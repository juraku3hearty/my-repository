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
- [ ] A-3 LINE Developers(進行中): manager.line.biz→Link Hokkaido→設定→Messaging API→利用する
  →プロバイダー「Link Hokkaido」新規作成→シークレット/トークン取得→LINE Loginチャネルも作成
  →環境変数4つ(LINE_CHANNEL_SECRET / LINE_CHANNEL_ACCESS_TOKEN / LINE_LOGIN_CHANNEL_ID / LINE_LOGIN_CHANNEL_SECRET)
- [ ] B: Claudeがデプロイ(**新セッションで実行**。/tmp/line-harness は消えている可能性が高いので
  `npx -y create-line-harness` を再実行。CLOUDFLARE_API_TOKEN があれば wrangler は非対話で通るはず。
  通らなければ CLOUDFLARE_API_TOKEN を env に export して `npx wrangler deploy` を直接)
- [ ] C: LINE側の仕上げ(Webhook URL設定・LIFF・Callback URL — デプロイ後にURLが決まり次第)

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
