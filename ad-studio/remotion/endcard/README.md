# 締めのLINE予約カード生成

広告の締めに使う「公式LINEのアプリを開いて続行画面」を入れたスマホ1枚を作る。
LINEの汎用ゲートウェイ画面なので**予約システムを移行しても不変**（動画を作り直さなくていい）。

## 作り方(この環境/Macどちらも)
```
# 1) LINE画面を描画 → PNG
chrome --headless --disable-gpu --no-sandbox --hide-scrollbars \
  --force-device-scale-factor=1 --window-size=720,1480 \
  --screenshot=line_screen.png "file://$PWD/line_screen.html"

# 2) end_card.html の __LINE_PNG__ を line_screen.png の絶対パスに置換 → 1080x1920で描画
sed "s#__LINE_PNG__#$PWD/line_screen.png#" end_card.html > end_card_final.html
chrome --headless --disable-gpu --no-sandbox --hide-scrollbars \
  --force-device-scale-factor=1 --window-size=1080,1920 \
  --screenshot=end_card.png "file://$PWD/end_card_final.html"

# 3) 静止画→締めの長さ(秒)ぶんの動画にして public/bg/08.mp4 等に置く
ffmpeg -y -loop 1 -i end_card.png -t 6.03 -r 30 -c:v libx264 -pix_fmt yuv420p \
  -vf scale=1080:1920 ../public/bg/08.mp4
```
Macは `chrome` の代わりに `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"` など。

## 差し替えポイント
- 予約の実リンクは**広告のCTAボタン側**に持たせる(固定リンク→飛び先だけ移行時に変更)
- 背景色やスマホの形は end_card.html のCSSで調整可

## オファー投下の効果音(se/pop.wav)
価格スタンプの瞬間に鳴らす"チャリーン✨"。ffmpegで生成済み(public/se/pop.wav・コミット済)。
作り直す例:
```
ffmpeg -y \
 -f lavfi -i "sine=frequency=1318:duration=0.5" \
 -f lavfi -i "sine=frequency=1760:duration=0.5" \
 -f lavfi -i "sine=frequency=2637:duration=0.5" \
 -filter_complex "[0]afade=t=out:st=0:d=0.32,volume=0.9[a];[1]adelay=85|85,afade=t=out:st=0.085:d=0.36,volume=0.9[b];[2]adelay=85|85,afade=t=out:st=0.085:d=0.30,volume=0.35[c];[a][b][c]amix=inputs=3:normalize=0,volume=3.4,alimiter=limit=0.98[o]" \
 -map "[o]" -ac 2 -ar 44100 -t 0.55 public/se/pop.wav
```
props: offerFrom(投下フレーム) / offerSe:"se/pop.wav" / offerSeVolume

## 締めのWEB予約カード（LINEの代わり／コンバージョン計測版）
`end_card_web.html` ＝ 予約画面(日時選択)を入れたスマホ＋「24時間ネット予約OK/タップして希望の日時を選ぶだけ」。LINE無し。
広告CTA「予約する」→ sekkotsu-appの予約URL(?m=..&c=施策ID)へ。予約完了でMetaコンバージョン(Schedule)発火。
作り方はLINE版と同じ（chromiumで1080x1920書き出し→ public/bg/08web.mp4）。
音声は「公式ラインから…」を除去した full_web.wav を使う（afade out）。props は props.reuse.web.json。
