"""会員向けアプリの利用ログ。

docs/analytics-design.md の設計に沿って、記録する前に個人情報を落とす。
「保存してから消す」運用にはしない。
"""
from __future__ import annotations

import hashlib
import os
import re
import sqlite3
from datetime import datetime

SCHEMA = """
CREATE TABLE IF NOT EXISTS search_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT, member_hash TEXT, query_masked TEXT,
    result_count INTEGER, zero_hit INTEGER, top_item_id TEXT, channel TEXT
);
CREATE TABLE IF NOT EXISTS view_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT, member_hash TEXT, item_id TEXT, entry TEXT
);
CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT, member_hash TEXT, item_id TEXT, verdict TEXT, reason_tag TEXT
);
CREATE TABLE IF NOT EXISTS video_click (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT, member_hash TEXT, item_id TEXT, video_id TEXT, start_sec INTEGER
);
CREATE TABLE IF NOT EXISTS unanswered (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT, query_masked TEXT, cause TEXT, status TEXT,
    linked_item_id TEXT, linked_video_id TEXT
);
"""

# 記録前に落とす個人情報。日本語の氏名は正規表現で完全に検出できないため、
# 「〜さん」「〜様」の直前も落としたうえで、原文そのものは保存しない。
MASKS = [
    (re.compile(r"\d{2,4}-\d{2,4}-\d{3,4}"), "[電話]"),
    (re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+"), "[メール]"),
    (re.compile(r"\d{1,4}丁目[\d\-－]*"), "[住所]"),
    (re.compile(r"[一-龥ァ-ヶА-я]{2,5}(さん|様|君|ちゃん)"), "[氏名]"),
    (re.compile(r"[A-Za-z]{1,3}\d{4,}"), "[番号]"),
]


def mask(text: str) -> str:
    out = (text or "").strip()
    for pattern, replacement in MASKS:
        out = pattern.sub(replacement, out)
    return out[:200]


def member_hash(member_id: str) -> str:
    """生の会員IDは保存しない。サーバ側の秘密鍵でハッシュ化する。"""
    salt = os.environ.get("MEMBER_HASH_SALT", "change-me")
    return hashlib.sha256((salt + "|" + (member_id or "guest")).encode()).hexdigest()[:16]


def now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def init(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA)
    conn.commit()


def log_search(conn, member, query, result_count, top_item_id, channel="web"):
    conn.execute(
        """INSERT INTO search_log (ts, member_hash, query_masked, result_count, zero_hit, top_item_id, channel)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (now(), member_hash(member), mask(query), result_count,
         1 if result_count == 0 else 0, top_item_id, channel))
    if result_count == 0:
        conn.execute(
            """INSERT INTO unanswered (ts, query_masked, cause, status) VALUES (?, ?, ?, ?)""",
            (now(), mask(query), "zero_hit", "未対応"))
    conn.commit()


def log_view(conn, member, item_id, entry="search"):
    conn.execute("INSERT INTO view_log (ts, member_hash, item_id, entry) VALUES (?, ?, ?, ?)",
                 (now(), member_hash(member), item_id, entry))
    conn.commit()


def log_feedback(conn, member, item_id, verdict, reason_tag=""):
    conn.execute(
        """INSERT INTO feedback (ts, member_hash, item_id, verdict, reason_tag) VALUES (?, ?, ?, ?, ?)""",
        (now(), member_hash(member), item_id, verdict, reason_tag))
    if verdict == "not_solved":
        conn.execute(
            """INSERT INTO unanswered (ts, query_masked, cause, status, linked_item_id)
               VALUES (?, ?, ?, ?, ?)""",
            (now(), f"（{item_id} が解決しなかった）{reason_tag}", "not_solved", "未対応", item_id))
    conn.commit()


def log_video_click(conn, member, item_id, video_id, start_sec):
    conn.execute(
        """INSERT INTO video_click (ts, member_hash, item_id, video_id, start_sec)
           VALUES (?, ?, ?, ?, ?)""",
        (now(), member_hash(member), item_id, video_id, int(start_sec or 0)))
    conn.commit()
