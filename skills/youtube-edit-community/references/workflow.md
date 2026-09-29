# 制作仕様と検品

## 環境と入口

macOS Apple Silicon専用。FFmpeg/FFprobe 8.x、Appleの `/usr/bin/python3` 3.9以上、mlx-whisper・numpy・scipy・Pillow、Node.js 20以上、npmを使用する。フォントは `fonts/` の2書体だけを読む。個人のフォント一覧や別スキルのスクリプトを参照しない。

パッケージのディレクトリで、最初に実行する。

```bash
./scripts/check_env.sh
```

不足する項目だけ導入する。PythonはCLIと同じ実行ファイルを使う。

```bash
brew install ffmpeg node
/usr/bin/python3 -m pip install --user mlx-whisper numpy scipy Pillow
cd remotion
npm ci
npm run setup
cd ..
./scripts/check_env.sh
```

`npm run setup` は初回に描画用Chromiumを取得する。実行時の自動取得はしない。Whisperモデル `mlx-community/whisper-large-v3-turbo` は最初の `transcribe` で取得する。取得済みなら `HF_HUB_OFFLINE=1` で実行できる。環境のPythonを変える場合は、そのPythonへ依存を導入する必要があるため、標準手順は `/usr/bin/python3` に統一する。

以下の `PROJECT` は利用者の作業フォルダ。素材のパスは利用者の実ファイルへ置き換える。すべてのコマンドには `--out` を指定する。

```bash
PROJECT="$HOME/Documents/Videos/youtube-project"
./scripts/ytedit.py probe --out "$PROJECT" --plan B \
  --camera "/absolute/input/camera.mp4" \
  --screen "/absolute/input/screen.mov" \
  --mic "/absolute/input/mic.m4a"
./scripts/ytedit.py transcribe --out "$PROJECT"
./scripts/ytedit.py sync --out "$PROJECT"
```

人物のみ、人物＋画面、人物＋別録り音声、画面＋ナレーションにも対応する。存在する素材だけ指定する。`settings.json` の `audio.master` は既定で `auto`。probeが有音の1〜2chストリームを測定し、`master_choice` に主音声と理由を残す。差が小さい場合は自動選択を止め、利用者の回答を `probe --master mic|camera|screen` に渡す。使わない候補は `--exclude-master` で除外する。映像がない素材だけの場合は、映像を支える資料を利用者と決める。

音声の測定は48kHz・3箇所の最大20秒窓で行い、有音が見つからなければ全音声を測る。有音率は50ms RMSが−40dBFSを超える割合、ノイズ床はRMSの下位10%、高域比は全周波数パワー中の8kHz以上の比率。これは声の有無の近似であり、発話内容の認識ではない。`transcript.gaps.json` は3秒以上の空白と再取得結果、`transcript.validation.json` は0秒単語結合とセグメント本文の一致を記録する。語彙補正前の単語と時刻は `transcript.words.original.json` に保存し、補正後も元の時刻を使う。置換が元の単語数より短く結合が必要な場合も、元の各時刻を `source_words` に保持する。

別録りは原則優先する。他候補のノイズ床が6dB以上低く、高域比が1.5倍以上あり、音量低下が3dB以内・有音率が別録りの80%以上なら、その候補を優先する。別録り以外の候補同士はRMSとノイズ床の差・高域比で順位を付ける。どちらの場合も、選択候補と他候補のノイズ床差が3dB未満かつ高域比の相対差が20%未満なら自動選択を止める。

## 音声の基準と同期

`probe.json` で各素材の解像度・向き・fps・実尺・音声を検査する。縦素材は余白付き、fps不一致は出力fpsへ変換する。出力fpsの `source` は人物素材、なければ画面素材のfps。

文字起こし・保持区間は主音声の時刻。`sync.json` の符号は **素材の時刻 = 主音声の時刻 + offset**。camera_minus_master_s / screen_minus_master_s が切り出しに使われる。

同期は16kHzモノラル音声を4kHzへ間引き、200〜1700Hz帯域の正規化相互相関を計算する。20秒窓を長さに合わせて5点、短い素材では3点に配置する。極性反転を許容し、相関の絶対値が0.3未満なら「要手動確認」。良好な測定点のoffset差が0.05秒を超えた場合も警告する。音声なし素材ではoffsetを空欄にし、手動設定までカットを停止する。

別録り音声が同時録音なら、冒頭・中盤・終盤で口元と操作を照合する。別テイクのナレーションを人物の口元へ無理に合わせない。主音声は1つだけ使い、同じ発話を二重に重ねない。

## カットと字幕

全文を読んで、無音・操作待ち・言い直し・重複の役割を判断する。語尾の減衰、自然な息継ぎ、結果を読む時間は残す。保持区間は主音声時刻の昇順、重複なし。

```json
[
  {"s": 12.25, "e": 38.34, "note": "導入"},
  {"s": 51.32, "e": 65.77, "note": "操作の結果を見せる"}
]
```

```bash
./scripts/ytedit.py cut --out "$PROJECT" --keep "$PROJECT/full-keep.json"
./scripts/ytedit.py captions --out "$PROJECT"
```

`cut` は前後80msを保護し、隣の保持区間と重ならないようにする。出力fpsの整数フレームへ丸めるため、完成尺は要求区間の単純合計と少し異なる。`timeline.json` のsource_s/source_eとoutput_s/output_eを正とする。語頭・語尾を完全に救えるという判定ではないため、境界は原音を確認して修正する。`preview` の外側境界は指定範囲を維持し、フレーム丸めだけを適用する。

`captions.json` は完成時刻の配列。初稿を生成した後、全文を原音と照合して校正する。

```json
[
  {"start": 0.32, "end": 2.1, "text": "画面収録を確認します", "source_start": 12.49, "source_end": 14.27, "segment": 0}
]
```

[caption-rules.md](caption-rules.md)と[caption-sample.json](caption-sample.json)を読み、初稿の全文を1枚ずつ書き直す。1行のみ、句読点なし（間は半角スペース）、平均13字前後・最大23字。文末、接続助詞、格助詞の順で切る。語の途中や言いかけを避け、フィラーと重複を除き、言い換え・要約はしない。校閲済み字幕はworkの外にも保存し、`--captions` で渡す。

`captions --captions <校閲JSON>` または `preview/full --captions` は、校閲本文を保持区間ごとの単語列へDP整列し、最初と最後の語にスナップする。JSONは配列またはitems配列。各要素にtextと、完成時刻startまたはtimelineのsegment番号が必要。0.3〜4秒の隙間は前の字幕を延ばし、0.3秒未満の短い隙間も連続表示にする。最短0.6秒を確保する。無理に次の発話やカットを越えて延ばさず、確保できないものは検品FAILとして分割の修正を求める。speech_source_start/endは発話アンカー、source_start/endは延長後の表示範囲。整列結果はcaptions.alignment.jsonへ保存する。

`caption_check.py` は1行・23字・句読点・フィラー・語彙未補正・確実な行頭/行末断片・保持区間・最短時間を検査する。12字/秒超はFAIL、9字/秒超はWARN。正当な単語や接続にもなる「よ/ね/ら行」始まり・「て/で/と」終わりはWARNとして必ず全文校閲で判断する。孤立した助詞や活用断片はFAIL。`qc.json` のcaption節に結果を出し、FAILが1件でもあれば全体FAIL。render前にも同じ検査を行う。

通常字幕は1920×1080でNoto Sans JP ExtraBold 56px、白、下54px、縁取りなし、柔らかい黒影。背景には薄い暗幕を敷く。

## シーン表とレイアウト

`scenes.json` は完成時刻の0から `timeline.duration_s` までを、隙間・重複なく覆う。`view` は presenter / screen / image、`face` は真偽値、`heading` は文言。以下は構造例で、時刻は実際のtimelineへ合わせる。

```json
[
  {"start": 0, "end": 8, "view": "presenter", "face": false, "heading": "素材を読み込む"},
  {"start": 8, "end": 24, "view": "screen", "face": true, "heading": "素材を読み込む"},
  {"start": 24, "end": 30, "view": "screen", "face": false, "heading": "結果を確認する"},
  {"start": 30, "end": 40.006633, "view": "presenter", "face": false, "heading": "次の操作へ進む"}
]
```

Aの `screen_mode:none` は丸ワイプを使わない指定で、画面挿入自体を禁止しない。Bのautoは発話からfaceを判断する指定。Cのpipは画面表示中のfaceを有効にする。人物が大きく映るpresenterでは、どのプランもfaceを無効にする。

| 要素 | 1920×1080の初期値 |
|---|---|
| 見出し | 左94px・上60px、白い帯、skewX(-9deg)、逆変形した黒い斜体文字44px、内余白14×30px |
| 見出し入場 | 左800px・上40px外側から0.46秒のease-out quart、透明度・2pxぼかしを戻す |
| 画面収録 | 左右44px・上70px・下195pxを基準とする領域へ縦横比を保って表示。角丸なし |
| 標準の丸ワイプ | 直径280px、左右48px、下215px |
| 小さめの丸ワイプ | 直径220px、左右48px、下215px |
| 丸ワイプ入退場 | 0.25秒のアルファフェード。字幕や操作対象に重ねない |

丸ワイプは人物動画の正方形クロップと静的円マスクを合成する。`face.crop_center` は横・縦の比率、`crop_scale` を大きくすると寄る。位置は `pip.position` のright/left、大きさは `pip.size` のnormal/small。

`heading.position:left|right`、`heading.bg_color:#ffffff`、`heading.text_color:#132129`、`heading.style:slant_band` を設定できる（v4のstyleはこの1種）。`heading.hide_during_screen:true` が既定。人物素材がない場合はこの休止設定を無視して帯を表示し、画面の上端を170px以上かつ帯下端より下へ下げる。画面に同じ話題の見出しがある場合は帯を休止する。falseにした場合は画面上にも表示する。顔・字幕・見出しを同時に最大強調しない。発話と一致する画面だけを使い、一定秒数ごとに無関係な素材を挿入しない。

## 画像Bロール

画像Bロールの選び方は、縦長のスクショ・SNS投稿・縦のグラフ＝`split`（静止）、縦の写真＝`full`（枠固定・中身だけズーム）、横長のWeb画面・製品ページ＝`contain`（画像全体をズーム）。人物は目線の反対側に置き、素材を目線の先に置く。カメラ1フレームで向きを確認する。画面右を向く人物は左に配置する。見せ方を大きく変える場合は30秒前後の試作で確認してから全編へ進む。

シーンの時刻は完成タイムライン。PNG/JPG/HEICの絶対パス、layoutを指定する。HEICの回転情報はFFmpegで反映する。imageでは `face` を省略するかfalseにする。

```json
{"start": 8, "end": 16, "view": "image", "image": "/absolute/input/photo.heic", "layout": "full", "heading": "製品の使い心地"}
```

settings.jsonの任意の `image` 節：

```json
"image": {
  "glass_source_x": [0.6, 1.0],
  "presenter_side": "left",
  "presenter_center_x": 0.5
}
```

`presenter_center_x` を省略すると `face.crop_center[0]` を使う。左右の位置・切り出し範囲はいずれも幅に対する0〜1の割合。ガラス用の範囲は回転を反映したカメラ原画、人物の中心はcut後の横長映像に対する比率。旧設定のimage節がなくても既定値で動く。imageシーンがない場合は従来の合成経路を使う。

cut後、全尺を覆うscenesを用意して確認画像を作る。

```bash
./scripts/ytedit.py glass-preview --out "$PROJECT" --scenes "$PROJECT/scenes-reviewed.json"
```

`work/images/source-crop-check.png` は切り出し範囲を赤枠表示する。`source-crop.png`、`glass-full.png`、`glass-panel.png` を必ず画像として確認し、人物・肩・腕の形が見えるときはglass_source_xを変えて再実行する。元の静止画は最初のimageシーン開始時刻からtimelineとsyncを逆算して1枚だけ抽出する。カメラがなければ#E8E4DF＋単色粒子3%にする。

値は3840×2160基準。出力解像度に比例換算する。

| 要素 | 4K基準 |
|---|---|
| ガラス | 1.2倍オーバースキャン→σ100のぼかし→彩度1.4→白70%→単色粒子3% |
| split | 人物2/5、残り3/5にガラス。カードはy330から高さ1540、左右余白各120。四角いUI（比率0.6〜1.7）は角丸56、それ以外88。縦スクショは最大2.6倍を目安に枠内へ収める |
| full | 高さ1960・上100・角丸88の写真枠。幅を超える画像は縦横比を保って縮小。内側に白40%・2pxの縁。枠固定で中身だけ1.00→1.04 |
| カード影 | 0 24px 72px 黒20%＋0 2px 8px 黒12% |
| contain | 全面にcontain。四隅の小領域がほぼ単色なら中央値を背景に使い、それ以外は#E8E4DF。画像全体が1.00→1.04 |
| フェード | imageとpresenter/screenの境目だけ、image区間の内側でsplit 0.3秒／full・contain 0.36秒。短い区間は半分まで。image→imageはカット |
| 字幕下 | split・full＝高さ480、透明→黒35%のグラデ。contain（白いWeb画面が多い）＝高さ460、下端で黒65%の濃いグラデ。imageと一緒にフェードする |

renderは画像を正しい向きで読み、静止パネルPNGとfull/containの可逆圧縮動画をwork/imagesへ作る。ズームは浮動小数点の逆アフィン変換＋bicubic補間で、整数cropの段付きを避ける。zoompanは使わない。字幕・見出しは引き続きRemotionの疎PNG。finalizeで人物／画面・画像・字幕を重ねて既存の主音声1本とmuxする。画像や設定を変更したらrenderからやり直す。

検品では、比較用フレームを保存し、人物の目線、ガラスに形が残らないこと、影・角丸・字幕の中央位置・帯の重なり、連続フレームの滑らかな等速ズーム、HEICの縦横を目視する。見出しのhide_during_screenはimageには適用しない。SEを追加しない。

## 描画・試作・本編

校正済み字幕とシーン表を作業フォルダへ置いてから実行する。

```bash
./scripts/ytedit.py render --out "$PROJECT" --scenes "$PROJECT/scenes-reviewed.json"
./scripts/ytedit.py finalize --out "$PROJECT"
./scripts/ytedit.py qc --out "$PROJECT"
```

RemotionはinputPropsから透明PNGの疎列だけをrenderStillで生成する。帯の入場はfpsに応じて約14コマ。`overlays.json` に各PNGのt_start/t_end/fileを保存する。全フレームの動画をRemotionでレンダリングしない。

音声はrender工程でステレオ化・コンプレッサー処理後のラウドネスを測定する。finalizeは測定値付きloudnorm、AAC符号化のピーク余裕0.2dB、48kHzステレオ・AAC 320kbps指定で処理し、映像と一度だけmuxする。AACの実測平均ビットレートは内容により指定値と異なる。設定を変更した場合はrenderからやり直す。中間映像はlibx264 CRF16で一度だけ符号化し、結合はストリームコピーする。最終映像はH.264/yuv420p、faststart。`output.video_bitrate` で指定し、既定は8M。

```bash
./scripts/ytedit.py preview --out "$PROJECT" --range 60 100 \
  --scenes "$PROJECT/preview-scenes.json" \
  --captions "$PROJECT/preview-captions-reviewed.json"
./scripts/ytedit.py full --out "$PROJECT" --settings "$PROJECT/settings.json" \
  --keep "$PROJECT/full-keep.json" --scenes "$PROJECT/full-scenes.json" \
  --captions "$PROJECT/full-captions-reviewed.json"
```

試作は30〜45秒。採用後に同じ設定で本編へ進む。`preview`と`full`は、素材検査・文字起こし・同期・カット・字幕・疎PNG・合成・QCの同じ関数を使う。素材を再指定しない継続作業では既存のprobeを利用する。新しい出力フォルダには最初に素材を指定してprobeする。

試作と本編を残す場合は出力フォルダを分ける。同じ出力フォルダで再実行すると中間ファイルとfinal.mp4を更新する。字幕やシーン表の校正済み正本はworkの外へ保存する。元素材は上書きしない。

## 検品と納品

`qc` は完成MP4を全編デコードし、実尺がtimeline合計±0.1秒、音声/映像の尺差が0.01秒未満、fps・解像度・コーデック・ステレオ48kHz、実測LUFSが目標±0.5、true peakが設定上限以内（測定丸め0.05dB）、字幕の字数・実幅・保持区間内、黒フレームを検査する。冒頭・中盤・末尾・シーン切替とカット境界の前後0.2秒をqc/へ抽出する。FAILがあればCLIは非ゼロ終了する。

技術検査に加え、以下を原音と完成映像で確認する。

- 字幕の誤字・脱落・数字・固有名詞・意味の切れ目。
- 冒頭・中盤・終盤とカット境界の音声、口元、操作、字幕の一致。
- 顔・画面・帯・字幕の重なり、二重の顔や残留、語頭・語尾の欠落。
- 原音と処理後の音量差、二重音声、クリップ。ラウドネス測定と聴感確認を分ける。

確認していない音を「聞いた」と記録しない。`listening`・`full_realtime_viewing`・`independent_lipsync`・`caption_wording_review` は自動QCでは `not_run`。人による検品は別の記録へ実施範囲と結果を残す。

納品物は `<out>/work/final.mp4`・`final.srt`、`<out>/settings.json`、work内のprobe/transcript/sync/keep_segments/timeline/captions/scenes/overlays各JSON、qc.jsonとqc/。実施済み検査と未検証項目を区別し、外部投稿やメッセージ送信を自動実行しない。
