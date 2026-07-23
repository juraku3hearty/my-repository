# Remotion ショート組み立て（できあがりを綺麗にする方）

素材（AIフック動画 / 実写 / Fish Audioの音声 / BGM）を受け取って、
**動的ズーム・1行ずつ出るキネティック字幕・BGMフェード**で、縦型ショート(1080x1920)に組み立てる。

＝今まで ffmpeg が「クソな組み立て」してた所を、これに置き換える。**素材はそのまま活かす。**

---

## Macでの動かし方（1つずつ・コードは読まなくていい）

### ① このフォルダをMacに用意する
リポジトリを落としてる場所の `ad-studio/remotion/` を使う。ターミナルでそこへ移動:
```
cd ~/（このフォルダのパス）/ad-studio/remotion
```

### ② 必要な部品をインストール（初回だけ・数分）
```
npm install
```
- 終われば準備OK
- ⚠️ もし `ERESOLVE` などバージョンのエラーが出たら、その赤い文字を私(Claude)に貼って。すぐ直す

### ③ 素材を置く
`public/` の中に、次のように置く:
- `public/bg/01.mp4, 02.mp4, ...` … 背景になる動画（**AIフック・実写をそのまま**。順番＝シーン順）
- `public/audio/01.wav, 02.wav, ...` … 各シーンのナレーション（**Fish Audioで作った音声**）
- `public/bgm/track.mp3` … BGM（1曲）
- `public/fonts/jp-gothic.ttf` … **テロップのフォント**（好きな日本語フォントの `.ttf` をこの名前で置く）
  - おすすめ＝丸くて太いやつ（例: Zen Maru Gothic を1回落として置く）。無くても動くが sans-serif で代替される
  - Google Fontsには取りに行かない＝オフラインでも・どのMacでも同じ仕上がりになる

### ④ 台本ファイルを作る
`props.example.json` をコピーして `props.json` を作り、シーンぶんだけ中身を書く（telop＝画面の文字）。
- `video` … そのシーンの背景ファイル名
- `audio` … そのシーンの音声ファイル名
- `telop` … 画面に出す文字（10字前後）
- `telopStyle` … 普通は `"normal"`、補足っぽくしたい時だけ `"paren"`

### ⑤ まずプレビューで見る（任意）
```
npm run studio
```
→ ブラウザが開いて、動きを確認できる。閉じるのは `Ctrl+C`

### ⑥ mp4に書き出す
```
npm run render
```
→ 完成品が `out/video.mp4` にできる。それを再生して確認。

---

## おまけ: 既存動画を"組み直す"モード（ShortReuse）

もう出来上がってる動画（ffmpeg版）はあるけど字幕や組み立てだけ直したい時用。
- 音声は**元動画の音声を丸ごと1本**で流す（`voiceover`）＝BGMも息継ぎも途切れない
- 背景は元動画をシーンごとに切ったクリップ（`public/bg/01.mp4〜`）
- テロップだけ新しく（`props.reuse.json` の各シーンの `telop`）
- 各シーンの尺は `props.reuse.json` に**フレーム数**で直接書く（音声を読まない）

書き出し:
```
npx remotion render ShortReuse out/reuse.mp4
```
※ 元動画の下に焼き込まれた字幕は、切り出す時に下側をクロップして消しておくこと。

---

## 仕組み（読まなくていいメモ）
- 各シーンの長さ ＝ **その音声の長さ + 余白10フレーム** で自動計算（`src/Root.tsx`）
- 背景=cover表示でゆっくり拡大、上下に暗転グラデ、テロップは極太・黒フチでフェードイン（`src/Scene.tsx`）
- BGMは全体にループ＋最初と最後フェード、上部にアカウント名を薄く表示（`src/ShortVideo.tsx`）
- Fish Audio音声は `public/audio/` の wav を各シーンで再生するだけ（TTSの種類は問わない）

エラーが出たら赤い文字を貼れば直します。

---

## 音声の作り直し〜受け渡しの正規ルート（毎回これ）
1. **生成はVPS**（キーとボイスIDは `/root/ad-studio/.env` と `test-voice.js` にある）。
   1行コマンドで Fish Audio TTS → `/root/ad-studio/narration.mp3`
   ※bashの `!` は禁物（event not found になる）。node -e のワンライナーは `!` 無しで書く
2. **VPS→Googleドライブ**：`node --input-type=module -e "import('./src/drive.js').then(async d=>{const r=await d.uploadOutput('/root/ad-studio/narration.mp3','narration.mp3');console.log('OK',r.url)})"`
3. **クラウドClaude側**：Google Drive連携(download_file_content)で取得→base64デコード→`public/audio/`へ
4. 無音検出(silencedetect)で文の切れ目→captions/scenes/offerFromを新タイミングに組み直し→レンダリング
※外部アップローダ(tmpfiles等)はプロキシで403になるため使わない。scpはMac側で打つ(VPS内で打たない)
