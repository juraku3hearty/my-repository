#!/usr/bin/env bash
# LINE受付ハブ リッチメニューのデプロイ
#   1. richmenu 定義を作成 (api.line.me)
#   2. 画像をアップロード (api-data.line.me)
#   3. 全ユーザのデフォルトに設定 (api.line.me)
# 前提: 環境変数 LINE_CHANNEL_ACCESS_TOKEN
set -euo pipefail
cd "$(dirname "$0")"

TOK="${LINE_CHANNEL_ACCESS_TOKEN:?LINE_CHANNEL_ACCESS_TOKEN が未設定}"

echo "== 画像生成 =="
python3 make_image.py

echo "== 1) richmenu 作成 =="
RES=$(curl -s -X POST https://api.line.me/v2/bot/richmenu \
  -H "Authorization: Bearer $TOK" \
  -H "Content-Type: application/json" \
  --data @richmenu.json)
echo "$RES"
RID=$(python3 -c "import sys,json;print(json.load(sys.stdin)['richMenuId'])" <<<"$RES")
echo "richMenuId = $RID"

echo "== 2) 画像アップロード =="
curl -s -X POST "https://api-data.line.me/v2/bot/richmenu/$RID/content" \
  -H "Authorization: Bearer $TOK" \
  -H "Content-Type: image/jpeg" \
  --data-binary @richmenu.jpg \
  -w "HTTP %{http_code}\n"

echo "== 3) デフォルト設定 =="
curl -s -X POST "https://api.line.me/v2/bot/user/all/richmenu/$RID" \
  -H "Authorization: Bearer $TOK" \
  -H "Content-Length: 0" \
  -w "HTTP %{http_code}\n"

echo "== 完了。現在の一覧 =="
curl -s https://api.line.me/v2/bot/richmenu/list -H "Authorization: Bearer $TOK"
echo
echo "DEFAULT_RICHMENU_ID=$RID"
