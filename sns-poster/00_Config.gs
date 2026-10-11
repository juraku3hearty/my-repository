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

  // ヘッダー行数
  HEADER_ROWS: 1,

  // 日付指定がないときの自動割り当て間隔（シート最終日 + N日）
  DEFAULT_INTERVAL_DAYS: 3,

  // 下書きの保持時間（時間）。これを超えた下書きは破棄する
  DRAFT_TTL_HOURS: 24,

  // Instagram が受け付けるアスペクト比（幅 / 高さ）の範囲
  IG_MIN_RATIO: 0.8,   // 4:5
  IG_MAX_RATIO: 1.91,  // 1.91:1

  // Cloudinary 配信時の基本変換（Instagram は JPEG のみ対応）
  CLOUDINARY_BASE_TX: 'f_jpg,q_auto:good,w_1080,c_limit',

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
