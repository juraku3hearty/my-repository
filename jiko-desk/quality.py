"""公開前の自動品質チェック。

専門家確認（法律・保険・医療の判断）とは別に、「確認不要」と自動判定した項目も
機械的に検査する。目的は、AIが文字起こしに無いことを書いていないかの検出。

  根拠照合 : evidence_quote が実際に文字起こしに存在するか
  数値照合 : 回答・解説に出てくる数値が文字起こしに存在するか
  時刻検証 : 開始<終了、動画の長さの範囲内か
  分量検証 : 回答・解説が極端に短くないか
  重複検出 : 同じ質問が複数項目に分かれていないか

結果は items.quality_status（OK / 要目視）と quality_notes に入る。

これは公開可否を決めるものではない。根拠照合は「文字起こしと一致するか」を見るだけで、
実務上の正しさは保証しない。公開には必ず院内確認（実務責任者）を通す。
品質チェックの結果は、院内確認で先に見るべき項目を示す優先度として使う。
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
# 保存した文字起こしの行頭に入る時刻マーカー。照合前に外さないと、
# キューをまたぐ引用がマーカーで分断されて一致しなくなる。
TIMESTAMP_RE = re.compile(r"\[\d{1,3}:\d{2}:\d{2}\]")
NUMBER_RE = re.compile(r"\d+(?:[,．.]\d+)?")
MATCH_THRESHOLD = 0.8   # 引用のこの割合以上が文字起こしに実在すれば根拠ありとみなす
MIN_BLOCK = 10          # 偶然の一致を除くための最小区間長（文字）


def normalize(text: str) -> str:
    """表記の揺れを落として照合しやすくする（全角数字も半角に）。"""
    if not text:
        return ""
    text = TIMESTAMP_RE.sub("", text)
    text = text.translate(str.maketrans("０１２３４５６７８９", "0123456789"))
    return NORMALIZE_RE.sub("", text)


def evidence_found(evidence: str, transcript: str) -> tuple[bool, float]:
    """逐語引用が文字起こしに含まれるか。

    AIは離れた複数箇所を1つの引用としてつなげることがあるため、
    「最長の連続一致」ではなく「一致した区間の合計が引用全体に占める割合」で見る。
    短い偶然の一致は除くため、一定の長さ以上の区間だけを数える。
    """
    ev, tr = normalize(evidence), normalize(transcript)
    if not ev or not tr:
        return False, 0.0
    if ev in tr:
        return True, 1.0
    matcher = SequenceMatcher(None, ev, tr, autojunk=False)
    covered = sum(b.size for b in matcher.get_matching_blocks() if b.size >= MIN_BLOCK)
    ratio = min(1.0, covered / len(ev))
    return ratio >= MATCH_THRESHOLD, round(ratio, 2)


def numeric_text(text: str) -> str:
    """数値照合用の軽い正規化。

    全角数字と桁区切り・空白だけを落とす。ハイフンまで消すと「年収400-500万円」が
    「400500」という存在しない数値に化けるため、記号は残す。時刻マーカーの数字が
    混ざらないよう先に外す。
    """
    text = TIMESTAMP_RE.sub("", text or "")
    text = text.translate(str.maketrans("０１２３４５６７８９", "0123456789"))
    return re.sub(r"[,，\s\u3000]", "", text)


def unsupported_numbers(text: str, transcript: str) -> list[str]:
    """回答・解説に出てくる数値のうち、文字起こしに無いもの。"""
    tr = numeric_text(transcript)
    missing = []
    for number in dict.fromkeys(NUMBER_RE.findall(numeric_text(text))):
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
        # 要約がズレている疑いがあるものは、確認不要のままにしない
        if status == STATUS_CHECK and row["review_status"] == config.ReviewStatus.NOT_REQUIRED:
            conn.execute(
                "UPDATE items SET review_status = ?, review_points = ? WHERE id = ?",
                (config.ReviewStatus.PENDING,
                 f"自動品質チェックで要確認: {notes}", row["id"]),
            )
        result["total"] += 1
        if status == STATUS_OK:
            result["ok"] += 1
        else:
            result["check"] += 1
            result["details"].append((row["id"], row["question"][:40], notes))
    conn.commit()
    return result
