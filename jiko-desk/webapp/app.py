"""交通事故実務デスク 会員向けQ&Aアプリ（雛形）

設計方針
  1. 回答をAIに生成させない。検索して、人が確認済みの回答をそのまま出す。
     AIが文章を作らなければ、未確認情報を補うことは構造的に起こらない。
  2. 会員に見せるのは「公開可」のナレッジだけ。一覧表示も一括取得も提供しない。
     検索語が無いときは何も返さない。
  3. 利用ログは記録前にマスキングする（applog.py）。

画面
  /                 会員向け質問画面
  /admin/analytics  運営者向け分析画面
  /admin/knowledge  管理者向けナレッジ管理画面
"""
from __future__ import annotations

import os
import re
import sqlite3
from datetime import date, timedelta
from pathlib import Path

from flask import (Flask, g, redirect, render_template, request, session, url_for)

import applog

# ── 検証環境ガード ────────────────────────────────────────────
# require_member() が未実装（常に通す）のため、本番公開を禁止する。
# APP_ENV=dev 以外では起動させない。外部公開も 127.0.0.1 固定で防ぐ。
APP_ENV = os.environ.get("APP_ENV", "dev")
if APP_ENV != "dev":
    raise SystemExit(
        "この雛形は検証専用です。認証（require_member）が未実装のため本番では起動できません。")

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = Path(os.environ.get("APP_DB_PATH", BASE_DIR / "demo.sqlite3"))
if DB_PATH.name != "demo.sqlite3":
    raise SystemExit("検証環境ではダミーデータ（demo.sqlite3）以外を開けません。")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "demo")

app = Flask(__name__)
app.secret_key = os.environ.get("FLASK_SECRET", "dev-secret-change-me")

PUBLISHED = "公開可"
NORMALIZE_RE = re.compile(r"[\s、。，．・「」『』（）()！？!?,.:：;；\-ー―‐]")


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        applog.init(g.db)
    return g.db


@app.teardown_appcontext
def close_db(_exc=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


# ---------------- 検索（AIを使わない） ----------------

def normalize(text: str) -> str:
    return NORMALIZE_RE.sub("", (text or "")).lower()


def bigrams(text: str) -> set[str]:
    t = normalize(text)
    return {t[i:i + 2] for i in range(len(t) - 1)} or {t}


def containment(query: str, target: str) -> float:
    """質問のうち、どれだけが相手に含まれているかの割合。

    Dice係数だと、短い質問と長い本文で値が薄まり、正解とノイズが分離しない
    （実測で正解0.19・ノイズ0.02と差が出なかった）。被覆率にすると
    正解0.43〜1.00／ノイズ0.00〜0.33に分かれたので、こちらを使う。
    """
    a, b = bigrams(query), bigrams(target)
    return len(a & b) / len(a) if a else 0.0


# 主回答として大きく出すしきい値と、関連質問として小さく出すしきい値。
# どちらも下回る場合は回答を出さず、相談導線だけを出す。
CONFIDENT = 0.40
RELATED = 0.25


def search_items(conn, query: str, limit: int = 6) -> list[dict]:
    """公開可のナレッジだけを対象に、文字の重なりで近いものを返す。

    LLMは使わない。返すのは人が確認した文章そのもので、要約も生成もしない。
    スコアを添えて返し、主回答と関連質問の切り分けは呼び出し側で行う。
    """
    if not query.strip():
        return []
    # 公開可であることに加えて、「承認済み」かつ「承認した版と今の本文が一致」を要求する。
    # 本文を直すと answer_version が変わり、再承認するまで会員には出なくなる。
    rows = conn.execute(
        "SELECT * FROM items WHERE publish_status = ? "
        "AND approval_state = '承認済' AND approved_version = answer_version "
        "AND approved_version <> ''", (PUBLISHED,)).fetchall()
    scored = []
    for row in rows:
        # 質問・キーワード・分類の一致を重く見る。本文だけの偶然の一致で上位に来ないように。
        head = f"{row['question']} {row['keywords']} {row['category']}"
        whole = f"{head} {row['answer']}"
        score = 0.65 * containment(query, head) + 0.35 * containment(query, whole)
        if score >= RELATED:
            item = dict(row)
            item["score"] = score
            scored.append(item)
    scored.sort(key=lambda x: -x["score"])
    return scored[:limit]


def current_member() -> str:
    return session.get("member_id", "guest")


def require_member():
    """会員向け画面の関所。ここ1か所を通れば、全経路で同じ判定になる。

    雛形の段階では常に通す（認証は連携方式の確定後に実装する）。
    本実装では次を満たす：
      - 未ログイン        → ログイン画面へ
      - 退会・停止        → 支払い/退会の案内へ（検索結果は一切返さない）
      - URL直接アクセス   → 同じ判定を通るので素通りできない
      - API直接呼び出し   → /api/* も同じ関数を通し、JSONで401を返す
    判定の根拠は members.status と members.paid_through のみで、
    Cyfons側のログイン状態は根拠にしない（Cyfonsが止められない場合があるため）。
    """
    return True   # TODO: 連携方式の確定後に実装する


# ---------------- 会員向け ----------------

@app.route("/", methods=["GET"])
def member_home():
    if not require_member():
        return redirect(url_for("admin_login"))
    query = (request.args.get("q") or "").strip()
    conn = get_db()
    primary, related = None, []
    if query:
        hits = search_items(conn, query)
        # 十分に近いものが無ければ、無理に回答を出さない。相談導線だけを出す。
        if hits and hits[0]["score"] >= CONFIDENT:
            primary, related = hits[0], hits[1:4]
        else:
            related = hits[:3]      # 「もしかしてこの質問ですか？」として出す
        applog.log_search(conn, current_member(), query,
                          1 if primary else 0, primary["id"] if primary else None)
        if primary:
            applog.log_view(conn, current_member(), primary["id"], entry="search")
    return render_template("member.html", query=query, primary=primary, related=related)


@app.route("/feedback", methods=["POST"])
def feedback():
    conn = get_db()
    applog.log_feedback(conn, current_member(), request.form.get("item_id", ""),
                        request.form.get("verdict", ""), request.form.get("reason", ""))
    if request.form.get("verdict") == "not_solved":
        return redirect(url_for("consult", q=request.form.get("q", "")))
    return redirect(url_for("member_home", q=request.form.get("q", ""), thanks=1))


@app.route("/video-click", methods=["POST"])
def video_click():
    """動画URLはクライアントから受け取らない。

    item_id だけを受け取り、サーバー側でDBを引いて
    「公開可」かつ「動画の公開を許可済み」のときだけ飛ばす。
    これにより、許可されていない過去動画のURLが会員の画面やHTMLソースに出ない。
    """
    conn = get_db()
    row = conn.execute(
        "SELECT video_id, video_url, start_sec FROM items "
        "WHERE id = ? AND publish_status = ? AND video_visible = 1 "
        "AND approval_state = '承認済' AND approved_version = answer_version",
        (request.form.get("item_id", ""), PUBLISHED)).fetchone()
    if row is None:
        return redirect(url_for("member_home"))
    applog.log_video_click(conn, current_member(), request.form.get("item_id", ""),
                           row["video_id"], row["start_sec"])
    return redirect(row["video_url"])


@app.route("/home")
def member_top():
    """会員トップ。新着件数と相談日程をデータから出す。"""
    if not require_member():
        return redirect(url_for("admin_login"))
    conn = get_db()
    today = date.today().isoformat()
    # 会員に公開した講座のうち、直近30日のものを新着として数える
    new_count = conn.execute(
        "SELECT COUNT(*) c FROM lessons WHERE member_visible = 1 AND published_at >= ?",
        ((date.today() - timedelta(days=30)).isoformat(),)).fetchone()["c"]
    def setting(key, default=""):
        row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
        return row["value"] if row else default
    next_date = setting("consult_next_date")
    # 開催日を過ぎた日程は出さない
    if next_date and next_date < today:
        next_date = ""
    return render_template("top.html", new_count=new_count,
                           consult_date=next_date, consult_note=setting("consult_note"))


@app.route("/consult")
def consult():
    """解決しなかった場合の相談案内。AIに答えさせず、人につなぐ。"""
    if not require_member():
        return redirect(url_for("admin_login"))
    return render_template("consult.html", query=(request.args.get("q") or ""))


# ---------------- 管理者 ----------------

def require_admin():
    return session.get("is_admin") is True


@app.route("/admin/login", methods=["GET", "POST"])
def admin_login():
    error = ""
    if request.method == "POST":
        if request.form.get("password") == ADMIN_PASSWORD:
            session["is_admin"] = True
            return redirect(url_for("analytics"))
        error = "パスワードが違います"
    return render_template("login.html", error=error)


@app.route("/admin/logout")
def admin_logout():
    session.pop("is_admin", None)
    return redirect(url_for("member_home"))


@app.route("/admin/analytics")
def analytics():
    if not require_admin():
        return redirect(url_for("admin_login"))
    conn = get_db()

    def rows(sql, *params):
        return conn.execute(sql, params).fetchall()

    summary = {
        "searches": conn.execute("SELECT COUNT(*) c FROM search_log").fetchone()["c"],
        "zero_hits": conn.execute("SELECT COUNT(*) c FROM search_log WHERE zero_hit=1").fetchone()["c"],
        "views": conn.execute("SELECT COUNT(*) c FROM view_log").fetchone()["c"],
        "members": conn.execute("SELECT COUNT(DISTINCT member_hash) c FROM search_log").fetchone()["c"],
        "clicks": conn.execute("SELECT COUNT(*) c FROM video_click").fetchone()["c"],
    }
    return render_template(
        "analytics.html",
        summary=summary,
        top_queries=rows("""SELECT query_masked q, COUNT(*) c FROM search_log
                            WHERE query_masked != '' GROUP BY q
                            HAVING c >= 1 ORDER BY c DESC LIMIT 12"""),
        # feedback を JOIN すると閲覧数が件数分だけ多重に数えられるので、
        # それぞれ独立した副問い合わせで数える。
        top_items=rows("""SELECT v.item_id, i.question, COUNT(*) views,
                          (SELECT COUNT(*) FROM feedback f
                            WHERE f.item_id=v.item_id AND f.verdict='helpful') helpful,
                          (SELECT COUNT(*) FROM feedback f
                            WHERE f.item_id=v.item_id AND f.verdict='not_solved') not_solved
                          FROM view_log v LEFT JOIN items i ON i.id=v.item_id
                          GROUP BY v.item_id ORDER BY views DESC LIMIT 12"""),
        unanswered=rows("""SELECT * FROM unanswered WHERE status='未対応'
                           ORDER BY ts DESC LIMIT 15"""),
        monthly=rows("""SELECT substr(ts,1,7) m, COUNT(*) searches,
                        SUM(zero_hit) zero FROM search_log GROUP BY m ORDER BY m DESC LIMIT 6"""),
        clicks=rows("""SELECT c.item_id, i.question, COUNT(*) clicks
                       FROM video_click c LEFT JOIN items i ON i.id=c.item_id
                       GROUP BY c.item_id ORDER BY clicks DESC LIMIT 8"""),
    )


@app.route("/admin/knowledge")
def manage():
    if not require_admin():
        return redirect(url_for("admin_login"))
    conn = get_db()
    keyword = (request.args.get("q") or "").strip()
    status = request.args.get("status") or ""
    sql = "SELECT * FROM items WHERE 1=1"
    params: list = []
    if keyword:
        sql += " AND (question LIKE ? OR answer LIKE ? OR category LIKE ?)"
        params += [f"%{keyword}%"] * 3
    if status:
        sql += " AND publish_status = ?"
        params.append(status)
    sql += " ORDER BY category, id LIMIT 200"
    items = conn.execute(sql, params).fetchall()
    counts = conn.execute("""SELECT publish_status s, COUNT(*) c FROM items GROUP BY s""").fetchall()
    return render_template("manage.html", items=items, keyword=keyword,
                           status=status, counts=counts)


@app.route("/admin/settings", methods=["POST"])
def admin_settings():
    if not require_admin():
        return redirect(url_for("admin_login"))
    conn = get_db()
    for key in ("consult_next_date", "consult_note"):
        if key in request.form:
            conn.execute("INSERT INTO settings(key, value) VALUES (?,?) "
                         "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                         (key, request.form[key].strip()))
    conn.commit()
    return redirect(url_for("manage"))


@app.route("/admin/knowledge/<item_id>", methods=["POST"])
def manage_update(item_id):
    if not require_admin():
        return redirect(url_for("admin_login"))
    conn = get_db()
    conn.execute("""UPDATE items SET internal_status=?, expert_status=?, publish_status=?,
                    updated_at=datetime('now','localtime') WHERE id=?""",
                 (request.form.get("internal_status"), request.form.get("expert_status"),
                  request.form.get("publish_status"), item_id))
    conn.commit()
    return redirect(url_for("manage", q=request.args.get("q", ""), status=request.args.get("status", "")))


if __name__ == "__main__":
    # 外部に出さない。検証は 127.0.0.1 からのみ。
    app.run(host="127.0.0.1", port=int(os.environ.get("PORT", 5001)), debug=True)
