# Xserver前提の連携設計とデザイン方針

2026-10-12 / **本実装は未着手。実現可能性と必要な操作の整理**

関連：`docs/membership-integration.md`（連携設計の本体）、`docs/membership-verification.md`（検証手順と費用）

---

## 0. 前回の記述の訂正

前回、門番PHPの設置方法として `.htaccess` に `php_value auto_prepend_file` を書く案を提示したが、**これは誤り**だった。

- `.user.ini` は **CGI/FastCGI環境でのみ** 読み込まれ、Apacheモジュール版では `.htaccess` を使う、というのがPHPの仕様（[PHP公式マニュアル](https://www.php.net/manual/en/configuration.file.per-user.php)）
- 逆に **FastCGI環境では `.htaccess` の `php_value` が効かず、500エラーになる報告がある**（[senooken.jp](https://senooken.jp/post/2019/07/28/) ほか）
- Xserverは **FastCGI** であり、PHPの設定はサーバーパネルの「[php.ini設定](https://xserver.jp/manual/man_server_phpini_edit.php)」または `.user.ini` で行う

**正しい設置方法：`.user.ini` に `auto_prepend_file` を書く、またはサーバーパネルの「php.ini設定」を使う。**
`auto_prepend_file` は `PHP_INI_PERDIR` なので `.user.ini` で指定できる（【推測】Xserver側で禁止されていなければ）。**要確認。**

---

## 1. Xserver上のCyfons ↔ 別VPS上のFlask を安全に連携する

### 1-1. 通信の向きを片方向に固定する

```
Xserver（Cyfons）  ──HTTPS──▶  VPS（Flask）
                   ◀──── 呼ばない
```

VPSからXserverを呼ばない。**Xserver側に受け口を作らなければ、攻撃面が増えない。**
退会の判定も、署名付きリンクの発行も、すべてXserver発の片方向で足りる。

### 1-2. リクエストの守り方（4重）

| | 対策 | 内容 |
|---|---|---|
| 1 | HTTPS必須 | VPS側はLet's Encrypt。HTTPは301で落とす |
| 2 | **HMAC-SHA256署名** | 共有鍵でボディ＋タイムスタンプに署名。鍵自体は送らない |
| 3 | **時刻窓＋nonce** | `ts` が±60秒外なら拒否。`nonce` は使い捨てで再利用を拒否（リプレイ攻撃対策） |
| 4 | **送信元IP許可リスト** | VPSのnginxでXserverのIPのみ許可。【推測】共用サーバーの送信元IPは契約サーバーのIPで固定。**要確認**（固定でなければこの層は省く。1〜3で足りる） |

加えて、VPS側で `/api/*` にレート制限（1分60回など）をかける。

### 1-3. 共有鍵の置き場所

**`public_html` の外に置く。** Xserverは `/home/<サーバーID>/<ドメイン>/public_html/` が公開領域なので、その1つ上の階層なら外部から読めない。

```
/home/xxxxx/example.com/
  ├── secret/config.php   ← ここ。ブラウザから到達できない
  └── public_html/
        └── freemember/   ← Cyfons本体
```

`.user.ini` の `auto_prepend_file` が使えるなら、そこで `secret/config.php` を読み込む。

### 1-4. 障害時の挙動 ★先に決めておく

| 状況 | 挙動 | 理由 |
|---|---|---|
| VPSが落ちている時のCyfons側の門番 | **fail-open（通す）** | VPS障害で会員サイト全体が閉まるほうが被害が大きい。退会者が数時間見えるリスクより軽い |
| VPSが落ちている時のQ&Aアプリ | fail-close | そもそもQ&Aが動かないので判断の余地がない |
| 判定結果のキャッシュ | 5分 | VPSへの問い合わせが毎ページ発生しないように。退会の反映は最大5分遅れる |

fail-open は意図的な選択であり、「退会者が最大数時間 Cyfons を見られる可能性がある」ことを受け入れる判断である。
**1-1 の価値配分（Q&A側に価値を寄せる）と組み合わせることで、この穴の実害を小さくする。**

---

## 2. ログイン済み会員の識別（Xserver版の検証手順）

手順そのものは `docs/membership-verification.md` 2章のとおり。Xserver固有の差分のみ記す。

### 2-1. 置き場所

Cyfonsの実体は【推測】次のパスにある（music3テンプレートの解説記事の例に基づく。**実機で確認する**）。

```
/home/<サーバーID>/<ドメイン>/public_html/freemember/
      ├── template/<テンプレート名>/   ← テンプレート一式。add.css はここ
      └── （本体のPHP）
```

検証ファイルは `public_html/freemember/_probe_<ランダム文字列>/` に置き、**終わったらディレクトリごと削除する。**

### 2-2. Xserverでのアクセス制限

サーバーパネルに「アクセス制限」機能がある。Basic認証をかけられる。IP制限は `.htaccess` の `Require ip` で行う（**PHP設定と違い、アクセス制御の `.htaccess` はFastCGIでも有効**）。

### 2-3. PHP設定の確認（手順1に追加）

```php
<?php // _probe/step1.php
header('Content-Type: text/plain; charset=UTF-8');
echo "PHP            : " . PHP_VERSION . "\n";
echo "SAPI           : " . PHP_SAPI . "\n";            // cgi-fcgi なら .user.ini が効く
echo "user_ini.filename : " . ini_get('user_ini.filename') . "\n";
echo "auto_prepend_file : " . (ini_get('auto_prepend_file') ?: '(未設定)') . "\n";
echo "session_name   : " . session_name() . "\n";
echo "save_path      : " . ini_get('session.save_path') . "\n";
echo "allow_url_fopen: " . ini_get('allow_url_fopen') . "\n";
echo "curl           : " . (function_exists('curl_init') ? 'あり' : 'なし') . "\n";
```

**`SAPI` が `cgi-fcgi` であれば `.user.ini` が効く。** `curl` の有無はVPSへの問い合わせに必要。

### 2-4. 判定後の分岐（前回と同じ）

| 検証結果 | 連携方式 | 退会の停止 |
|---|---|---|
| `$_SESSION` に会員情報がある | 署名付きリンク | 門番PHP（`.user.ini`）で完全自動 |
| DBのセッションテーブルから特定できる | 署名付きリンク | 門番PHP |
| どちらも不可 | 独立ログイン（メールにワンタイムリンク） | CSV半自動＋検知通知 |

---

## 3. 決済状況に応じた両方の停止

```
サブスクペイ
  ├ 決済結果通知URL（初回）     ──┐
  └ 自動課金結果通知URL（2回目〜）─┴─▶ VPS /webhook  → members.status を更新
                                              │
                      ┌───────────────────────┴───────────────────────┐
                      ▼                                               ▼
            Q&Aアプリ（VPS）                                 Cyfons（Xserver）
            status を直接見る                        門番PHPが /api/status に問い合わせ
            → 即時遮断                                → active以外なら支払い案内へ
                                                      （5分キャッシュ、VPS障害時は通す）
```

猶予の日数は `docs/membership-verification.md` のとおり（サブスクペイのリトライ7日×2回に合わせて17日）。

**門番PHPが使えない場合**は、Cyfons側はCSV半自動＋検知通知に落ちる。Q&A側の即時遮断は変わらない。

---

## 4. 会員サイトのデザイン

### 4-1. Cyfonsでどこまで変えられるか

**確認できたこと**

| 事項 | 内容 | 出典 |
|---|---|---|
| テンプレート方式 | `public_html/freemember/template/<テンプレート名>/` にテンプレート一式が置かれる | [hero-academy.jp（music3の解説）](https://n.hero-academy.jp/cyfons-customize-music3/) |
| **`add.css` がある** | テンプレートフォルダ内の `add.css` をFTPで編集し、CSSを追記できる | 同上 |
| 管理画面でできる範囲 | テンプレートの色・フォントの変更、コンテンツ表示の切り替え | [effibop.com](https://effibop.com/cyfons/) |
| 管理画面だけでは足りない | 「管理画面の機能からは、自分のカラーやデザインに自由度高くカスタマイズすることが不可能」「リリースから10年以上経つシステム」 | [homeworkers.jp](https://www.homeworkers.jp/cyfons-membersite/) |
| 外注が存在する | Cyfons専用のデザインカスタマイズを請け負うサービスがある（レスポンシブ対応含む） | [coconala](https://coconala.com/services/2503587) |

> 外注サービスが成立しているということは、**CSSの範囲で実用的に見た目を変えられる**ことの傍証になる。

**【推測・要確認】** テンプレートフォルダがPHPファイルで構成されているなら、**フォルダごと複製して独自テンプレートを作れる**可能性が高い。公式テンプレートを書き換えないので、Cyfonsのアップデートで消えない。

### 4-2. 3案の比較

| | 案A `add.css` のみ | **案B 独自テンプレートを複製** | 案C 外側に新トップ |
|---|---|---|---|
| やること | 既存テンプレートにCSSを追記 | `template/music3/` を `template/jiko2026/` に複製して作り込む | ログイン後の遷移先を自作PHPにする |
| 色・文字・余白 | ◎ | ◎ | ◎ |
| **レイアウト構造の変更** | △ CSS Gridで並べ替えはできるが限界あり | ◎ HTMLから書ける | ◎ 完全自由 |
| **トップ中心にQ&Aを置く** | ✕ 難しい | ○ | ◎ |
| 既存の会員管理・動画機能 | ◎ 無傷 | ◎ 無傷（公式テンプレートを触らない） | ◎ 無傷 |
| アップデート耐性 | ◎ | ○ 独自フォルダなので消えにくい【推測】 | ◎ |
| 実装負担 | 小 | 中 | 中（セッション読み取りが前提） |
| 前提 | なし | テンプレート複製が可能なこと【要確認】 | 2章の検証に成功すること |
| 失敗時の戻し | CSSを消す | 管理画面でテンプレートを元に戻す（**即座・安全**） | リダイレクトを外す |

### 4-3. 推奨：案B＋案C

```
会員サイト全体の見た目  → 案B（独自テンプレート jiko2026 を複製して作る）
トップページだけ        → 案C（中心にAI実務Q&Aを置くため、自作PHPにする）
Q&Aアプリ（VPS）        → 同じ design/tokens.css を使う
```

3つが同じCSS変数（`design/tokens.css`）を共有するので、**どこへ移動しても同じサイトに見える。**
案Bは管理画面でテンプレートを切り替えるだけで元に戻せるため、**試して駄目なら即座に戻せる**のが利点。

案Cが不可（セッションが読めない）の場合は、案Bだけで進める。トップ中心へのQ&A配置は、テンプレート内にQ&Aへのリンクブロックを大きく置く形で代替する。

### 4-4. 作業前のバックアップとテスト環境

**本番は触らない。順序を守る。**

1. **Xserverの自動バックアップの保持期間を確認**（【推測】過去14日分。サーバーパネルで確認）
2. **手動バックアップ**
   - FTPで `public_html/freemember/` を丸ごとダウンロード
   - phpMyAdminでCyfonsのデータベースをSQLダンプ
   - ダウンロードしたものを別の場所（Google Drive等）にも置く
3. **テスト環境**
   - 第一案：サブドメイン（例 `test.〈ドメイン〉`）を作り、Cyfonsをもう1セット設置する。Xserverはサブドメイン無制限＋無料独自SSLなので費用は0円（[Xserver サブドメイン設定](https://www.xserver.ne.jp/manual/man_domain_subdomain_setting.php) / [無料独自SSL](https://www.xserver.ne.jp/manual/man_server_ssl.php)）
     - **【要確認】Cyfonsのライセンスで複数設置が許されるか。** 買い切りだが設置数の制限がある可能性がある
   - 第二案（ライセンスが1つの場合）：**テンプレートフォルダだけ複製してテスト用テンプレートを作る。** 管理画面で切り替えて確認し、すぐ戻す。会員データには一切触れない

### 4-5. 試作品（作成済み）

`design/mockup-top.html` / `design/mockup-top.png`（スマホ 390px）

- 画面の中心＝最上部に **AI実務Q&A**。ほかの要素より明らかに大きく、濃い色で置いた
- よく検索される語（打ち切り／医師の同意／施術証明書／健康保険の併用）をタップできる形で添え、
  **何を聞けばいいか分からない状態を作らない**
- その下に 実務講座／グループ相談／書式ダウンロード。1件あたり高さ72px以上でタップしやすくした
- 最下部にお知らせ。古い情報が主役にならないよう下に置いた
- 色は2色だけ（紺＋グレー）。アイコンは単色の線画に統一し、絵文字は使わない
- 文字は16px以上（iOSで入力時に拡大されないサイズ）

**この試作品を確認・修正してから実装に入る。実装はまだ開始していない。**

---

## 5. 確認が必要なこと（優先順）

| # | 対象 | 内容 |
|---|---|---|
| 1 | Xserver | `_probe/step1.php` を実行し、`SAPI` が `cgi-fcgi` か、`.user.ini` で `auto_prepend_file` が効くか |
| 2 | Cyfons | `$_SESSION` に会員情報が入っているか（検証手順の手順3） |
| 3 | Cyfons | `template/` 配下の構成。フォルダを複製して独自テンプレートを作れるか |
| 4 | Cyfons | ライセンスで複数設置（テスト環境）が許されるか |
| 5 | Xserver | 送信元IPが固定か（VPS側の許可リストに使えるか） |
| 6 | Xserver | 自動バックアップの保持期間 |
| 7 | サブスクペイ | `docs/membership-integration.md` 9章の確認事項2〜6 |

**1〜3が揃えば、連携方式・退会の停止手段・デザインの実装方法がすべて確定する。**
それまで本実装には入らない。
