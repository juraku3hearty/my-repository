"""院内確認シートを作る。

初回60項目のレビューで分かったことを反映している。
代表が手で見つけたもののうち、機械で先に拾えるものは拾って★を付け、
拾えないものだけに目を使ってもらうのが目的。

初回に出た12件の内訳と、ここでの扱い:

  機械で拾える
    推測表現（可能性があります等）        → ★を付ける。8件あった
    回答になっていない（示されていません）  → シートに出さない。1件あった
    質問の重なり                      → ★を付ける。1組あった
    音声認識由来の誤字（行動→公道）       → ★を付けて候補を示す。1件あった
    金額・日数・期間が入る回答           → ★を付ける。間違えると直接事故になる
    条件が対になる話（一括対応／被害者請求） → ★を付ける。要約が逆になった例があった

  機械では拾えない（代表の目が要る）
    講師自身の説明が誤解を招く形だった     → 1通院あたり8600円。要約は忠実だった
    講師が話していない内容の補足が要る      → 交通費
    勧誘と読める書き方                 → 月15日の通院を促して見える

並び順は ★が先、次にカテゴリー。先に見てほしいものが上に来る。
"""
from __future__ import annotations

import csv
import re
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "webapp"))
from app import containment          # noqa: E402  本体と同じ採点を使う

DB = ROOT / "data" / "jiko_desk.sqlite3"

# ── 自動で付ける★ ─────────────────────────────────────────
GUESS = re.compile(r"可能性があります|と考えられます|かもしれません|と思われます|でしょう")
EMPTY = re.compile(r"示されていません|言及されていません|説明されていません|"
                   r"述べられていません|触れられていません")
MONEY = re.compile(r"\d[\d,]*\s*(?:万円|円)|\d+\s*(?:日|ヶ月|か月|週間|年)|\d+\s*(?:％|%|割|級)")
PAIR  = ("一括対応", "被害者請求", "損保", "任意保険会社")
PUSH  = re.compile(r"(通院|来院|施術).{0,12}(促す|勧め|すすめ|増やす|目安に|最大(に|化))|"
                   r"(慰謝料|金額).{0,16}(最大|増やす|多く)")

# 質問文に必ず入る言葉。重なりを測る前に外さないと、
# 中身が別でも「メリットは何ですか」どうしで引っかかる。
BOILER = re.compile(
    r"交通事故|患者|先生|整骨院|接骨院|場合|対応|方法|メリット|デメリット|ポイント|"
    r"は何ですか|ですか|でしょうか|について|における|に関する|とは|のは|ため|"
    r"必要|可能|注意|際|時|とき")


def bare(q: str) -> str:
    """定型句を外した、その質問だけの言葉。"""
    return BOILER.sub("", q or "")


def overlap_scorer(questions: list[str]):
    """この束の中で「ありふれた言葉」を外してから重なりを測る関数を返す。

    束がテーマ別（自賠責保険Aなど）だと、全部の質問に「自賠責」が入る。
    固定の除外語リストではテーマ語を外せないので、
    束の中で4分の1以上の質問に出てくる文字のつながりは数えない。
    """
    from app import bigrams
    n = len(questions) or 1
    df: dict[str, int] = {}
    for q in questions:
        for g in bigrams(bare(q)):
            df[g] = df.get(g, 0) + 1
    common = {g for g, c in df.items() if c / n > 0.25}

    def score(a: str, b: str) -> float:
        ga = bigrams(bare(a)) - common
        gb = bigrams(bare(b)) - common
        if not ga or not gb:
            return 0.0
        hit = len(ga & gb)
        return max(hit / len(ga), hit / len(gb))
    return score


# 文字起こしで繰り返し出る聞き取り違い。回答に混ざっていないか見る。
TYPO = {
    "行動": "公道", "正骨院": "整骨院", "精骨院": "整骨院", "性骨院": "整骨院",
    "自媒石": "自賠責", "自賠席": "自賠責", "自媒体": "自賠責",
    "医者料": "慰謝料", "医者量": "慰謝料", "東急": "等級",
    "障害保険": "傷害保険", "交易障害": "後遺障害", "任保険": "任意保険",
    "損売会社": "損保会社", "尊法会社": "損保会社", "柔道征服": "柔道整復",
    "打木念座": "打撲捻挫", "診所": "診断書", "政教": "共済",
}


def flags(row: sqlite3.Row) -> tuple[list[str], list[str]]:
    """（★＝AIがずれている疑い、印＝内容の性質上ていねいに見たいもの）に分ける。

    初回は★が60件中1件しか付いておらず、優先順位の役に立たなかった。
    かといって全部に付けると今度は意味が無くなる。
    「AIの書き方の問題」と「話の中身の性質」は別物なので、列を分ける。
    """
    text = f"{row['answer_short'] or ''} {row['body_md'] or ''}"
    star, kind = [], []
    if GUESS.search(text):
        star.append("推測表現")
    if PUSH.search(text):
        star.append("勧誘に見える")
    found = [f"{a}→{b}" for a, b in TYPO.items() if a in text]
    if found:
        star.append("誤字候補:" + " ".join(found[:3]))
    if MONEY.search(text):
        kind.append("数字")
    if sum(w in text for w in PAIR) >= 2:
        kind.append("条件が対")
    return star, kind


def build(video_ids: list[str], out_path: Path, compare_to: Path | None = None) -> None:
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    q = ", ".join("?" for _ in video_ids)
    rows = conn.execute(
        f"SELECT i.*, v.title, v.url FROM items i LEFT JOIN videos v ON v.video_id = i.video_id "
        f"WHERE i.video_id IN ({q})", video_ids).fetchall()

    # 回答になっていないものは、そもそも見てもらう必要がない
    kept, dropped = [], []
    for r in rows:
        if EMPTY.search(f"{r['answer_short'] or ''} {r['body_md'] or ''}"):
            dropped.append(r)
        else:
            kept.append(r)

    # 同じシート内で質問が重なるもの
    overlap: dict[str, list[tuple[str, float, str]]] = {}
    for i, a in enumerate(kept):
        for b in kept[i + 1:]:
            qa, qb = bare(a["question"]), bare(b["question"])
            c = max(containment(qa, qb), containment(qb, qa))
            if c >= 0.55:
                overlap.setdefault(a["id"], []).append((b["id"], c, b["question"]))
                overlap.setdefault(b["id"], []).append((a["id"], c, a["question"]))

    # 既に承認済みのものと重なるか（初回の済52件など）
    approved = []
    if compare_to and compare_to.exists():
        approved = [r for r in csv.DictReader(compare_to.open(encoding="utf-8"))
                    if r.get("判定") == "済"]
    clash: dict[str, list[tuple[str, float, str]]] = {}
    for a in kept:
        for b in approved:
            qa, qb = bare(a["question"]), bare(b["質問"])
            c = max(containment(qa, qb), containment(qb, qa))
            if c >= 0.55:
                clash.setdefault(a["id"], []).append((b["ナレッジID"], c, b["質問"]))

    recs = []
    for r in kept:
        star, kind = flags(r)
        # 重なりは、相手を探しに行かなくて済むよう質問文も同じ行に出す
        pairs = sorted(overlap.get(r["id"], []) + clash.get(r["id"], []),
                       key=lambda t: -t[1])[:2]
        same = ""
        if pairs:
            star.append("重なり")
            same = "／".join(f"{i}（{c:.2f}）{q}" for i, c, q in pairs)
        url = (r["url"] or "").split("#")[0]
        recs.append({
            "ナレッジID": r["id"], "判定": "", "コメント": "",
            "注意": "★ " + " / ".join(star) if star else "",
            "種類": " ".join(kind),
            "重なり相手": same,
            "カテゴリー": r["category"] or "",
            "質問": r["question"] or "", "回答": r["answer_short"] or "",
            "講師の発言（根拠）": (r["evidence"] or "")[:600],
            "動画リンク": f"{url}#t={int(r['start_sec'] or 0)}s",
            "動画": (r["title"] or "")[:40],
        })
    # 1件で判断できるもの → 比較が要るもの → 数字など → 残り、の順に並べる
    def order(d):
        if d["注意"] and "重なり" not in d["注意"]:
            return (0, d["カテゴリー"], d["ナレッジID"])
        if d["注意"]:
            return (1, d["カテゴリー"], d["ナレッジID"])
        if d["種類"]:
            return (2, d["カテゴリー"], d["ナレッジID"])
        return (3, d["カテゴリー"], d["ナレッジID"])
    recs.sort(key=order)

    with out_path.open("w", encoding="utf-8", newline="") as fp:
        w = csv.DictWriter(fp, fieldnames=list(recs[0].keys()))
        w.writeheader(); w.writerows(recs)

    alone = sum(1 for d in recs if d["注意"] and "重なり" not in d["注意"])
    pair  = sum(1 for d in recs if d["注意"] and "重なり" in d["注意"])
    kind  = sum(1 for d in recs if not d["注意"] and d["種類"])
    print(f"  対象 {len(rows)}件 → 出力 {len(recs)}件（回答になっていない {len(dropped)}件は除外）")
    print(f"  ① ★ 単独で判断できる（推測表現・誤字・勧誘） {alone:3}件 ← ここから")
    print(f"  ② ★ 重なり（相手の質問文も同じ行にある）     {pair:3}件")
    print(f"  ③ 印 数字・条件が対                        {kind:3}件")
    print(f"  ④ 印なし                                  {len(recs)-alone-pair-kind:3}件")
    for r in dropped:
        print(f"    除外: {r['id']} {r['question'][:46]}")
    return recs


def build_from_csv(src: Path, out_path: Path, compare_to: Path | None = None) -> None:
    """すでに作ってある束（out/①〜⑥）に、あとから検査と並べ替えをかける。

    DBは見ない。束を作った時点とDBの中身がずれている場合があるため、
    束に書かれている質問・回答・根拠だけを使う。
    """
    rows = list(csv.DictReader(src.open(encoding="utf-8-sig")))

    done, approved = set(), []
    if compare_to and compare_to.exists():
        for r in csv.DictReader(compare_to.open(encoding="utf-8")):
            done.add(r["ナレッジID"])
            if r.get("判定") == "済":
                approved.append(r)

    kept, already, dropped = [], [], []
    for r in rows:
        if r["ナレッジID"] in done:
            already.append(r)
        elif EMPTY.search(r.get("回答", "")):
            dropped.append(r)
        else:
            kept.append(r)

    sim = overlap_scorer([r["質問"] for r in kept] + [r["質問"] for r in approved])
    pairs: dict[str, list[tuple[str, float, str]]] = {}
    for i, a in enumerate(kept):
        for b in kept[i + 1:]:
            c = sim(a["質問"], b["質問"])
            if c >= 0.55:
                pairs.setdefault(a["ナレッジID"], []).append((b["ナレッジID"], c, b["質問"]))
                pairs.setdefault(b["ナレッジID"], []).append((a["ナレッジID"], c, a["質問"]))
    for a in kept:
        for b in approved:
            c = sim(a["質問"], b["質問"])
            if c >= 0.55:
                pairs.setdefault(a["ナレッジID"], []).append(
                    (b["ナレッジID"] + "（済）", c, b["質問"]))

    recs = []
    for r in kept:
        text = r.get("回答", "")
        star, kind = [], []
        if GUESS.search(text):
            star.append("推測表現")
        if PUSH.search(text):
            star.append("勧誘に見える")
        typo = [f"{a}→{b}" for a, b in TYPO.items() if a in text]
        if typo:
            star.append("誤字候補:" + " ".join(typo[:3]))
        if MONEY.search(text):
            kind.append("数字")
        if sum(w in text for w in PAIR) >= 2:
            kind.append("条件が対")
        top = sorted(pairs.get(r["ナレッジID"], []), key=lambda t: -t[1])[:2]
        same = ""
        if top:
            star.append("重なり")
            same = "／".join(f"{i}（{c:.2f}）{q}" for i, c, q in top)
        recs.append({
            "ナレッジID": r["ナレッジID"], "判定": "", "コメント": "",
            "注意": "★ " + " / ".join(star) if star else "",
            "種類": " ".join(kind), "重なり相手": same,
            "カテゴリー": r.get("カテゴリー", ""),
            "質問": r["質問"], "回答": r.get("回答", ""),
            "講師の発言（根拠）": r.get("講師の発言（根拠）", ""),
            "動画リンク": r.get("動画リンク", ""),
        })

    def order(d):
        if d["注意"] and "重なり" not in d["注意"]:
            return (0, d["カテゴリー"], d["ナレッジID"])
        if d["注意"]:
            return (1, d["カテゴリー"], d["ナレッジID"])
        if d["種類"]:
            return (2, d["カテゴリー"], d["ナレッジID"])
        return (3, d["カテゴリー"], d["ナレッジID"])
    recs.sort(key=order)

    with out_path.open("w", encoding="utf-8", newline="") as fp:
        w = csv.DictWriter(fp, fieldnames=list(recs[0].keys()))
        w.writeheader(); w.writerows(recs)

    alone = sum(1 for d in recs if d["注意"] and "重なり" not in d["注意"])
    pair  = sum(1 for d in recs if d["注意"] and "重なり" in d["注意"])
    kindn = sum(1 for d in recs if not d["注意"] and d["種類"])
    print(f"  元 {len(rows)}件")
    print(f"    初回で確認済み {len(already)}件 を除外")
    print(f"    回答になっていない {len(dropped)}件 を除外")
    print(f"  → 出力 {len(recs)}件")
    print(f"     ① ★ 単独で判断できる  {alone:3}件 ← ここから")
    print(f"     ② ★ 重なり           {pair:3}件")
    print(f"     ③ 印 数字・条件が対    {kindn:3}件")
    print(f"     ④ 印なし             {len(recs)-alone-pair-kindn:3}件")
    for r in dropped:
        print(f"       除外(回答になっていない): {r['ナレッジID']} {r['質問'][:40]}")


if __name__ == "__main__":
    args = sys.argv[1:]
    r1 = ROOT / "data" / "review-round1.csv"
    if args and args[0] == "--from-csv":
        build_from_csv(Path(args[1]), Path(args[2]), compare_to=r1)
        print(f"  → {args[2]}")
    else:
        build(args[:-1], Path(args[-1]), compare_to=r1)
        print(f"  → {args[-1]}")
