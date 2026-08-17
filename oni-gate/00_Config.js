/**
 * 鬼頭ゲート — 00_Config
 * X（旧Twitter）で「鬼頭」とリプライ/メンションした人に、導入キットURLをDMで自動送信する自作ゲート。
 * GASのみで動作（Cloudflare等のサーバー不要）。
 *
 * スクリプトプロパティ（プロジェクトの設定 → スクリプトプロパティ）:
 *   X_CONSUMER_KEY        … X Developer Portal のアプリで取得
 *   X_CONSUMER_SECRET     … 同上
 *   X_ACCESS_TOKEN        … 同上（権限を Read/Write/DM にしてから再生成したもの）
 *   X_ACCESS_TOKEN_SECRET … 同上
 *   KIT_URL               … 配布キットのURL（Google Drive共有フォルダ等）
 *
 * ※アプリの App permissions を「Read, Write, and Direct Messages」にした後、
 *   Access Token を必ず「Regenerate」すること（権限変更前のトークンではDMが送れない）
 */
const PROPS = PropertiesService.getScriptProperties();

const GATE_KEYWORD = '鬼頭';   // このキーワードを含むリプライ/メンションに反応
const POLL_MINUTES = 10;        // 巡回間隔（分）。短くするほどX APIの読み取り課金が増える

const X_API_BASE = 'https://api.x.com/2';

// DMで送る文面（{url} がKIT_URL＝メルノキのフォームURLに置き換わる）
const DM_TEXT =
  '呼んだか。鬼頭だ。\n' +
  '鬼上司Botの導入キットを渡す。下のフォームに名前とメールアドレスを置いていけ。すぐキットが届く。\n' +
  '{url}\n' +
  '※メールは famitect.com のアドレスから届く。迷惑メール箱も確認しろ。\n' +
  '設置したら、初日の説教のスクショでも送ってこい。待っている。';

// DMが送れなかった時の公開リプライ（リンクは載せない）
const REPLY_FALLBACK =
  'DMを送ったが届かなかったようだ。DMを解放するか、フォローしてからもう一度「鬼頭」と送れ。二度手間をかけさせるな。';
