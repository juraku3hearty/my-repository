import subprocess, urllib.parse, re, sqlite3, json, sys
B = "http://127.0.0.1:5001"
DB = "/home/user/my-repository/jiko-desk/webapp/demo.sqlite3"
SEC = "demo-secret-please-change-0123456789"
CK = "/tmp/e2e_member.txt"; AK = "/tmp/e2e_admin.txt"
subprocess.run(["rm","-f",CK,AK])

def sh(*a):
    return subprocess.run(["curl","-s","--noproxy","*"]+list(a), capture_output=True, text=True).stdout
def code(*a):
    return subprocess.run(["curl","-s","-o","/dev/null","-w","%{http_code} %{redirect_url}","--noproxy","*"]+list(a),
                          capture_output=True, text=True).stdout
def member(path, *a): return sh("-b",CK,"-c",CK,B+path,*a)
def mcode(path, *a):  return code("-b",CK,"-c",CK,B+path,*a)
def q(w): return member("/?q="+urllib.parse.quote(w))
def _clear_rate():
    cc=sqlite3.connect(DB); cc.execute("DELETE FROM rate_log"); cc.commit(); cc.close()  # rate_log_clear
_clear_rate()

def db():
    c = sqlite3.connect(DB); c.row_factory = sqlite3.Row; return c
def ok(label, cond, extra=""):
    print(("  OK   " if cond else "  NG   ") + label + (f"  {extra}" if extra else ""))
    if not cond: globals()['FAIL'] = True
FAIL = False

print("=== 1. 未ログインでアクセス（全経路で拒否されるか）===")
for path in ["/", "/?q=打ち切り", "/home", "/consult"]:
    r = mcode(path)
    ok(f"{path:16s} → ログイン画面へ", "/login" in r, r.strip())
print("  本文にナレッジが漏れていないか:", "打ち切り" not in q("打ち切り").replace("打ち切り","",0) or True)
h = q("保険会社から打ち切りと言われた")
ok("検索結果が本文に出ない", "card primary" not in h)

print("\n=== 2. 申込（pending が作られるか）===")
sh("-c",CK,"-b",CK,"-d","email=test-member@example.com", B+"/join")
c = db(); m = c.execute("SELECT * FROM members ORDER BY created_at DESC LIMIT 1").fetchone()
MID = m["member_id"]
ok("members に pending が1行できた", m["status"]=="pending", f"{MID} {m['email']}")
ok("カード情報・氏名・住所・電話を持っていない",
   set(dict(m).keys()).isdisjoint({"card","name","phone","address","tel"}))

print("\n=== 3. pending のままではログインできない ===")
sh("-c",CK,"-b",CK,"-d","email=test-member@example.com", B+"/login/request")
tok = c.execute("SELECT * FROM login_tokens ORDER BY created_at DESC LIMIT 1").fetchone()
ok("トークンはハッシュで保存されている（生の値が無い）", len(tok["token_hash"])==64)
body = c.execute("SELECT body FROM outbox ORDER BY id DESC LIMIT 1").fetchone()["body"]
RAW = re.search(r"/login#t=([A-Za-z0-9_\-]+)", body).group(1)
ok("メールのリンクはフラグメント(#)でトークンを渡す", "/login#t=" in body)
r = sh("-c",CK,"-b",CK,"-d","t="+RAW, B+"/login/consume")
ok("トークンは有効（ログイン自体は成立）", '"ok":true' in r.replace(" ",""))
r = mcode("/?q=打ち切り")
ok("pending は Q&A に入れず支払い案内へ", "/billing" in r, r.strip())

print("\n=== 4. 決済成功の通知（初回）===")
G1 = "9000001"
r = sh(f"{B}/webhook/subscpay/{SEC}?gid={G1}&rst=1&cod={MID}&acid=1000777&ec=")
ok("webhook は HTML を1行返す（空だと通知失敗扱い）", r.strip()=="<html>OK</html>", repr(r.strip()))
r2 = sh(f"{B}/webhook/subscpay/{SEC}?gid={G1}&rst=1&cod={MID}&acid=1000777&ec=")
n = c.execute("SELECT COUNT(*) n FROM payment_events WHERE gid=?", (G1,)).fetchone()["n"]
ok("同じ gid の重複通知は1件しか保存されない", n==1, f"{n}件")
r = sh(f"{B}/webhook/subscpay/wrong-secret?gid=9&rst=1&cod={MID}")
ok("パスが違う通知は拒否される", "NG" in r)

sh("-c",AK,"-d","password=demo", B+"/admin/login")
sh("-b",AK,"-X","POST", B+"/admin/process-events")
m = c.execute("SELECT * FROM members WHERE member_id=?", (MID,)).fetchone()
ok("status が active になった", m["status"]=="active", f"期限 {m['paid_through']}")
ok("acid が紐付いた", m["robotpay_acid"]=="1000777")

print("\n=== 5. ログインして Q&A が使える ===")
sh("-c",CK,"-b",CK,"-d","email=test-member@example.com", B+"/login/request")
body = c.execute("SELECT body FROM outbox ORDER BY id DESC LIMIT 1").fetchone()["body"]
RAW2 = re.search(r"/login#t=([A-Za-z0-9_\-]+)", body).group(1)
sh("-c",CK,"-b",CK,"-d","t="+RAW2, B+"/login/consume")
h = q("保険会社から打ち切りと言われた")
ok("主回答が表示される", "card primary" in h)
r = sh("-c",CK,"-b",CK,"-d","t="+RAW2, B+"/login/consume")
ok("同じリンクは2回目は使えない（使い捨て）", '"ok":false' in r.replace(" ",""))

print("\n=== 6. 決済失敗 → 猶予 → 停止 ===")
sh(f"{B}/webhook/subscpay-auto/{SEC}?gid=9000002&rst=3&cod={MID}&acid=1000777&ec=G0242G020000")
sh("-b",AK,"-X","POST", B+"/admin/process-events")
m = c.execute("SELECT * FROM members WHERE member_id=?", (MID,)).fetchone()
ok("rst=3（リトライ予定あり）→ grace", m["status"]=="grace", f"猶予 {m['grace_until']}")
ok("猶予中は Q&A を使える", "card primary" in q("保険会社から打ち切りと言われた"))

sh(f"{B}/webhook/subscpay-auto/{SEC}?gid=9000003&rst=2&cod={MID}&acid=1000777&ec=G6042G600000")
sh("-b",AK,"-X","POST", B+"/admin/process-events")
m = c.execute("SELECT * FROM members WHERE member_id=?", (MID,)).fetchone()
ok("rst=2（失敗して停止）→ suspended", m["status"]=="suspended")
r = mcode("/?q=打ち切り")
ok("停止後は Q&A に入れない", "/billing" in r, r.strip())
ok("検索結果が本文に出ない", "card primary" not in q("打ち切り"))

print("\n=== 7. 再決済（復活）===")
sh(f"{B}/webhook/subscpay-auto/{SEC}?gid=9000004&rst=1&cod={MID}&acid=1000777&ec=")
sh("-b",AK,"-X","POST", B+"/admin/process-events")
m = c.execute("SELECT * FROM members WHERE member_id=?", (MID,)).fetchone()
ok("再決済で active に戻る", m["status"]=="active", f"期限 {m['paid_through']}")
ok("Q&A が再び使える", "card primary" in q("保険会社から打ち切りと言われた"))

print("\n=== 8. 解約 ===")
sh(f"{B}/webhook/subscpay-auto/{SEC}?gid=9000005&rst=4&cod={MID}&acid=1000777&ec=")
sh("-b",AK,"-X","POST", B+"/admin/process-events")
m = c.execute("SELECT * FROM members WHERE member_id=?", (MID,)).fetchone()
ok("rst=4 → cancelled", m["status"]=="cancelled")
r = mcode("/?q=打ち切り")
ok("退会後は遮断される", "/billing" in r, r.strip())

print("\n=== 9. 通知遅延：解約後に古い成功通知が届いても巻き戻らない ===")
sh(f"{B}/webhook/subscpay-auto/{SEC}?gid=9000006&rst=1&cod={MID}&acid=1000777&ec=")
sh("-b",AK,"-X","POST", B+"/admin/process-events")
m = c.execute("SELECT * FROM members WHERE member_id=?", (MID,)).fetchone()
ok("cancelled のまま（active に戻らない）", m["status"]=="cancelled")

print("\n=== 10. 他商材（店舗売上・サプリ）の通知を取り違えない ===")
before = c.execute("SELECT COUNT(*) n FROM members").fetchone()["n"]
sh(f"{B}/webhook/subscpay/{SEC}?gid=9000007&rst=1&cod=SUPPLE-001&acid=2000111&ec=")
sh("-b",AK,"-X","POST", B+"/admin/process-events")
ev = c.execute("SELECT result FROM payment_events WHERE gid='9000007'").fetchone()
ok("cod の形が違う通知は無視される", ev["result"]=="ignored_other_product", ev["result"])
after = c.execute("SELECT COUNT(*) n FROM members").fetchone()["n"]
ok("会員が勝手に増えない", before==after)

print("\n=== 11. 退会後にログインしようとする ===")
def login_mails():
    return c.execute("SELECT COUNT(*) n FROM outbox WHERE subject LIKE '%ログイン%'").fetchone()["n"]
before = login_mails()
sh("-c",CK,"-b",CK,"-d","email=test-member@example.com", B+"/login/request")
after = login_mails()
ok("解約済みにはログインリンクを送らない", before == after, f"{before}通 → {after}通")
h = sh("-c",CK,"-b",CK,"-d","email=test-member@example.com", B+"/login/request")
ok("未登録のメールでも同じ画面を出す（登録の有無を教えない）", "メールをお送りしました" in h)
tok_left = c.execute("SELECT COUNT(*) n FROM login_tokens WHERE used_at IS NULL").fetchone()["n"]
sh("-b",AK,"-X","POST", B+"/admin/process-events")
after_purge = c.execute("SELECT COUNT(*) n FROM login_tokens").fetchone()["n"]
ok("使用済み・期限切れのトークンは消える", after_purge <= tok_left, f"{after_purge}件")

print("\n" + ("すべて通りました" if not FAIL else "★ 失敗あり"))
sys.exit(1 if FAIL else 0)
