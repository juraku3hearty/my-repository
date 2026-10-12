"""SQLite の読み書き。

1項目（item）= 質問 + 短い回答 + 解説本文 + 出典時刻。
検索用のQ&A索引とPDFの解説節は、同じこのテーブルから作る。
"""
from __future__ import annotations

import json
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable

import config

SCHEMA = """
CREATE TABLE IF NOT EXISTS videos (
    video_id              TEXT PRIMARY KEY,
    title                 TEXT NOT NULL,
    url                   TEXT NOT NULL,
    duration_sec          INTEGER,
    published_at          TEXT,
    caption_state         TEXT,
    caption_language      TEXT,
    transcript_fetched_at TEXT,
    knowledge_built_at    TEXT,
    item_count            INTEGER DEFAULT 0,
    status                TEXT,
    folder                TEXT,
    note                  TEXT,
    created_at            TEXT,
    updated_at            TEXT
);

CREATE TABLE IF NOT EXISTS transcripts (
    video_id   TEXT PRIMARY KEY,
    source     TEXT,
    language   TEXT,
    fetched_at TEXT,
    cue_count  INTEGER,
    body       TEXT,
    FOREIGN KEY (video_id) REFERENCES videos (video_id)
);

CREATE TABLE IF NOT EXISTS items (
    id               TEXT PRIMARY KEY,
    video_id         TEXT NOT NULL,
    chunk_index      INTEGER,
    category         TEXT,
    question         TEXT NOT NULL,
    answer_short     TEXT NOT NULL,
    body_md          TEXT,
    evidence         TEXT,
    supplement       TEXT,
    supplement_by    TEXT,
    supplement_status TEXT,
    lecture_request  INTEGER DEFAULT 0,
    key_points       TEXT,
    caveats          TEXT,
    unknown_points   TEXT,
    keywords         TEXT,
    start_sec        REAL,
    end_sec          REAL,
    review_status    TEXT,
    internal_status  TEXT,
    internal_reviewer TEXT,
    internal_reviewed_at TEXT,
    expert_type      TEXT,
    review_points    TEXT,
    matched_keywords TEXT,
    outdated         INTEGER DEFAULT 0,
    quality_status   TEXT,
    quality_notes    TEXT,
    pdf_page         INTEGER,
    created_at       TEXT,
    updated_at       TEXT,
    FOREIGN KEY (video_id) REFERENCES videos (video_id)
);

CREATE INDEX IF NOT EXISTS idx_items_video    ON items (video_id);
CREATE INDEX IF NOT EXISTS idx_items_category ON items (category);
CREATE INDEX IF NOT EXISTS idx_items_review   ON items (review_status);

CREATE TABLE IF NOT EXISTS review_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id    TEXT NOT NULL,
    reviewer   TEXT,
    judged_at  TEXT,
    judgement  TEXT,
    comment    TEXT,
    axis       TEXT,
    FOREIGN KEY (item_id) REFERENCES items (id)
);

CREATE TABLE IF NOT EXISTS runs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    command    TEXT,
    started_at TEXT,
    ended_at   TEXT,
    result     TEXT
);
"""


def now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def connect(db_path: Path | None = None) -> sqlite3.Connection:
    path = Path(db_path or config.DB_PATH)
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(SCHEMA)
    migrate(conn)
    return conn


def dumps(value: Any) -> str:
    return json.dumps(value or [], ensure_ascii=False)


def loads(value: str | None) -> Any:
    if not value:
        return []
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return []


# ---------- videos ----------

def upsert_video(conn: sqlite3.Connection, video: dict) -> bool:
    """動画を登録。新規なら True、既存の更新なら False を返す。"""
    cur = conn.execute("SELECT video_id FROM videos WHERE video_id = ?", (video["video_id"],))
    exists = cur.fetchone() is not None
    if exists:
        conn.execute(
            """UPDATE videos SET title = ?, url = ?, duration_sec = ?, published_at = ?, updated_at = ?
               WHERE video_id = ?""",
            (video["title"], video["url"], video.get("duration_sec"),
             video.get("published_at"), now(), video["video_id"]),
        )
    else:
        conn.execute(
            """INSERT INTO videos (video_id, title, url, duration_sec, published_at,
                                   caption_state, status, item_count, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)""",
            (video["video_id"], video["title"], video["url"], video.get("duration_sec"),
             video.get("published_at"), "", config.VideoStatus.NEW, now(), now()),
        )
    conn.commit()
    return not exists


def set_video_fields(conn: sqlite3.Connection, video_id: str, **fields) -> None:
    if not fields:
        return
    fields["updated_at"] = now()
    sets = ", ".join(f"{k} = ?" for k in fields)
    conn.execute(f"UPDATE videos SET {sets} WHERE video_id = ?", (*fields.values(), video_id))
    conn.commit()


def get_video(conn: sqlite3.Connection, video_id: str) -> sqlite3.Row | None:
    return conn.execute("SELECT * FROM videos WHERE video_id = ?", (video_id,)).fetchone()


def list_videos(conn: sqlite3.Connection, status: str | None = None) -> list[sqlite3.Row]:
    if status:
        return conn.execute(
            "SELECT * FROM videos WHERE status = ? ORDER BY published_at, video_id", (status,)
        ).fetchall()
    return conn.execute("SELECT * FROM videos ORDER BY published_at, video_id").fetchall()


# ---------- transcripts ----------

def save_transcript(conn: sqlite3.Connection, video_id: str, source: str,
                    language: str, body: str, cue_count: int) -> None:
    conn.execute(
        """INSERT INTO transcripts (video_id, source, language, fetched_at, cue_count, body)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT (video_id) DO UPDATE SET
             source = excluded.source, language = excluded.language,
             fetched_at = excluded.fetched_at, cue_count = excluded.cue_count,
             body = excluded.body""",
        (video_id, source, language, now(), cue_count, body),
    )
    conn.commit()


def get_transcript(conn: sqlite3.Connection, video_id: str) -> sqlite3.Row | None:
    return conn.execute("SELECT * FROM transcripts WHERE video_id = ?", (video_id,)).fetchone()


# ---------- items ----------

def next_item_id(conn: sqlite3.Connection, video_id: str) -> str:
    row = conn.execute(
        "SELECT COUNT(*) AS c FROM items WHERE video_id = ?", (video_id,)
    ).fetchone()
    return f"KB-{video_id}-{row['c'] + 1:03d}"


def item_exists(conn: sqlite3.Connection, video_id: str, question: str, start_sec: float) -> bool:
    """同じ動画・同じ質問・ほぼ同じ時刻は重複として扱う（再実行時の二重登録防止）。"""
    row = conn.execute(
        """SELECT 1 FROM items
           WHERE video_id = ? AND question = ? AND ABS(COALESCE(start_sec, 0) - ?) < 15""",
        (video_id, question, start_sec or 0),
    ).fetchone()
    return row is not None


def insert_item(conn: sqlite3.Connection, item: dict) -> str:
    item_id = item.get("id") or next_item_id(conn, item["video_id"])
    conn.execute(
        """INSERT INTO items (id, video_id, chunk_index, category, question, answer_short,
                              body_md, evidence, key_points, caveats, unknown_points, keywords,
                              start_sec, end_sec, review_status, internal_status,
                              expert_type, review_points,
                              matched_keywords, outdated, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            item_id, item["video_id"], item.get("chunk_index"), item.get("category"),
            item["question"], item["answer_short"], item.get("body_md", ""),
            item.get("evidence", ""),
            dumps(item.get("key_points")), item.get("caveats", ""),
            dumps(item.get("unknown_points")), dumps(item.get("keywords")),
            item.get("start_sec"), item.get("end_sec"),
            item.get("review_status"),
            item.get("internal_status", config.InternalStatus.UNCHECKED),
            item.get("expert_type", ""),
            item.get("review_points", ""), dumps(item.get("matched_keywords")),
            1 if item.get("outdated") else 0, now(), now(),
        ),
    )
    conn.commit()
    return item_id


def delete_items_of_video(conn: sqlite3.Connection, video_id: str) -> int:
    cur = conn.execute("DELETE FROM items WHERE video_id = ?", (video_id,))
    conn.commit()
    return cur.rowcount


def list_items(conn: sqlite3.Connection, review_status: Iterable[str] | None = None) -> list[sqlite3.Row]:
    sql = """SELECT i.*, v.title AS video_title, v.url AS video_url
             FROM items i JOIN videos v ON v.video_id = i.video_id"""
    params: list[Any] = []
    if review_status:
        statuses = list(review_status)
        sql += " WHERE i.review_status IN (%s)" % ", ".join("?" for _ in statuses)
        params.extend(statuses)
    sql += " ORDER BY i.category, v.published_at, i.start_sec"
    return conn.execute(sql, params).fetchall()


def set_pdf_pages(conn: sqlite3.Connection, pages: dict[str, int]) -> None:
    for item_id, page in pages.items():
        conn.execute("UPDATE items SET pdf_page = ? WHERE id = ?", (page, item_id))
    conn.commit()


def set_quality(conn: sqlite3.Connection, item_id: str, status: str, notes: str) -> None:
    conn.execute(
        "UPDATE items SET quality_status = ?, quality_notes = ?, updated_at = ? WHERE id = ?",
        (status, notes, now(), item_id),
    )


def migrate(conn: sqlite3.Connection) -> None:
    """既存DBに後から増えた列を足す（作り直し不要にする）。"""
    existing = {row["name"] for row in conn.execute("PRAGMA table_info(items)").fetchall()}
    for column, ddl in (
        ("evidence", "TEXT"), ("quality_status", "TEXT"), ("quality_notes", "TEXT"),
        ("internal_status", "TEXT"), ("internal_reviewer", "TEXT"), ("internal_reviewed_at", "TEXT"),
        ("supplement", "TEXT"), ("supplement_by", "TEXT"), ("supplement_status", "TEXT"),
        ("lecture_request", "INTEGER"),
    ):
        if column not in existing:
            conn.execute(f"ALTER TABLE items ADD COLUMN {column} {ddl}")
    video_columns = {row["name"] for row in conn.execute("PRAGMA table_info(videos)").fetchall()}
    if "folder" not in video_columns:
        conn.execute("ALTER TABLE videos ADD COLUMN folder TEXT")
    conn.execute(
        "UPDATE items SET internal_status = ? WHERE internal_status IS NULL OR internal_status = ''",
        (config.InternalStatus.UNCHECKED,),
    )
    log_columns = {row["name"] for row in conn.execute("PRAGMA table_info(review_log)").fetchall()}
    if "axis" not in log_columns:
        conn.execute("ALTER TABLE review_log ADD COLUMN axis TEXT")
    conn.commit()


def apply_review(conn: sqlite3.Connection, item_id: str, judgement: str,
                 reviewer: str = "", comment: str = "") -> None:
    """専門家確認の結果を反映する。"""
    conn.execute(
        "UPDATE items SET review_status = ?, updated_at = ? WHERE id = ?",
        (judgement, now(), item_id),
    )
    conn.execute(
        """INSERT INTO review_log (item_id, reviewer, judged_at, judgement, comment, axis)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (item_id, reviewer, now(), judgement, comment, "専門家"),
    )
    conn.commit()


def apply_internal_review(conn: sqlite3.Connection, item_id: str, judgement: str,
                          reviewer: str = "", comment: str = "") -> None:
    """院内確認（実務責任者）の結果を反映する。"""
    conn.execute(
        """UPDATE items SET internal_status = ?, internal_reviewer = ?,
                            internal_reviewed_at = ?, updated_at = ? WHERE id = ?""",
        (judgement, reviewer, now(), now(), item_id),
    )
    conn.execute(
        """INSERT INTO review_log (item_id, reviewer, judged_at, judgement, comment, axis)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (item_id, reviewer, now(), judgement, comment, "院内"),
    )
    conn.commit()


def set_supplement(conn: sqlite3.Connection, item_id: str, text: str, by: str = "",
                   lecture_request: bool = False) -> None:
    """院長や有資格者が書いた補足を記録する。

    講座で話されていない実務知識は、AIに書かせると創作になり根拠照合が成り立たない。
    人が書いたものとして講師の説明と分けて保持し、出典も分ける。
    """
    conn.execute(
        """UPDATE items SET supplement = ?, supplement_by = ?, supplement_status = ?,
                            lecture_request = ?, updated_at = ? WHERE id = ?""",
        (text, by, "未確認" if text else "", 1 if lecture_request else 0, now(), item_id),
    )
    conn.commit()


def publishable(row: sqlite3.Row) -> bool:
    """会員へ公開してよいか。

    院内確認を通り、かつ専門家確認が不要または確認済であること。
    自動生成しただけの項目や、品質チェックだけを通った項目は公開しない。
    """
    if (row["internal_status"] or config.InternalStatus.UNCHECKED) != config.InternalStatus.APPROVED:
        return False
    return row["review_status"] in (config.ReviewStatus.NOT_REQUIRED, config.ReviewStatus.APPROVED)


def stats(conn: sqlite3.Connection) -> dict:
    def one(sql: str, *params) -> int:
        return conn.execute(sql, params).fetchone()[0]

    return {
        "videos": one("SELECT COUNT(*) FROM videos"),
        "transcribed": one("SELECT COUNT(*) FROM transcripts"),
        "items": one("SELECT COUNT(*) FROM items"),
        "expert_pending": one("SELECT COUNT(*) FROM items WHERE review_status = ?", config.ReviewStatus.PENDING),
        "expert_approved": one("SELECT COUNT(*) FROM items WHERE review_status = ?", config.ReviewStatus.APPROVED),
        "expert_not_required": one("SELECT COUNT(*) FROM items WHERE review_status = ?", config.ReviewStatus.NOT_REQUIRED),
        "internal_unchecked": one("SELECT COUNT(*) FROM items WHERE internal_status = ?", config.InternalStatus.UNCHECKED),
        "internal_approved": one("SELECT COUNT(*) FROM items WHERE internal_status = ?", config.InternalStatus.APPROVED),
        "quality_check": one("SELECT COUNT(*) FROM items WHERE quality_status = ?", "要目視"),
        "publishable": one(
            """SELECT COUNT(*) FROM items WHERE internal_status = ?
               AND review_status IN (?, ?)""",
            config.InternalStatus.APPROVED,
            config.ReviewStatus.NOT_REQUIRED, config.ReviewStatus.APPROVED,
        ),
    }


def approval_history(conn: sqlite3.Connection) -> list[sqlite3.Row]:
    """カテゴリー別の院内確認の実績。将来の自動承認の判断材料にする。"""
    return conn.execute(
        """SELECT category,
                  COUNT(*) AS total,
                  SUM(CASE WHEN internal_status = ? THEN 1 ELSE 0 END) AS approved,
                  SUM(CASE WHEN internal_status = ? THEN 1 ELSE 0 END) AS rejected
           FROM items GROUP BY category ORDER BY total DESC""",
        (config.InternalStatus.APPROVED, config.InternalStatus.REJECTED),
    ).fetchall()
