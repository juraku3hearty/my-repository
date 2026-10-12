"""バックアップ → 変更 → 復元 のテスト。sqlite3コマンドが無い環境でも同じ流れを再現する。"""
import sqlite3, shutil, gzip, os, sys, subprocess, tempfile
DB="/home/user/my-repository/jiko-desk/webapp/demo.sqlite3"
DEST="/tmp/jiko-backup-test"
os.makedirs(DEST, exist_ok=True)
FAIL=False
def ok(l,c,x=""):
    global FAIL
    print(("  OK   " if c else "  NG   ")+l+(f"  {x}" if x else ""))
    if not c: FAIL=True

def count(db, table):
    c=sqlite3.connect(db)
    try: return c.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
    finally: c.close()

print("=== 1. バックアップを取る ===")
before = count(DB, "members")
src = sqlite3.connect(DB); out = f"{DEST}/demo-test.sqlite3"
dst = sqlite3.connect(out)
with dst: src.backup(dst)          # 書き込み中でも壊れた断面を取らない方法
dst.close(); src.close()
ok("バックアップが作られた", os.path.exists(out), f"{os.path.getsize(out)//1024} KB")
c=sqlite3.connect(out)
ok("整合性チェックが通る", c.execute("PRAGMA integrity_check").fetchone()[0]=="ok")
ok("会員の件数が一致する", count(out,"members")==before, f"{before}件")
c.close()
with open(out,"rb") as f, gzip.open(out+".gz","wb") as g: shutil.copyfileobj(f,g)
os.remove(out)
ok("圧縮して保存できた", os.path.exists(out+".gz"), f"{os.path.getsize(out+'.gz')//1024} KB")

print("\n=== 2. 本番のDBを壊す（復元が本当に効くかを見るため）===")
c=sqlite3.connect(DB); c.execute("DELETE FROM members"); c.commit()
after_break = count(DB,"members"); c.close()
ok("会員を全部消した", after_break==0, f"{after_break}件")

print("\n=== 3. 復元する ===")
safety = DB + ".before-restore-test"
shutil.copy(DB, safety)
ok("復元前に現在のDBを退避した", os.path.exists(safety))
tmp = tempfile.mktemp()
with gzip.open(out+".gz","rb") as g, open(tmp,"wb") as f: shutil.copyfileobj(g,f)
c=sqlite3.connect(tmp)
integrity = c.execute("PRAGMA integrity_check").fetchone()[0]; c.close()
ok("復元前に中身を確認した", integrity=="ok")
shutil.move(tmp, DB); os.chmod(DB, 0o600)
ok("会員の件数が戻った", count(DB,"members")==before, f"{count(DB,'members')}件（元 {before}件）")
c=sqlite3.connect(DB)
ok("ナレッジも戻っている", c.execute("SELECT COUNT(*) FROM items").fetchone()[0]==10)
ok("通知の記録も戻っている", c.execute("SELECT COUNT(*) FROM payment_events").fetchone()[0]>=0)
c.close()
os.remove(safety)

print("\n=== 4. 壊れたバックアップからは復元しない ===")
bad = f"{DEST}/broken.sqlite3"
open(bad,"wb").write(b"this is not a database")
try:
    c=sqlite3.connect(bad); r=c.execute("PRAGMA integrity_check").fetchone()[0]; c.close()
except Exception as e:
    r = "error"
ok("壊れたファイルは整合性チェックで弾かれる", r!="ok", str(r)[:40])

print("\n=== 5. 保存期間を過ぎたものの削除 ===")
c=sqlite3.connect(DB)
c.execute("INSERT INTO search_log(ts,member_hash,query_masked,result_count,zero_hit,top_item_id) "
          "VALUES (date('now','-14 months'),'x','古いログ',0,1,NULL)")
c.execute("INSERT INTO payment_events(gid,kind,raw,received_at,processed_at) "
          "VALUES ('OLD','auto','x',date('now','-25 months'),date('now','-25 months'))")
c.commit()
old_s = c.execute("SELECT COUNT(*) FROM search_log WHERE ts < date('now','-13 months')").fetchone()[0]
old_p = c.execute("SELECT COUNT(*) FROM payment_events WHERE received_at < date('now','-24 months')").fetchone()[0]
ok("古いデータを仕込んだ", old_s>=1 and old_p>=1, f"ログ{old_s} 通知{old_p}")
c.executescript("""
DELETE FROM search_log  WHERE ts < date('now','-13 months');
DELETE FROM payment_events WHERE received_at < date('now','-24 months');
DELETE FROM login_tokens WHERE used_at IS NOT NULL OR expires_at < datetime('now','localtime');
""")
c.commit()
ok("13か月より古い利用ログが消えた",
   c.execute("SELECT COUNT(*) FROM search_log WHERE ts < date('now','-13 months')").fetchone()[0]==0)
ok("24か月より古い通知が消えた",
   c.execute("SELECT COUNT(*) FROM payment_events WHERE received_at < date('now','-24 months')").fetchone()[0]==0)
ok("使用済みトークンが消えた",
   c.execute("SELECT COUNT(*) FROM login_tokens WHERE used_at IS NOT NULL").fetchone()[0]==0)
c.close()
print("\n"+("すべて通りました" if not FAIL else "★ 失敗あり")); sys.exit(1 if FAIL else 0)
