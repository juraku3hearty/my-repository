"""ダミーデータでパイプラインの出力部分（④振り分け〜PDF/CSV）を検証する。

Gemini の応答を模したJSONを normalize_item に通すので、
AI出力の検証・要確認の二重判定・PDF組版・索引出力まで実データなしで確認できる。
Vimeo API と Gemini の実通信は含まない。
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import config
import db
import knowledge
import quality
import render
import transcript as tr

FAKE_VIDEOS = [
    {"video_id": "900000001", "title": "第1回 交通事故患者の初診対応と受付の基本",
     "url": "https://vimeo.com/900000001", "duration_sec": 3240, "published_at": "2026-01-15"},
    {"video_id": "900000002", "title": "第2回 保険会社からの打ち切り打診にどう対応するか",
     "url": "https://vimeo.com/900000002", "duration_sec": 2880, "published_at": "2026-01-29"},
]

# 文字起こし（ダミー）。品質チェックの根拠照合はこの本文に対して行われる
FAKE_TRANSCRIPTS = {
    "900000001": (
        "[00:00:02] 交通事故の患者さんが来院されたとき、まず確認するのは事故日と、警察に届け出をしているかどうかです。\n"
        "[00:03:20] 届け出がされていないと人身事故としての取り扱いにならないため、患者さん本人に届け出を促してください。\n"
        "[00:05:10] あわせて、相手方や保険会社から連絡が来ているかも初回に聞き取ります。一括対応の話が進んでいるかで動き方が変わります。\n"
        "[00:12:10] 患者さんの過失が大きい場合などは、健康保険を使う選択をすることがあります。その場合は第三者行為による傷病届が必要です。\n"
        "[00:16:40] 自賠責や任意保険で請求できるかどうかは状況によって変わります。"
    ),
    "900000002": (
        "[00:01:30] 保険会社から治療の打ち切りを打診された場合、すぐに同意しないでください。症状が続いているなら、その事実を記録として残すことが重要です。\n"
        "[00:08:00] 打ち切りの打診は保険会社側の都合によるもので、症状が残っているかどうかとは別の話です。\n"
        "[00:22:00] 施術証明書は施術録の内容を証明する書類です。記載が食い違うと後から説明を求められます。\n"
        "[00:28:30] 日付、施術部位、施術内容の3点は転記でずれが起きやすい箇所です。"
    ),
}

# Gemini が responseSchema に従って返す形を模したもの（内容はダミー）
FAKE_RESPONSES = {
    "900000001": [
        {
            "category": "初診・受付対応",
            "question": "交通事故の患者が来院したとき、受付で最初に確認することは何か",
            "answer_short": "事故日と、警察への届け出が済んでいるかをまず確認します。届け出がない場合は、人身事故としての扱いができず、その後の手続き全体に影響すると講座では説明されています。",
            "body_md": "交通事故の患者が来院した際、受付でまず押さえるのは事故日と警察への届け出状況です。\n\n講座では、この2点が確認できていないまま施術を始めてしまうと、後から書類を整えるのが難しくなると説明されています。特に届け出がされていないケースでは、人身事故としての取り扱いにならないため、患者本人に届け出を促す必要があります。\n\nあわせて、事故の相手方や保険会社から連絡が来ているかどうかも初回に聞き取ります。連絡が来ていない段階では、まだ一括対応の話が進んでいないため、院としての動き方が変わる点に触れられています。",
            "key_points": ["事故日を必ず記録する", "警察への届け出の有無を確認する", "保険会社からの連絡状況を聞き取る"],
            "caveats": "届け出がない場合に院が代わりに手続きすることはできないため、患者本人に案内する形になると説明されています。",
            "unknown_points": ["届け出が事故から数か月経っている場合の扱いは講座内で確認できない"],
            "keywords": ["初診", "受付", "事故日", "警察", "届け出", "人身事故"],
            "evidence_quote": "交通事故の患者さんが来院されたとき、まず確認するのは事故日と、警察に届け出をしているかどうかです。",
            "start_time": "00:00:02", "end_time": "00:06:40",
            "needs_expert_review": False, "expert_type": "なし",
            "review_points": "", "may_be_outdated": False,
        },
        {
            "category": "健康保険の併用",
            "question": "交通事故の施術で健康保険を使うことはあるのか",
            "answer_short": "講座では、患者側の事情で健康保険を使う場面があると説明されています。ただし第三者行為による傷病届が必要になるため、手続きの流れを患者に説明できるようにしておく必要があります。",
            "body_md": "交通事故は原則として自賠責や任意保険での取り扱いになりますが、患者の過失が大きい場合など、健康保険を使う選択をする場面があると講座では触れられています。\n\nその場合には第三者行為による傷病届の提出が必要になり、保険者への届け出が前提になります。院としては、患者が手続きの存在を知らないまま来院することが多いため、流れを説明できる状態にしておくことが求められます。",
            "key_points": ["原則は自賠責・任意保険での取り扱い", "健康保険を使う場合は第三者行為による傷病届が必要"],
            "caveats": "",
            "unknown_points": ["保険者ごとの届出様式の違いは講座内で確認できない"],
            "keywords": ["健康保険", "第三者行為", "傷病届", "併用", "過失"],
            "evidence_quote": "患者さんの過失が大きい場合などは、健康保険を使う選択をすることがあります。その場合は第三者行為による傷病届が必要です。",
            "start_time": "00:12:10", "end_time": "00:19:30",
            "needs_expert_review": True, "expert_type": "保険",
            "review_points": "健康保険併用の説明が現行の取り扱いとして妥当か確認をお願いします。",
            "may_be_outdated": True,
        },
    ],
    "900000002": [
        {
            "category": "打切り・治療終了",
            "question": "保険会社から治療の打ち切りを打診されたら、患者にどう案内すればよいか",
            "answer_short": "その場で同意しないよう案内します。症状が続いている事実を記録として残すことが重要だと講座では説明されています。打ち切りの判断は保険会社の都合であり、症状の有無とは別だという整理です。",
            "body_md": "保険会社から治療費の支払い打ち切りを打診された場合、講座では「その場で同意しない」ことが出発点だと説明されています。\n\n打ち切りの打診は保険会社側の都合によるもので、症状が残っているかどうかとは別の話として整理されています。院としてやるべきことは、症状が継続している事実を施術録に具体的に残すことです。どの動作でどの程度の痛みが出るのか、前回からの変化はどうかを記録しておくことで、継続の必要性を説明する材料になります。\n\nそのうえで、患者が自分で保険会社と話す場面になるため、何をどう伝えるかを患者と確認しておく流れが紹介されています。",
            "key_points": ["その場で同意させない", "症状継続の事実を施術録に具体的に残す", "患者が保険会社に伝える内容を事前に整理する"],
            "caveats": "院が保険会社と直接交渉する立場ではない点に注意が必要だと説明されています。",
            "unknown_points": ["打ち切り後に自費で継続する場合の料金設定は講座内で確認できない"],
            "keywords": ["打ち切り", "打切り", "保険会社", "治療費", "施術録", "症状固定"],
            "evidence_quote": "保険会社から治療の打ち切りを打診された場合、すぐに同意しないでください。症状が続いているなら、その事実を記録として残すことが重要です。",
            "start_time": "00:01:30", "end_time": "00:14:20",
            "needs_expert_review": True, "expert_type": "",
            "review_points": "",
            "may_be_outdated": False,
        },
        {
            "category": "文書作成（施術証明書・同意書）",
            "question": "施術証明書を書くときに気をつける点は何か",
            "answer_short": "実際に施術した内容と施術録の記載が一致していることが前提だと説明されています。なお文書料は1通5500円と説明されています。",
            "body_md": "施術証明書は、施術録に書かれている内容を証明するための書類です。講座では、施術録と証明書の記載が食い違っていると、後から説明を求められる原因になると説明されています。\n\n特に日付、施術部位、施術内容の3点は、転記の段階でずれが起きやすい箇所として挙げられています。月末にまとめて作成するより、都度確認しながら進めるほうが確実だという整理です。",
            "key_points": ["施術録と証明書の記載を一致させる", "日付・部位・内容の3点はずれやすい"],
            "caveats": "",
            "unknown_points": [],
            "keywords": ["施術証明書", "施術録", "文書作成", "転記"],
            "evidence_quote": "施術証明書は必ず月末までに提出し、料金は1通5500円と決まっています。",
            "start_time": "00:22:00", "end_time": "00:31:40",
            "needs_expert_review": False, "expert_type": "なし",
            "review_points": "", "may_be_outdated": False,
        },
    ],
}


def main() -> None:
    db_path = Path(__file__).resolve().parent / "sample.sqlite3"
    out_dir = Path(__file__).resolve().parent / "sample_out"
    if db_path.exists():
        db_path.unlink()
    conn = db.connect(db_path)

    for video in FAKE_VIDEOS:
        db.upsert_video(conn, video)
        db.save_transcript(conn, video["video_id"], source="ダミー", language="ja",
                           body=FAKE_TRANSCRIPTS[video["video_id"]], cue_count=4)

    total = 0
    for video_id, responses in FAKE_RESPONSES.items():
        row = db.get_video(conn, video_id)
        chunk = tr.Chunk(index=0, start=0, end=row["duration_sec"], text="")
        for raw in responses:
            item = knowledge.normalize_item(raw, row, chunk)
            assert item, f"検証で落ちた: {raw['question']}"
            item["video_id"] = video_id
            item_id = db.insert_item(conn, item)
            total += 1
            print(f"  {item_id} [{item['category']}] {item['review_status']}"
                  f"{'/' + item['expert_type'] if item['expert_type'] else ''}"
                  f"{' 更新確認要' if item['outdated'] else ''}")
        db.set_video_fields(conn, video_id, item_count=len(responses),
                            knowledge_built_at=db.now(), status=config.VideoStatus.BUILT)

    # 公開には院内確認と専門家確認の両方が要ることを確認する
    print("\n-- 公開判定の確認 --")
    print(f"  生成直後に公開可能な項目: {db.stats(conn)['publishable']}件（0件であること）")

    db.apply_review(conn, "KB-900000002-001", config.ReviewStatus.APPROVED,
                    reviewer="確認用ダミー（専門家）", comment="内容確認済み")
    print(f"  専門家確認だけ通した後 : {db.stats(conn)['publishable']}件（まだ0件であること）")

    db.apply_internal_review(conn, "KB-900000002-001", config.InternalStatus.APPROVED,
                             reviewer="確認用ダミー（院長）")
    db.apply_internal_review(conn, "KB-900000002-002", config.InternalStatus.APPROVED,
                             reviewer="確認用ダミー（院長）")
    print(f"  院内確認も通した後     : {db.stats(conn)['publishable']}件")

    qc = quality.run(conn)
    print(f"\n自動品質チェック: OK {qc['ok']} / 要目視 {qc['check']}")
    for item_id, question, notes in qc["details"]:
        print(f"  要目視 {item_id} {question} … {notes}")

    print(f"\n投入 {total}項目 / {db.stats(conn)}")

    draft, pages, count = render.render_book(conn, draft=True, out_dir=out_dir)
    print(f"ドラフト解説PDF : {draft}（{count}項目, ページ対応{len(pages)}件）")
    book, pages2, count2 = render.render_book(conn, draft=False, out_dir=out_dir)
    print(f"確認済み版PDF   : {book}（{count2}項目）")
    review, pending = render.render_review_booklet(conn, out_dir=out_dir)
    print(f"確認待ち別冊PDF : {review}（{pending}項目）")
    csv_path, json_path, n = render.export_index(conn, out_dir=out_dir)
    print(f"Q&A索引CSV      : {csv_path}（{n}項目）")
    qc_path, flagged = render.export_quality_list(conn, out_dir=out_dir)
    print(f"品質要目視CSV   : {qc_path}（{flagged}項目）")
    internal_path, unchecked = render.export_internal_review_list(conn, out_dir=out_dir)
    print(f"院内確認リストCSV: {internal_path}（未確認{unchecked}項目）")


if __name__ == "__main__":
    main()
