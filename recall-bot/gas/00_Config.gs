/**
 * 再来促進(リコール)Bot — 共通設定・共通ヘルパー
 *
 * 整骨院の最大の穴「来院が途切れた人」を毎日自動で拾い、LINEで再来をやさしく促す。
 * GAS + LINE Messaging API + スプレッドシート + Gemini。LLMはGemini優先(CLAUDE.md準拠)。
 *
 * まずは患者マスタ(スプレッドシート)単体で動く。SalonBoard同期からの自動取り込みは後付け。
 */
const CONFIG = {
  // 機密はコードに直書きせずスクリプトプロパティへ
  PROP: {
    LINE_TOKEN: 'LINE_CHANNEL_ACCESS_TOKEN',
    LINE_SECRET: 'LINE_CHANNEL_SECRET',
    GEMINI_KEY: 'GEMINI_API_KEY',
  },
  SHEET: {
    PATIENTS: '患者マスタ',
    LOG: '送信ログ',
    SETTINGS: '設定',
  },
  GEMINI_MODEL: 'gemini-3.5-flash', // 無料枠が切れたら差し替え

  // 離脱判定: 推奨間隔 × この倍率 を超えたら「間が空いた」とみなす
  RECALL_FACTOR: 1.3,
  // 同じ人に連投しないクールダウン(日)
  RECALL_COOLDOWN_DAYS: 14,
  // 推奨間隔 × この倍率 を超えたら「離脱」扱いにして送信を止める
  DORMANT_FACTOR: 3.0,

  // 症状キーワード→推奨来院間隔(日)の既定。患者マスタの「推奨間隔」列が空の時に使う
  INTERVAL_BY_SYMPTOM: [
    { key: ['急性', 'ぎっくり', '寝違え', '捻挫'], days: 4 },
    { key: ['骨盤', '産後', 'ピラティス'], days: 10 },
    { key: ['腰', '肩', '首', '慢性', '頭痛'], days: 7 },
  ],
  DEFAULT_INTERVAL_DAYS: 7,
};

/** スクリプトプロパティ必須取得(未設定なら分かりやすく落とす) */
function getProp_(key) {
  const v = PropertiesService.getScriptProperties().getProperty(key);
  if (!v) throw new Error('スクリプトプロパティ未設定: ' + key);
  return v;
}

/** シート取得(なければ作る) */
function sheet_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

/** 設定シートから値を読む(前後スペース混入に耐える) */
function getSetting_(key, fallback) {
  const sh = SpreadsheetApp.getActive().getSheetByName(CONFIG.SHEET.SETTINGS);
  if (!sh) return fallback;
  const rows = sh.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === key && String(rows[i][1]).trim() !== '') {
      return String(rows[i][1]).trim();
    }
  }
  return fallback;
}

/** 今日(時刻を0時に丸めたDate。日数計算のブレ防止) */
function today_() {
  const tz = Session.getScriptTimeZone() || 'Asia/Tokyo';
  return new Date(Utilities.formatDate(new Date(), tz, 'yyyy/MM/dd'));
}

/** aからbまでの経過日数 */
function daysBetween_(a, b) {
  return Math.floor((b.getTime() - a.getTime()) / 86400000);
}
