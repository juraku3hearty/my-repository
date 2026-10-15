/**
 * 00_Config.js
 * 交通事故 問診票ジェネレーター - 設定
 *
 * 秘密情報はコードに書かず、すべてスクリプトプロパティから読む。
 * 設定方法: GASエディタ > プロジェクトの設定 > スクリプト プロパティ
 */

/** スクリプトプロパティのキー名 */
var PROP_KEYS = {
  SPREADSHEET_ID: 'SPREADSHEET_ID',
  LINE_CHANNEL_ACCESS_TOKEN: 'LINE_CHANNEL_ACCESS_TOKEN',
  LINE_CHANNEL_SECRET: 'LINE_CHANNEL_SECRET',
  WEBAPP_URL: 'WEBAPP_URL',
  DESK_URL: 'DESK_URL'
};

/** シート名 */
var SHEETS = {
  CLINIC: '院マスタ',
  INTAKE: '問診回答',
  CONFIG: '設定'
};

/** 院マスタの列順（この順番で読み書きする） */
var CLINIC_COLS = [
  'clinicId', 'publicId', 'adminToken', '院名', '院長名',
  '電話', '住所', 'LINE_userId', '登録日時', '更新日時'
];

/** 問診回答の列順 */
var INTAKE_COLS = [
  'recordId', 'clinicId', '受付日時',
  '患者名', '電話', '住所',
  '事故日時', '経過日数',
  '病院受診', '最終受診日', '病院での案内',
  '発生場所', '発生場所その他',
  '自分の種別', '走行状態', '乗車区分', '相手の種別',
  '修理費用', '過失_自分', '過失_相手',
  '痛み部位', '車両キズ箇所',
  '病院併用意向', '自賠責認知', '任意保険',
  '遅延理由', '遅延理由詳細',
  'アラート', '院内メモ'
];

/**
 * 設定値をまとめて取得する。
 * @return {Object}
 */
function getConfig_() {
  var p = PropertiesService.getScriptProperties();
  return {
    SPREADSHEET_ID: p.getProperty(PROP_KEYS.SPREADSHEET_ID) || '',
    LINE_CHANNEL_ACCESS_TOKEN: p.getProperty(PROP_KEYS.LINE_CHANNEL_ACCESS_TOKEN) || '',
    LINE_CHANNEL_SECRET: p.getProperty(PROP_KEYS.LINE_CHANNEL_SECRET) || '',
    WEBAPP_URL: p.getProperty(PROP_KEYS.WEBAPP_URL) || '',
    DESK_URL: p.getProperty(PROP_KEYS.DESK_URL) || ''
  };
}

/**
 * 13日を超えたかどうかの判定に使うしきい値。
 * 院長の運用（14日でだめだったケースがあるため13日で線を引く）に合わせている。
 * 変更する場合はここだけ直せばよい。
 */
var DAYS_THRESHOLD = 13;
