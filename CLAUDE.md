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
- **文字数の実測値:** 本文+ハッシュタグ 215字 / 従来フッター 137字 / Google用フッター 92字
  - B列を500字以内で書けば Instagram・Google・Threads の3つ全部に出せる
  - 上限: Instagram 2200字、Google 1500字、**Threads 500字**（ここが実質の制約）
  - 長文回（1,500〜2,000字）対策は Threadsモジュールの前に
    `length(B列) <= 500` のフィルターを置いてスキップさせるだけでよい。
    **substringでの切り捨てやGemini要約は不要**（当初そう見積もったが、
    フッターを分離すれば本文は200〜350字に収まるため過大見積もりだった）
- **残課題:**
  1. GASコードから `setupProperties()` 内の平文トークンを削除（note記事掲載時の漏洩防止）
  2. Makeのスケジュールを毎日11:30に設定（タイムゾーンがAsia/Tokyoか要確認）
  3. 各モジュールへのフッター設定とThreads追加
  4. 過去行（5/23〜8/12）のアーカイブシートへの退避。季節ネタは毎年使い回せるので消さない
  5. B列にハッシュタグが含まれるためGoogle側にも出る。実害は小さいので当面放置
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
