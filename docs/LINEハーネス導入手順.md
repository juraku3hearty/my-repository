# LINEハーネス導入手順(Link Hokkaido無料相談導線用・2026-06-12)

方針(決定済み): LINE Harnessは**自分のLINE公式アカウント専用**(店舗向け予約はSuzume)。
役割: 友だち追加→自動あいさつ→ヒアリングフォーム→未返信一覧、流入経路の追跡。

## 進捗
- [x] 本体ダウンロード+依存関係インストール確認(2026-06-12・Claude環境で `npx create-line-harness` 動作確認済み)
- [x] A-1 Cloudflare完了(2026-06-13): Googleログインの既存アカウント利用。
  APIトークン作成済み(Edit Cloudflare Workersテンプレ+**D1:Edit追加**・Account=自分・Zone=All zones)。
  Account ID = 87351a541f4086271e277d145ac839cf
- [x] A-2 完了: 環境変数 CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID 設定済み+api.cloudflare.com許可済み
  (場所メモ: claude.ai/code → New session → 環境「Default」横の歯車アイコン → 変数とネットワークの両方ここ)
  ※環境変更は**新しいセッションから有効**(2026-06-13実測: 既存セッションでは見えない)
- [x] A-3 完了(2026-06-13 1:34): プロバイダー「Link Hokkaido」新規作成・Messaging APIチャネル
  (公式アカウント管理画面から作成=既存アカウントに確実に紐付け)・LINE Loginチャネル
  (ウェブアプリ・メール=famitect@gaea.ocn.ne.jp・プライバシーポリシー欄は空欄=任意)。
  **環境変数4つすべて設定済み**(LINE_CHANNEL_SECRET / LINE_CHANNEL_ACCESS_TOKEN /
  LINE_LOGIN_CHANNEL_ID / LINE_LOGIN_CHANNEL_SECRET)。
  ※トークン再発行の懸案もこれで解消(Git履歴に漏れた旧トークンは新発行により無効化)
- [x] B-0 デプロイ前調査完了(2026-06-12・Claude実施)。結果:
  - APIトークン権限はWorkers/D1/Pages/R2すべてOK(Pagesは作成→削除の実地テストで確認済み)
  - Worker本体・Admin UIともビルド成功を確認済み(コード側の問題なし)
  - **ブロッカー①: R2が未有効化**(API code 10042「Please enable R2 through the Cloudflare Dashboard」)。
    WorkerがR2バケット(画像保存用)必須のためデプロイ不可 → A-4へ
  - **ブロッカー②: api.line.me がネットワーク不許可**。Channel ID自動取得・LIFF自動作成・
    Webhook URL自動設定ができない → A-5へ
  - メモ: アカウントに4月作成の旧 `line-harness` Worker・旧D1 `line-crm`・`x-bot-harness` 一式が存在。
    今回のセットアップは Worker `line-harness` を上書き、D1は新規 `line-harness` を作成(旧 `line-crm` は温存)
- [x] A-4 完了(2026-06-13): **R2有効化済み**(カードがブロックされたがPayPal等で解決)。
  Claudeがバケット `line-harness-images` も作成済み(再開時は「既に存在」でOK)
- [x] A-5 設定済み(2026-06-13): api.line.me をネットワーク許可に追加済み。
  ※旧セッションのコンテナには反映されないことを実測再確認 → **新セッション必須**
- [x] B 完了(2026-06-13 00:10 UTC): Claudeがデプロイ。create-line-harness@0.1.24 を
  非対話実行(state事前生成方式)。全10ステップ完了・Cloudflare API で稼働確認済み。
  - Worker:   `line-harness` → https://line-harness.juraku-3hearty.workers.dev (workers.dev有効・デプロイ10件)
  - Webhook:  https://line-harness.juraku-3hearty.workers.dev/webhook
  - LIFF:     https://liff.line.me/2010383287-Nq9MxzT7 (liffId=2010383287-Nq9MxzT7)
  - Callback: https://line-harness.juraku-3hearty.workers.dev/auth/callback
  - 管理画面: https://line-harness-admin-17afdb62.pages.dev
  - D1: 新規 `line-harness`(uuid ef93e18f-f5f0-4a6a-a2ab-e2e660372895)・R2: `line-harness-images`
  - Messaging Channel ID = 2010383277 / LINE Login Channel ID = 2010383287
  - APIで自動設定済み: ①LIFFエンドポイントURL → {worker}?liffId=2010383287-Nq9MxzT7
    ②Messaging Webhookエンドポイント → {worker}/webhook(ただし「Webhookの利用」トグルは下記Cで手動ON)
  - ※API Key(管理画面/MCP用)は再表示不可。setup実行コンテナはエフェメラルのため未保存
    → 管理画面で再発行が必要になったら create-line-harness を再実行
- [ ] C: LINE側の仕上げ(まゆみさん手動・残りはトグルとCallback登録のみ):
  1. LINE Official Account Manager → 設定 → 応答設定:
     チャット=オフ / あいさつメッセージ=オフ / Webhook=**オン** / 応答メッセージ=オフ
  2. LINE Developers → Messaging API → 「Webhookの利用」を**オン**(URLは登録済み)
  3. LINE Developers → LINE Login チャネル → LINEログイン設定:
     「ウェブアプリでLINEログインを利用する」=オン →
     Callback URL に `https://line-harness.juraku-3hearty.workers.dev/auth/callback` を登録
  4. LINE Login → リンクされたLINE公式アカウント=Link Hokkaido / 友だち追加オプション=On(aggressive)
  5. 友だち追加テスト(あいさつ→フォーム動作確認)

### Claude向け再開メモ(B実行時)
- `npx -y create-line-harness` は対話式だが、`~/.line-harness/.line-harness-setup.json` に
  state を事前生成すればプロンプトをスキップできる(キー: completedSteps[], accountId, projectName,
  lineChannelId, lineChannelAccessToken, lineChannelSecret, lineLoginChannelId, liffId, apiKey)。
  completedSteps に "r2billing","credentials","liffId" を入れておく。値は環境変数から(チャットに書かない)
- lineChannelId(Messaging APIのチャネルID)は `GET https://api.line.me/oauth2/v2.1/verify?access_token=…`
  の client_id で取得できる
- LIFFアプリは LINE Login チャネルのトークン(POST /oauth2/v3/token, client_credentials)で
  `POST https://api.line.me/liff/v1/apps` により作成可能(view: full, scope: openid/profile/chat_message.write,
  botPrompt: aggressive)。デプロイ後にエンドポイントURLを `{workerUrl}?liffId={liffId}` へ更新
- 実行はTTYが必要なので `script -qec "npx -y create-line-harness" /dev/null` で。
  最後のMCP設定確認プロンプトだけ Enter 入力が要る
- Webhook URLは `PUT https://api.line.me/v2/bot/channel/webhook/endpoint` で自動設定可能
  (「Webhookの利用」ONと応答設定・Callback URL登録は手動のまま)

## A. まゆみさんの準備(20分くらい・全部無料)

### A-1. Cloudflareアカウント(5分)
1. https://dash.cloudflare.com/sign-up でアカウント作成(無料プランでOK)
2. ログイン後、右上アイコン → My Profile → **API Tokens** → Create Token
   → テンプレート **「Edit Cloudflare Workers」** を選んで作成 → **トークンをコピー**(一度しか見られない)
3. ダッシュボード右下あたりの **Account ID** もコピー
4. ⚠️ このトークンは**チャットに直接貼らず**、Claude環境の環境変数に保存:
   claude.ai/code → Environments → my-repositoryの環境 → Environment variables に
   `CLOUDFLARE_API_TOKEN` と `CLOUDFLARE_ACCOUNT_ID` を追加

### A-2. ネットワーク許可の追加(2分)
同じ環境設定画面の Network access → Allowed domains に追加:
- `api.cloudflare.com` (wranglerのデプロイに必要)

### A-3. LINE Developers でチャネル2つ(10分)
https://developers.line.biz/console/ にLINEアカウントでログイン

1. プロバイダー作成(名前: Link Hokkaido)
2. **Messaging APIチャネル**を作成し、**既存のLINE公式アカウント(Link Hokkaido)に紐付け**
   - 控えるもの: ①チャネルシークレット(Basic settings) ②チャネルアクセストークン(Messaging API→発行)
   - ※これが「LINEトークン再発行」タスクの実行でもある(旧トークンはGit履歴に漏れたので使わない)
3. **LINE Loginチャネル**も同じプロバイダー内に作成(友だち追加時のユーザー特定・流入追跡に必須)
   - 控えるもの: ③チャネルID ④チャネルシークレット
4. ②〜④も環境変数に保存(変数名は何でもいい。例: `LINE_CHANNEL_ACCESS_TOKEN`,
   `LINE_CHANNEL_SECRET`, `LINE_LOGIN_CHANNEL_ID`, `LINE_LOGIN_CHANNEL_SECRET`)
   ※LIFFアプリの追加とCallback URLはデプロイ後にURLが決まるので後回し(CでClaudeが指示)

## B. Claudeの作業(Aが揃ったら次のセッションで)

1. `npx create-line-harness` を再実行(API トークン認証で非対話デプロイ)
2. wrangler secret put で LINE系の鍵を設定
3. Worker URL(webhook URL)とLIFF URLを発行してまゆみさんに渡す

## C. 仕上げ(まゆみさん・Claudeの指示つき)

1. LINE Developers → Messaging API → **Webhook URL** にWorker URLを設定 → Webhook ON
2. LINE公式アカウント管理画面 → 応答設定: **チャット ON + Webhook ON**(両立可)
3. LINE Loginチャネル → LIFFアプリ追加 + Callback URL設定(URLはClaudeが渡す)
4. 友だち追加テスト → あいさつ→フォームの動作確認

## メモ
- 費用: Cloudflare無料枠+LINE無料枠で**月0円**
- 秘密鍵は絶対にチャット・リポジトリに書かない(環境変数 or wrangler secretのみ。LINEトークン流出の教訓)
