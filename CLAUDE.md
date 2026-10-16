# CLAUDE.md — プロジェクト共通コンテキスト

## オーナー情報

**MAYU（juraku.3hearty@gmail.com）**

- 整骨院スタッフ（経営者の妻）兼独学エンジニア
- 自院でシステム試験運用 → SaaS販売を目指している
- GAS・LINE・スプレッドシートで実現できるかを必ず先に検討する。それで無理な時だけアプリ化する

## 行動指針（MAYU の好み）

- 細かい命名・デフォルト値などで質問しない。こちらで決めて「これで進めます、違えば教えてください」スタイル
- A（最小）vs B（フル）の選択肢が出たら常にフルを選ぶ
- 確認画面を出してから「できました」と言わない。確認した結果だけ報告する
- 決まった方針を勝手に変えない・余計な脱線提案しない
- 動いたコードは指示なしで資産庫（`~/.claude/assets/`）に自動登録する

---

## 100チャレ — AI自動化を100人に無料提供するプロジェクト

MAYUが主催する取り組み。一人ひとりの業務課題をAIで自動化し、note等で発信する。

### 完了案件

#### No.1 献立AIシステム
- **依頼者:** 家族向け（献立担当者のいる家庭）
- **内容:** LINE Bot → GAS → Gemini APIで1ヶ月の夕飯メニューを自動生成、Googleカレンダーに買い物リストを登録
- **技術:** LINE Messaging API, GAS 11ファイル（00_Config〜10_Setup）, Gemini 2.0-flash-lite（無料枠）
- **状態:** コード実装済み。ユーザーのGAS/LINE初期セットアップ待ち
- **コード場所:** `C:\Users\jurak\Desktop\Claudecord\meal-planner\`
- **セットアップ手順:**
  1. LINE Bot 新規作成（Developers Console）
  2. Google AI Studio で GEMINI_API_KEY 取得
  3. GASプロジェクト新規作成 → 11ファイル貼り付け
  4. スクリプトプロパティ設定（LINE_CHANNEL_ACCESS_TOKEN, LINE_CHANNEL_SECRET, GEMINI_API_KEY, SPREADSHEET_ID）
  5. initialize() → generateFirstMonth() 手動実行
  6. GAS Web App デプロイ → WebhookURLをLINEに設定

#### No.2 タイムカードOCR + VBA転記（弁護士未払給料案件）
- **依頼者:** 弁護士（未払給料の裁判案件）
- **内容:** タイムカード画像をGemini OCRで読み取り、裁判所提出用Excel「給与第一Ver0.653」の時間計算書シートに自動転記
- **技術:**
  - OCR: GAS + Gemini 3.5 Flash Vision API（`gemini-3.5-flash`）
  - 転記: VBAマクロ（給与第一.xlsmのModule1）
  - スプレッドシート（確認シートID）: `1aoLD-3WAQ8MoO1DMX_y49CObAKka_pxRcPQ_cOmV2l8`
- **状態:** 完成・テスト済み。弁護士に連携済み
- **GAS確認シート列構成:** A=氏名, B=年, C=月, D=日, E=午前IN, F=午前OUT, G=午後IN, H=午後OUT, I=残業IN, J=残業OUT
- **ファイル名形式:** `2026-04_田中太郎.jpg`（正規表現で年月氏名を抽出）
- **VBA転記ロジック:**
  - 計算規則シートのD3=基準年(2023), F3=基準月(4)を読み込む
  - monthOffset = (選択年 - 基準年) × 12 + (選択月 - 基準月)
  - monthStartRow = 5 + monthOffset × 31
  - dstRow = monthStartRow + 日付 - 1
  - 既存値があるセルはスキップ（上書きしない）

#### No.3 ディオーネバレーボール YouTube自動アップロード
- **依頼者:** ディオーネバレーボールチーム
- **内容:** フォームから動画を受け取りYouTubeに自動アップロード
- **技術:** Flask (Python, VPS), YouTube API, OAuth2 token.pickle
- **フォームURL:** https://dione.famitect.com/
- **VPS構成:** vm-12d689c3-d8（163.44.114.69）、`/root/upload/app.py`
- **状態:** 本番稼働中（OAuthを本番公開済み、2026-05-17）
- **注意:** token.pickleが切れたらWindows側でauth.py実行 → SCP転送が必要

#### No.4 SNS投稿Bot（樹鍼灸整骨院）
- **依頼者:** 自院（樹鍼灸整骨院）
- **課題:** Make製のInstagram/Google自動投稿は動いていたが、画像を
  画像アップローダーサイトへ手動アップロードしてURLをシートに貼る工程が面倒
- **内容:** LINEに画像と投稿文を送るだけでSNS投稿カレンダーに1行追加。
  投稿の実行は従来通りMake側の「投稿日 == 今日」判定に任せる
- **技術:** LINE Messaging API, GAS 8ファイル（00_Config〜07_Setup）,
  Cloudinary（署名付きアップロード）
- **構成:** パターンA（MAYUの個別トークをフック）
- **シートID:** `144VrJLm2dMBDwtB9uOHnYQBrnlaCuOB8mtZctQ_E3Dw`
- **シート列構成:** A=投稿日, B=テキスト, C=画像URL, D=投稿済み
- **コード場所:** `my-repository/sns-poster/`（ブランチ claude/blissful-allen-2qmefq）
- **状態:** 🟢 本番稼働中（2026-10-11 Instagram・Google両方への初投稿成功）
- **LINEチャネル:** 「樹鍼灸整骨院 SNS投稿Bot」。顧客向けLINEとは別の新規公式アカウント
- **GAS WebApp URL:** `https://script.google.com/macros/s/AKfycbxnzuxcAaD5cDayK4ijzJDUvJk7TN-gCsiVS7tAZcSLfKl5L29gXoVcY1WNUrnhAQ97/exec`
- **Cloudinary:** cloud name `dcbfytmzv` / 署名付きアップロード / フォルダ `sns-poster/`
- **投稿者:** 院長がLINEで送る。MAYUは管理用に許可リストへ同居（`一覧` コマンドで確認可）
- **Makeシナリオ構成:**
  `Google Sheets(Search Rows)` → `Cloudinary(Upload a Resource)`
  → `Google Business Profile(Create a Post)` → `Instagram for Business(Create a carousel post)`
- **Instagramはカルーセル投稿:** Item 1 = シートの画像（Cloudinary経由）、
  Item 2 = **QRコードの固定スライド**（`v1779805420/GW_ghgxka.png`）。毎回2枚組で出る
- **フッターの扱い（2026-10-11 方針決定）:** シートのB列は「本文＋ハッシュタグ」だけにし、
  店舗情報フッターは**Makeの各モジュールに固定文として直接書く**。
  シートに列を足さない（毎回同じ内容を25回保存するより管理が楽で、変更も1箇所で済む）
  - Instagram の Caption欄: `B列` + 従来フッター（137字・@ハンドルとプロフィール誘導あり）
  - Google の本文欄: `B列` + Google用フッター（92字・**@ハンドルとプロフィール誘導を削除**。
    Googleにプロフィールリンクは存在しないため、従来は意味不明な文章が公開されていた）
  - Threads の本文欄: `B列` のみ（フッターなし）
  - Googleモジュールは Post type = `Call to action` / Action type = `Book`（予約ボタン）設定済み
- **文字数の実測値:** 本文+ハッシュタグ 215字 / 従来フッター 137字 / Google用フッター 92字
  - B列を500字以内で書けば Instagram・Google・Threads の3つ全部に出せる
  - 上限: Instagram 2200字、Google 1500字、**Threads 500字**（ここが実質の制約）
  - 長文回（1,500〜2,000字）対策は Threadsモジュールの前に
    `length(B列) <= 500` のフィルターを置いてスキップさせるだけでよい。
    **substringでの切り捨てやGemini要約は不要**（当初そう見積もったが、
    フッターを分離すれば本文は200〜350字に収まるため過大見積もりだった）
- **Threads対応の調査結果（2026-10-14・結論が出た）:**
  - **Makeに公式のThreadsモジュールは無い**（検索で出るのは無関係の「Zee」のみ）
  - **Instagramの「Threadsへ自動シェア」トグルは使えない。** 理由が2つあり、どちらも決定的:
    1. この機能は**アプリからのリアルタイム投稿専用**で、予約投稿・API投稿では発火しない
    2. 運ばれるのは**単一画像の投稿だけ**。リールとカルーセルは対象外。
       樹整骨院は2枚組カルーセルなので、アプリから投稿しても出ない
  - Meta公式APIにあるのは **Threads → Instagramストーリーズ**（`crossreshare_to_ig`）
    の方向だけ。逆方向のAPIは存在しない。IG Graph APIとThreads APIは別製品で
    トークンもスコープも別
  - **→ Threadsに出すならHTTPモジュールでThreads APIを直接叩く以外に道はない**
    - ① `POST https://graph.threads.net/v1.0/{threads-user-id}/threads`
      （`media_type=IMAGE`, `image_url`, `text`, `access_token`）→ `creation_id` が返る
    - ② Sleep 30秒（Meta推奨・画像取り込み待ち）
    - ③ `POST .../threads_publish`（`creation_id`, `access_token`）
    - 前提作業: Meta開発者アカウント → アプリ作成 → Threads APIユースケース追加 →
      テスター承認 → 長期アクセストークン取得 → Threads User ID取得。**1〜2時間は見る**
    - Threadsモジュールの手前に `length(B列) <= 500` のフィルターを置いて長文回をスキップ
- **Makeのスケジュール:** `Daily at 11:30` / Time zone `Asia/Tokyo` / **Active**（2026-10-14 設定完了）
  - **ハマりどころ:** スケジュールを設定しても**シナリオ本体のトグルがOFFだと自動実行されない**。
    Run once（手動）はOFFでも動くため気づきにくい。History の実行が全部 `Manual` で
    `Scheduled` が1件も無い場合は、まずトグルを疑う
  - 動作確認は History に `Scheduled` 表記の実行が出るかで判断する。
    該当行が無い日は `1 operation` で空振りするが、それは正常
- **Threads実装（2026-10-14 構築完了・初回自動実行は10/15 11:30で検証予定）:**
  - Metaアプリ名 `樹整骨院 SNS投稿` / ビジネス `樹鍼灸整骨院` / **開発モードのまま**（公開・審査不要）
  - Threads User ID: `29583181311273824` / Threadsユーザー名 `itukisinkyu_staff`
  - Makeのモジュール構成（Instagramの後ろに3つ追加）:
    | # | 種別 | 設定 |
    |---|---|---|
    | 11 | HTTP Make a request | `POST https://graph.threads.net/v1.0/29583181311273824/threads`<br>Body: form-urlencoded / `media_type=IMAGE`, `image_url`=C列, `text`=B列, `access_token`<br>Parse response: **Yes**（これをYesにしないと13で戻り値が使えない） |
    | 12 | Tools Sleep | 30秒。Metaが画像を取りに行く待ち時間。無いと「準備できていない」で失敗する |
    | 13 | HTTP Make a request | `POST .../29583181311273824/threads_publish`<br>Body: `creation_id={{11.data.id}}`, `access_token` |
  - Threads APIは「①下書きコンテナ作成 → ②公開」の2段階。Instagramと同じ構造
  - **セットアップで詰まった点（次回必ず再発する）:**
    1. **Messaging APIと同じくアプリ作成ウィザードは「Threads APIにアクセス」ユースケースを選ぶ**
    2. トークンは**グラフAPIエクスプローラ**（developers.facebook.com/tools/explorer）で取る。
       アプリ管理画面側に「ユーザートークンジェネレーター」は見当たらなかった
    3. ★**エクスプローラでドメインを `graph.facebook.com` → `graph.threads.net` に切り替える。**
       切り替えるとボタンが「Generate Threads Access Token」に変わる。
       切り替え忘れるとFacebookのトークンが出て使えない
    4. ★**Threadsアカウントをテスターに招待し、Threads側で承認が要る。**
       未承認だと `error_code: 1349245 "The user has not accepted the invite to test the app"`。
       パスワードや認証情報の問題ではない
       - 招待: アプリの役割 →「メンバーを追加」→ **役割の種類で「Threadsテスター」を選ぶ**。
         Facebookの「テスター」欄にThreadsユーザー名を入れると `Invalid id` になる
       - 承認: **Threadsアプリ → 設定 → 「その他の設定」→ ウェブサイトのアクセス許可 → 招待**。
         「アカウント」という項目は存在しない。**通知バッジが一切出ないので気づけない**
    5. 認可ダイアログは「続行／キャンセル」のみで、Optional権限も含めて一括許可される。
       個別選択は不要
  6. ★**グラフAPIエクスプローラが出すのは短期トークン（数時間で失効）。**
     そのままMakeに入れると翌日には
     `OAuthException code:190 "Session has expired on ..."` で落ちる（2026-10-16に実際に発生）。
     **長期トークン（60日）への交換が必須**:
     ```
     https://graph.threads.net/access_token?grant_type=th_exchange_token
       &client_secret=【App Secret】&access_token=【短期トークン】
     ```
     ブラウザのアドレスバーに貼るだけでよい。`expires_in: 5184000`（60日）が返れば成功。
     App Secret は アプリの設定 → ベーシック → app secret（パスワード再入力あり）
  - **⚠️ 未対応の運用課題: 長期トークンも60日で失効する。**
    `th_refresh_token` で更新できるが未実装。放置するとThreads投稿だけ静かに止まる。
    **失効予定: 2026年12月15日ごろ**（2026-10-16に発行）
    - 更新案（本命）: Make の Data Store にトークンを置き、モジュール11・13はそこから読む。
      月1回 `refresh_access_token` を叩いて Data Store を上書きする別シナリオを作る
    - 更新案（簡易）: 50日ごとにカレンダーリマインダー → 手動で再発行してMakeに貼り直す
    - 使用（投稿）では延長されない。**明示的にリフレッシュしないと切れる**。
      ディオーネ（Google OAuth）は本番公開で期限が消えたが、**Metaは公開しても60日のまま**。
      同じ感覚でいると止まる
- **実運用で出た不具合と対応（2026-10-15〜16）:**
  1. **登録後に取り消せなかった。** 院長が画像サイズを間違えて「変更したい」と送ったが、
     それは新しい下書きとして扱われ、元の行がそのまま投稿されクレームになった。
     → **`やり直し` コマンドを追加**。直前の登録をシートから削除し、文章と日付は
     下書きに戻す（画像を送り直すだけで再登録できる）。対象行は行番号ではなく
     **画像URLで特定**する（行挿入で番号がずれて別の投稿を消す事故を防ぐため）。
     投稿済みの可能性がある場合は警告を出す
  2. **Googleで画像の上下が切れた。** Googleビジネスプロフィールは横長寄りに切り取る。
     縦長（4:5＝Instagram向き）画像だと上下が落ちる。**横長画像では切れていなかった**ことを
     実機で確認。原因はBotの変換ではなく**画像の縦横比**（`c_limit` は比率を変えない）
     → **E列に Google用URL を出し分け**（`ar_4:3,c_pad,b_white,f_jpg,q_auto:good,w_1200`）。
     切らずに白余白を足す。MakeのGoogleモジュールは C列ではなく **E列** を参照する
     （変更前は Cloudinaryモジュールの `Secure URL` を参照していた）
     → **根本対策はCanvaで横長か正方形で作ること。** そうすれば白余白も出ない
- **残課題:**
  1. GASコードから `setupProperties()` 内の平文トークンを削除（note記事掲載時の漏洩防止）← **未了**
  2. Threadsの投稿確認（10/17 11:30。長期トークンに差し替え済み）
  4. **Threadsトークンの60日更新の仕組み**（未着手・放置すると止まる）
  5. Threadsモジュールの手前に `length(B列) <= 500` のフィルターを追加（長文回のスキップ）
  6. 過去行（5/23〜8/12）のアーカイブシートへの退避。季節ネタは毎年使い回せるので消さない
  7. B列にハッシュタグが含まれるためGoogle側にも出る。実害は小さいので当面放置
  8. Googleモジュールの Title欄に本文が丸ごと入っている（Make側の必須項目を埋めるため
     同じ変数を流用したと思われる）。CTA投稿ではタイトルが表示されない可能性が高く、
     実害は確認できていないため保留
- **注意点:**
  - 既存GASプロジェクト（gas_main.js）に別のdoPostがあるため、別GASプロジェクト・
    別LINEチャネルとして分離している
  - Make内にもCloudinaryモジュールがあるため二重アップロードになるが**無害**。
    Botが出すURLは既にJPEG変換・比率補正済みのため、むしろ安全側に働く。触らないこと
  - **Item 2 のQRコード画像はPNGのまま触らないこと。** Instagramモジュールの注意書きは
    「JPEG only」だが実際には通っている。JPEGは非可逆圧縮のため、変換すると
    QRコードの輪郭がにじんで読み取れなくなる恐れがある

---

## よく使う構成パターン

### パターンA：MAYUのLINEをフックにする単独運用

MAYUが個別トークでBotに送ったものだけが処理される最小構成。
ペットサロン案件（LINE → WordPress自動投稿）がこの形。

- Botは1対1の個別トークで受ける。**グループは使わない**
  （グループだと雑談が入力として誤認される）
- 許可ユーザーは `ALLOWED_USER_IDS` にMAYUのLINE IDのみ登録
- 後からスタッフを増やす場合は、IDをカンマ区切りで足すだけ。コード変更不要
- Apps ScriptのdoPostはリクエストヘッダーを読めず `X-Line-Signature` を
  検証できないため、この許可リストが唯一の保護になる

採用案件: ペットサロン（→WordPress）、No.4 SNS投稿Bot（→Instagram/Google）

### GAS + LINE のハマりどころ（毎回出る）

- **LINEの［検証］ボタンで「302 Found」エラーが出るが、無視してよい。**
  GASのウェブアプリはレスポンスを `script.googleusercontent.com` へリダイレクト
  する仕様で、LINEの検証はリダイレクトを追わないため必ず302になる。
  302が返る時点でスクリプトは実行済みであり、返信も届く。
  実際に動いているかは GASの「実行数」画面で `doPost` が完了しているかで判断する
- **Messaging APIチャネルはDevelopers Consoleから直接作れない。**
  先にLINE公式アカウントを作り、Official Account Manager側で有効化する
- **応答メッセージのオフは Official Account Manager の「応答設定」にある。**
  オンのままだとBotの返信と定型文が二重で返る
- **スクリプトプロパティの編集画面は、値が空の行があると保存できない。**
  使わないプロパティは行ごと削除する
- **900行級のコードは8ファイルに分けず1ファイルに連結して貼る方が事故が少ない。**
  GASは全ファイルが同一スコープなので動作は変わらない（`build_all_in_one.sh` 参照）

---

## インフラ構成（VPS）

- **VPS:** ConoHa、163.44.114.69、Ubuntu 22.04、2GB
- **稼働中サービス:**
  - Claude Code × Discord連携（tmux: discord）
  - ディオーネYouTube uploader（gunicorn port:5000）
  - SalonBoard自動同期（Xvfb + Puppeteer）
- **重要パス:**
  - 顧客リスト: `/root/scripts/customers.json`
  - 日次レポート: `/root/scripts/daily_report.sh`
  - YouTube uploader: `/root/upload/app.py`
  - OAuth token: `/root/youtube/token.pickle`

## Claudecord サービス（有料 Discord Bot）

- **料金:** 初期6ヶ月 月15,000円 → 継続 月6,600円
- **前提:** 顧客がClaude Max（$100/月）とVPS（2GB推奨）を自己契約
- **VPS管理:** MAYUがSSHで各VPSに入って横展開

---

## 後宮オーケストラ（マルチエージェント体制）

薬屋のひとりごと風エージェント13人。`~/.claude/agents/` に全員配置済み。

| エージェント | 役割 |
|---|---|
| 🌸 玉葉妃 (gyokuyou-planner) | 企画・GAS/LINE優先判定 |
| ♟️ 羅漢 (rakan-architect) | 設計・技術判断 |
| 🔨 高順 (gaoshun-builder) | 実装 |
| 🧪 猫猫 (maomao-critic) | コードレビュー |
| 🌙 壬氏 (jinshi-rescue) | 救援・根本原因分析 |
| 📝 水蓮 (suiren-writer) | note記事執筆 |
| 📖 紅娘 (hongniang-manual) | 説明書作成 |
| 🧮 羅半 (rahan-archivist) | 資産管理 |

**スラッシュコマンド:** `/koukyu`（フルパイプライン）, `/stuck`（行き止まり整理）, `/rahan`（資産検索）, `/maomao`（レビュー）
