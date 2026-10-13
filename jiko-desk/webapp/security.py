"""本番公開に向けた安全側の設定。

ここに集めてある理由：設定の抜けは「どこかに書いたつもり」で起きる。
1か所にまとめ、起動時に自己点検して、危ない状態では起動させない。
"""
from __future__ import annotations

import hashlib
import hmac
import os
import secrets
from datetime import datetime, timedelta

# 管理者ログインの失敗許容回数と、ロックする時間
ADMIN_MAX_FAILS = 5
ADMIN_LOCK_MINUTES = 15

SCHEMA = """
CREATE TABLE IF NOT EXISTS admin_login_log (
    ts TEXT NOT NULL, ip TEXT NOT NULL, ok INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_admin_login ON admin_login_log(ip, ts);
"""


def init(conn):
    conn.executescript(SCHEMA)


# ───────────── 送信元IPの判定（プロキシ経由の扱い）─────────────
#
# nginx などを前に置くと remote_addr は 127.0.0.1 になり、本当の送信元が分からなくなる。
# X-Forwarded-For をそのまま信じるのは危険で、誰でも偽装できてしまう。
#
# 正しい扱いは「自分が置いたプロキシの段数を知っていること」。
# TRUSTED_PROXY_COUNT に段数を入れると、X-Forwarded-For の右からその数だけ
# さかのぼった値を送信元とみなす。右端は直前のプロキシが付けた値なので信用できる。
#
#   直接公開（プロキシなし）          TRUSTED_PROXY_COUNT=0  → remote_addr を使う
#   nginx を1段だけ前に置く            TRUSTED_PROXY_COUNT=1  → XFF の右から1番目
#   CDN + nginx の2段                  TRUSTED_PROXY_COUNT=2  → XFF の右から2番目
#
# 【重要】nginx 側にも設定が要る。
#   proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
#   proxy_set_header X-Real-IP $remote_addr;
# さらに nginx 自身でIPを絞っておけば二重に守れる（docs/operations.md）。

def client_ip(request) -> str:
    n = int(os.environ.get("TRUSTED_PROXY_COUNT", "0") or 0)
    if n <= 0:
        return request.remote_addr or ""
    xff = [x.strip() for x in (request.headers.get("X-Forwarded-For") or "").split(",") if x.strip()]
    if len(xff) < n:
        # 段数が合わない＝設定ミスか偽装。判定できないので空にして拒否させる。
        return ""
    return xff[-n]


# ───────────── 起動時の自己点検 ─────────────

def preflight(app_env: str) -> list[str]:
    """本番で危ない設定が残っていないか調べる。dev 以外では、1つでもあれば起動させない。"""
    problems = []
    if os.environ.get("FLASK_SECRET", "") in ("", "dev-secret-change-me", "test"):
        problems.append("FLASK_SECRET が既定値のままです")
    if os.environ.get("ADMIN_PASSWORD_HASH", "") == "":
        problems.append("ADMIN_PASSWORD_HASH が未設定です（平文のADMIN_PASSWORDは本番で使えません）")
    if os.environ.get("WEBHOOK_SECRET", "").startswith("demo-"):
        problems.append("WEBHOOK_SECRET が既定値のままです")
    if os.environ.get("ENFORCE_SOURCE_IP", "0") != "1":
        problems.append("ENFORCE_SOURCE_IP が 1 ではありません（決済通知の送信元IPを確認しません）")
    if os.environ.get("REQUIRE_HTTPS", "0") != "1":
        problems.append("REQUIRE_HTTPS が 1 ではありません")
    if os.environ.get("MEMBER_HASH_SALT", "change-me") == "change-me":
        problems.append("MEMBER_HASH_SALT が既定値のままです")
    if not os.environ.get("ADMIN_ALLOW_IPS", ""):
        problems.append("ADMIN_ALLOW_IPS が未設定です（管理画面にIP制限がかかりません）")
    if "TRUSTED_PROXY_COUNT" not in os.environ:
        problems.append("TRUSTED_PROXY_COUNT が未設定です"
                        "（プロキシ経由だと送信元IPを正しく判定できません）")
    return problems


def apply(app, app_env: str) -> None:
    """Flask 本体の安全側の設定。"""
    https = os.environ.get("REQUIRE_HTTPS", "0") == "1"
    app.config.update(
        SESSION_COOKIE_HTTPONLY=True,          # JavaScriptから読めない
        SESSION_COOKIE_SAMESITE="Lax",         # 他サイトからのPOSTにCookieを付けない
        SESSION_COOKIE_SECURE=https,           # HTTPSのときだけ送る
        SESSION_COOKIE_NAME="jk_session",
        PERMANENT_SESSION_LIFETIME=timedelta(days=30),
        MAX_CONTENT_LENGTH=1 * 1024 * 1024,    # 大きなPOSTを受けない
    )
    if https:
        app.config["PREFERRED_URL_SCHEME"] = "https"


def headers(resp, https: bool):
    """共通のセキュリティヘッダー。"""
    resp.headers["Referrer-Policy"] = "no-referrer"
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["X-Frame-Options"] = "DENY"
    resp.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    # インラインのスクリプト・スタイルを許可しない。外部への送信も禁止する。
    resp.headers["Content-Security-Policy"] = (
        "default-src 'self'; script-src 'self'; style-src 'self'; "
        "img-src 'self' data:; connect-src 'self'; "
        "form-action 'self' https://credit.j-payment.co.jp; "
        "frame-ancestors 'none'; base-uri 'none'; object-src 'none'")
    if https:
        resp.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return resp


# ───────────── CSRF ─────────────

def csrf_token(session) -> str:
    """セッションごとの使い回しトークン。フォームに埋めて、POSTで照合する。"""
    if "csrf" not in session:
        session["csrf"] = secrets.token_urlsafe(32)
    return session["csrf"]


def csrf_ok(session, form) -> bool:
    sent = form.get("_csrf", "")
    held = session.get("csrf", "")
    return bool(held) and hmac.compare_digest(sent, held)


# ───────────── 管理者認証 ─────────────

def hash_password(password: str, salt: str = "") -> str:
    """保存用のハッシュ。`salt$hash` の形で持つ。"""
    salt = salt or secrets.token_hex(16)
    h = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 200_000)
    return f"{salt}${h.hex()}"


def verify_password(password: str, stored: str) -> bool:
    if "$" not in (stored or ""):
        return False
    salt, _ = stored.split("$", 1)
    return hmac.compare_digest(hash_password(password, salt), stored)


def admin_locked(conn, ip: str) -> bool:
    """短時間に失敗が続いたらロックする。"""
    since = (datetime.now() - timedelta(minutes=ADMIN_LOCK_MINUTES)).strftime("%Y-%m-%d %H:%M:%S")
    n = conn.execute("SELECT COUNT(*) n FROM admin_login_log WHERE ip=? AND ok=0 AND ts>=?",
                     (ip, since)).fetchone()["n"]
    return n >= ADMIN_MAX_FAILS


def record_admin_login(conn, ip: str, ok: bool) -> None:
    conn.execute("INSERT INTO admin_login_log(ts, ip, ok) VALUES (?,?,?)",
                 (datetime.now().strftime("%Y-%m-%d %H:%M:%S"), ip, 1 if ok else 0))
    if ok:   # 成功したら失敗の記録を消す
        conn.execute("DELETE FROM admin_login_log WHERE ip=? AND ok=0", (ip,))


def admin_ip_allowed(ip: str) -> bool:
    """ADMIN_ALLOW_IPS が設定されていれば、そのIPからだけ管理画面に入れる。"""
    allow = os.environ.get("ADMIN_ALLOW_IPS", "").strip()
    if not allow:
        return True        # 未設定なら制限しない（起動時の点検で警告する）
    return ip in {x.strip() for x in allow.split(",") if x.strip()}
