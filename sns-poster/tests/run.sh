#!/bin/bash
# GASファイルの構文チェックとロジックテストをまとめて実行する
set -e
cd "$(dirname "$0")/.."

echo "=== 構文チェック ==="
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
for f in *.gs; do
  cp "$f" "$tmp/${f%.gs}.js"
  node --check "$tmp/${f%.gs}.js"
  echo "  OK $f"
done

echo
echo "=== ロジックテスト ==="
TZ=Asia/Tokyo node tests/test_logic.js

echo
echo "=== Cloudinary署名テスト ==="
node tests/test_signature.js
