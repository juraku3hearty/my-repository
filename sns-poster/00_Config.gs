/**
 * 00_Config.gs — 設定とスクリプトプロパティ
 *
 * 機密値はコードに書かない。すべてスクリプトプロパティに保存する。
 * プロジェクトの設定 > スクリプト プロパティ から登録するか、
 * 07_Setup.gs の setupProperties() を編集して一度実行する。
 */

/** 固定設定（機密ではないもの） */
var CONFIG = {
  // 投稿カレンダーのシート名
  SHEET_NAME: 'シート1',

  // 列番号（1始まり）
  COL_DATE: 1,   // A: 投稿日
  COL_TEXT: 2,   // B: テキスト
  COL_IMAGE: 3,  // C: 画像URL
  COL_DONE: 4,   // D: 投稿済み
  COL_GOOGLE_IMAGE: 5, // E: Google用画像URL（正方形パディング版）

  // ヘッダー行数
  HEADER_ROWS: 1,

  // 日付指定がないときの自動割り当て間隔（シート最終日 + N日）
  DEFAULT_INTERVAL_DAYS: 3,

  // 下書きの保持時間（時間）。これを超えた下書きは破棄する
  DRAFT_TTL_HOURS: 24,

  // Makeが投稿を実行する時刻（HH:mm）。「やり直し」で投稿済みの可能性を判定するのに使う。
  // Make側のスケジュールを変えたらここも合わせること
  POST_TIME_HHMM: '11:30',

  // Instagram が受け付けるアスペクト比（幅 / 高さ）の範囲
  IG_MIN_RATIO: 0.8,   // 4:5
  IG_MAX_RATIO: 1.91,  // 1.91:1

  // Cloudinary 配信時の基本変換（Instagram は JPEG のみ対応）
  CLOUDINARY_BASE_TX: 'f_jpg,q_auto:good,w_1080,c_limit',

  // Google用の変換。Googleビジネスプロフィールは横長寄りに表示するため、
  // 縦長画像をそのまま渡すと上下が切り取られる（2026-10実測）。
  // 横長の画像は切れずに表示されたため、切り取らずに白余白を足して4:3に収める。
  // 元から横長・正方形の画像なら余白はほとんど出ない
  CLOUDINARY_GOOGLE_TX: 'ar_4:3,c_pad,b_white,f_jpg,q_auto:good,w_1200',

  TIMEZONE: 'Asia/Tokyo'
};

/** スクリプトプロパティから値を取得する（必須） */
function prop_(key) {
  var v = PropertiesService.getScriptProperties().getProperty(key);
  if (!v) {
    throw new Error('スクリプトプロパティ ' + key + ' が未設定です。07_Setup.gs を参照してください。');
  }
  return v;
}

/** スクリプトプロパティから値を取得する（任意） */
function propOpt_(key, fallback) {
  var v = PropertiesService.getScriptProperties().getProperty(key);
  return v ? v : (fallback || '');
}

function lineToken_()        { return prop_('LINE_CHANNEL_ACCESS_TOKEN'); }
function spreadsheetId_()    { return prop_('SPREADSHEET_ID'); }
function cloudinaryCloud_()  { return prop_('CLOUDINARY_CLOUD_NAME'); }
function cloudinaryPreset_() { return prop_('CLOUDINARY_UPLOAD_PRESET'); }

/**
 * 投稿を許可する LINE userId の一覧。
 * 未設定なら全員許可（テスト時のみ想定。本番では必ず設定する）
 */
function allowedUserIds_() {
  var raw = propOpt_('ALLOWED_USER_IDS', '');
  if (!raw) return null;
  return raw.split(',').map(function (s) { return s.trim(); }).filter(String);
}

function isAllowedUser_(userId) {
  var list = allowedUserIds_();
  if (!list) return true; // 未設定＝制限なし
  return list.indexOf(userId) !== -1;
}
