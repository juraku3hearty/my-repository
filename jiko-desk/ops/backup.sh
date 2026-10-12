#!/bin/sh
# 会員DBとナレッジDBのバックアップ。cron で毎日実行する想定。
#   0 3 * * * /path/to/jiko-desk/ops/backup.sh >> /var/log/jiko-backup.log 2>&1
set -eu

DB="${JIKO_DB:-/home/user/my-repository/jiko-desk/webapp/demo.sqlite3}"
DEST="${JIKO_BACKUP_DIR:-/var/backups/jiko-desk}"
KEEP_DAYS="${JIKO_BACKUP_KEEP:-30}"

mkdir -p "$DEST"
STAMP=$(date +%Y%m%d-%H%M%S)
OUT="$DEST/$(basename "$DB" .sqlite3)-$STAMP.sqlite3"

# ファイルをコピーせず .backup を使う。書き込み中でも壊れた断面を取らない。
sqlite3 "$DB" ".backup '$OUT'"

# 取ったものが本当に開けるか、その場で確認する
sqlite3 "$OUT" "PRAGMA integrity_check;" | grep -qx ok || {
  echo "NG: バックアップが壊れています $OUT"; exit 1; }

gzip -f "$OUT"
echo "OK: $OUT.gz ($(date))"

# 古いものを消す
find "$DEST" -name '*.sqlite3.gz' -mtime "+$KEEP_DAYS" -delete
