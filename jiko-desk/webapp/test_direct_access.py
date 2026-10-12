"""退会者・停止者が、ログイン済みのブラウザから直接たたいた場合の検証。"""
import subprocess, sqlite3, re, urllib.parse, sys, random
B="http://127.0.0.1:5001"; SEC="demo-secret-please-change-0123456789"
DB="/home/user/my-repository/jiko-desk/webapp/demo.sqlite3"
CK="/tmp/direct_member.txt"; AK="/tmp/direct_admin.txt"
subprocess.run(["rm","-f",CK,AK])

# ── CSRF対応（テスト用）─────────────────────────────────────
# 本体がPOSTにCSRFトークンを要求するようになったため、curlの呼び出しを
# 横取りしてトークンを自動で付ける。webhook は対象外（外部から来るため）。
_raw_run = subprocess.run
_DEFAULT_JAR = "/tmp/_test_jar.txt"


def _get_csrf(cookie):
    # 管理者ログイン時にセッションを作り直すのでトークンが変わる。毎回取り直す。
    h = _raw_run(["curl", "-s", "--noproxy", "*", "-c", cookie, "-b", cookie, B + "/login"],
                 capture_output=True, text=True).stdout
    m = re.search(r'name="_csrf" value="([^"]+)"', h)
    return m.group(1) if m else ""


def run(cmd, **kw):
    if not cmd or cmd[0] != "curl":
        return _raw_run(cmd, **kw)
    joined = " ".join(cmd)
    is_post = ("-d" in cmd) or ("-X" in cmd and "POST" in cmd)
    url = next((a for a in cmd if a.startswith("http")), "")
    if is_post and "/webhook/" not in url and "_csrf=" not in joined:
        cookie = None
        for flag in ("-b", "-c"):
            if flag in cmd:
                cookie = cmd[cmd.index(flag) + 1]
                break
        cmd = list(cmd)
        if cookie is None:
            cookie = _DEFAULT_JAR
            cmd += ["-c", cookie]
        if "-b" not in cmd:          # Cookieを送らないとセッションが渡らない
            cmd += ["-b", cookie]
        cmd += ["-d", "_csrf=" + _get_csrf(cookie)]
    return _raw_run(cmd, **kw)


subprocess.run = run
# ──────────────────────────────────────────────────────────

def sh(*a): return subprocess.run(["curl","-s","--noproxy","*"]+list(a),capture_output=True,text=True).stdout
def mb(path,*a): return sh("-b",CK,"-c",CK,B+path,*a)
def mcode(path,*a): return subprocess.run(
    ["curl","-s","-o","/dev/null","-w","%{http_code} %{redirect_url}","--noproxy","*","-b",CK,"-c",CK,B+path]+list(a),
    capture_output=True,text=True).stdout
FAIL=False
def ok(l,c,x=""):
    global FAIL
    print(("  OK   " if c else "  NG   ")+l+(f"  {x}" if x else ""))
    if not c: FAIL=True

sh(B+"/join")
c=sqlite3.connect(DB); c.row_factory=sqlite3.Row
c.execute("DELETE FROM rate_log"); c.execute("DELETE FROM outbox"); c.commit()
E="direct@example.com"; ACID=str(random.randint(1000000,9999999))
c.execute("DELETE FROM members WHERE email=?",(E,)); c.execute("DELETE FROM payment_events WHERE gid LIKE '95%'"); c.commit()
sh("-d","email="+E,"-d","agree=1", B+"/join")
mid=c.execute("SELECT member_id FROM members WHERE email=?",(E,)).fetchone()["member_id"]
sh("-c",AK,"-d","password=demo", B+"/admin/login")

print("=== 3. pending のままでは Q&A を使えない ===")
sh("-b",CK,"-c",CK,"-d","email="+E, B+"/login/request")
tok=re.search(r"/login#t=([A-Za-z0-9_\-]+)",
              c.execute("SELECT body FROM outbox ORDER BY id DESC LIMIT 1").fetchone()["body"]).group(1)
r=sh("-b",CK,"-c",CK,"-d","t="+tok, B+"/login/consume")
ok("ログイン自体は成立する", '"ok":true' in r.replace(" ",""))
r=mcode("/?q="+urllib.parse.quote("打ち切り"))
ok("pending は Q&A に入れない", "/billing" in r, r.strip())
h=mb("/?q="+urllib.parse.quote("打ち切り"))
ok("本文（回答）が返らない", "card primary" not in h and "ありません。保険会社の社内規定" not in h)
ok("/video-click も通らない", "/billing" in mcode("/video-click","-d","item_id=KB-DEMO-002"))
ok("/feedback も通らない", "/billing" in mcode("/feedback","-d","item_id=KB-DEMO-002","-d","verdict=helpful"))

print("\n=== 決済成功 → 利用できる ===")
sh(f"{B}/webhook/subscpay/{SEC}?gid=9500001&rst=1&cod={mid}&acid={ACID}&ec=")
sh("-b",AK,"-X","POST", B+"/admin/process-events")
h=mb("/?q="+urllib.parse.quote("保険会社から打ち切りと言われた"))
ok("主回答が出る", "card primary" in h)
ok("動画ボタンが出る", "関連動画を見る" in h)
r=mcode("/video-click","-d","item_id=KB-DEMO-002")
ok("/video-click が vimeo へ飛ぶ", "vimeo.com" in r, r.strip())

print("\n=== 5. 退会後、ログイン済みのブラウザから直接たたく ===")
sh(f"{B}/webhook/subscpay-auto/{SEC}?gid=9500002&rst=4&cod={mid}&acid={ACID}&ec=")
sh("-b",AK,"-X","POST", B+"/admin/process-events")
st=c.execute("SELECT status FROM members WHERE member_id=?",(mid,)).fetchone()["status"]
ok("状態が cancelled になった", st=="cancelled", st)
print("  （Cookie はログインしたまま。消していない）")
for path,name in [("/","会員トップ"),
                  ("/?q="+urllib.parse.quote("打ち切り"),"検索（回答本文）"),
                  ("/home","会員トップ"),("/consult","相談案内")]:
    r=mcode(path); h=mb(path)
    ok(f"{name} 遮断される", "/billing" in r, r.split()[0])
    ok(f"{name} 本文が返らない",
       "card primary" not in h and "施術録に具体的に残して" not in h and "ありません。保険会社" not in h)
print("  --- POSTで直接たたく ---")
ok("/video-click（動画URLを取りに行く）", "/billing" in mcode("/video-click","-d","item_id=KB-DEMO-002"))
ok("/feedback", "/billing" in mcode("/feedback","-d","item_id=KB-DEMO-002","-d","verdict=helpful"))
ok("動画URLが本文に出ない", "vimeo.com" not in mb("/video-click","-d","item_id=KB-DEMO-002"))
print("  --- 管理者用の経路 ---")
for p_ in ["/admin/knowledge","/admin/analytics","/admin/members"]:
    ok(f"{p_} に会員の資格では入れない", "/admin/login" in mcode(p_), mcode(p_).split()[0])
r=mcode("/item/KB-DEMO-002"); ok("回答詳細URLは存在しない（404）", r.startswith("404"), r.strip())

print("\n=== 6. メールが届かないときの案内と再送 ===")
h = sh("-c","/tmp/rk.txt","-d","email="+E, B+"/login/request")
ok("マスクした宛先を表示する", "@example.com" in h and "direct@example.com" not in h)
for t in ["迷惑メール","もう一度送る","別のメールアドレスで試す","お問い合わせ"]:
    ok(f"「{t}」がある", t in h)

print("\n=== 1・2. 申込画面と内部パラメータ ===")
h = sh(B+"/join")
for t in ["9,800円","自動で更新","解約","利用規約","プライバシーポリシー","特定商取引法"]:
    ok(f"申込画面に「{t}」がある", t in h)
h = sh("-d","email=param@example.com", B+"/join")
ok("同意なしでは進めない", "同意が必要" in h)
h = sh("-d","email=param@example.com","-d","agree=1", B+"/join")
ok("本番相当の画面に aid/cod の一覧が出ない", "開発用" not in h and "<th>項目</th>" not in h)
h = sh("-d","email=param2@example.com","-d","agree=1", B+"/join?debug=1")
ok("開発用（?debug=1）のときだけ一覧が出る", "開発用" in h)
for p_ in ["/terms","/privacy","/tokusho"]:
    ok(f"{p_} が開ける", "交通事故実務デスク" in sh(B+p_))

print("\n"+("すべて通りました" if not FAIL else "★ 失敗あり")); sys.exit(1 if FAIL else 0)
