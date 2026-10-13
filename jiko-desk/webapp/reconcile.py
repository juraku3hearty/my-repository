"""日次照合：通知の取りこぼしを拾う。

なぜ必須か（2026-10-13 サポート回答で確定）
  - キックバックの **自動再送は行われない**。不達が起きたら、そのまま失われる
  - 不達時の再送信は「都度カスタマーサポートへ依頼」が必要
  → つまり **こちらが気づかなければ、会員の状態が永久にずれたままになる**

二段構えにしてある。
  1. check_overdue()  … CSVが無くても動く。課金されたはずなのに通知が来ていない会員を拾う
  2. reconcile_csv()  … 管理画面から落としたCSVと突き合わせ、こちらの状態を直す

【未確認】CSVの列名は実物を見ていない。下の ALIASES で複数の呼び方に当て、
見つからなければ列名を並べて報告する（黙って失敗させない）。
"""
from __future__ import annotations

import csv
import io
from datetime import date, datetime, timedelta

import membership as mb

# 期限を過ぎてから、通知が無いことを異常とみなすまでの日数。
# 決済日のずれと通知遅延を吸収するための余裕。
OVERDUE_GRACE_DAYS = 3

# CSVの列名のゆれを吸収する。左が内部の呼び名、右が候補。
ALIASES = {
    "acid": ["自動課金番号", "acid", "AutoChargeID", "自動課金ID"],
    "gid": ["決済番号", "gid", "ID"],
    "cod": ["店舗オーダー番号", "cod", "オーダー番号"],
    "result": ["決済結果", "rst", "結果", "ステータス", "状態"],
    "next_at": ["次回課金日", "nad", "次回決済日"],
    "paid_at": ["決済日時", "決済日", "cd", "処理日時"],
    "amount": ["合計金額", "金額", "ta", "決済金額"],
}

# CSVの「決済結果」に入りうる表記。数字でも日本語でも拾う。
SUCCESS_WORDS = {"1", "成功", "決済成功", "完了", "OK"}
FAILURE_WORDS = {"2", "4", "5", "失敗", "決済失敗", "エラー", "NG"}


def _pick(header: list[str], key: str) -> str | None:
    norm = {h.strip().replace("　", "").replace(" ", ""): h for h in header}
    for cand in ALIASES[key]:
        c = cand.replace(" ", "")
        if c in norm:
            return norm[c]
        for k, orig in norm.items():          # 部分一致も見る
            if c and c in k:
                return orig
    return None


def parse_csv(text: str) -> tuple[list[dict], list[str]]:
    """CSVを読んで、内部の呼び名に直した行と、見つからなかった列名を返す。"""
    # 文字コードは呼び出し側で直してから渡す
    reader = csv.DictReader(io.StringIO(text))
    header = reader.fieldnames or []
    mapping, missing = {}, []
    for key in ("acid", "result"):            # この2つは必須
        col = _pick(header, key)
        if col is None:
            missing.append(key)
        else:
            mapping[key] = col
    for key in ("gid", "cod", "next_at", "paid_at", "amount"):
        col = _pick(header, key)
        if col:
            mapping[key] = col
    if missing:
        return [], [f"必要な列が見つかりません: {', '.join(missing)}",
                    f"CSVの列: {', '.join(header)}"]
    rows = []
    for raw in reader:
        rows.append({k: (raw.get(col) or "").strip() for k, col in mapping.items()})
    return rows, []


def check_overdue(conn) -> list[dict]:
    """課金されたはずなのに通知が来ていない会員を拾う。CSVが無くても動く。

    自動再送が無いため、これが唯一の自前の検知手段になる。
    """
    limit = (date.today() - timedelta(days=OVERDUE_GRACE_DAYS)).isoformat()
    rows = conn.execute(
        """SELECT * FROM members
            WHERE status = 'active' AND paid_through IS NOT NULL
              AND paid_through <> '' AND paid_through < ?""", (limit,)).fetchall()
    found = []
    for r in rows:
        found.append({"member_id": r["member_id"], "paid_through": r["paid_through"],
                      "acid": r["robotpay_acid"] or ""})
        mb.alert(conn, "warn", "課金の通知が届いていない可能性",
                 f"{r['member_id']} 期限 {r['paid_through']} acid={r['robotpay_acid']}"
                 f" / 管理画面で決済を確認してください")
    # 申込したまま決済が確認できないものも拾う
    mb.check_stale_pending(conn)
    conn.commit()
    return found


def reconcile_csv(conn, text: str) -> dict:
    """管理画面から落としたCSVと突き合わせ、ずれを報告する。

    **自動では直さない。** 金銭に関わるので、差分を出して人が判断する。
    """
    rows, errors = parse_csv(text)
    if errors:
        for e in errors:
            mb.alert(conn, "warn", "CSVを読めませんでした", e)
        conn.commit()
        return {"ok": False, "errors": errors, "diffs": []}

    diffs = []
    seen_acid = set()
    for row in rows:
        acid = row.get("acid", "")
        if not acid or acid == "0":
            continue
        seen_acid.add(acid)
        m = conn.execute("SELECT * FROM members WHERE robotpay_acid = ?", (acid,)).fetchone()
        result = row.get("result", "")
        if m is None:
            # 会員サイト由来かを cod で見分ける。店舗売上・サプリの決済は無視する。
            if (row.get("cod") or "").startswith("JK-"):
                diffs.append({"kind": "決済側にあって会員がいない",
                              "acid": acid, "cod": row.get("cod", ""), "detail": result})
            continue
        # 決済は成功しているのに、こちらが停止・解約のままになっていないか
        if result in SUCCESS_WORDS and m["status"] in ("suspended", "cancelled", "pending"):
            diffs.append({"kind": "決済は成功しているが利用停止のまま",
                          "acid": acid, "member_id": m["member_id"], "detail": m["status"]})
        # 決済は失敗・停止しているのに、こちらが使える状態のままになっていないか
        if result in FAILURE_WORDS and m["status"] in ("active", "grace"):
            diffs.append({"kind": "決済は失敗しているが利用できる状態のまま",
                          "acid": acid, "member_id": m["member_id"], "detail": m["status"]})
        # 次回課金日が分かるなら、利用期限とずれていないか見る
        nxt = (row.get("next_at") or "")[:10].replace("/", "-")
        if nxt and m["paid_through"] and nxt > m["paid_through"]:
            diffs.append({"kind": "利用期限が決済側より短い",
                          "acid": acid, "member_id": m["member_id"],
                          "detail": f"こちら {m['paid_through']} / 決済側の次回 {nxt}"})

    # こちらでは使えるのに、決済側に見当たらない会員
    for m in conn.execute("SELECT * FROM members WHERE status IN ('active','grace')").fetchall():
        if m["robotpay_acid"] and m["robotpay_acid"] not in seen_acid:
            diffs.append({"kind": "利用できる状態だが決済側に見当たらない",
                          "acid": m["robotpay_acid"], "member_id": m["member_id"],
                          "detail": m["status"]})

    for d in diffs:
        mb.alert(conn, "warn", "日次照合：" + d["kind"],
                 f"{d.get('member_id', '')} acid={d['acid']} {d.get('detail', '')}")
    mb.alert(conn, "info", "日次照合を実行しました",
             f"CSV {len(rows)}行 / 差分 {len(diffs)}件")
    conn.commit()
    return {"ok": True, "errors": [], "diffs": diffs, "rows": len(rows)}
