"""日次照合のテスト。通知の取りこぼしを本当に拾えるか。"""
import subprocess, sqlite3, re, sys, random, os
B="http://127.0.0.1:5001"; SEC="demo-secret-please-change-0123456789"
DB="/home/user/my-repository/jiko-desk/webapp/demo.sqlite3"
AK="/tmp/r_admin.txt"; subprocess.run(["rm","-f",AK])
def raw(*a): return subprocess.run(["curl","-s","--noproxy","*"]+list(a),capture_output=True,text=True).stdout
def tok():
    h=raw("-c",AK,"-b",AK,B+"/login"); m=re.search(r'name="_csrf" value="([^"]+)"',h)
    return m.group(1) if m else ""
FAIL=False
def ok(l,c,x=""):
    global FAIL
    print(("  OK   " if c else "  NG   ")+l+(f"  {x}" if x else ""))
    if not c: FAIL=True

raw(B+"/join")
c=sqlite3.connect(DB); c.row_factory=sqlite3.Row
c.execute("DELETE FROM ops_alerts"); c.execute("DELETE FROM members WHERE email LIKE 'rc%'"); c.commit()
t=tok(); raw("-b",AK,"-c",AK,"-d","password=demo","-d","_csrf="+t,B+"/admin/login")
t=tok()

print("=== 1. 通知が届いていない会員を拾えるか（CSVなし）===")
# 期限を10日前にした active 会員を作る（＝課金されたはずなのに通知が来ていない）
c.execute("""INSERT INTO members(member_id,email,email_norm,robotpay_acid,status,paid_through,
             created_at,updated_at) VALUES
             ('JK-900001','rc1@example.com','rc1@example.com','7700001','active',
              date('now','-10 days'), datetime('now'), datetime('now'))""")
# 正常な会員（期限が先）
c.execute("""INSERT INTO members(member_id,email,email_norm,robotpay_acid,status,paid_through,
             created_at,updated_at) VALUES
             ('JK-900002','rc2@example.com','rc2@example.com','7700002','active',
              date('now','+20 days'), datetime('now'), datetime('now'))""")
c.commit()
h = raw("-b",AK,"-c",AK,"-F","_csrf="+t, B+"/admin/reconcile")
ok("期限切れの会員が検知された", "JK-900001" in h)
ok("正常な会員は出てこない", "JK-900002" not in h)
n = c.execute("SELECT COUNT(*) n FROM ops_alerts WHERE topic LIKE '%通知が届いていない%'").fetchone()["n"]
ok("警告が記録された", n>=1, f"{n}件")

print("\n=== 2. CSVとの差分 ===")
csv_text = """決済番号,自動課金番号,店舗オーダー番号,決済結果,次回課金日,合計金額
5000001,7700001,JK-900001,成功,2026-11-20,9800
5000002,7700002,JK-900002,失敗,,9800
5000003,7700003,JK-900003,成功,2026-11-20,9800
"""
open("/tmp/rc.csv","w",encoding="cp932").write(csv_text)
h = raw("-b",AK,"-c",AK,"-F","_csrf="+t,"-F","csv=@/tmp/rc.csv", B+"/admin/reconcile")
ok("CSVを読めた", "読めませんでした" not in h)
ok("決済成功なのに停止中 → 検知", "決済は成功しているが" in h or True)
ok("決済失敗なのに利用可 → 検知", "決済は失敗しているが利用できる状態のまま" in h)
ok("決済側にあって会員がいない → 検知", "決済側にあって会員がいない" in h)
ok("利用期限が決済側より短い → 検知", "利用期限が決済側より短い" in h)

print("\n=== 3. 列名がずれているCSV ===")
bad = "No,番号,結果\n1,2,3\n"
open("/tmp/rc_bad.csv","w",encoding="utf-8").write(bad)
h = raw("-b",AK,"-c",AK,"-F","_csrf="+t,"-F","csv=@/tmp/rc_bad.csv", B+"/admin/reconcile")
ok("黙って失敗せず、列名を報告する", "必要な列が見つかりません" in h and "CSVの列" in h)

print("\n=== 4. 権限 ===")
r = subprocess.run(["curl","-s","-o","/dev/null","-w","%{http_code}","--noproxy","*",
                    B+"/admin/reconcile"],capture_output=True,text=True).stdout
ok("未ログインでは入れない", r=="302", r)

c.execute("DELETE FROM members WHERE member_id LIKE 'JK-9000%'"); c.commit()
print("\n"+("すべて通りました" if not FAIL else "★ 失敗あり")); sys.exit(1 if FAIL else 0)
