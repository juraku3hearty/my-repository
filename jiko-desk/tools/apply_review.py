#!/usr/bin/env python3
"""院内確認シートの判定をDBに書き戻す。

ナレッジIDは動画内の連番なので、動画を読み込み直すと振り直される。
2026-10-17 に実際にずれていた（docs/id-stability.md）。
そのため ID の一致だけでは書かない。シートの質問文とDBの質問文を
照合し、1行でも合わなければ何も書かずに止める。

  python3 tools/apply_review.py data/review-round1.csv            # 確認だけ
  python3 tools/apply_review.py data/review-round1.csv --apply    # 書き戻す

対応表（旧ID→新ID）を渡すと、ずれを補正してから照合する。
  --remap data/review-round1-manual.csv
"""
from __future__ import annotations

import argparse
import csv
import re
import sqlite3
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

DB = Path(__file__).resolve().parent.parent / "data" / "jiko_desk.sqlite3"
JST = timezone(timedelta(hours=9))
# 質問文の一致度がこれを下回る行は書かない
THRESHOLD = 0.60
# シートの判定語 → DBの internal_status の語（アプリ側と揃える）
STATUS = {"済": "院内確認済", "要修正": "院内要修正"}
# 同じ項目に複数の判定が集まったとき、強い方を残す。書いた順には依存させない
PRECEDENCE = {"要修正": 2, "済": 1}


def bare(s: str) -> str:
    return re.sub(r"[^\wぁ-んァ-ヶ一-龠]", "", s or "")


def bigrams(s: str) -> set[str]:
    s = bare(s)
    return {s[i:i + 2] for i in range(len(s) - 1)}


def similarity(a: str, b: str) -> float:
    ga, gb = bigrams(a), bigrams(b)
    if not ga or not gb:
        return 0.0
    # 短い方がどれだけ覆われているかで見る。長さの違いで落とさない
    return len(ga & gb) / min(len(ga), len(gb))


def load_remap(paths: list[Path]) -> tuple[dict[str, list[str]], set[tuple[str, str]]]:
    """旧ID → 新IDの一覧と、目視確認済みの組。

    1件が複数に分割された場合は新IDが複数並ぶ。
    質問文が言い換えられていて機械的に照合できない組は、対応表の
    「照合」列に「目視確認」と書いてあるものだけ通す。根拠は同じ行の
    「根拠」列に残すこと。
    """
    remap: dict[str, list[str]] = {}
    eyeballed: set[tuple[str, str]] = set()
    for p in paths:
        with p.open(encoding="utf-8") as fp:
            for row in csv.DictReader(fp):
                old, new = (row.get("旧ID") or "").strip(), (row.get("新ID") or "").strip()
                if not (old and new):
                    continue
                if new not in remap.setdefault(old, []):
                    remap[old].append(new)
                if "目視確認" in (row.get("照合") or ""):
                    eyeballed.add((old, new))
    return remap, eyeballed


def seconds_of(url: str) -> int | None:
    m = re.search(r"#t=(\d+)s", url or "")
    return int(m.group(1)) if m else None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("sheet", type=Path)
    ap.add_argument("--remap", type=Path, action="append", default=[])
    ap.add_argument("--apply", action="store_true", help="実際に書き戻す")
    ap.add_argument("--reviewer", default="代表")
    args = ap.parse_args()

    remap, eyeballed = load_remap(args.remap)
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    db = {r["id"]: r for r in conn.execute(
        "SELECT id, question, start_sec, end_sec FROM items")}

    with args.sheet.open(encoding="utf-8") as fp:
        rows = list(csv.DictReader(fp))

    ok, bad, eye = [], [], []
    for row in rows:
        sheet_id = (row.get("ナレッジID") or "").strip()
        verdict = (row.get("判定") or "").strip()
        if not sheet_id or not verdict:
            continue
        if verdict not in STATUS:
            bad.append((sheet_id, sheet_id, f"判定の語が不明（{verdict}）", 0.0))
            continue
        sec = seconds_of(row.get("動画リンク", ""))
        for item_id in remap.get(sheet_id, [sheet_id]):
            item = db.get(item_id)
            if item is None:
                bad.append((sheet_id, item_id, "DBに無い", 0.0))
                continue
            sim = similarity(row.get("質問", ""), item["question"])
            # 秒がチャンクの範囲に入っていれば、言い換えで一致度が落ちても通す
            in_range = (sec is not None
                        and (item["start_sec"] or 0) - 2 <= sec <= (item["end_sec"] or 0) + 2)
            if sim >= THRESHOLD or in_range:
                ok.append((sheet_id, item_id, verdict, row.get("コメント", "").strip(), sim))
            elif (sheet_id, item_id) in eyeballed:
                eye.append((sheet_id, item_id, sim))
                ok.append((sheet_id, item_id, verdict, row.get("コメント", "").strip(), sim))
            else:
                bad.append((sheet_id, item_id, f"中身が違う（一致度{sim:.2f}）", sim))

    print(f"シート {args.sheet.name}: {len(rows)}行")
    print(f"  照合できた   {len(ok)}件（うち目視確認 {len(eye)}件）")
    print(f"  照合できない {len(bad)}件")
    for sheet_id, item_id, sim in eye:
        print(f"    ! {sheet_id} → {item_id}  目視確認（一致度{sim:.2f}）")
    for sheet_id, item_id, why, _ in bad:
        arrow = f"{sheet_id} → {item_id}" if sheet_id != item_id else sheet_id
        print(f"    × {arrow}  {why}")

    if bad:
        print("\n照合できない行があるので、何も書き込みませんでした。")
        print("docs/id-stability.md の手順で対応表を作り、--remap で渡してください。")
        return 1

    # 1本の項目に複数のシート行が集まることがある（統合された項目）。
    # 黙って後の行が勝つのを避け、必ず目に見える形にする。
    by_item: dict[str, list[tuple[str, str, str]]] = {}
    for sheet_id, item_id, verdict, comment, _ in ok:
        by_item.setdefault(item_id, []).append((sheet_id, verdict, comment))
    dupes = {k: v for k, v in by_item.items() if len(v) > 1}
    if dupes:
        print(f"\n複数のシート行が同じ項目に集まっています（{len(dupes)}件）")
        for item_id, group in dupes.items():
            kept = max(group, key=lambda g: PRECEDENCE.get(g[1], 0))[1]
            src = "／".join(f"{s}={v}" for s, v, _ in group)
            print(f"    {item_id}  {src}  → 「{kept}」を残します")

    if not args.apply:
        print("\n確認のみ（--apply を付けると書き戻します）")
        return 0

    now = datetime.now(JST).isoformat(timespec="seconds")
    with conn:
        # ログは全行残す。コメントはどのシート行から来たかが分かるようにする
        for sheet_id, item_id, verdict, comment, _ in ok:
            note = comment if sheet_id == item_id else f"[{sheet_id}] {comment}".strip()
            conn.execute(
                "INSERT INTO review_log (item_id, reviewer, judged_at, judgement, comment, axis) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (item_id, args.reviewer, now, verdict, note, "院内確認"))
        # items の状態は、項目ごとに強い判定ひとつだけ入れる
        for item_id, group in by_item.items():
            verdict = max(group, key=lambda g: PRECEDENCE.get(g[1], 0))[1]
            conn.execute(
                "UPDATE items SET internal_status = ?, internal_reviewer = ?, "
                "internal_reviewed_at = ? WHERE id = ?",
                (STATUS[verdict], args.reviewer, now, item_id))
    print(f"\nログ {len(ok)}件 / 項目 {len(by_item)}件を書き戻しました"
          f"（reviewer={args.reviewer}, {now}）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
