"""募集の受付を閉じている間（JOIN_OPEN=0）の動きを確かめる。

SNSで発信を始めてから決済の準備が整うまでの数日間、
募集ページは「先行案内の登録」として動く必要がある。
"""
import os, re, sys, sqlite3

os.environ["APP_ENV"] = "dev"
os.environ["JOIN_OPEN"] = "0"
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import app as A            # noqa: E402  JOIN_OPEN は読み込み時に決まる
import membership as mb    # noqa: E402

DB = "/home/user/my-repository/jiko-desk/webapp/demo.sqlite3"
ok = ng = 0


def check(name, cond, detail=""):
    global ok, ng
    if cond:
        ok += 1
        print(f"  ✓ {name}")
    else:
        ng += 1
        print(f"  ✗ {name}  {detail}")


def csrf(c, path="/prelaunch"):
    html = c.get(path).get_data(as_text=True)
    m = re.search(r'name="_csrf" value="([^"]+)"', html)
    return m.group(1) if m else ""


con = sqlite3.connect(DB)
con.row_factory = sqlite3.Row
mb.init(con)
con.execute("DELETE FROM prelaunch WHERE email LIKE 'pl-test%'")
con.execute("DELETE FROM rate_log WHERE bucket = 'prelaunch_ip'")
con.commit()

A.app.config["TESTING"] = False
c = A.app.test_client()

print("\n■ 受付を閉じている間の導線")
r = c.get("/lp")
body = r.get_data(as_text=True)
check("募集ページは表示される", r.status_code == 200, r.status_code)
check("CTAが『受付開始のご案内を受け取る』になる", "受付開始のご案内を受け取る" in body)
check("『申し込む』ボタンは出さない", "月額9,800円（税込）で申し込む" not in body)
check("料金欄に準備中と出る", "現在、受付の準備中です" in body)
check("/prelaunch へ誘導している", "/prelaunch" in body)

r = c.get("/join")
check("/join は先行案内へ転送する", r.status_code == 302 and "/prelaunch" in r.headers["Location"],
      f"{r.status_code} {r.headers.get('Location')}")

r = c.post("/join", data={"email": "pl-test1@example.com", "agree": "1",
                          "_csrf": csrf(c)})
check("/join へのPOSTでも決済に進ませない", r.status_code == 302 and "/prelaunch" in r.headers["Location"],
      f"{r.status_code} {r.headers.get('Location')}")
check("pending会員が作られていない",
      con.execute("SELECT COUNT(*) FROM members WHERE email LIKE 'pl-test%'").fetchone()[0] == 0)

print("\n■ 先行案内の登録")
r = c.get("/prelaunch")
body = r.get_data(as_text=True)
check("登録画面が出る", r.status_code == 200)
check("料金が発生しないと明記している", "料金は発生しません" in body)
check("預かるのはメールアドレスのみと明記している", "メールアドレスのみ" in body)
check("削除の方法を書いている", "info@famitect.com" in body)

r = c.post("/prelaunch", data={"email": "pl-test1@example.com", "agree": "1", "_csrf": csrf(c)})
check("登録できる", "お預かりしました" in r.get_data(as_text=True))
check("DBに入る",
      con.execute("SELECT COUNT(*) FROM prelaunch WHERE email='pl-test1@example.com'").fetchone()[0] == 1)

r = c.post("/prelaunch", data={"email": "PL-Test1@Example.com ", "agree": "1", "_csrf": csrf(c)})
check("同じアドレスを再登録しても同じ画面（登録済みが分からない）",
      "お預かりしました" in r.get_data(as_text=True))
check("重複して増えない",
      con.execute("SELECT COUNT(*) FROM prelaunch WHERE email='pl-test1@example.com'").fetchone()[0] == 1)

r = c.post("/prelaunch", data={"email": "pl-test2@example.com", "_csrf": csrf(c)})
check("同意なしは断る", "同意が必要です" in r.get_data(as_text=True))
check("同意なしでは保存しない",
      con.execute("SELECT COUNT(*) FROM prelaunch WHERE email='pl-test2@example.com'").fetchone()[0] == 0)

r = c.post("/prelaunch", data={"email": "こわれたアドレス", "agree": "1", "_csrf": csrf(c)})
check("不正なアドレスは断る", "ご確認ください" in r.get_data(as_text=True))

r = c.post("/prelaunch", data={"email": "pl-test3@example.com", "agree": "1"})
check("CSRFトークンなしは403", r.status_code == 403, r.status_code)

print("\n■ 連打のレート制限（1時間に5回）")
con.execute("DELETE FROM rate_log WHERE bucket = 'prelaunch_ip'")
con.commit()
last = ""
for i in range(7):
    last = c.post("/prelaunch", data={"email": f"pl-test-r{i}@example.com", "agree": "1",
                                      "_csrf": csrf(c)}).get_data(as_text=True)
check("6回目以降は断る", "しばらく時間をおいて" in last)

print("\n■ 会員の入り口は閉じたまま")
check("Q&Aは未ログインでは開けない",
      c.get("/").status_code == 302)
check("APIは401", c.get("/api/search?q=打ち切り").status_code == 401)

print("\n■ 管理画面")
r = c.get("/admin/prelaunch")
check("未ログインでは見られない", r.status_code == 302 and "/login" in r.headers["Location"],
      f"{r.status_code} {r.headers.get('Location')}")
con.execute("DELETE FROM admin_login_log")
con.commit()
c.post("/admin/login", data={"password": "demo", "_csrf": csrf(c, "/admin/login")})
r = c.get("/admin/prelaunch")
check("管理者なら一覧が見える", r.status_code == 200 and "pl-test1@example.com" in r.get_data(as_text=True),
      r.status_code)
r = c.get("/admin/prelaunch?format=csv")
check("CSVで取り出せる", r.status_code == 200 and "pl-test1@example.com" in r.get_data(as_text=True))

print("\n■ 案内済みの記録")
n = mb.prelaunch_mark_notified(con, ["pl-test1@example.com"])
con.commit()
check("案内済みにできる", n == 1)
check("二重には立たない", mb.prelaunch_mark_notified(con, ["pl-test1@example.com"]) == 0)
check("未案内だけを取り出せる",
      all(r["email"] != "pl-test1@example.com" for r in mb.prelaunch_list(con, only_unnotified=True)))

con.execute("DELETE FROM prelaunch WHERE email LIKE 'pl-test%'")
con.execute("DELETE FROM rate_log WHERE bucket = 'prelaunch_ip'")
con.commit()
con.close()

print(f"\n{ok}項目通過 / {ng}項目失敗")
print("すべて通りました" if ng == 0 else "失敗があります")
sys.exit(1 if ng else 0)
