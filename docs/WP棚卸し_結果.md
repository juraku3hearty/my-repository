# WordPress棚卸し結果(2026-06-10)

- サイト名: link-hokkaido / 説明: Just another WordPress site
- URL: https://link-hokkaido.com

## テーマ
- swell v2.7.8.2
- swell_child **(有効)** v1.0.0
- twentytwenty v2.0
- twentytwentyfive v1.0
- twentytwentyfour v1.0
- twentytwentyone v1.6
- twentytwentythree v1.0
- twentytwentytwo v1.2

## プラグイン
- Akismet Anti-Spam v5.0.1 — 停止中
- Hello Dolly v1.7.2 — 停止中
- SEO SIMPLE PACK v3.2.1 — **有効**
- TypeSquare Webfonts for エックスサーバー v1.2.1 — 停止中
- Yoast Duplicate Post v4.5 — **有効**

## 固定ページ(3件)

| タイトル | 状態 | 更新日 | URL | 残す/消す |
|---|---|---|---|---|
| 運営会社情報 | publish | 2023-09-20 | https://link-hokkaido.com/company/ | |
| プライバシーポリシー | draft | 2022-11-09 | https://link-hokkaido.com/?page_id=3 | |
| サンプルページ | publish | 2022-11-09 | https://link-hokkaido.com/sample-page/ | |

## 投稿(8件)

| タイトル | 状態 | 日付 | カテゴリID | 残す/消す |
|---|---|---|---|---|
| お食事処 柳ばし｜千歳市で味わう名物メンチカツ定食 | publish | 2024-10-28 | 3 | |
| 「キリンビアレストランハウベ」千歳市で楽しむジューシーなジンギスカンと新鮮ビールなら | publish | 2024-10-27 | 3 | |
| 【必見】スープカレーGARAKU千歳店のおすすめメニューTOP5！ | publish | 2024-06-15 | 3 | |
| 山岡家千歳店は朝ラーメンメニューがおすすめ！口コミも紹介します | publish | 2024-04-24 | 3 | |
| ひこま豚食堂の人気メニューとは？テイクアウト・ランチメニューも紹介 | publish | 2024-01-18 | 3 | |
| 【もりもと千歳本店】お土産のハスカップジュエリーだけじゃない！地元にも愛されるパンはいかが？ | publish | 2023-09-19 | 3 | |
| 【新千歳シアター】国内初！の空港内映画館。飛行機の待ち時間にも使えます！ | publish | 2023-09-09 | 4 | |
| 【東千歳バーベキュー】豪快に鶏の半身を焼く！絶品の野菜炒めも忘れずに！ | publish | 2023-08-29 | 3 | |

## カテゴリ
- エンタメ(slug: %e3%82%a8%e3%83%b3%e3%82%bf%e3%83%a1 / 記事1件)
- グルメ(slug: %e3%82%b0%e3%83%ab%e3%83%a1 / 記事7件)
- 未分類(slug: uncategorized / 記事0件)

## メディア: 63件

## バージョン・セキュリティ状態(2026-06-10 確認)

- WordPress 7.0(フィードの generator タグより。最新系で問題なし)
- サーバー: XSERVER(nginx)。PHPバージョンはヘッダー非公開(良い状態)
- `wp-login.php` / `xmlrpc.php` / `/wp-json` は海外IPから403 → XSERVERの国外IPアクセス制限が**有効**(良い状態)
  - このためClaude Code環境からは `?rest_route=` 形式でREST APIに接続する(scripts/wp_client.mjs で自動対応済み)
- `readme.html` が200で公開中(バージョン推測の手がかりになる。軽微。気になればXSERVER側 or .htaccessで遮断)
- フィードに generator タグ露出(軽微)

## 残す/消すの提案(2026-06-10 一部実施済み)

| 対象 | 状況 |
|---|---|
| プラグイン Hello Dolly | ✅ **削除済み**(2026-06-10) |
| プラグイン Akismet(停止中) | ✅ **削除済み**(2026-06-10・ユーザーOK済み。コメント欄を使う時に再インストール) |
| プラグイン TypeSquare Webfonts(停止中) | ✅ **削除済み**(2026-06-10・ユーザーOK済み) |
| テーマ twentytwenty〜twentytwentyfive(6個) | ⚠️ **REST APIでは削除不可**(コアAPIはテーマ読み取り専用)。wp-adminで手動削除が必要: 外観→テーマ→各テーマをクリック→右下「削除」。SWELL不具合時の避難先として twentytwentyfive だけ残すのがおすすめ |
| テーマ SWELL / SWELL CHILD | 残す(有効テーマ) |
| プラグイン SEO SIMPLE PACK / Yoast Duplicate Post | 残す(有効・使用中) |
| 固定ページ「サンプルページ」 | ✅ **ゴミ箱へ移動済み**(2026-06-10・30日復元可) |
| 固定ページ「プライバシーポリシー」(draft) | 残して整備(問い合わせフォーム設置時に必須) |
| 固定ページ「運営会社情報」 | 残す |
| 投稿8件(千歳グルメ/エンタメ記事) | 残す(地域サイトの旗印・SEO資産) |
