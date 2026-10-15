/**
 * 01_Setup.js
 * 初期セットアップ
 *
 * 【実行手順】
 *  1. GASエディタで setup() を1回実行する
 *  2. ログに出たスプレッドシートIDを、スクリプトプロパティ SPREADSHEET_ID に設定
 *     （setup() が自動で設定するので、通常は手作業不要）
 *  3. LINE_CHANNEL_ACCESS_TOKEN / LINE_CHANNEL_SECRET をスクリプトプロパティに設定
 *  4. ウェブアプリとしてデプロイし、そのURLを WEBAPP_URL に設定
 *  5. LINEのWebhook URL に、同じデプロイURLを設定
 */

function setup() {
  var p = PropertiesService.getScriptProperties();
  var id = p.getProperty(PROP_KEYS.SPREADSHEET_ID);
  var ss;

  if (id) {
    ss = SpreadsheetApp.openById(id);
    Logger.log('既存のスプレッドシートを使います: ' + ss.getUrl());
  } else {
    ss = SpreadsheetApp.create('交通事故 問診票ジェネレーター');
    p.setProperty(PROP_KEYS.SPREADSHEET_ID, ss.getId());
    Logger.log('スプレッドシートを作成しました: ' + ss.getUrl());
  }

  ensureSheet_(ss, SHEETS.CLINIC, CLINIC_COLS);
  ensureSheet_(ss, SHEETS.INTAKE, INTAKE_COLS);
  ensureSheet_(ss, SHEETS.CONFIG, ['キー', '値', 'メモ']);

  // デフォルトシートが空のまま残っていたら消す
  var def = ss.getSheetByName('シート1') || ss.getSheetByName('Sheet1');
  if (def && ss.getSheets().length > 1) ss.deleteSheet(def);

  Logger.log('--- セットアップ完了 ---');
  Logger.log('スプレッドシート: ' + ss.getUrl());
  Logger.log('未設定のスクリプトプロパティ: ' + missingProps_().join(', ') || 'なし');
}

/** シートが無ければ作り、ヘッダを整える */
function ensureSheet_(ss, name, cols) {
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);

  var head = sh.getRange(1, 1, 1, cols.length).getValues()[0];
  var needsHeader = head.join('') === '' || head[0] !== cols[0];
  if (needsHeader) {
    sh.getRange(1, 1, 1, cols.length).setValues([cols]);
  }
  sh.getRange(1, 1, 1, cols.length)
    .setFontWeight('bold')
    .setBackground('#1f3a5f')
    .setFontColor('#ffffff');
  sh.setFrozenRows(1);
  return sh;
}

/** 未設定のスクリプトプロパティ名を返す */
function missingProps_() {
  var c = getConfig_();
  var missing = [];
  if (!c.SPREADSHEET_ID) missing.push(PROP_KEYS.SPREADSHEET_ID);
  if (!c.LINE_CHANNEL_ACCESS_TOKEN) missing.push(PROP_KEYS.LINE_CHANNEL_ACCESS_TOKEN);
  if (!c.WEBAPP_URL) missing.push(PROP_KEYS.WEBAPP_URL);
  return missing;
}

/**
 * 動作確認用。テスト院を1件作って、発行されるURLをログに出す。
 */
function createTestClinic() {
  var clinic = createClinic_({ lineUserId: '', 院名: 'テスト整骨院' });
  var base = getConfig_().WEBAPP_URL || '(WEBAPP_URLが未設定)';
  Logger.log('院長用（登録・管理）: ' + base + '?p=admin&t=' + clinic.adminToken);
  Logger.log('患者用（問診記入）  : ' + base + '?p=intake&c=' + clinic.publicId);
  Logger.log('印刷用（院名入り）  : ' + base + '?p=print&c=' + clinic.publicId);
}
