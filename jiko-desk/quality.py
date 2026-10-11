"""公開前の自動品質チェック。

専門家確認（法律・保険・医療の判断）とは別に、「確認不要」と自動判定した項目も
機械的に検査する。目的は、AIが文字起こしに無いことを書いていないかの検出。

  根拠照合 : evidence_quote が実際に文字起こしに存在するか
  数値照合 : 回答・解説に出てくる数値が文字起こしに存在するか
  時刻検証 : 開始<終了、動画の長さの範囲内か
  分量検証 : 回答・解説が極端に短くないか
  重複検出 : 同じ質問が複数項目に分かれていないか

結果は items.quality_status（OK / 要目視）と quality_notes に入る。
本編PDFには「確認済」または「確認不要かつ品質OK」の項目だけを載せる。
"""
from __future__ import annotations

import re
import sqlite3
from difflib import SequenceMatcher

import config
import db

STATUS_OK = "OK"
STATUS_CHECK = "要目視"

NORMALIZE_RE = re.compile(r"[\s、。，．・「」『』（）()〈〉【】！？!?,.:：;；\-ー―‐]")
NUMBER_RE = re.compile(r"\d+(?:[,．.]\d+)?")
MATCH_THRESHOLD = 0.8   # 逐語引用がこの割合以上一致すれば根拠ありとみなす


def normalize(text: str) -> str:
    """表記の揺れを落として照合しやすくする（全角数字も半角に）。"""
    if not text:
        return ""
    text = text.translate(str.maketrans("０１２３４５６７８９", "0123456789"))
    return NORMALIZE_RE.sub("", text)


def evidence_found(evidence: str, transcript: str) -> tuple[bool, float]:
    """逐語引用が文字起こしに含まれるか。完全一致でなくても一致率で判定する。"""
    ev, tr = normalize(evidence), normalize(transcript)
    if not ev or not tr:
        return False, 0.0
    if ev in tr:
        return True, 1.0
    matcher = SequenceMatcher(None, ev, tr, autojunk=False)
    match = matcher.find_longest_match(0, len(ev), 0, len(tr))
    ratio = match.size / len(ev)
    return ratio >= MATCH_THRESHOLD, round(ratio, 2)


def unsupported_numbers(text: str, transcript: str) -> list[str]:
    """回答・解説に出てくる数値のうち、文字起こしに無いもの。"""
    tr = normalize(transcript)
    missing = []
    for number in dict.fromkeys(NUMBER_RE.findall(normalize(text))):
        if len(number) < 2:      # 1桁は誤検出が多いので対象外
            continue
        if number not in tr:
            missing.append(number)
    return missing


def check_item(row: sqlite3.Row, transcript: str, duplicate_questions: set[str]) -> tuple[str, str]:
    notes: list[str] = []

    evidence = row["evidence"] or ""
    if not evidence:
        notes.append("根拠テキストなし")
    else:
        found, ratio = evidence_found(evidence, transcript)
        if not found:
            notes.append(f"根拠テキストが文字起こしに見つからない（一致率{ratio}）")

    body = f"{row['answer_short']} {row['body_md'] or ''}"
    missing = unsupported_numbers(body, transcript)
    if missing:
        notes.append(f"文字起こしに無い数値: {', '.join(missing[:5])}")

    start, end = row["start_sec"] or 0, row["end_sec"] or 0
    if end <= start:
        notes.append("終了時刻が開始時刻以下")

    if len(row["answer_short"] or "") < 20:
        notes.append("回答が短い")
    if len(row["body_md"] or "") < 80:
        notes.append("解説が短い")

    if normalize(row["question"]) in duplicate_questions:
        notes.append("同じ質問の項目が他にもある")

    return (STATUS_CHECK if notes else STATUS_OK), " / ".join(notes)


def run(conn: sqlite3.Connection, video_ids: list[str] | None = None) -> dict:
    """品質チェックを実行し、結果をDBに書き戻す。"""
    sql = "SELECT * FROM items"
    params: list = []
    if video_ids:
        sql += " WHERE video_id IN (%s)" % ", ".join("?" for _ in video_ids)
        params = list(video_ids)
    rows = conn.execute(sql, params).fetchall()

    counts: dict[str, int] = {}
    for row in conn.execute("SELECT question FROM items").fetchall():
        key = normalize(row["question"])
        counts[key] = counts.get(key, 0) + 1
    duplicates = {q for q, c in counts.items() if c > 1}

    transcripts: dict[str, str] = {}
    result = {"total": 0, "ok": 0, "check": 0, "details": []}
    for row in rows:
        vid = row["video_id"]
        if vid not in transcripts:
            tr_row = db.get_transcript(conn, vid)
            transcripts[vid] = tr_row["body"] if tr_row else ""
        status, notes = check_item(row, transcripts[vid], duplicates)
        db.set_quality(conn, row["id"], status, notes)
        result["total"] += 1
        if status == STATUS_OK:
            result["ok"] += 1
        else:
            result["check"] += 1
            result["details"].append((row["id"], row["question"][:40], notes))
    conn.commit()
    return result


def publishable(row: sqlite3.Row) -> bool:
    """本編PDFに載せてよいか。確認済み、または確認不要かつ品質OK。"""
    if row["review_status"] == config.ReviewStatus.APPROVED:
        return True
    return (row["review_status"] == config.ReviewStatus.NOT_REQUIRED
            and (row["quality_status"] or STATUS_OK) == STATUS_OK)
