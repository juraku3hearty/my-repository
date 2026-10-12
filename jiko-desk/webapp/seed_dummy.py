"""画面確認用のダミーデータを作る。実データ（jiko_desk.sqlite3）には触れない。"""
from __future__ import annotations

import hashlib
import random
import sqlite3
from datetime import datetime, timedelta
from pathlib import Path

import applog
import membership

DB = Path(__file__).resolve().parent / "demo.sqlite3"

SCHEMA = """
DROP TABLE IF EXISTS items;
CREATE TABLE items (
    id TEXT PRIMARY KEY, category TEXT, question TEXT, answer TEXT, keywords TEXT,
    video_title TEXT, video_id TEXT, video_url TEXT, start_sec INTEGER, start_hms TEXT,
    internal_status TEXT, expert_status TEXT, publish_status TEXT,
    outdated INTEGER DEFAULT 0, supplement TEXT, supplement_by TEXT, updated_at TEXT,
    -- 院内確認の実績。確認していないものに確認済みと表示しないため、名前と日付で持つ
    internal_reviewer TEXT, internal_reviewed_at TEXT,
    -- 元動画を会員に見せてよいか。過去動画は既定で不可（0）
    video_visible INTEGER DEFAULT 0,
    -- 承認は「どの版を承認したか」で持つ。本文を直したら承認が外れる
    answer_version TEXT, approved_version TEXT, approval_state TEXT
);

DROP TABLE IF EXISTS lessons;
CREATE TABLE lessons (
    id TEXT PRIMARY KEY, title TEXT, published_at TEXT,
    member_visible INTEGER DEFAULT 0      -- 過去動画は既定で会員非公開
);

DROP TABLE IF EXISTS settings;
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
"""

LESSONS = [   # member_visible=1 が会員に見える。過去動画は 0 のまま
    ("LS-041", "交通事故対応の基本（2026年10月版）", "2026-10-10", 1),
    ("LS-040", "施術証明書の書き方", "2026-10-02", 1),
    ("LS-039", "打ち切り打診への対応", "2026-08-18", 1),
    ("LS-012", "2025.10.28 交通事故講座（過去回）", "2025-10-28", 0),
    ("LS-008", "2025.8.12 交通事故講座 初級編（過去回）", "2025-08-12", 0),
]

ITEMS = [
    ("打切り・治療終了", "保険会社から治療の打ち切りを打診されたら、患者にどう案内すればよいですか？",
     "その場で同意しないよう案内します。治療継続の判断は症状に基づくものであり、保険会社の打診に法的な拘束力はありません。症状が続いている事実を施術録に具体的に残してください。",
     "打ち切り,打切り,保険会社,治療費,施術録", "2025.10.28交通事故講座", "1131330358", 1007, "00:16:47",
     "院内確認済", "確認済", "公開可", 0, "", "", "院長 平井", "2026-09-22", 1),
    ("打切り・治療終了", "保険会社からの「打ち切り」の連絡に法的な拘束力はありますか？",
     "ありません。保険会社の社内規定に基づく打診であり、治療の継続を強制的に終了させるものではありません。",
     "打ち切り,法的拘束力,社内規定", "2025.10.28交通事故講座", "1131330358", 1175, "00:19:35",
     "院内確認済", "確認済", "公開可", 0, "", "", "院長 平井", "2026-09-22", 1),
    ("自賠責保険", "自賠責保険の傷害による損害の限度額と、その内訳は？",
     "限度額は120万円です。内訳は治療費・休業損害・慰謝料・交通費です。",
     "自賠責,120万,限度額,内訳,交通費", "自賠責保険（基礎）", "1060102035", 733, "00:12:13",
     "院内確認済", "確認済", "公開可", 0, "交通費も120万円の枠に含まれます（講座では触れられていません）", "院長", "院長 平井", "2026-08-25", 1),
    ("自賠責保険", "被害者請求とは何ですか？一括対応と何が違いますか？",
     "被害者が自賠責保険に直接請求する方法です。任意保険会社が間に入らないため、保険会社の都合による治療の打ち切りを受けません。",
     "被害者請求,一括対応,自賠責", "2026-02-17 交通事故講座", "1165673551", 619, "00:10:19",
     "院内確認済", "確認済", "公開可", 0, "", "", "院長 平井", "2026-09-22", 1),
    ("初診・受付対応", "交通事故の患者が来院したら、受付で最初に確認することは？",
     "事故日と、警察への届け出が済んでいるかを確認します。届け出がない場合は人身事故としての扱いにならないため、患者本人に届け出を案内します。",
     "初診,受付,事故日,警察,届け出", "2025.8.12交通事故講座 初級編", "1109352698", 762, "00:12:42",
     "院内確認済", "不要", "公開可", 0, "", "", "院長 平井", "2026-08-16", 0),
    ("保険会社対応", "整骨院での施術に医師の同意は必要ですか？",
     "柔道整復師の施術に医師の同意は基本的に不要です。ただし骨折・脱臼の施術には医師の同意が必要です。",
     "医師の同意,柔道整復師,骨折,脱臼", "2025.10.28交通事故講座", "1131330358", 1210, "00:20:10",
     "院内確認済", "確認済", "公開可", 0, "", "", "院長 平井", "2026-09-22", 1),
    ("健康保険の併用", "交通事故で健康保険を使うことはありますか？",
     "患者の過失が大きい場合などに使う場面があります。その場合は第三者行為による傷病届の提出が必要です。",
     "健康保険,第三者行為,傷病届,過失", "自賠責保険（基礎）", "1060102035", 1861, "00:31:01",
     "院内確認済", "確認済", "公開可", 1, "", "", "院長 平井", "2026-09-23", 0),
    ("請求・レセプト実務", "施術証明書を書くときの注意点は？",
     "施術録の記載と証明書の内容を一致させてください。日付・施術部位・施術内容の3点はずれが起きやすい箇所です。",
     "施術証明書,施術録,転記", "2025.8.12交通事故講座 初級編", "1109352698", 1320, "00:22:00",
     "院内確認済", "不要", "公開可", 0, "", "", "院長 平井", "2026-08-16", 0),
    ("後遺障害", "後遺障害の等級申請はどのように進めますか？",
     "（確認中のため非公開）", "後遺障害,等級,申請",
     "交通事故講座 2025-04-22", "1077611994", 1500, "00:25:00",
     "院内未確認", "確認待ち", "非公開", 0, "", "", "", "", 0),
    ("損害賠償・示談", "示談の前に整骨院が注意すべきことは？",
     "（院内確認待ちのため非公開）", "示談,損害賠償",
     "交通事故講座 2026-02-17", "1165673551", 2100, "00:35:00",
     "院内未確認", "確認待ち", "非公開", 1, "", "", "", "", 0),
]

QUERIES = [
    "打ち切り", "打ち切り 言われた", "治療の打ち切り", "保険会社 打ち切り",
    "医師の同意", "同意書", "自賠責 120万", "被害者請求", "被害者請求 やり方",
    "健康保険 使える", "施術証明書", "初診 確認",
    "後遺障害 申請", "後遺障害 等級", "弁護士特約", "症状固定 いつ",
]


def answer_hash(text: str) -> str:
    """回答本文の版。本文が1文字でも変われば値が変わる。"""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def main() -> None:
    if DB.exists():
        DB.unlink()
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    applog.init(conn)
    membership.init(conn)

    now = datetime.now()
    for i, row in enumerate(ITEMS, start=1):
        conn.execute(
            """INSERT INTO items (id, category, question, answer, keywords, video_title, video_id,
               video_url, start_sec, start_hms, internal_status, expert_status, publish_status,
               outdated, supplement, supplement_by, updated_at,
               internal_reviewer, internal_reviewed_at, video_visible,
               answer_version, approved_version, approval_state)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (f"KB-DEMO-{i:03d}", row[0], row[1], row[2], row[3], row[4], row[5],
             f"https://vimeo.com/{row[5]}#t={row[6]}s", row[6], row[7],
             row[8], row[9], row[10], row[11], row[12], row[13],
             (now - timedelta(days=random.randint(1, 60))).strftime("%Y-%m-%d %H:%M:%S"),
             row[14], row[15], row[16],
             answer_hash(row[2]),
             # 院内確認済のものだけ、その版を承認済みとして記録する
             answer_hash(row[2]) if row[8] == "院内確認済" else "",
             "承認済" if row[8] == "院内確認済" else "未承認"))
    for ls in LESSONS:
        conn.execute("INSERT INTO lessons VALUES (?,?,?,?)", ls)
    conn.execute("INSERT INTO settings VALUES ('consult_next_date', '2026-10-24')")
    conn.execute("INSERT INTO settings VALUES ('consult_note', '毎月1回。個別の事案を直接相談できます')")

    # 本文を直したのに再承認していない状態を1件作り、画面で検証できるようにする
    conn.execute("UPDATE items SET answer = answer || '（2026-10-12 修正）', "
                 "answer_version = ?, approval_state = '再承認待ち' WHERE id = 'KB-DEMO-008'",
                 (answer_hash("dummy-edited"),))
    conn.commit()

    published = [r["id"] for r in conn.execute("SELECT id FROM items WHERE publish_status='公開可'")]
    random.seed(7)
    for day in range(90):
        ts = (now - timedelta(days=day)).strftime("%Y-%m-%d %H:%M:%S")
        for _ in range(random.randint(0, 6)):
            member = f"member{random.randint(1, 18)}"
            query = random.choice(QUERIES)
            hit = not query.startswith(("後遺障害", "症状固定", "弁護士特約"))
            item = random.choice(published) if hit else None
            conn.execute("""INSERT INTO search_log (ts, member_hash, query_masked, result_count,
                            zero_hit, top_item_id, channel) VALUES (?,?,?,?,?,?,?)""",
                         (ts, applog.member_hash(member), query,
                          random.randint(1, 3) if hit else 0, 0 if hit else 1, item, "web"))
            if hit:
                conn.execute("INSERT INTO view_log (ts, member_hash, item_id, entry) VALUES (?,?,?,?)",
                             (ts, applog.member_hash(member), item, "search"))
                if random.random() < 0.35:
                    verdict = "helpful" if random.random() < 0.8 else "not_solved"
                    conn.execute("""INSERT INTO feedback (ts, member_hash, item_id, verdict, reason_tag)
                                    VALUES (?,?,?,?,?)""",
                                 (ts, applog.member_hash(member), item, verdict,
                                  "" if verdict == "helpful" else "内容が足りない"))
                    if verdict == "not_solved":
                        conn.execute("""INSERT INTO unanswered (ts, query_masked, cause, status, linked_item_id)
                                        VALUES (?,?,?,?,?)""", (ts, query, "not_solved", "未対応", item))
                if random.random() < 0.3:
                    conn.execute("""INSERT INTO video_click (ts, member_hash, item_id, video_id, start_sec)
                                    VALUES (?,?,?,?,?)""",
                                 (ts, applog.member_hash(member), item, "1131330358", 1007))
            else:
                conn.execute("""INSERT INTO unanswered (ts, query_masked, cause, status)
                                VALUES (?,?,?,?)""", (ts, query, "zero_hit", "未対応"))
    conn.commit()

    for table in ("items", "search_log", "view_log", "feedback", "video_click", "unanswered"):
        n = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
        print(f"  {table:<14} {n:>5}件")
    print(f"\nダミーDB: {DB}")


if __name__ == "__main__":
    main()
