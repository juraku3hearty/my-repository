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

import hashlib
import os
import re
import secrets
import sqlite3
from datetime import date, timedelta
from pathlib import Path

from flask import (Flask, g, jsonify, redirect, render_template, request,
                   send_from_directory, session, url_for)

import applog
import membership as mb
import reconcile as rec
import security as sec

# ── 検証環境ガード ────────────────────────────────────────────
# require_member() が未実装（常に通す）のため、本番公開を禁止する。
# APP_ENV=dev 以外では起動させない。外部公開も 127.0.0.1 固定で防ぐ。
APP_ENV = os.environ.get("APP_ENV", "dev")
REQUIRE_HTTPS = os.environ.get("REQUIRE_HTTPS", "0") == "1"

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = Path(os.environ.get("APP_DB_PATH", BASE_DIR / "demo.sqlite3"))
if DB_PATH.name != "demo.sqlite3":
    raise SystemExit("検証環境ではダミーデータ（demo.sqlite3）以外を開けません。")
# 本番では平文のパスワードを使わない。ADMIN_PASSWORD_HASH（security.hash_password の出力）を使う。
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "demo")
ADMIN_PASSWORD_HASH = os.environ.get("ADMIN_PASSWORD_HASH", "")

app = Flask(__name__)
app.secret_key = os.environ.get("FLASK_SECRET", "dev-secret-change-me")
sec.apply(app, APP_ENV)

# 本番で危ない設定が残っていないか、起動時に点検する。
# 1つでも残っていれば起動させない（「設定したつもり」で公開されるのを防ぐ）。
_problems = sec.preflight(APP_ENV)
if APP_ENV != "dev" and _problems:
    raise SystemExit("本番で起動できません：\n  - " + "\n  - ".join(_problems))

PUBLISHED = "公開可"
NORMALIZE_RE = re.compile(r"[\s、。，．・「」『』（）()！？!?,.:：;；\-ー―‐]")


def answer_hash(text: str) -> str:
    """回答本文の版。seed_dummy.py と同じ計算にそろえる。"""
    return hashlib.sha256((text or "").encode("utf-8")).hexdigest()[:16]


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        applog.init(g.db)
        mb.init(g.db)
        sec.init(g.db)
    return g.db


@app.before_request
def force_https_and_csrf():
    """HTTPSの強制と、POSTのCSRF確認。全リクエストがここを通る。"""
    if REQUIRE_HTTPS:
        proto = request.headers.get("X-Forwarded-Proto", request.scheme)
        if proto != "https":
            return redirect(request.url.replace("http://", "https://", 1), code=301)
    # 決済代行会社からの通知は外部から来るのでCSRFの対象外（別の方法で守る）
    if request.method == "POST" and not request.path.startswith("/webhook/"):
        if not sec.csrf_ok(session, request.form):
            return ("<html>この操作は受け付けられませんでした。"
                    "お手数ですが、画面を開き直してからお試しください。</html>"), 403
    return None


@app.context_processor
def inject_csrf():
    """すべてのテンプレートで {{ csrf() }} を使えるようにする。"""
    return {"csrf": lambda: sec.csrf_token(session)}


@app.after_request
def harden(resp):
    return sec.headers(resp, REQUIRE_HTTPS)


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
    return session.get("member_id", "anonymous")


def current_member_row():
    """ログイン中の会員。セッションに member_id が無ければ None。"""
    mid = session.get("member_id")
    if not mid:
        return None
    return get_db().execute("SELECT * FROM members WHERE member_id = ?", (mid,)).fetchone()


def require_member():
    """会員向け画面の関所。**既定は拒否**。認証が成立したときだけ通す。

    判定の根拠は members.status と paid_through のみ。
    Cyfonsのログイン状態は根拠にしない（Cyfonsを止められない場合があるため）。

    戻り値：(通してよいか, 行かせ先のレスポンス)
      - 未ログイン      → ログイン画面へ
      - 停止・解約・期限切れ → 支払い案内へ（検索結果は一切返さない）
      - URL直接アクセス → 全ルートがこの関数を通るので素通りできない
      - API            → JSONで401。本文に中身を含めない
    """
    row = current_member_row()
    if row is None:
        return False, redirect(url_for("login_page"))
    ok, reason = mb.can_use(row)
    if not ok:
        return False, redirect(url_for("billing", reason=reason))
    return True, None


def require_member_api():
    """API用。HTMLではなくJSONで401を返し、本文に中身を含めない。"""
    row = current_member_row()
    if row is None:
        return False, (jsonify({"error": "unauthorized"}), 401)
    ok, _ = mb.can_use(row)
    if not ok:
        return False, (jsonify({"error": "forbidden"}), 403)
    return True, None


# ---------------- 会員向け ----------------

@app.route("/", methods=["GET"])
def member_home():
    ok, resp = require_member()
    if not ok:
        return resp
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
    ok, resp = require_member()
    if not ok:
        return resp
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
    ok, resp = require_member()
    if not ok:
        return resp
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


# ───────────── 申込・ログイン ─────────────

# ── 本番の決済に触る操作の安全装置 ─────────────────────────
# 自動課金停止API（acsgate.aspx）を呼ぶ機能は、MAYUさんの承認があるまで
# 実行できないようにしておく。既定は無効。
# 有効にするには ALLOW_STOP_API=1 と STOP_API_AID（店舗ID）の両方が要る。
ALLOW_STOP_API = os.environ.get("ALLOW_STOP_API", "0") == "1"
STOP_API_AID = os.environ.get("STOP_API_AID", "")


def stop_auto_charge(acid: str) -> tuple[bool, str]:
    """自動課金を停止する。**承認があるまで実行されない。**

    注意（2026-10-13 サポート回答）
      - このAPIで停止すると、会員に自動で通知メールが送信される
      - 文面は管理画面「設定 ＞ ユーザ向けメール ＞ 自動課金 ＞ 停止」で確認できる
      - 文面を確認するまで使わない
      - 実行には、決済データ送信元IPに当方のサーバーを登録しておく必要がある
    """
    if not ALLOW_STOP_API or not STOP_API_AID:
        return False, "停止APIは無効です（ALLOW_STOP_API と STOP_API_AID が必要）"
    if not acid:
        return False, "自動課金番号が分かりません（acidのキックバック追加が未設定）"
    raise NotImplementedError(
        "実装前に、会員へ届く停止メールの文面を確認してください。"
        "docs/subscpay-facts.md の D2 を参照。")


# 通知の受け口のパス。推測できない長さにする。本番では環境変数で渡す。
WEBHOOK_SECRET = os.environ.get("WEBHOOK_SECRET", "demo-secret-please-change-0123456789")
# 検証環境では自分のPCから叩けるように送信元IPの確認を切る
ENFORCE_SOURCE_IP = os.environ.get("ENFORCE_SOURCE_IP", "0") == "1"


@app.route("/join", methods=["GET", "POST"])
def join():
    """申込フォーム。

    本番では famitect.com 配下に静的HTMLとして置く（決済データ送信元URLの制約）。
    ここは、その静的HTMLに埋め込む値を作るための試作である。
    押された時点で members に pending の行を作る。
    ER系エラーのときキックバックが飛ばない仕様のため、これが無いと
    「申し込んだつもりの人」を検知できない。
    """
    conn = get_db()
    if request.method == "POST":
        email = (request.form.get("email") or "").strip()
        if not mb.rate_ok(conn, "join_ip", sec.client_ip(request) or "?"):
            conn.commit()
            return render_template("join.html", email=email,
                                   error="しばらく時間をおいてからお試しください")
        if "@" not in email:
            return render_template("join.html", email=email,
                                   error="メールアドレスをご確認ください")
        if request.form.get("agree") != "1":
            return render_template("join.html", email=email,
                                   error="利用規約などへの同意が必要です")
        member_id = mb.create_pending(conn, email)
        conn.commit()
        # 本番ではここで ROBOT PAYMENT の決済フォームへPOSTする。
        # 試作では、送信される値を確認できる画面を出す。
        return render_template("join_confirm.html", member_id=member_id, email=email,
                               fields=[("aid", "〈店舗ID〉"), ("cod", member_id),
                                       ("jb", "CAPTURE"), ("am", "9800"), ("tx", "0"),
                                       ("sf", "0"), ("actp", "4"), ("acam", "9800"),
                                       ("actx", "0"), ("acsf", "0"), ("em", email),
                                       ("inm", "交通事故実務デスク 月額会員")],
                               # 内部パラメータの一覧は開発環境でのみ表示する
                               show_debug=(APP_ENV == "dev"
                                           and request.args.get("debug") == "1"))
    return render_template("join.html", error="", email="")


@app.route("/terms")
def terms():
    return render_template("terms.html")


@app.route("/privacy")
def privacy_policy():
    return render_template("privacy_policy.html")


@app.route("/tokusho")
def tokusho():
    return render_template("tokusho.html")


MAIL_FROM = os.environ.get("MAIL_FROM", "famitect@gaea.ocn.ne.jp")


def mask_email(email: str) -> str:
    """ta***@example.com の形にする。入力の確認用で、全文は見せない。"""
    email = (email or "").strip()
    if "@" not in email:
        return email
    name, dom = email.split("@", 1)
    head = name[:2] if len(name) > 2 else name[:1]
    return f"{head}{'*' * max(1, len(name) - len(head))}@{dom}"


@app.route("/login")
def login_page():
    """ログイン画面。メールアドレスを入れると使い捨てリンクが届く。

    トークンはURLのフラグメント（#）で渡される。フラグメントはサーバーに送られないので、
    アクセスログにもRefererにも残らない。このページのJavaScriptが読み取って
    POSTで送る。
    """
    return render_template("login_member.html", sent=False, error="",
                           masked="", mail_from=MAIL_FROM)


@app.route("/login/request", methods=["POST"])
def login_request():
    conn = get_db()
    # 再送のときはフォームに入れず、セッションから取る。
    # 生のメールアドレスをHTMLに出さないため。
    email = (request.form.get("email") or session.get("login_email") or "").strip()
    session["login_email"] = email
    ip = sec.client_ip(request) or "?"
    # 連打でメールを送りつけられないようにする。制限に達しても画面は同じにする。
    if not (mb.rate_ok(conn, "login_request_ip", ip)
            and mb.rate_ok(conn, "login_request_email", mb.norm_email(email))):
        conn.commit()
        return render_template("login_member.html", sent=True, error="",
                               masked=mask_email(email), mail_from=MAIL_FROM)
    row = mb.find(conn, email=email)
    # 会員がいてもいなくても同じ画面を出す。どのメールが登録済みかを教えないため。
    if row is not None and row["status"] != "cancelled":
        mb.send_login_link(conn, row, request.url_root)
    conn.commit()
    return render_template("login_member.html", sent=True, error="",
                           masked=mask_email(email), mail_from=MAIL_FROM)


@app.route("/login/consume", methods=["POST"])
def login_consume():
    """フラグメントから渡されたトークンを1回だけ使う。"""
    conn = get_db()
    ip = sec.client_ip(request) or "?"
    # 総当たり対策。失敗した試行だけを数えるので、正規の利用者が共有IPから
    # 何度ログインしても打ち止めにならない。
    if not mb.rate_ok(conn, "login_consume_ip", ip, record=False):
        conn.commit()
        return jsonify({"ok": False}), 429
    token = (request.form.get("t") or "").strip()
    member_id = mb.consume_login_token(conn, token)
    if not member_id:
        mb.rate_hit(conn, "login_consume_ip", ip)
    conn.commit()
    if not member_id:
        return jsonify({"ok": False}), 401
    session.clear()
    session["member_id"] = member_id
    session.permanent = True
    return jsonify({"ok": True})


@app.route("/logout")
def member_logout():
    session.pop("member_id", None)
    return redirect(url_for("login_page"))


@app.route("/billing")
def billing():
    """支払い・利用停止の案内。ログインはできるが検索結果は返さない画面。"""
    row = current_member_row()
    if row is None:
        return redirect(url_for("login_page"))
    # 利用できる会員がURLを直接開いた場合は、誤解を与えないよう会員トップへ戻す
    usable, _ = mb.can_use(row)
    if usable:
        return redirect(url_for("member_top"))
    return render_template("billing.html", row=row,
                           reason=request.args.get("reason", ""))


# ───────────── API（会員向け） ─────────────
#
# 画面と同じ関所を通す。資格が無い場合は画面に飛ばさず、JSONで状態コードだけ返す。
#   401 未ログイン        … 誰か分からない
#   403 資格なし          … 誰かは分かるが使えない（pending / suspended / cancelled）
#   404 対象なし          … 非公開・未承認・存在しないID
# いずれも本文に回答やURLを含めない。

@app.route("/api/search")
def api_search():
    ok, resp = require_member_api()
    if not ok:
        return resp
    conn = get_db()
    query = (request.args.get("q") or "").strip()
    if not query:
        return jsonify({"results": []})
    hits = search_items(conn, query)
    primary = hits[0] if hits and hits[0]["score"] >= CONFIDENT else None
    related = (hits[1:4] if primary else hits[:3])
    return jsonify({
        "answer": None if primary is None else {
            "id": primary["id"], "question": primary["question"],
            "answer": primary["answer"],
            "reviewed_at": primary["internal_reviewed_at"],
            "reviewer": primary["internal_reviewer"],
        },
        # 関連は質問だけ。回答本文は返さない。
        "related": [{"id": r["id"], "question": r["question"]} for r in related],
    })


@app.route("/api/item/<item_id>")
def api_item(item_id):
    ok, resp = require_member_api()
    if not ok:
        return resp
    row = get_db().execute(
        "SELECT * FROM items WHERE id = ? AND publish_status = ? "
        "AND approval_state = '承認済' AND approved_version = answer_version "
        "AND approved_version <> ''", (item_id, PUBLISHED)).fetchone()
    if row is None:
        return jsonify({"error": "not_found"}), 404
    return jsonify({"id": row["id"], "question": row["question"], "answer": row["answer"],
                    "reviewed_at": row["internal_reviewed_at"]})


@app.route("/api/status")
def api_status():
    """自分の資格だけを返す。他人の情報は返さない。"""
    row = current_member_row()
    if row is None:
        return jsonify({"error": "unauthorized"}), 401
    usable, reason = mb.can_use(row)
    return jsonify({"usable": usable, "status": row["status"],
                    "paid_through": row["paid_through"], "reason": reason})


# ───────────── 書式ダウンロード（認証付き配信） ─────────────

DOWNLOAD_DIR = BASE_DIR / "downloads"
DOWNLOADS = {
    "shojutsu-shomeisho": ("shojutsu-shomeisho.txt", "施術証明書（ひな形）.txt"),
    "doisho": ("doisho.txt", "同意書（ひな形）.txt"),
}


@app.route("/downloads")
def downloads():
    ok, resp = require_member()
    if not ok:
        return resp
    return render_template("downloads.html", files=DOWNLOADS)


@app.route("/downloads/<key>")
def download_file(key):
    """Web公開領域に置かず、関所を通してから配信する。直リンクでは落とせない。"""
    ok, resp = require_member()
    if not ok:
        return resp
    item = DOWNLOADS.get(key)
    if item is None:
        return "<html>見つかりません</html>", 404
    return send_from_directory(DOWNLOAD_DIR, item[0], as_attachment=True,
                               download_name=item[1])


# ───────────── 決済通知の受け口 ─────────────

@app.route("/webhook/subscpay/<secret>", methods=["GET", "POST"])
def webhook_initial(secret):
    return _webhook(secret, "initial")


@app.route("/webhook/subscpay-auto/<secret>", methods=["GET", "POST"])
def webhook_auto(secret):
    return _webhook(secret, "auto")


def _webhook(secret: str, kind: str):
    """キックバックの受け口。

    仕様上の制約（docs/membership-integration.md 19-4・20-4）
      - HTML GET形式で届く（クエリ文字列）
      - 1行目にHTMLを出力しないと「通知失敗」として記録される
      - 「決済結果 待ち時間 30秒」があるため、ここでは保存だけして即返す
    """
    if not secrets.compare_digest(secret, WEBHOOK_SECRET):
        return "<html>NG</html>", 404
    params = dict(request.args) | dict(request.form)
    conn = get_db()
    mb.receive(conn, kind, params, sec.client_ip(request) or "", ENFORCE_SOURCE_IP)
    # 反映はここでやらない。別途 process_pending() が処理する。
    return "<html>OK</html>", 200


@app.route("/admin/process-events", methods=["POST"])
def admin_process_events():
    """未処理の通知を反映する。本番ではワーカーかcronで回す。"""
    if not require_admin():
        return redirect(url_for("admin_login"))
    conn = get_db()
    n = mb.process_pending(conn)
    mb.check_stale_pending(conn)
    mb.purge_tokens(conn)
    conn.commit()
    return redirect(url_for("members_admin", processed=n))


@app.route("/admin/reconcile", methods=["GET", "POST"])
def admin_reconcile():
    """日次照合。CSVが無くても「通知が来ていない会員」は拾える。

    キックバックの自動再送が無い（2026-10-13 サポート回答）ため、
    取りこぼしに気づく手段はここだけになる。
    """
    if not require_admin():
        return redirect(url_for("admin_login"))
    conn = get_db()
    result = None
    overdue = []
    stale = rec.check_reconcile_overdue(conn)
    last = rec.last_reconciled_at(conn)
    if request.method == "POST":
        overdue = rec.check_overdue(conn)
        rec.record_quick_check(conn)
        f = request.files.get("csv")
        if f and f.filename:
            raw = f.read()
            # 管理画面のCSVはShift_JISのことが多い。UTF-8も試す。
            for enc in ("cp932", "utf-8-sig", "utf-8"):
                try:
                    text = raw.decode(enc)
                    break
                except UnicodeDecodeError:
                    continue
            else:
                text = raw.decode("utf-8", errors="replace")
            result = rec.reconcile_csv(conn, text)
    return render_template("reconcile.html", result=result, overdue=overdue,
                           grace=rec.OVERDUE_GRACE_DAYS, stale=stale, last=last,
                           last_quick=rec.last_quick_check_at(conn),
                           interval=rec.RECONCILE_INTERVAL_DAYS)


@app.route("/admin/members")
def members_admin():
    if not require_admin():
        return redirect(url_for("admin_login"))
    conn = get_db()
    return render_template(
        "members.html",
        members=conn.execute("SELECT * FROM members ORDER BY created_at DESC").fetchall(),
        events=conn.execute("SELECT * FROM payment_events ORDER BY received_at DESC LIMIT 20").fetchall(),
        alerts=conn.execute("SELECT * FROM ops_alerts ORDER BY id DESC LIMIT 20").fetchall(),
        outbox=conn.execute("SELECT * FROM outbox ORDER BY id DESC LIMIT 20").fetchall(),
        processed=request.args.get("processed"))


@app.route("/home")
def member_top():
    """会員トップ。新着件数と相談日程をデータから出す。"""
    ok, resp = require_member()
    if not ok:
        return resp
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
    ok, resp = require_member()
    if not ok:
        return resp
    return render_template("consult.html", query=(request.args.get("q") or ""))


# ---------------- 管理者 ----------------

def require_admin():
    """管理者の関所。IP制限とセッションの両方を見る。"""
    if not sec.admin_ip_allowed(sec.client_ip(request) or "?"):
        return False
    return session.get("is_admin") is True


@app.route("/admin/login", methods=["GET", "POST"])
def admin_login():
    conn = get_db()
    ip = sec.client_ip(request) or "?"
    if not sec.admin_ip_allowed(ip):
        return "<html>この場所からは利用できません。</html>", 403
    error = ""
    if request.method == "POST":
        if sec.admin_locked(conn, ip):
            # 失敗が続いたらしばらく受け付けない。正誤を判定せず同じ応答にする。
            conn.commit()
            return render_template("login.html",
                                   error=f"しばらく時間をおいてからお試しください"
                                         f"（{sec.ADMIN_LOCK_MINUTES}分）"), 429
        pw = request.form.get("password", "")
        if ADMIN_PASSWORD_HASH:
            ok = sec.verify_password(pw, ADMIN_PASSWORD_HASH)
        else:
            # ハッシュ未設定のときだけ平文と比較する。本番では起動時の点検で止まる。
            ok = secrets.compare_digest(pw, ADMIN_PASSWORD)
        sec.record_admin_login(conn, ip, ok)
        conn.commit()
        if ok:
            session.clear()                       # セッション固定攻撃への備え
            session["is_admin"] = True
            sec.csrf_token(session)
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


@app.route("/admin/approve/<item_id>", methods=["POST"])
def approve(item_id):
    """いま表示されている本文を、その版ごと承認する／承認を取り消す。

    承認は「どの版を承認したか」で持つ。本文を直すと answer_version が変わり、
    approved_version と食い違って会員には出なくなる。ここで承認し直すと、
    その時点の本文のハッシュを approved_version に入れ直す。
    """
    if not require_admin():
        return redirect(url_for("admin_login"))
    conn = get_db()
    row = conn.execute("SELECT answer FROM items WHERE id = ?", (item_id,)).fetchone()
    if row is None:
        return redirect(url_for("manage"))
    action = request.form.get("action")
    if action == "approve":
        reviewer = (request.form.get("reviewer") or "").strip() or "院長 平井"
        conn.execute(
            """UPDATE items SET approval_state = '承認済',
               approved_version = ?, answer_version = ?,
               internal_status = '院内確認済', internal_reviewer = ?,
               internal_reviewed_at = date('now','localtime'),
               updated_at = datetime('now','localtime') WHERE id = ?""",
            (answer_hash(row["answer"]), answer_hash(row["answer"]), reviewer, item_id))
    elif action == "revoke":
        conn.execute(
            """UPDATE items SET approval_state = '未承認', approved_version = '',
               publish_status = '非公開', internal_status = '院内要修正',
               updated_at = datetime('now','localtime') WHERE id = ?""", (item_id,))
    conn.commit()
    return redirect(url_for("manage", q=request.args.get("q", ""),
                            status=request.args.get("status", "")))


@app.route("/admin/knowledge/<item_id>", methods=["POST"])
def manage_update(item_id):
    if not require_admin():
        return redirect(url_for("admin_login"))
    conn = get_db()
    answer = request.form.get("answer")
    if answer is not None:
        # 本文を直したら版が変わる。承認済みだったものは再承認待ちに落とす。
        new_version = answer_hash(answer)
        conn.execute(
            """UPDATE items SET answer = ?, answer_version = ?,
               approval_state = CASE WHEN approved_version = ? THEN approval_state
                                     ELSE '再承認待ち' END
               WHERE id = ?""", (answer, new_version, new_version, item_id))
    conn.execute("""UPDATE items SET internal_status=?, expert_status=?, publish_status=?,
                    updated_at=datetime('now','localtime') WHERE id=?""",
                 (request.form.get("internal_status"), request.form.get("expert_status"),
                  request.form.get("publish_status"), item_id))
    conn.commit()
    return redirect(url_for("manage", q=request.args.get("q", ""), status=request.args.get("status", "")))


if __name__ == "__main__":
    # 外部に出さない。検証は 127.0.0.1 からのみ。
    app.run(host="127.0.0.1", port=int(os.environ.get("PORT", 5001)), debug=True)
