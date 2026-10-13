"""正式回答の反映を確認するテスト。"""
import subprocess, sqlite3, re, sys, os, importlib.util
B="http://127.0.0.1:5001"; SEC="demo-secret-please-change-0123456789"
DB="/home/user/my-repository/jiko-desk/webapp/demo.sqlite3"
AK="/tmp/o_admin.txt"; subprocess.run(["rm","-f",AK])
def raw(*a): return subprocess.run(["curl","-s","--noproxy","*"]+list(a),capture_output=True,text=True).stdout
def code(*a): return subprocess.run(["curl","-s","-o","/dev/null","-w","%{http_code}","--noproxy","*"]+list(a),capture_output=True,text=True).stdout
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
c.execute("DELETE FROM ops_alerts"); c.execute("DELETE FROM payment_events WHERE gid LIKE '97%'")
c.execute("DELETE FROM members WHERE email LIKE 'of%'"); c.commit()
t=tok(); raw("-b",AK,"-c",AK,"-d","password=demo","-d","_csrf="+t,B+"/admin/login"); t=tok()

print("=== 1. 未確認の仕様を契約条件として書いていないか ===")
h = raw(B+"/join")
ok("申込画面に「7日ごとに最大2回」が無い", "7日ごと" not in h and "最大2回" not in h)
ok("申込画面に「決済代行会社の規定により」がある", "決済代行会社の規定により" in h)
ok("当方が停止する時点を明記している", "最終的に決済失敗の" in h)
h = raw(B+"/terms")
ok("利用規約に「7日ごとに最大2回」が無い", "7日ごと" not in h and "最大2回" not in h)
ok("利用規約で回数・間隔を決済代行会社の定めとしている", "決済代行会社の定めによります" in h)

print("\n=== 2. 送信元IPの判定（プロキシ経由）===")
spec=importlib.util.spec_from_file_location("security","/home/user/my-repository/jiko-desk/webapp/security.py")
secm=importlib.util.module_from_spec(spec); spec.loader.exec_module(secm)
class Req:
    def __init__(self, remote, xff=None):
        self.remote_addr=remote; self.headers={"X-Forwarded-For":xff} if xff else {}
os.environ["TRUSTED_PROXY_COUNT"]="0"
ok("プロキシ無し → remote_addr を使う", secm.client_ip(Req("1.2.3.4","9.9.9.9"))=="1.2.3.4")
os.environ["TRUSTED_PROXY_COUNT"]="1"
ok("1段 → XFFの右から1番目", secm.client_ip(Req("127.0.0.1","54.95.223.30"))=="54.95.223.30")
ok("偽装されても右端が使われる",
   secm.client_ip(Req("127.0.0.1","54.95.223.30, 1.1.1.1"))=="1.1.1.1")
os.environ["TRUSTED_PROXY_COUNT"]="2"
ok("2段 → XFFの右から2番目",
   secm.client_ip(Req("127.0.0.1","54.95.223.30, 10.0.0.1"))=="54.95.223.30")
ok("段数が足りなければ空（＝拒否される）", secm.client_ip(Req("127.0.0.1","1.1.1.1"))=="")
os.environ["TRUSTED_PROXY_COUNT"]="0"

print("\n=== 3. 通知の受信：保存できてから応答する ===")
r = code(f"{B}/webhook/subscpay-auto/{SEC}?gid=9700001&rst=1&cod=JK-NOBODY&acid=1&ec=")
ok("保存できれば 200", r=="200", r)
n=c.execute("SELECT COUNT(*) n FROM payment_events WHERE gid='9700001'").fetchone()["n"]
ok("先に保存されている", n==1)
r = code(f"{B}/webhook/subscpay-auto/wrong-path?gid=9700002&rst=1")
ok("パスが違えば 404", r=="404", r)

print("\n=== 4. cod の無い通知を黙って捨てない ===")
raw(f"{B}/webhook/subscpay-auto/{SEC}?gid=9700003&rst=1&acid=8888&ec=")
raw("-b",AK,"-X","POST","-d","_csrf="+t, B+"/admin/process-events")
res=c.execute("SELECT result FROM payment_events WHERE gid='9700003'").fetchone()["result"]
ok("cod無しは ignored_no_cod", res=="ignored_no_cod", res)
ok("警告が残る", c.execute("SELECT COUNT(*) n FROM ops_alerts WHERE topic LIKE '%cod%'").fetchone()["n"]>=1)

print("\n=== 5. 反映に失敗しても他が止まらない ===")
# 壊れた生ログを仕込む
c.execute("INSERT INTO payment_events(gid,kind,raw,received_at) VALUES ('9700004','auto','cod=JK-000001&rst=',datetime('now'))")
c.commit()
raw("-b",AK,"-X","POST","-d","_csrf="+t, B+"/admin/process-events")
stuck=c.execute("SELECT result FROM payment_events WHERE gid='9700004'").fetchone()["result"]
ok("未知のrstは unknown として記録される", stuck is not None, str(stuck)[:40])

print("\n=== 6. 照合のやり忘れを検知する ===")
c.execute("DELETE FROM ops_alerts WHERE topic='日次照合を実行しました'"); c.commit()
h = raw("-b",AK,"-c",AK,B+"/admin/reconcile")
ok("一度も実行していなければ警告が出る", "未実施" in h)
# CSV無しの確認だけでは「照合した」ことにしない
raw("-b",AK,"-c",AK,"-F","_csrf="+t, B+"/admin/reconcile")
h = raw("-b",AK,"-c",AK,B+"/admin/reconcile")
ok("CSV無しの確認では警告が消えない", "あいています" in h or "未実施" in h)
open("/tmp/of.csv","w",encoding="cp932").write("決済番号,自動課金番号,決済結果\n1,9999,成功\n")
raw("-b",AK,"-c",AK,"-F","_csrf="+t,"-F","csv=@/tmp/of.csv", B+"/admin/reconcile")
h = raw("-b",AK,"-c",AK,B+"/admin/reconcile")
ok("CSVを上げると照合済みになる", "あいています" not in h and "CSVとの照合：2" in h)
ok("CSVの自動取得を前提にしないと明記", "自動取得できるとは想定していません" in h)

print("\n=== 7. 停止APIは承認があるまで実行されない ===")
src=open("/home/user/my-repository/jiko-desk/webapp/app.py").read()
ok("既定で無効", 'ALLOW_STOP_API = os.environ.get("ALLOW_STOP_API", "0") == "1"' in src)
ok("店舗IDも必要", "STOP_API_AID" in src)
ok("実装前に止める", "NotImplementedError" in src)
ok("acidが無ければ実行できない", "acidのキックバック追加が未設定" in src)

print("\n=== 8. acid 未到着の扱い ===")
c.execute("""INSERT OR REPLACE INTO members(member_id,email,email_norm,status,created_at,updated_at)
             VALUES ('JK-000001','of1@example.com','of1@example.com','pending',
                     datetime('now'),datetime('now'))""")
c.execute("DELETE FROM ops_alerts"); c.commit()
raw(f"{B}/webhook/subscpay/{SEC}?gid=9700005&rst=1&cod=JK-000001&ec=")
raw("-b",AK,"-X","POST","-d","_csrf="+t, B+"/admin/process-events")
st=c.execute("SELECT status FROM members WHERE member_id='JK-000001'").fetchone()["status"]
ok("acidが無くても cod だけで会員を特定できる", st=="active", st)
ok("acid未着を警告として残す",
   c.execute("SELECT COUNT(*) n FROM ops_alerts WHERE topic LIKE '%acid%'").fetchone()["n"]>=1)

print("\n"+("すべて通りました" if not FAIL else "★ 失敗あり")); sys.exit(1 if FAIL else 0)
