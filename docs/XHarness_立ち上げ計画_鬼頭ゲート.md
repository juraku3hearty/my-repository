# X Harness 立ち上げ計画 — 「鬼頭」DM自動配布ゲート

目的：秦さんの投稿に「鬼頭」とリプライ/DMした人へ、導入キットのリンクを**自動で**届ける受け皿を作る。
（`juraku3hearty/my-x-harness` を MAYU の Cloudflare にデプロイして使う）

## 結論（設計）

X Harness の**エンゲージメントゲート v2** がそのまま使える：

```
秦さんの投稿
  └─ 読者が「鬼頭」とリプライ
       └─ Cronが5分ごとに差分取得（since_id方式＝低コスト）
            └─ 条件チェック（フォロー必須にするか選べる）
                 └─ 合格者に自動でDM（または@リプライ）で導入キットURLを送信
                      └─ 通過者はフォロワーDBにタグ付きで記録（リスト資産になる）
```

- 投稿文はすでに「鬼頭とだけ送ってもらえればすぐ渡します」になってるので**文面変更不要**
- おすすめ設定：条件は「フォローのみ必須」（RT必須にすると参加率が落ちる。拡散はコンテンツ力に任せる）
- 配布物：導入キットのURL 1本（下記「配布キット」参照）

## 費用（正直に）

- Cloudflare（Workers/D1/Pages）: **無料枠でOK**
- X API: **Pay-Per-Useで月$3〜5目安**（ゲート1〜2個の通常運用。バズったら$20〜45）
- ここだけは0円にならない。ただしXステップ（月21,780円〜）の代替と考えれば1/50以下

## 役割分担

### 🤖 Claude側（済み・進行中）
- [x] リポジトリ精読、ゲートv2が要件に合うことを確認
- [x] この計画書の作成
- [ ] `pnpm install` / ビルド検証（コンテナで実行中）
- [ ] デプロイ時に一緒に手順を1個ずつ出す（wrangler.tomlのdatabase_id記入等もガイド）

### 👩 MAYU側（これだけ用意して。全部で20分くらい）
1. **Cloudflareアカウント作成**（無料）: https://dash.cloudflare.com/sign-up
2. **X Developerアカウント + アプリ作成**: https://developer.x.com/
   - 運用するXアカウント（発信用）でログイン
   - アプリの App permissions を **「Read, Write, and Direct Messages」** に設定
   - **Consumer Key / Consumer Secret / Access Token / Access Token Secret** の4つを控える
   - 課金プランは Pay-Per-Use を選択（クレカ登録が要る）
3. 作業マシンは**Windowsで OK**（wrangler login がブラウザ認証だから、普段のPCが一番楽。VPS不要）
   - Node.js 20+ が入ってなければ https://nodejs.org からLTSを入れる

## デプロイ手順（当日、私と一緒に。所要1時間弱）

```bash
# 1. クローンと依存インストール
git clone https://github.com/juraku3hearty/my-x-harness.git
cd my-x-harness
npm i -g pnpm
pnpm install

# 2. Cloudflareログイン（ブラウザが開く）
npx wrangler login

# 3. D1データベース作成 → 出力されたdatabase_idをapps/worker/wrangler.tomlに記入
npx wrangler d1 create x-harness
npx wrangler d1 execute x-harness --file=packages/db/schema.sql --remote

# 4. R2バケット作成（記事画像置き場。wrangler.tomlが参照している）
npx wrangler r2 bucket create x-harness-growth-images

# 5. ダッシュボード用APIキー設定
npx wrangler secret put API_KEY

# 6. Workerデプロイ
cd apps/worker && npx wrangler deploy

# 7. Xアカウント登録（READMEのcurl。キー4つをここで使う）

# 8. 管理画面デプロイ
cd ../web
NEXT_PUBLIC_API_URL=https://<worker>.workers.dev npx next build
npx wrangler pages deploy out --project-name=x-harness-admin

# 9. 管理画面にログイン → キャンペーンウィザードで「鬼頭」ゲート作成
```

## 配布キット（ゲートが自動送信するURL先）

DMで送るのはURL1本。中身の候補：
- **A案（推奨）: Google Driveの共有フォルダ** — 導入ガイドPDF＋コード8ファイル(.txt)。誰でも開ける・差し替え自由
- B案: GitHub公開リポジトリのフォルダリンク — 楽だが非エンジニアには画面が怖い
- C案: UTAGEもどきのフォーム経由 — メアド取得はできるが、DMの「すぐ渡す」感が薄れる

→ A案で作る。フォルダ内に「まず導入ガイド.pdfを開いてください」と書いた説明を置く。

## タイムライン

1. MAYUが上の「用意するもの」3点を済ませる
2. 私と一緒にデプロイ（1時間弱）→「鬼頭」ゲート作成 → 自分のテストリプライで動作確認
3. **ゲート稼働を確認してから**秦さんに投稿GOを出す
