#!/bin/sh
# X文体ツールのテスト。GASを偽のシートと偽のAPIで動かし、結果を確かめる。
# 先に build_x_dist.sh で dist を作り直してから実行する。
cd "$(dirname "$0")"
fail=0
for t in *.test.js; do
  out=$(node "$t" 2>&1)
  okc=$(printf '%s\n' "$out" | grep -c '^✅')
  ng=$(printf '%s\n' "$out" | grep '^❌')
  if [ -n "$ng" ] || ! printf '%s\n' "$out" | grep -q '^✅'; then
    echo "NG  $t"; printf '%s\n' "$out" | grep -E '^❌|Error' ; fail=1
  else
    echo "OK  $t ($okc)"
  fi
done
exit $fail
