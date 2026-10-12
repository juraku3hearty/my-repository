#!/bin/sh
# バックアップからの復元。手順を覚えていなくても実行できるようにする。
#   ./restore.sh /var/backups/jiko-desk/demo-20261012-030000.sqlite3.gz
set -eu

SRC="${1:?復元するバックアップファイルを指定してください}"
DB="${JIKO_DB:-/home/user/my-repository/jiko-desk/webapp/demo.sqlite3}"

echo "復元元: $SRC"
echo "復元先: $DB"

# 1. いま動いているものを先に退避する（復元が間違っていても戻せるように）
if [ -f "$DB" ]; then
  SAFETY="$DB.before-restore-$(date +%Y%m%d-%H%M%S)"
  cp "$DB" "$SAFETY"
  echo "現在のDBを退避しました: $SAFETY"
fi

# 2. 展開して中身を確認してから置き換える
TMP=$(mktemp)
gzip -dc "$SRC" > "$TMP" 2>/dev/null || cp "$SRC" "$TMP"
sqlite3 "$TMP" "PRAGMA integrity_check;" | grep -qx ok || {
  echo "NG: バックアップが壊れています。復元を中止しました。"; rm -f "$TMP"; exit 1; }

mv "$TMP" "$DB"
chmod 600 "$DB"
echo "OK: 復元しました"
sqlite3 "$DB" "SELECT '会員 ' || COUNT(*) FROM members;" || true
