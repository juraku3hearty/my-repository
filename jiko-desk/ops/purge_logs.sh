#!/bin/sh
# 保存期間を過ぎたものを消す。cron で毎日実行する想定。
#   30 3 * * * /path/to/jiko-desk/ops/purge_logs.sh >> /var/log/jiko-purge.log 2>&1
set -eu
DB="${JIKO_DB:-/home/user/my-repository/jiko-desk/webapp/demo.sqlite3}"

sqlite3 "$DB" <<'SQL'
-- 利用ログ：13か月
DELETE FROM search_log  WHERE ts < date('now','-13 months');
DELETE FROM view_log    WHERE ts < date('now','-13 months');
DELETE FROM feedback    WHERE ts < date('now','-13 months');
DELETE FROM video_click WHERE ts < date('now','-13 months');
DELETE FROM unanswered  WHERE ts < date('now','-13 months');

-- 決済通知の生ログ：24か月
DELETE FROM payment_events WHERE received_at < date('now','-24 months');

-- ログイン用トークン：使用済み・期限切れは即時
DELETE FROM login_tokens WHERE used_at IS NOT NULL OR expires_at < datetime('now','localtime');

-- 回数制限の記録：1日
DELETE FROM rate_log WHERE ts < datetime('now','localtime','-1 day');

-- 管理者ログインの記録：90日
DELETE FROM admin_login_log WHERE ts < date('now','-90 days');

-- 退会から13か月たった会員：メールアドレスを消し、統計用に行だけ残す
UPDATE members
   SET email = '', email_norm = '', status = 'deleted'
 WHERE status = 'cancelled'
   AND cancelled_at IS NOT NULL
   AND cancelled_at < date('now','-13 months');

VACUUM;
SQL
echo "OK: 保存期間を過ぎたものを削除しました ($(date))"
