"""本番前の固め：CSRF・管理者認証・Cookie・CSP・API・書式DLの検証。"""
import subprocess, sqlite3, re, urllib.parse, sys, random, json
B="http://127.0.0.1:5001"; SEC="demo-secret-please-change-0123456789"
DB="/home/user/my-repository/jiko-desk/webapp/demo.sqlite3"
CK="/tmp/h_member.txt"; AK="/tmp/h_admin.txt"
subprocess.run(["rm","-f",CK,AK])
def sh(*a): return subprocess.run(["curl","-s","--noproxy","*"]+list(a),capture_output=True,text=True).stdout
def st(*a): return subprocess.run(["curl","-s","-o","/dev/null","-w","%{http_code}","--noproxy","*"]+list(a),capture_output=True,text=True).stdout
FAIL=False
def ok(l,c,x=""):
    global FAIL
    print(("  OK   " if c else "  NG   ")+l+(f"  {x}" if x else ""))
    if not c: FAIL=True
def csrf(cookie, path="/login"):
    h = sh("-c",cookie,"-b",cookie, B+path)
    m = re.search(r'name="_csrf" value="([^"]+)"', h)
    return m.group(1) if m else ""

sh(B+"/join")
c=sqlite3.connect(DB); c.row_factory=sqlite3.Row
c.execute("DELETE FROM rate_log"); c.execute("DELETE FROM admin_login_log"); c.commit()
E="harden@example.com"; ACID=str(random.randint(1000000,9999999))
c.execute("DELETE FROM members WHERE email=?",(E,)); c.execute("DELETE FROM payment_events WHERE gid LIKE '96%'"); c.commit()

print("=== 4-a. CSRF ===")
tok = csrf(CK, "/join")
ok("フォームにCSRFトークンが入っている", len(tok) > 20)
r = st("-b",CK,"-c",CK,"-d","email="+E,"-d","agree=1", B+"/join")
ok("トークン無しのPOSTは拒否される（403）", r=="403", r)
h = sh("-b",CK,"-c",CK,"-d","email="+E,"-d","agree=1","-d","_csrf="+tok, B+"/join")
ok("正しいトークンなら通る", "お支払い画面へ移動します" in h)
r = st("-b",CK,"-c",CK,"-d","email=x@y.z","-d","agree=1","-d","_csrf=wrong", B+"/join")
ok("間違ったトークンは拒否される（403）", r=="403", r)
mid=c.execute("SELECT member_id FROM members WHERE email=?",(E,)).fetchone()["member_id"]

print("\n=== 4-b. 管理者認証 ===")
at = csrf(AK, "/admin/login")
for i in range(5):
    sh("-b",AK,"-c",AK,"-d","password=wrong","-d","_csrf="+at, B+"/admin/login")
r = st("-b",AK,"-c",AK,"-d","password=demo","-d","_csrf="+at, B+"/admin/login")
ok("失敗が続くとロックされる（429）", r=="429", r)
c.execute("DELETE FROM admin_login_log"); c.commit()
h = sh("-b",AK,"-c",AK,"-d","password=demo","-d","_csrf="+at,"-i", B+"/admin/login")
ok("ロック解除後は正しいパスワードで入れる", "302" in h.split("\n")[0])
import importlib.util, sys as _s
spec=importlib.util.spec_from_file_location("security","/home/user/my-repository/jiko-desk/webapp/security.py")
secm=importlib.util.module_from_spec(spec); spec.loader.exec_module(secm)
hp = secm.hash_password("test-password")
ok("パスワードはハッシュで保存できる", "$" in hp and len(hp) > 60)
ok("  正しいパスワードを受け付ける", secm.verify_password("test-password", hp))
ok("  違うパスワードを拒否する", not secm.verify_password("wrong", hp))

print("\n=== 4-c. Cookie と ヘッダー ===")
h = sh("-D","-","-o","/dev/null","-c","/tmp/h_c.txt", B+"/login")
ok("HttpOnly が付く", "httponly" in h.lower())
ok("SameSite=Lax が付く", "samesite=lax" in h.lower())
ok("Secure は付かない（HTTPのため。本番でON）", "secure" not in h.lower().split("set-cookie")[1].split("\n")[0] if "set-cookie" in h.lower() else True)
ok("CSPに 'unsafe-inline' が無い", "unsafe-inline" not in h)
ok("CSPが script-src 'self' のみ", "script-src 'self';" in h)
ok("Permissions-Policy が付く", "permissions-policy" in h.lower())

print("\n=== 3. 退会者の遮断（画面とAPIの両方）===")
sh(f"{B}/webhook/subscpay/{SEC}?gid=9600001&rst=1&cod={mid}&acid={ACID}&ec=")
act = csrf(AK, "/admin/members")
sh("-b",AK,"-X","POST","-d","_csrf="+act, B+"/admin/process-events")
ltok = csrf(CK, "/login")
sh("-b",CK,"-c",CK,"-d","email="+E,"-d","_csrf="+ltok, B+"/login/request")
raw=re.search(r"/login#t=([A-Za-z0-9_\-]+)",
    c.execute("SELECT body FROM outbox ORDER BY id DESC LIMIT 1").fetchone()["body"]).group(1)
sh("-b",CK,"-c",CK,"-d","t="+raw,"-d","_csrf="+ltok, B+"/login/consume")
ok("ログインできた（active）", '"usable":true' in sh("-b",CK,"-c",CK,B+"/api/status").replace(" ",""))
ok("書式ダウンロードできる", "施術証明書" in sh("-b",CK,"-c",CK,B+"/downloads/shojutsu-shomeisho"))
ok("API検索が回答を返す", '"answer"' in sh("-b",CK,"-c",CK,B+"/api/search?q="+urllib.parse.quote("打ち切り")))

sh(f"{B}/webhook/subscpay-auto/{SEC}?gid=9600002&rst=4&cod={mid}&acid={ACID}&ec=")
sh("-b",AK,"-X","POST","-d","_csrf="+act, B+"/admin/process-events")
ok("退会済みになった", c.execute("SELECT status FROM members WHERE member_id=?",(mid,)).fetchone()["status"]=="cancelled")
print("  --- 画面（302でブロック）---")
for path,name in [("/?q="+urllib.parse.quote("打ち切り"),"検索"),("/home","会員トップ"),
                  ("/consult","相談"),("/downloads","書式一覧")]:
    r = subprocess.run(["curl","-s","-o","/dev/null","-w","%{http_code} %{redirect_url}","--noproxy","*",
                        "-b",CK,"-c",CK,B+path],capture_output=True,text=True).stdout
    ok(f"{name} 遮断", "/billing" in r, r.split()[0])
r = subprocess.run(["curl","-s","-o","/dev/null","-w","%{http_code} %{redirect_url}","--noproxy","*",
                    "-b",CK,"-c",CK,B+"/downloads/shojutsu-shomeisho"],capture_output=True,text=True).stdout
ok("書式ファイルの直リンク 遮断", "/billing" in r, r.split()[0])
h = sh("-b",CK,"-c",CK,B+"/downloads/shojutsu-shomeisho")
ok("  ファイルの中身が返らない", "施術証明書" not in h)

print("  --- API（HTTPステータス）---")
ok("/api/search は 403", st("-b",CK,"-c",CK,B+"/api/search?q=a")=="403")
ok("/api/item は 403", st("-b",CK,"-c",CK,B+"/api/item/KB-DEMO-002")=="403")
h = sh("-b",CK,"-c",CK,B+"/api/search?q="+urllib.parse.quote("打ち切り"))
ok("  本文に回答を含まない", "answer" not in h or '"error"' in h, h[:60])
h = sh("-b",CK,"-c",CK,B+"/api/item/KB-DEMO-002")
ok("  本文に回答を含まない", "ありません。保険会社" not in h, h[:60])
ok("/api/status は 200（自分の資格のみ）", st("-b",CK,"-c",CK,B+"/api/status")=="200")
ok("  usable=false を返す", '"usable":false' in sh("-b",CK,"-c",CK,B+"/api/status").replace(" ",""))

print("  --- 未ログインのAPI ---")
ok("/api/search は 401", st(B+"/api/search?q=a")=="401")
ok("/api/item は 401", st(B+"/api/item/KB-DEMO-002")=="401")
ok("/api/status は 401", st(B+"/api/status")=="401")
print("  --- 非公開・存在しないID（ログイン中の会員で）---")
subprocess.run(["rm","-f","/tmp/h2.txt"])
E2="ok@example.com"; ACID2=str(random.randint(1000000,9999999))
c.execute("DELETE FROM members WHERE email=?",(E2,)); c.commit()
t2=csrf("/tmp/h2.txt","/join")
sh("-b","/tmp/h2.txt","-c","/tmp/h2.txt","-d","email="+E2,"-d","agree=1","-d","_csrf="+t2, B+"/join")
m2=c.execute("SELECT member_id FROM members WHERE email=?",(E2,)).fetchone()["member_id"]
sh(f"{B}/webhook/subscpay/{SEC}?gid=9600003&rst=1&cod={m2}&acid={ACID2}&ec=")
sh("-b",AK,"-X","POST","-d","_csrf="+act, B+"/admin/process-events")
t2=csrf("/tmp/h2.txt","/login")
sh("-b","/tmp/h2.txt","-c","/tmp/h2.txt","-d","email="+E2,"-d","_csrf="+t2, B+"/login/request")
raw2=re.search(r"/login#t=([A-Za-z0-9_\-]+)",
    c.execute("SELECT body FROM outbox ORDER BY id DESC LIMIT 1").fetchone()["body"]).group(1)
sh("-b","/tmp/h2.txt","-c","/tmp/h2.txt","-d","t="+raw2,"-d","_csrf="+t2, B+"/login/consume")
ok("非公開ナレッジは 404", st("-b","/tmp/h2.txt",B+"/api/item/KB-DEMO-009")=="404")
ok("存在しないIDは 404", st("-b","/tmp/h2.txt",B+"/api/item/NOPE")=="404")
ok("公開中のナレッジは 200", st("-b","/tmp/h2.txt",B+"/api/item/KB-DEMO-002")=="200")

print("\n=== 5. ログインの制限と列挙対策 ===")
c.execute("DELETE FROM rate_log"); c.commit()
t3=csrf("/tmp/h3.txt","/login")
a = sh("-b","/tmp/h3.txt","-c","/tmp/h3.txt","-d","email=nobody-xyz@example.com","-d","_csrf="+t3, B+"/login/request")
b = sh("-b","/tmp/h3.txt","-c","/tmp/h3.txt","-d","email="+E2,"-d","_csrf="+t3, B+"/login/request")
ok("登録の有無で画面が変わらない", ("メールをお送りしました" in a) and ("メールをお送りしました" in b))
n0=c.execute("SELECT COUNT(*) n FROM outbox WHERE to_email='nobody-xyz@example.com'").fetchone()["n"]
ok("登録の無い宛先にはメールを送らない", n0==0, f"{n0}通")
before=c.execute("SELECT COUNT(*) n FROM outbox WHERE to_email=?",(E2,)).fetchone()["n"]
for _ in range(8):
    sh("-b","/tmp/h3.txt","-c","/tmp/h3.txt","-d","email="+E2,"-d","_csrf="+t3, B+"/login/request")
after=c.execute("SELECT COUNT(*) n FROM outbox WHERE to_email=?",(E2,)).fetchone()["n"]
ok("同一宛先への再送は5通で打ち止め", after-before<=5, f"{after-before}通")
c.execute("DELETE FROM rate_log"); c.commit()
r=[st("-b","/tmp/h3.txt","-d","t=deadbeef","-d","_csrf="+t3, B+"/login/consume") for _ in range(25)]
ok("失敗したトークン試行はIP単位で止まる（429）", "429" in r, f"最後 {r[-1]}")

print("\n"+("すべて通りました" if not FAIL else "★ 失敗あり")); sys.exit(1 if FAIL else 0)
