#!/bin/sh
# dist/X文体ツール_全部入り.gs を 10_〜22_ の各ファイルから作り直す
set -e
cd "$(dirname "$0")"
out=dist/X文体ツール_全部入り.gs
mkdir -p dist
cat > "$out" <<'HDR'
/**
 * X投稿 文体ツール（全部入り）
 * このファイル1つをGASに貼れば動きます。
 *
 * 必要なスクリプトプロパティ:
 *   ANTHROPIC_API_KEY  … Claude APIキー
 *   X_SPREADSHEET_ID   … 作業用スプレッドシートのID
 *
 * ※ このファイルは build_x_dist.sh が生成します。直接編集しないでください。
 */

HDR
for f in 10_XConfig.js 11_XClaude.js 12_XMap.js 13_XExtract.js 14_XGenerate.js \
         15_XMenu.js 16_XFact.js 17_XStrategy.js 18_XPattern.js 19_XWeek.js \
         20_XCheck.js 21_XAnalytics.js 22_XMining.js 23_XTrend.js 24_XEdit.js 25_XPlan.js; do
  printf '\n// ===== %s =====\n\n' "$f" >> "$out"
  cat "$f" >> "$out"
done
wc -l "$out"
