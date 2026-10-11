# SNS投稿Bot（LINEから画像を送るだけ）

樹鍼灸整骨院のSNS投稿カレンダーに、**LINEから画像と投稿文を送るだけ**で1行追加するGASプロジェクト。

## これが解決する問題

従来のフロー（面倒だった点）:

```
画像を作る → 画像アップローダーサイトを開く → アップロード
→ URLをコピー → スプレッドシートに貼る → 投稿文を貼る
```

変更後:

```
LINEに画像を送る → LINEに投稿文を送る → 完了
```

Instagram Graph API は投稿画像を**公開URL**でしか受け取れない（ファイル添付不可）ため、
「どこかに画像をホストする」工程自体はなくせない。この工程を自動化する。

## 予約投稿はそのまま使える

このBotがやるのは「シートに1行書く」ことだけ。
実際の投稿タイミングを決めているのは**従来通りMake側の「投稿日 == 今日」判定**なので、
スケジュール機構には一切手を入れていない。

- `日付 11/3` と送れば11月3日の行として登録される
- 日付を書かなければ「シート最終日 + 3日」に自動割り当て（返信で日付を通知）
- Cloudinaryの画像URLは期限切れしないので、数ヶ月先の予約でも問題ない

## 構成

| ファイル | 役割 |
|---|---|
| `00_Config.gs` | 設定・スクリプトプロパティの読み出し |
| `01_Webhook.gs` | `doPost` とイベント振り分け |
| `02_LineApi.gs` | LINE返信・画像バイナリ取得 |
| `03_Cloudinary.gs` | Cloudinaryアップロード・配信URL生成 |
| `04_Draft.gs` | 画像とテキストが揃うまでの下書き保持 |
| `05_Sheet.gs` | シート読み書き・投稿日の決定 |
| `06_Commands.gs` | テキストコマンド処理 |
| `07_Setup.gs` | 初期設定と動作確認 |
| `tests/` | ロジックテスト（Node で実行） |

**既存のGASプロジェクトとは別プロジェクトにする。**
リポジトリ直下の `gas_main.js` にすでに `doPost` があり、同じプロジェクトに入れると関数名が衝突する。
また顧客向けLINEとスタッフ用Botは分けるべきなので、LINEチャネルも新規に作る。

## セットアップ手順

### 1. 専用のLINE Botを新規作成

> **既存の院のLINE公式アカウントは使わないこと。**
> 患者さんの予約が来ており、`gas_main.js` のWebhookも繋がっている可能性があるため、
> 混ぜると既存システムが壊れる。必ず新規で作る。

**LINE Developers Console から直接 Messaging API チャネルを作ることはできない。**
先に LINE公式アカウントを作り、そこで Messaging API を有効化する流れになる。

1. [LINE Developers Console](https://developers.line.biz/console/) で新規チャネル作成を開き、
   案内に従って **「LINE公式アカウントを作成する」** に進む
   （[LINE Official Account Manager](https://manager.line.biz/) から直接作ってもよい）
2. アカウント情報を入力
   - アカウント名: 例「樹整骨院 SNS投稿Bot」
   - **認証済みアカウント（青バッジ）は不要。** 未認証のままで動く
3. 作成後、LINE Official Account Manager で Messaging API を有効化
   - 右上の **設定** → 左メニュー **Messaging API** → 「Messaging APIを利用する」
   - プロバイダーを選択（既存のものがあればそれでよい）
4. ここで LINE Developers Console にチャネルが現れる。
   「Messaging API設定」タブで **チャネルアクセストークン（長期）** を発行してコピー
5. 応答設定を変更する
   - LINE Official Account Manager → 設定 → **応答設定**
     - 応答モード: **Bot**
     - **応答メッセージ: オフ**（オンのままだと定型文が返ってしまう）
     - あいさつメッセージ: オフ（任意）
   - LINE Developers Console → Messaging API設定 → **Webhookの利用: オン**

> **料金はかからない。**
> このBotが送るのは応答メッセージ（Reply API）のみで、
> LINE公式アカウントの無料枠でカウントされるのは配信（プッシュ・一斉配信）。
> 応答メッセージは課金対象外。

### 2. Cloudinaryの準備

既存アカウント（cloud name: `dcbfytmzv`）をそのまま使う。

**署名付きアップロード（推奨）**
1. Cloudinary ダッシュボード → Settings → API Keys
2. **API Key** と **API Secret** をコピー

**または unsigned preset（手軽だが要注意）**
1. Settings → Upload → Upload presets → Add upload preset
2. Signing Mode: **Unsigned**
3. Folder: `sns-poster`
4. Allowed formats: `jpg,png,webp` / Max file size: `10MB` を設定しておく
5. preset名をコピー

> unsignedは cloud名とpreset名が漏れると第三者もアップロードできるため、
> 本番では署名付きを使うこと。両方設定した場合は署名付きが優先される。

### 3. GASプロジェクトを作成

1. [script.google.com](https://script.google.com/) で新規プロジェクト作成
2. `00_Config.gs` 〜 `07_Setup.gs` の8ファイルを貼り付け
   （ファイル名の `.gs` は不要。GAS上では `00_Config` などになる）
3. `appsscript.json` の内容を反映（プロジェクトの設定 →「appsscript.json マニフェスト ファイルをエディタで表示する」をオン）

または clasp を使う場合:
```bash
cd sns-poster
# .clasp.json の scriptId を新規プロジェクトのIDに書き換えてから
clasp push
```

### 4. スクリプトプロパティを設定

`07_Setup.gs` の `setupProperties()` の値を書き換えて**一度だけ実行**する。

| キー | 値 |
|---|---|
| `LINE_CHANNEL_ACCESS_TOKEN` | 手順1で取得したトークン |
| `SPREADSHEET_ID` | `144VrJLm2dMBDwtB9uOHnYQBrnlaCuOB8mtZctQ_E3Dw` |
| `CLOUDINARY_CLOUD_NAME` | `dcbfytmzv` |
| `CLOUDINARY_API_KEY` | 手順2のAPI Key |
| `CLOUDINARY_API_SECRET` | 手順2のAPI Secret |
| `ALLOWED_USER_IDS` | 最初は空。手順7で設定 |

実行後 `checkConfig()` を実行し、ログが全て ✅ になることを確認する。

### 5. 書き込みテスト

`testSheetWrite()` を実行する。テスト行が追加され、すぐ削除される。
ログに「✅ テスト行を削除しました」が出れば正常。

### 6. ウェブアプリとしてデプロイ

1. 右上「デプロイ」→「新しいデプロイ」
2. 種類: **ウェブアプリ**
3. 次のユーザーとして実行: **自分**
4. アクセスできるユーザー: **全員**
5. デプロイ → WebアプリURLをコピー
6. LINE Developers Console の「Webhook URL」に貼り付け → **検証** を押して成功を確認

> コードを変更したら必ず「デプロイを管理」→ 編集 → バージョン「新しいバージョン」で再デプロイする。
> これを忘れると古いコードが動き続ける。

### 7. 投稿できる人を制限する

1. スタッフのLINEでBotを友だち追加
2. Botに `ID` と送る → 自分のuserIdが返ってくる
3. 全員分のuserIdを集め、カンマ区切りで `ALLOWED_USER_IDS` に設定

```
Uxxxxxxxxxxxxxxxxx,Uyyyyyyyyyyyyyyyyy
```

> Apps Script の `doPost` はリクエストヘッダーを読めないため、
> `X-Line-Signature` による署名検証ができない。
> WebアプリURLは「全員アクセス可」で公開されるので、
> **この許可リストが唯一の保護**になる。必ず設定すること。

### 8. （任意）下書きの自動掃除

トリガー → `cleanupDrafts` を1日1回で設定しておくと、
放置された下書きがスクリプトプロパティに溜まらない。

## 使い方

```
画像を送る → 投稿文を送る   （順番はどちらが先でもOK）
```

2つが揃うと自動でシートに登録され、登録結果が返信される。

### 投稿日を指定する

投稿文の1行目に日付だけを書く:
```
10/15
今日は寒暖差について…
```

または先に日付だけ送る:
```
日付 10/15
```

`10/15` `2026/10/15` `10月15日` のいずれの形式でも通る。
年を省略すると「今日以降になる最も近い年」が選ばれる（今日が10/11なら `10/01` → **翌年**の10/01）。
過去の日付に登録したい場合は年を明示する。

### コマンド

| コマンド | 動作 |
|---|---|
| `確認` | 今の下書きを表示 |
| `取消` | 下書きを破棄 |
| `一覧` | 今日以降の予約投稿を10件表示 |
| `ID` | 自分のLINE IDを表示 |
| `ヘルプ` | 使い方を表示 |

## 画像の自動補正

Instagram Graph API は **JPEGのみ**対応で、アスペクト比も 4:5 〜 1.91:1 の範囲に限られる。
Cloudinaryの配信URLで自動的に以下を行う:

- `f_jpg` — PNG/WebPで送ってもJPEGで配信
- `w_1080,c_limit` — 1080pxより大きい場合のみ縮小（小さい画像は拡大しない）
- 比率が範囲外の場合のみ `c_pad,b_white` で**切り取らず白余白を足して**収める

これにより「PNGだから投稿失敗」「縦長すぎて失敗」が起きなくなる。
余白が足された場合はLINEの返信で通知される。

## テスト

```bash
./sns-poster/tests/run.sh
```

- 全 `.gs` の構文チェック
- 日付パース・自動割り当て・行挿入位置・下書き・許可リストのロジックテスト（32件）
- Cloudinary署名生成の検証（6件）

GAS APIはスタブ化しているので、Nodeだけで実行できる。

## 制限事項

- **1投稿につき画像1枚**。Instagramのカルーセル（複数枚）には未対応。
  2枚目を送ると1枚目が差し替えられる。
- 画像とテキストが揃うまでの下書きは**24時間**で破棄される。
- 署名検証ができないため、`ALLOWED_USER_IDS` が実質的な唯一の認証になる。
- 行挿入を使うため、Makeのシナリオ実行中にBotが登録すると行番号がずれる可能性がある。
  Makeは行番号ではなく日付で絞り込む設計にしておくこと。
