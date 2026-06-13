# LINE受付ハブ 引き継ぎメモ(2026-06-13)

次のセッション用。**このリポジトリを開いて「`docs/LINE受付_引き継ぎ.md` に従ってリッチメニューを作って」**と言えば続きから動けます。
設計の全体像は `docs/LINE受付_サービス設計.md` を参照。

## ✅ 完了:リッチメニュー(2026-06-13)
**作成・画像アップロード・デフォルト設定まで完了。** 全ユーザの下部メニューに表示される。
- `richMenuId`: `richmenu-15c6bbf27af398de8b1705048ce0803a`(デフォルト設定済 = `GET /v2/bot/user/all/richmenu` で確認済)
- 生成物・スクリプトは `scripts/richmenu/`(`make_image.py`=画像生成 / `richmenu.json`=メニュー定義 / `deploy.sh`=一括デプロイ / `richmenu.png`=確定画像)
- 作り直す/差し替える時は `scripts/richmenu/deploy.sh` を実行(`LINE_CHANNEL_ACCESS_TOKEN` 必須)。再実行すると**新しいIDで再作成**されるので、不要になった旧メニューは `DELETE /v2/bot/richmenu/{id}` で掃除する。
- ハマりどころ: デフォルト設定 `POST /v2/bot/user/all/richmenu/{id}` はボディ無しのため `Content-Length: 0` を付けないと Akamai が **HTTP 411** を返す(deploy.sh は対応済)。

## (旧)今すぐの依頼 — 上記で完了済み
**LINEリッチメニュー(下部の常設ボタン)を作る。**
- 前提:環境のネット許可ドメインに **`api-data.line.me`** が追加済みであること(リッチメニュー画像アップロード先。旧セッションでは未許可で403だった → まゆみさんが追加済み)。新セッションで `curl -s -o /dev/null -w "%{http_code}" https://api-data.line.me/v2/bot/richmenu/list -H "Authorization: Bearer $LINE_CHANNEL_ACCESS_TOKEN` が 200/関連レスポンスになるか先に確認。
- 日本語フォントは `IPAGothic`(/usr/share/fonts/.../ipag.ttf)が利用可。画像生成はこれを使う。

### リッチメニュー仕様(2500x1686・2行3列・6セル)
各セルは URI アクションで下記フォーム(LIFF)へ。LIFFベース = `https://liff.line.me/2010383287-Nq9MxzT7?page=form&id=<FORM_ID>`

| 位置 | ラベル | リンク先フォーム | FORM_ID |
|------|--------|------------------|---------|
| 左上 | 🆕 無料仮ページ | 無料仮ページ申込 | `579903f2-ffde-4fd8-bef4-2d192e6df556` |
| 中上 | 🛠 ページ変更 | ページ変更依頼 | `a83faf36-4cc3-4ebb-99bc-4ce2b6e25e5a` |
| 右上 | 🎉 イベント・チラシ | イベント・チラシ掲載 | `38ad0a41-d252-459d-b6ed-1a92b22e7f91` |
| 左下 | 💳 お支払い | お支払い・決済の問い合わせ | `b9f5f5dd-7318-4b8a-a0a4-75ba1bf6eb33` |
| 中下 | ❓ その他 | その他のお問い合わせ | `1b647178-1ea0-4034-a9f5-6dcd3e5d5c75` |
| 右下 | 🌐 公式サイト | (URI) https://link-hokkaido.com/ | — |

手順: ①POST `https://api.line.me/v2/bot/richmenu`(menu定義) → ②POST `https://api-data.line.me/v2/bot/richmenu/{id}/content`(PNG画像, 2500x1686, <1MB) → ③POST `https://api.line.me/v2/bot/user/all/richmenu/{id}`(デフォルト設定)。bounds例: セル幅833/834・高さ843。

## 現在の稼働状態(全部Cloudflare上で生きてる)
- Worker: `line-harness` → https://line-harness.juraku-3hearty.workers.dev (webhook ON・疎通済)
- 管理画面: https://line-harness-admin-17afdb62.pages.dev (ログイン鍵=Worker secret `API_KEY`。**値はリポジトリに書かない**。まゆみさんのパスワード管理に保管。必要なら `wrangler secret put API_KEY` で再発行)
- D1: `line-harness`(uuid `ef93e18f-f5f0-4a6a-a2ab-e2e660372895`) / R2: `line-harness-images`
- LIFF id: `2010383287-Nq9MxzT7`(botPrompt=none に設定済) / Messaging Ch=`2010383277` / Login Ch=`2010383287`
- D1上の line_account_id: `00a5f7e7-ae9b-4aa4-96d8-1c060504da2c`

### 作成済み(D1に投入済み)
- **タグ**: 見込み / 会員 / 非会員 / 仮ページ希望 / ページ変更依頼 / イベント掲載依頼 / 支払い問い合わせ / その他問い合わせ
- **あいさつ**: friend_add シナリオ(即時返信)→ 無料仮ページ申込フォームへ誘導。動作確認済(テスト送信成功)
- **フォーム5種**: 上表の通り。各 `on_submit` で「タグ付け＋メタデータ保存＋受付返信」自動発火(検証済)

## 重要な制約・コツ(次セッションが詰まらないように)
- **Worker URL(workers.dev)はこのコンテナのegress許可リストに無い** → `curl` で叩くと403。動作確認は「まゆみさんに友だち追加テストしてもらう」or「D1を直接見る」で行う。
- D1操作: `cd /root/.line-harness && CLOUDFLARE_ACCOUNT_ID=$CLOUDFLARE_ACCOUNT_ID npx -y wrangler@latest d1 execute line-harness --remote --command "..."`(または `--file`)。リポジトリ `Shudesu/line-harness-oss` は `~/.line-harness` にclone済(無ければ再clone+pnpm install)。
- LINE API: `api.line.me` 許可済。LIFF作成/更新・webhook設定・bot info はこれでOK。Loginトークンは client_credentials(`oauth2/v3/token`)で取得。
- WP(link-hokkaido.com): `/wp-json` は海外IP403 → `scripts/wp_post.mjs`(`?rest_route=`自動フォールバック)経由。運営ポータル=固定ページ id `321`。

## 今後のロードマップ(優先度順・未着手)
1. ~~**リッチメニュー**~~ ✅ 完了(2026-06-13)
2. **新規申込のプッシュ通知**(今はダッシュボード記録のみ。まゆみさんのLINE等へ通知を飛ばす)
3. **会員の自動タグ付け**(Square/契約台帳と連動 → 会員/非会員の自動出し分け)
4. **動的ETA**(申込件数連動で受付返信の「◯日」を自動計算 → form submit ハンドラに小改修+再デプロイ)
5. **WPイベントページ連携**(チラシ→ `/event/` へ転記。`wp_post.mjs`)
6. **規約更新**(制作データの権利=Link Hokkaido帰属・印刷/二次利用不可)→ /terms/(WP page id `215`)
7. あいさつ・フォーム・受付返信の**文言/見た目の調整**(ボタン化など)

## 開発ブランチ
作業ブランチ: `claude/sharp-davinci-imh5wg`(docs類はここにコミット)
