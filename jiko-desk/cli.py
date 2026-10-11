#!/usr/bin/env python3
"""交通事故実務デスク — 動画ナレッジ化 CLI

  python3 cli.py check                 接続確認（Vimeo / Gemini / フォント）
  python3 cli.py list-videos           ① 動画一覧を取り込む
  python3 cli.py test-one              最初の1本だけで字幕取得〜生成を検証する
  python3 cli.py fetch-captions        ② 字幕をまとめて取得
  python3 cli.py import-manual         字幕なし動画のVTTを取り込む
  python3 cli.py build                 ③④ ナレッジ生成と要確認の振り分け
  python3 cli.py qc                    公開前の自動品質チェック（根拠照合・数値照合）
  python3 cli.py render                PDF（本編・確認待ち別冊）とQ&A索引を出力
  python3 cli.py review --item ID --judge 確認済
  python3 cli.py import-review FILE.csv
  python3 cli.py sync-new              ⑤ 新着動画だけを同じ流れで処理
  python3 cli.py status                進捗を表示
"""
from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path

import config
import db
import gemini
import knowledge
import quality
import render
import transcript as tr
from vimeo_client import VimeoClient


def _client() -> VimeoClient:
    return VimeoClient()


def cmd_check(args: argparse.Namespace) -> int:
    print("== 設定 ==")
    print(f"  DB            : {config.DB_PATH}")
    print(f"  出力先        : {config.OUT_DIR}")
    print(f"  フォント      : {config.FONT_PATH} {'OK' if config.FONT_PATH.exists() else '見つかりません'}")
    print(f"  Vimeo取得元   : {config.VIMEO_SOURCE}")
    print(f"  Geminiモデル  : {config.GEMINI_MODEL}")

    print("== Vimeo ==")
    try:
        me = _client().whoami()
        account = me.get("account", "?")
        print(f"  接続OK: {me.get('name')}（プラン: {account}）")
        if account in ("basic", "free"):
            print("  注意: 無料/Basicプランは字幕の自動生成が使えません。既存の字幕のみ取得できます。")
    except Exception as e:
        print(f"  失敗: {e}")
        return 1

    print("== Gemini ==")
    try:
        schema = {"type": "object", "properties": {"ok": {"type": "boolean"}}, "required": ["ok"]}
        data = gemini.generate_json("ok に true を入れて返してください。", schema)
        print(f"  接続OK: {data}")
    except Exception as e:
        print(f"  失敗: {e}")
        return 1
    return 0


def cmd_list_videos(args: argparse.Namespace) -> int:
    conn = db.connect()
    new_count, total = knowledge.sync_video_list(conn, _client())
    print(f"動画一覧: 全{total}本（新規{new_count}本）")
    for row in db.list_videos(conn):
        print(f"  {row['video_id']}  {tr.hms(row['duration_sec'] or 0)}  "
              f"{row['status']:<12} {row['title'][:48]}")
    return 0


def cmd_test_one(args: argparse.Namespace) -> int:
    """一括化の前に、最初の1本で字幕取得とナレッジ生成が通ることを確認する。"""
    conn = db.connect()
    client = _client()
    if not db.list_videos(conn):
        print("動画一覧が空なので先に取り込みます。")
        knowledge.sync_video_list(conn, client)

    video_id = args.video or db.list_videos(conn)[0]["video_id"]
    video = db.get_video(conn, video_id)
    print(f"対象: {video['title']}（{video_id}）")

    print("-- 字幕トラック --")
    tracks = client.list_text_tracks(video_id)
    if not tracks:
        print("  Vimeoに字幕トラックがありません。")
        print("  → 字幕をアップロードするか、data/captions_manual/ に "
              f"{video_id}.vtt を置いて import-manual を実行してください。")
        return 2
    for t in tracks:
        print(f"  type={t.get('type')} lang={t.get('language')} active={t.get('active')} name={t.get('name')}")

    result = knowledge.fetch_captions(conn, client, [video_id], only_missing=False)
    print(f"  取得結果: {result['details']}")
    if result["ok"] == 0:
        return 2

    print("-- ナレッジ生成（先頭1チャンクのみ）--")
    built = knowledge.build_knowledge(conn, [video_id], force=True, limit_chunks=1)
    print(f"  生成: {built['items']}項目（うち確認待ち {built['pending']}件）")
    if built["error"]:
        print(f"  エラー: {built['details']}")
        return 2

    for row in db.list_items(conn)[:5]:
        print(f"\n  [{row['category']}] {row['question']}")
        print(f"    A: {row['answer_short'][:120]}")
        print(f"    解説: {len(row['body_md'] or '')}字  時刻: {tr.hms(row['start_sec'])}〜{tr.hms(row['end_sec'])}")
        print(f"    {row['review_status']} / {row['expert_type']} / {row['review_points'][:80]}")
    print("\nここまで想定どおりなら fetch-captions → build で全本を処理してください。")
    return 0


def cmd_fetch_captions(args: argparse.Namespace) -> int:
    conn = db.connect()
    result = knowledge.fetch_captions(conn, _client(), args.video, only_missing=not args.force)
    print(f"字幕取得: 成功{result['ok']} / 字幕なし{result['no_caption']} / "
          f"スキップ{result['skipped']} / エラー{result['error']}")
    for vid, title, note in result["details"]:
        print(f"  {vid}  {title[:40]:<42} {note}")
    if result["no_caption"]:
        print("\n字幕なしの動画は、以下のいずれかで文字起こしを用意してください。")
        print("  a) Vimeo側で字幕をアップロード（または有料プランの自動字幕生成）→ fetch-captions を再実行")
        print(f"  b) Whisperなどで作ったVTTを {config.MANUAL_CAPTION_DIR} に 動画ID.vtt で置く → import-manual")
    return 0


def cmd_import_manual(args: argparse.Namespace) -> int:
    conn = db.connect()
    result = knowledge.import_manual_captions(conn)
    print(f"手動字幕の取り込み: 成功{result['ok']} / ID不一致{result['unknown']} / エラー{result['error']}")
    for name, note in result["details"]:
        print(f"  {name}: {note}")
    return 0


def cmd_build(args: argparse.Namespace) -> int:
    conn = db.connect()
    result = knowledge.build_knowledge(conn, args.video, force=args.force,
                                       limit_chunks=args.limit_chunks, model=args.model)
    qc = quality.run(conn, args.video)
    print(f"\n自動品質チェック: OK {qc['ok']} / 要目視 {qc['check']}（全{qc['total']}件）")
    for item_id, question, notes in qc["details"][:10]:
        print(f"  {item_id} {question} … {notes}")
    print(f"\nナレッジ生成: {result['videos']}本 / {result['items']}項目 "
          f"（確認待ち{result['pending']}件）スキップ{result['skipped']} エラー{result['error']}")
    for vid, title, note in result["details"]:
        print(f"  {vid}  {title[:40]:<42} {note}")
    return 0


def cmd_qc(args: argparse.Namespace) -> int:
    conn = db.connect()
    result = quality.run(conn, args.video)
    print(f"自動品質チェック: OK {result['ok']} / 要目視 {result['check']}（全{result['total']}件）")
    for item_id, question, notes in result["details"]:
        print(f"  {item_id} {question} … {notes}")
    return 0


def cmd_render(args: argparse.Namespace) -> int:
    conn = db.connect()
    quality.run(conn)
    book, pages, count = render.render_book(conn, draft=args.draft)
    print(f"解説PDF: {book}（{count}項目 / ページ対応 {len(pages)}件）")
    review, pending = render.render_review_booklet(conn)
    print(f"確認待ち別冊: {review}（{pending}項目）")
    csv_path, json_path, total = render.export_index(conn)
    print(f"Q&A索引: {csv_path}（{total}項目）")
    print(f"JSON   : {json_path}")
    qc_path, flagged = render.export_quality_list(conn)
    print(f"品質要目視: {qc_path}（{flagged}項目）")
    if count == 0:
        print("\n注意: 確認済みの項目がまだ0件です。内部確認用には --draft を付けて出力してください。")
    return 0


def cmd_review(args: argparse.Namespace) -> int:
    conn = db.connect()
    if args.judge not in (config.ReviewStatus.APPROVED, config.ReviewStatus.REJECTED):
        print(f"判定は「{config.ReviewStatus.APPROVED}」か「{config.ReviewStatus.REJECTED}」を指定してください。")
        return 1
    db.apply_review(conn, args.item, args.judge, args.reviewer or "", args.comment or "")
    print(f"{args.item} を {args.judge} にしました。")
    return 0


def cmd_import_review(args: argparse.Namespace) -> int:
    """専門家の確認結果をCSVで戻す（列: ナレッジID, 判定, 確認者, コメント）。"""
    conn = db.connect()
    path = Path(args.file)
    applied = skipped = 0
    with path.open(encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            item_id = (row.get("ナレッジID") or "").strip()
            judge = (row.get("判定") or "").strip()
            if not item_id or judge not in (config.ReviewStatus.APPROVED, config.ReviewStatus.REJECTED):
                skipped += 1
                continue
            db.apply_review(conn, item_id, judge,
                            (row.get("確認者") or "").strip(), (row.get("コメント") or "").strip())
            applied += 1
    print(f"確認結果を反映: {applied}件（スキップ{skipped}件）")
    return 0


def cmd_sync_new(args: argparse.Namespace) -> int:
    """⑤ 新着動画だけを 一覧 → 字幕 → 生成 → 出力 まで通す。cronからこれを呼ぶ。"""
    conn = db.connect()
    client = _client()
    new_count, total = knowledge.sync_video_list(conn, client)
    print(f"動画一覧: 全{total}本（新規{new_count}本）")
    if new_count == 0 and not args.force:
        print("新着なし。終了します。")
        return 0

    fetched = knowledge.fetch_captions(conn, client, only_missing=True)
    print(f"字幕取得: 成功{fetched['ok']} / 字幕なし{fetched['no_caption']} / エラー{fetched['error']}")
    knowledge.import_manual_captions(conn)
    built = knowledge.build_knowledge(conn, force=False)
    print(f"ナレッジ生成: {built['videos']}本 / {built['items']}項目（確認待ち{built['pending']}件）")
    if built["items"]:
        cmd_render(argparse.Namespace(draft=args.draft))
    return 0


def cmd_status(args: argparse.Namespace) -> int:
    conn = db.connect()
    s = db.stats(conn)
    print(f"動画 {s['videos']}本 / 字幕取得済 {s['transcribed']}本")
    print(f"項目 {s['items']}件  （確認済 {s['approved']} / 確認不要 {s['not_required']} / 確認待ち {s['pending']}）")
    print("\n動画ごとの状態:")
    for row in db.list_videos(conn):
        print(f"  {row['video_id']}  {row['status']:<12} 字幕={row['caption_state'] or '-':<10} "
              f"項目={row['item_count'] or 0:>3}  {row['title'][:40]}")
        if row["note"]:
            print(f"      備考: {row['note'][:100]}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="交通事故実務デスク 動画ナレッジ化")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("check", help="接続確認").set_defaults(func=cmd_check)
    sub.add_parser("list-videos", help="① 動画一覧を取り込む").set_defaults(func=cmd_list_videos)

    p = sub.add_parser("test-one", help="最初の1本で検証")
    p.add_argument("--video", help="動画ID（省略時は一覧の先頭）")
    p.set_defaults(func=cmd_test_one)

    p = sub.add_parser("fetch-captions", help="② 字幕を取得")
    p.add_argument("--video", action="append", help="動画ID（複数指定可）")
    p.add_argument("--force", action="store_true", help="取得済みでも再取得する")
    p.set_defaults(func=cmd_fetch_captions)

    sub.add_parser("import-manual", help="手動/WhisperのVTTを取り込む").set_defaults(func=cmd_import_manual)

    p = sub.add_parser("build", help="③④ ナレッジ生成")
    p.add_argument("--video", action="append", help="動画ID（複数指定可）")
    p.add_argument("--force", action="store_true", help="生成済みでも作り直す（既存項目は削除）")
    p.add_argument("--limit-chunks", type=int, help="1本あたりの処理チャンク数を制限（試験用）")
    p.add_argument("--model", help="モデルを一時的に変える")
    p.set_defaults(func=cmd_build)

    p = sub.add_parser("qc", help="自動品質チェックを実行")
    p.add_argument("--video", action="append", help="動画ID（複数指定可）")
    p.set_defaults(func=cmd_qc)

    p = sub.add_parser("render", help="PDFとQ&A索引を出力")
    p.add_argument("--draft", action="store_true", help="確認待ちも含めた内部ドラフトを出す")
    p.set_defaults(func=cmd_render)

    p = sub.add_parser("review", help="確認結果を1件反映")
    p.add_argument("--item", required=True)
    p.add_argument("--judge", required=True, help="確認済 / 要修正")
    p.add_argument("--reviewer")
    p.add_argument("--comment")
    p.set_defaults(func=cmd_review)

    p = sub.add_parser("import-review", help="確認結果CSVを反映")
    p.add_argument("file")
    p.set_defaults(func=cmd_import_review)

    p = sub.add_parser("sync-new", help="⑤ 新着動画を処理")
    p.add_argument("--force", action="store_true", help="新着が無くても続行する")
    p.add_argument("--draft", action="store_true")
    p.set_defaults(func=cmd_sync_new)

    sub.add_parser("status", help="進捗表示").set_defaults(func=cmd_status)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
