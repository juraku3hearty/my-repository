"""会員資格の中核。決済通知の受け取りと、利用可否の判定。

設計の前提（本番接続前に必ず読むこと）
  - 会員資格の正本はこの members テーブル。Cyfonsのログイン状態は根拠にしない
  - 決済側から受け取るのは「入金があった／なかった」という事実だけ
  - 保存する個人情報はメールアドレスのみ（docs/privacy-and-data.md）

【公式仕様が未確認の点】コード中に UNVERIFIED と書いた箇所
  1. キックバックに署名・認証ヘッダがあるか（公式リファレンスに記載がない。おそらく無い）
  2. 通知先がエラーを返したときの自動再送の有無・回数・間隔
  3. 「決済結果 待ち時間 30秒」がキックバックの応答期限かどうか
  4. リンク方式で acid の返却に事前申請が要るか
  5. 送信元IPが 54.95.223.30 / 54.168.57.171 の2つで固定か（将来変わりうる）
"""
from __future__ import annotations

import hashlib
import os
import secrets
import sqlite3
from datetime import date, datetime, timedelta

# 通知の送信元（公式ヘルプ記載）。UNVERIFIED(5): 将来変わる可能性がある
SUBSCPAY_SOURCE_IPS = {"54.95.223.30", "54.168.57.171"}

# ログインリンクの有効期間。短いほど安全だが、メールの遅延も考えて15分にする
LOGIN_TOKEN_MINUTES = 15

# 通知が届かないまま active が古くなったときの許容。通知遅延を吸収しつつ、
# 取りこぼしで永久に使われ続けるのを防ぐ
STALE_ACTIVE_DAYS = 7

# 決済失敗から締め切るまで。サブスクペイのリトライ（7日ごと最大2回）＋予備
GRACE_DAYS = 20

SCHEMA = """
CREATE TABLE IF NOT EXISTS members (
    member_id TEXT PRIMARY KEY,          -- JK-000123。cod に入れる値
    email TEXT NOT NULL,
    email_norm TEXT NOT NULL,            -- 小文字・前後空白除去。照合用
    robotpay_acid TEXT,                  -- 自動課金番号。決済側との結び目
    status TEXT NOT NULL,                -- pending/active/grace/suspended/cancelled
    paid_through TEXT,                   -- 利用期限（YYYY-MM-DD）。自前で計算する
    grace_until TEXT,                    -- 猶予の期限
    last_payment_at TEXT, last_failure_at TEXT,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, cancelled_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_members_acid
    ON members(robotpay_acid) WHERE robotpay_acid IS NOT NULL AND robotpay_acid <> '';
CREATE INDEX IF NOT EXISTS idx_members_email ON members(email_norm);

-- ログインリンク。トークン本体は保存しない（ハッシュのみ）
CREATE TABLE IF NOT EXISTS login_tokens (
    token_hash TEXT PRIMARY KEY,
    member_id TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    created_at TEXT NOT NULL
);

-- 受け取った通知の生ログ。gid で重複を弾く
CREATE TABLE IF NOT EXISTS payment_events (
    gid TEXT NOT NULL,
    kind TEXT NOT NULL,                  -- initial / auto
    raw TEXT NOT NULL,
    received_at TEXT NOT NULL,
    processed_at TEXT,
    result TEXT,
    PRIMARY KEY (gid, kind)
);

-- 送れなかった／届かなかったものの記録。人が見るため
CREATE TABLE IF NOT EXISTS ops_alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL, level TEXT NOT NULL, topic TEXT NOT NULL, detail TEXT
);

-- 送信したメールの記録。試作では実送信せず、ここに貯めて画面で確認する
CREATE TABLE IF NOT EXISTS outbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL, to_email TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL
);
"""


def init(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA)
    conn.executescript(RATE_SCHEMA)
    conn.commit()


def now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def today() -> date:
    return date.today()


def norm_email(email: str) -> str:
    return (email or "").strip().lower()


def alert(conn, level: str, topic: str, detail: str = "") -> None:
    conn.execute("INSERT INTO ops_alerts(ts, level, topic, detail) VALUES (?,?,?,?)",
                 (now(), level, topic, detail))


def send_mail(conn, to_email: str, subject: str, body: str) -> None:
    """試作では実送信しない。outbox に貯めて管理画面で確認する。

    本番では SMTP に差し替える。差出人は決済側（famitect@gaea.ocn.ne.jp）と
    揃えるか、別に立てるかを先に決める（docs/membership-integration.md 20-3）。
    """
    conn.execute("INSERT INTO outbox(ts, to_email, subject, body) VALUES (?,?,?,?)",
                 (now(), to_email, subject, body))


# ───────────── 会員 ─────────────

def next_member_id(conn) -> str:
    row = conn.execute("SELECT member_id FROM members ORDER BY member_id DESC LIMIT 1").fetchone()
    n = int(row["member_id"].split("-")[1]) + 1 if row else 1
    return f"JK-{n:06d}"


def create_pending(conn, email: str) -> str:
    """申込ボタンを押した時点で1行作る。

    理由：パラメータエラー（ER系）のときキックバックが飛ばない仕様のため、
    これが無いと「申し込んだつもりの人」を一切検知できない。
    """
    member_id = next_member_id(conn)
    conn.execute(
        """INSERT INTO members(member_id, email, email_norm, status,
                               created_at, updated_at)
           VALUES (?,?,?,'pending',?,?)""",
        (member_id, email.strip(), norm_email(email), now(), now()))
    return member_id


def find(conn, member_id: str = "", acid: str = "", email: str = ""):
    """照合の優先順は acid → member_id → メールアドレス。

    メールアドレスは変わりうるので最後にする。一致してもログに残す。
    """
    if acid:
        r = conn.execute("SELECT * FROM members WHERE robotpay_acid = ?", (acid,)).fetchone()
        if r:
            return r
    if member_id:
        r = conn.execute("SELECT * FROM members WHERE member_id = ?", (member_id,)).fetchone()
        if r:
            return r
    if email:
        # 同じメールアドレスで再入会すると複数行が並ぶ。
        # 解約済みより生きている行を優先し、同条件なら新しいほうを返す。
        r = conn.execute(
            """SELECT * FROM members WHERE email_norm = ?
               ORDER BY (status = 'cancelled') ASC, created_at DESC LIMIT 1""",
            (norm_email(email),)).fetchone()
        if r:
            alert(conn, "info", "メールアドレスで照合しました",
                  f"{r['member_id']} / acid・member_idで一致しませんでした")
            return r
    return None


def can_use(row) -> tuple[bool, str]:
    """利用可否。ここだけを正とする。

    active でも paid_through が古すぎる場合は拒否する。通知を取りこぼしたまま
    使われ続けるのを防ぐため。通知遅延を吸収するため STALE_ACTIVE_DAYS の余裕を置く。
    """
    if row is None:
        return False, "会員情報が見つかりません"
    st = row["status"]
    if st == "active":
        pt = row["paid_through"] or ""
        if pt and date.fromisoformat(pt) < today() - timedelta(days=STALE_ACTIVE_DAYS):
            return False, "お支払い状況を確認できませんでした"
        return True, ""
    if st == "grace":
        gu = row["grace_until"] or ""
        if gu and date.fromisoformat(gu) < today():
            return False, "お支払いが確認できていません"
        return True, ""
    if st == "pending":
        return False, "お申し込みの手続きが完了していません"
    if st == "suspended":
        return False, "お支払いが確認できていないため、ご利用を停止しています"
    return False, "ご利用が終了しています"


# ───────────── ログイン（使い捨てリンク） ─────────────

def _hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def issue_login_token(conn, member_id: str) -> str:
    """使い捨てのログイントークンを発行する。

    DBにはハッシュだけを置く。生の値はこの戻り値（＝メール本文）にしか存在しない。
    メールのリンクはフラグメント（#）に入れる。フラグメントはサーバーに送られないので、
    アクセスログにもRefererにも残らない。
    """
    token = secrets.token_urlsafe(32)
    conn.execute(
        """INSERT INTO login_tokens(token_hash, member_id, expires_at, created_at)
           VALUES (?,?,?,?)""",
        (_hash(token), member_id,
         (datetime.now() + timedelta(minutes=LOGIN_TOKEN_MINUTES)).strftime("%Y-%m-%d %H:%M:%S"),
         now()))
    return token


def consume_login_token(conn, token: str) -> str | None:
    """1回だけ使える。期限切れ・使用済みは拒否する。"""
    row = conn.execute("SELECT * FROM login_tokens WHERE token_hash = ?",
                       (_hash(token),)).fetchone()
    if row is None:
        return None
    if row["used_at"]:
        alert(conn, "warn", "使用済みのログインリンクが再度使われました", row["member_id"])
        return None
    if row["expires_at"] < now():
        return None
    conn.execute("UPDATE login_tokens SET used_at = ? WHERE token_hash = ?",
                 (now(), _hash(token)))
    return row["member_id"]


def purge_tokens(conn) -> None:
    """期限切れ・使用済みのトークンは残さない。"""
    conn.execute("DELETE FROM login_tokens WHERE used_at IS NOT NULL OR expires_at < ?", (now(),))


def send_login_link(conn, row, base_url: str) -> str:
    token = issue_login_token(conn, row["member_id"])
    url = f"{base_url.rstrip('/')}/login#t={token}"
    send_mail(conn, row["email"], "交通事故実務デスク ログインのご案内",
              f"""下のリンクを開くとログインできます（{LOGIN_TOKEN_MINUTES}分間有効・1回のみ）。

{url}

心当たりがない場合は、このメールを破棄してください。""")
    return url


# ───────────── レート制限 ─────────────

RATE_LIMITS = {
    # 用途: (回数, 期間の分)
    "login_request_ip": (10, 60),     # 同じIPからのログインメール要求
    "login_request_email": (5, 60),   # 同じ宛先へのログインメール（迷惑メール化を防ぐ）
    "login_consume_ip": (20, 10),     # トークンの総当たり
    "join_ip": (5, 60),               # 申込の連打
}

RATE_SCHEMA = """
CREATE TABLE IF NOT EXISTS rate_log (
    bucket TEXT NOT NULL, key TEXT NOT NULL, ts TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rate ON rate_log(bucket, key, ts);
"""


def rate_ok(conn, bucket: str, key: str, record: bool = True) -> bool:
    """回数を数えて、超えていたら False を返す。

    record=False にすると数えるだけで記録しない。
    トークンの総当たり対策では「失敗した試行」だけを数える。成功まで数えると、
    院内の共有IPから複数人が正しくログインしただけで打ち止めになってしまう。
    """
    limit, minutes = RATE_LIMITS[bucket]
    since = (datetime.now() - timedelta(minutes=minutes)).strftime("%Y-%m-%d %H:%M:%S")
    conn.execute("DELETE FROM rate_log WHERE ts < ?",
                 ((datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d %H:%M:%S"),))
    n = conn.execute("SELECT COUNT(*) n FROM rate_log WHERE bucket=? AND key=? AND ts>=?",
                     (bucket, key, since)).fetchone()["n"]
    if n >= limit:
        alert(conn, "warn", "回数制限に達しました", f"{bucket} {key[:40]}")
        return False
    if record:
        conn.execute("INSERT INTO rate_log(bucket, key, ts) VALUES (?,?,?)", (bucket, key, now()))
    return True


def rate_hit(conn, bucket: str, key: str) -> None:
    """失敗した試行を1回数える。"""
    conn.execute("INSERT INTO rate_log(bucket, key, ts) VALUES (?,?,?)", (bucket, key, now()))


# ───────────── 決済通知の受け取り ─────────────

def source_ip_ok(remote_addr: str, enforce: bool) -> bool:
    """送信元IPの確認。

    【UNVERIFIED(1)】キックバックに署名や認証ヘッダがあるという記載が公式資料に無い。
    したがって真正性の担保は次の3つに頼る。
      a. 送信元IPの許可リスト（下記）
      b. URLのパスに十分長いランダム文字列を含める（推測できないようにする）
      c. 受け取った内容を鵜呑みにせず、acid / cod が自分のDBに実在するか照合する
    署名が提供されることが分かったら、ここに検証を足す。
    """
    if not enforce:
        return True            # 検証環境では自分のPCから叩けるようにする
    return remote_addr in SUBSCPAY_SOURCE_IPS


def receive(conn, kind: str, params: dict, remote_addr: str, enforce_ip: bool) -> str:
    """通知を受け取って生ログに保存するだけ。ここでは判定も更新もしない。

    【UNVERIFIED(3)】管理画面の「決済結果 待ち時間 30秒」がキックバックの応答期限と
    思われるため、この関数は必ず1秒以内に終わらせる。重い処理は process() に回す。
    仕様書に「通知先URLの1行目にHTMLが出力されれば結果通知成功とみなす」とあるため、
    呼び出し側は必ずHTMLを1行返すこと。
    """
    if not source_ip_ok(remote_addr, enforce_ip):
        alert(conn, "warn", "許可外のIPから通知が来ました", f"{remote_addr} / {kind}")
        conn.commit()
        return "rejected"

    gid = (params.get("gid") or "").strip()
    if not gid:
        alert(conn, "warn", "gidの無い通知", str(params)[:500])
        conn.commit()
        return "no_gid"

    # 重複通知は主キーで弾く。同じ gid + kind は1回しか処理しない
    cur = conn.execute(
        "INSERT OR IGNORE INTO payment_events(gid, kind, raw, received_at) VALUES (?,?,?,?)",
        (gid, kind, _encode(params), now()))
    conn.commit()
    return "stored" if cur.rowcount else "duplicate"


def _encode(params: dict) -> str:
    return "&".join(f"{k}={v}" for k, v in sorted(params.items()))


def _decode(raw: str) -> dict:
    out = {}
    for part in raw.split("&"):
        if "=" in part:
            k, v = part.split("=", 1)
            out[k] = v
    return out


def process_pending(conn) -> int:
    """未処理の通知を順に反映する。webhookとは別に動かす（本番ではワーカーかcron）。

    受信順ではなく received_at の昇順で処理する。通知が前後して届いても、
    状態の巻き戻りは下の apply_rst() 側で防ぐ。
    """
    rows = conn.execute(
        "SELECT * FROM payment_events WHERE processed_at IS NULL ORDER BY received_at"
    ).fetchall()
    for ev in rows:
        try:
            result = _apply(conn, ev["kind"], _decode(ev["raw"]))
        except Exception as e:                  # noqa: BLE001
            # 1件の失敗で残りが止まらないようにする。
            # processed_at は入れない（次回また処理を試みる）。
            result = f"error: {str(e)[:120]}"
            alert(conn, "error", "通知の反映に失敗しました",
                  f"gid={ev['gid']} kind={ev['kind']} {result}")
            conn.execute("UPDATE payment_events SET result = ? WHERE gid = ? AND kind = ?",
                         (result, ev["gid"], ev["kind"]))
            continue
        conn.execute("UPDATE payment_events SET processed_at = ?, result = ? "
                     "WHERE gid = ? AND kind = ?", (now(), result, ev["gid"], ev["kind"]))
    conn.commit()
    # 何度も失敗し続けているものは、別途目立たせる
    stuck = conn.execute(
        "SELECT COUNT(*) n FROM payment_events "
        "WHERE processed_at IS NULL AND result LIKE 'error:%'").fetchone()["n"]
    if stuck:
        alert(conn, "error", "反映できない通知が残っています", f"{stuck}件")
        conn.commit()
    return len(rows)


def _apply(conn, kind: str, p: dict) -> str:
    cod = (p.get("cod") or "").strip()
    acid = (p.get("acid") or "").strip()
    rst = (p.get("rst") or "").strip()
    ec = (p.get("ec") or "").strip()

    # 自分の会員サイト由来かを cod の形で判定する。
    # 同じ店舗IDで店舗売上やサプリの決済も通るため、形の違うものは処理しない。
    #
    # 【2026-10-13 時点の注意】acid・em・nm のキックバックへの追加は未設定。
    # したがって当面 acid が届かない可能性があり、**cod だけが頼りになる**。
    # cod が空の通知は、自社の決済かどうかも判断できないので必ず記録する。
    if not cod:
        alert(conn, "warn", "codの無い通知（判別できません）",
              f"acid={acid} rst={rst} ec={ec}")
        return "ignored_no_cod"
    if not cod.startswith("JK-"):
        return "ignored_other_product"

    row = find(conn, member_id=cod, acid=acid)
    if row is None:
        alert(conn, "warn", "会員が見つからない通知", f"cod={cod} acid={acid}")
        return "member_not_found"

    # 初回通知で acid を結びつける。
    # acid の返却はまだ設定されていないため、届かないことがある。
    # その場合は cod（会員ID）だけで運用し、acid が届いた時点で結びつける。
    if not acid and not row["robotpay_acid"]:
        alert(conn, "info", "acidがまだ届いていません",
              f"{row['member_id']} / 自動課金停止APIはacidが無いと実行できません")
    if acid and not row["robotpay_acid"]:
        conn.execute("UPDATE members SET robotpay_acid = ?, updated_at = ? WHERE member_id = ?",
                     (acid, now(), row["member_id"]))
    elif acid and row["robotpay_acid"] and row["robotpay_acid"] != acid:
        # 退会後に再入会すると別の acid になる。古い通知が遅れて届いた可能性もある
        alert(conn, "warn", "acidが一致しません",
              f"{row['member_id']} 登録={row['robotpay_acid']} 通知={acid}")
        return "acid_mismatch"

    return apply_rst(conn, row["member_id"], kind, rst, ec)


def apply_rst(conn, member_id: str, kind: str, rst: str, ec: str = "") -> str:
    """rst の値を会員の状態に反映する。

    rst の意味（公式仕様書・リンク方式）
      1 決済成功 ／ 2 決済失敗（この通知後、自動課金は停止する）
      3 リトライ決済失敗（リトライ予定あり）／ 4 自動課金停止
      5 お試し期間中のリトライ決済失敗
    ※仕様書では rst=5 のサンプルが &rst=4 と書かれている（誤記と思われる）。
      値で分岐せず、5も 3 と同じ扱いにする。

    通知遅延への備え：
      - cancelled は最終状態。あとから古い成功通知が来ても active に戻さない
      - paid_through は常に大きいほうを採る（古い通知で期限が縮まない）
    """
    row = conn.execute("SELECT * FROM members WHERE member_id = ?", (member_id,)).fetchone()
    if row is None:
        return "member_not_found"

    # 解約済みを巻き戻さない。再入会は新しい member_id として扱う
    if row["status"] == "cancelled" and rst != "4":
        alert(conn, "info", "解約済みの会員に通知が届きました（無視）",
              f"{member_id} rst={rst}")
        return "ignored_after_cancel"

    if rst == "1":
        # 初回は申込日から、2回目以降は既存の期限から1か月延ばす
        base = today()
        if kind == "auto" and row["paid_through"]:
            try:
                base = max(base, date.fromisoformat(row["paid_through"]))
            except ValueError:
                pass
        new_pt = (base + timedelta(days=31)).isoformat()
        old_pt = row["paid_through"] or ""
        if old_pt and old_pt > new_pt:      # 古い通知が遅れて届いた場合
            new_pt = old_pt
        conn.execute("""UPDATE members SET status='active', paid_through=?,
                        grace_until=NULL, last_payment_at=?, updated_at=?
                        WHERE member_id=?""", (new_pt, now(), now(), member_id))
        return "active"

    if rst in ("3", "5"):
        # 通知の順序が逆転した場合の備え。すでに停止・解約した会員を、
        # あとから届いた古い「リトライ中」通知で使える状態に戻さない。
        # 復帰は成功通知（rst=1）が来たときだけ。
        if row["status"] in ("suspended", "cancelled"):
            alert(conn, "info", "停止後に届いた古い通知（無視）", f"{member_id} rst={rst}")
            return "ignored_stale_retry"
        conn.execute("""UPDATE members SET status='grace',
                        grace_until=?, last_failure_at=?, updated_at=?
                        WHERE member_id=?""",
                     ((today() + timedelta(days=GRACE_DAYS)).isoformat(),
                      now(), now(), member_id))
        send_mail(conn, row["email"], "お支払いの確認ができませんでした",
                  "カードのお引き落としができませんでした。\n"
                  "サブスクペイより届くメールのURLから、カード情報をご確認ください。\n"
                  "しばらくの間はこれまでどおりご利用いただけます。")
        return "grace"

    if rst == "2":
        conn.execute("""UPDATE members SET status='suspended', last_failure_at=?,
                        updated_at=? WHERE member_id=?""", (now(), now(), member_id))
        send_mail(conn, row["email"], "ご利用を一時停止しました",
                  "お支払いが確認できなかったため、ご利用を停止しました。\n"
                  "再開をご希望の場合はご連絡ください。")
        alert(conn, "info", "決済失敗により停止", f"{member_id} ec={ec}")
        return "suspended"

    if rst == "4":
        conn.execute("""UPDATE members SET status='cancelled', cancelled_at=?,
                        updated_at=? WHERE member_id=?""", (now(), now(), member_id))
        return "cancelled"

    alert(conn, "warn", "未知の rst", f"{member_id} rst={rst}")
    return f"unknown_rst_{rst}"


def check_stale_pending(conn, minutes: int = 30) -> int:
    """申込したのに通知が来ないものを拾う。

    ER系のエラー（パラメータ誤り）はキックバックされない仕様のため、
    これが無いと「申し込んだつもりの人」を検知できない。
    """
    limit = (datetime.now() - timedelta(minutes=minutes)).strftime("%Y-%m-%d %H:%M:%S")
    rows = conn.execute(
        "SELECT * FROM members WHERE status='pending' AND created_at < ?", (limit,)).fetchall()
    for r in rows:
        existing = conn.execute(
            "SELECT 1 FROM ops_alerts WHERE topic='申込が完了していません' AND detail LIKE ?",
            (f"{r['member_id']}%",)).fetchone()
        if not existing:
            alert(conn, "warn", "申込が完了していません",
                  f"{r['member_id']} {r['email']} 申込 {r['created_at']}")
    conn.commit()
    return len(rows)
