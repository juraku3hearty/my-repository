"""文字起こしの全文検索。

590本・1,212万字をSQLiteのFTS5で横断検索する。Gemini は使わないので費用ゼロ。
「この論点はどの動画で話されているか」を調べ、ナレッジ化する動画を選んだり、
講座で扱われていないテーマを見つけたりするために使う。
"""
from __future__ import annotations

import re
import sqlite3

import db
import transcript as tr

FTS_SCHEMA = """
CREATE VIRTUAL TABLE IF NOT EXISTS transcript_fts USING fts5(
    video_id UNINDEXED,
    body,
    tokenize = 'unicode61'
);
"""


def build_index(conn: sqlite3.Connection) -> int:
    """検索用の索引を作り直す。字幕を取り直したら再実行する。

    日本語は単語の区切りが無くFTS5のトークナイザが効きにくいため、
    索引は補助に留め、実際の絞り込みは本文のLIKE/正規表現で行う。
    """
    conn.executescript(FTS_SCHEMA)
    conn.execute("DELETE FROM transcript_fts")
    rows = conn.execute("SELECT video_id, body FROM transcripts").fetchall()
    conn.executemany("INSERT INTO transcript_fts (video_id, body) VALUES (?, ?)",
                     [(r["video_id"], r["body"]) for r in rows])
    conn.commit()
    return len(rows)


def search(conn: sqlite3.Connection, keyword: str, folder: str | None = None,
           limit: int = 20, context: int = 60) -> list[dict]:
    """文字起こしをキーワードで横断検索する。

    1動画につき最初の1か所を抜粋し、出現回数の多い順に返す。
    """
    sql = """SELECT t.video_id, t.body, v.title, v.folder, v.url, v.published_at, v.item_count
             FROM transcripts t JOIN videos v ON v.video_id = t.video_id"""
    params: list = []
    if folder:
        sql += " WHERE v.folder LIKE ?"
        params.append(f"%{folder}%")

    results = []
    for row in conn.execute(sql, params):
        body = row["body"]
        hits = list(re.finditer(re.escape(keyword), body))
        if not hits:
            continue
        first = hits[0]
        line_start = body.rfind("\n", 0, first.start()) + 1
        stamp = body[line_start:line_start + 10] if body[line_start:line_start + 1] == "[" else ""
        seconds = tr.to_seconds(stamp.strip("[]")) if stamp else 0
        excerpt = body[max(0, first.start() - context):first.end() + context].replace("\n", " ")
        results.append({
            "video_id": row["video_id"],
            "title": row["title"],
            "folder": row["folder"] or "",
            "published_at": row["published_at"] or "",
            "count": len(hits),
            "seconds": seconds,
            "url": f"{(row['url'] or '').split('#')[0]}#t={int(seconds)}s",
            "excerpt": excerpt,
            "already_built": bool(row["item_count"]),
        })
    results.sort(key=lambda r: -r["count"])
    return results[:limit]


def coverage(conn: sqlite3.Connection, keywords: list[str]) -> list[dict]:
    """テーマごとに、どれだけ語られているかを数える。

    ナレッジ化済みの動画とそれ以外を分けて数えるので、
    「この論点は講座で話されているのにナレッジ化できていない」が分かる。
    """
    rows = conn.execute("""SELECT t.video_id, t.body, v.item_count
                           FROM transcripts t JOIN videos v ON v.video_id = t.video_id""").fetchall()
    out = []
    for keyword in keywords:
        built = unbuilt = total = 0
        for row in rows:
            n = row["body"].count(keyword)
            if not n:
                continue
            total += n
            if row["item_count"]:
                built += 1
            else:
                unbuilt += 1
        out.append({"keyword": keyword, "total": total,
                    "built_videos": built, "unbuilt_videos": unbuilt})
    return out
