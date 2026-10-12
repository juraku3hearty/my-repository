import subprocess, sqlite3, re, urllib.parse, sys
B="http://127.0.0.1:5001"; SEC="demo-secret-please-change-0123456789"
DB="/home/user/my-repository/jiko-desk/webapp/demo.sqlite3"

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
def code(*a): return subprocess.run(["curl","-s","-o","/dev/null","-w","%{http_code}","--noproxy","*"]+list(a),capture_output=True,text=True).stdout
FAIL=False
def ok(l,c,x=""):
    global FAIL
    print(("  OK   " if c else "  NG   ")+l+(f"  {x}" if x else ""))
    if not c: FAIL=True

sh(B+"/join")
c=sqlite3.connect(DB); c.row_factory=sqlite3.Row
c.execute("DELETE FROM rate_log"); c.execute("DELETE FROM outbox"); c.commit()  # rate_log_clear
E="sec@example.com"
c.execute("DELETE FROM members WHERE email=?",(E,)); c.execute("DELETE FROM rate_log")
c.execute("DELETE FROM payment_events WHERE gid LIKE '94%'"); c.commit()
sh("-d","email="+E,"-d","agree=1", B+"/join")
mid=c.execute("SELECT member_id FROM members WHERE email=?",(E,)).fetchone()["member_id"]
sh("-c","/tmp/ak.txt","-d","password=demo", B+"/admin/login")

print("=== 通知の順序逆転 ===")
sh(f"{B}/webhook/subscpay/{SEC}?gid=9400001&rst=1&cod={mid}&acid=444001&ec=")
sh(f"{B}/webhook/subscpay-auto/{SEC}?gid=9400003&rst=2&cod={mid}&acid=444001&ec=G6042G600000")
sh("-b","/tmp/ak.txt","-X","POST", B+"/admin/process-events")
st=lambda: c.execute("SELECT status FROM members WHERE member_id=?",(mid,)).fetchone()["status"]
ok("停止された", st()=="suspended", st())
# 停止のあとに、本来は前に起きていた「リトライ中」通知が遅れて届く
sh(f"{B}/webhook/subscpay-auto/{SEC}?gid=9400002&rst=3&cod={mid}&acid=444001&ec=G0242G020000")
sh("-b","/tmp/ak.txt","-X","POST", B+"/admin/process-events")
ok("古いリトライ通知で使える状態に戻らない", st()=="suspended", st())
sh(f"{B}/webhook/subscpay-auto/{SEC}?gid=9400004&rst=1&cod={mid}&acid=444001&ec=")
sh("-b","/tmp/ak.txt","-X","POST", B+"/admin/process-events")
ok("成功通知が来たら復帰する", st()=="active", st())

print("\n=== レート制限 ===")
c.execute("DELETE FROM rate_log"); c.commit()
sent=[]
for i in range(8):
    sh("-d","email="+E, B+"/login/request")
    sent.append(c.execute("SELECT COUNT(*) n FROM outbox WHERE to_email=? AND subject LIKE '%ログイン%'",(E,)).fetchone()["n"])
ok("同じ宛先へのログインメールは5通で打ち止め", sent[-1]==5, f"8回要求 → {sent[-1]}通")
r=[code("-d","t=deadbeef", B+"/login/consume") for _ in range(25)]
ok("トークンの総当たりは429で止まる", "429" in r, f"最後 {r[-1]}")

print("\n=== ヘッダー ===")
h=sh("-D","-","-o","/dev/null", B+"/login")
for k,v in [("Referrer-Policy","no-referrer"),("X-Frame-Options","DENY"),
            ("X-Content-Type-Options","nosniff"),("Content-Security-Policy","default-src 'self'")]:
    ok(f"{k}", v.lower() in h.lower(), "")

print("\n=== XSS（入力がそのまま出ないか）===")
payload = "<script>alert(1)</script>"
h = sh(B+"/?q="+urllib.parse.quote(payload))
ok("検索語がエスケープされる", "<script>alert(1)</script>" not in h)
sh("-d","email="+urllib.parse.quote(payload)+"@x.com","-d","agree=1", B+"/join")
h = sh("-b","/tmp/ak.txt", B+"/admin/members")
ok("管理画面でもエスケープされる", "<script>alert(1)</script>" not in h)

print("\n=== API・管理画面の権限 ===")
for path in ["/admin/members","/admin/analytics","/admin/knowledge"]:
    ok(f"{path} は未ログインで入れない", code(B+path)=="302")
ok("/admin/process-events も同様", code("-X","POST",B+"/admin/process-events")=="302")
ok("webhook はパスが違うと404", code(f"{B}/webhook/subscpay/wrong?gid=1")=="404")

print("\n"+("すべて通りました" if not FAIL else "★ 失敗あり")); sys.exit(1 if FAIL else 0)
