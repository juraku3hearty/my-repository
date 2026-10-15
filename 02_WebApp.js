/**
 * 02_WebApp.js
 * ウェブアプリのルーティング
 *
 * ?p=reg&t=<adminToken>    院の登録画面（LINEから届くリンク）
 * ?p=admin&t=<adminToken>  院長用の管理画面（届いた問診の一覧）
 * ?p=intake&c=<publicId>   患者が記入する問診画面
 * ?p=print&c=<publicId>    院名入りの印刷用問診票（ブラウザの印刷からPDF保存）
 *
 * ※ doPost は gas_main.js 側で定義済み（LINE Webhook / 決済IPN用）。
 *    この画面からの保存は google.script.run を使うので doPost には触らない。
 */
function doGet(e) {
  var params = (e && e.parameter) || {};
  var page = params.p || 'reg';

  try {
    switch (page) {
      case 'reg':    return renderRegister_(params.t);
      case 'admin':  return renderAdmin_(params.t);
      case 'intake': return renderIntake_(params.c);
      case 'print':  return renderPrint_(params.c);
      default:       return errorPage_('ページが見つかりません。');
    }
  } catch (err) {
    Logger.log('doGet error: ' + err.message);
    return errorPage_('エラーが発生しました。もう一度お試しください。');
  }
}

/** 院の登録画面 */
function renderRegister_(token) {
  var clinic = findClinicByToken_(token);
  if (!clinic) return errorPage_('URLが正しくありません。LINEに届いたリンクから開いてください。');

  var t = HtmlService.createTemplateFromFile('ui_register');
  t.clinic = clinic;
  t.urls = clinicUrls_(clinic);
  return page_(t, '問診票の設定');
}

/** 院長用の管理画面 */
function renderAdmin_(token) {
  var clinic = findClinicByToken_(token);
  if (!clinic) return errorPage_('URLが正しくありません。LINEに届いたリンクから開いてください。');

  var t = HtmlService.createTemplateFromFile('ui_admin');
  t.clinic = clinic;
  t.token = token;
  t.urls = clinicUrls_(clinic);
  return page_(t, '届いた問診');
}

/** 患者が記入する問診画面 */
function renderIntake_(publicId) {
  var clinic = findClinicByPublicId_(publicId);
  if (!clinic) return errorPage_('この問診票のリンクは無効です。受付にお声がけください。');

  var t = HtmlService.createTemplateFromFile('ui_intake');
  t.clinic = clinic;
  t.publicId = publicId;
  t.threshold = DAYS_THRESHOLD;
  return page_(t, (clinic['院名'] || '') + ' 交通事故カウンセリングシート');
}

/** 印刷用（院名入り） */
function renderPrint_(publicId) {
  var clinic = findClinicByPublicId_(publicId);
  if (!clinic) return errorPage_('この問診票のリンクは無効です。');

  var t = HtmlService.createTemplateFromFile('ui_print');
  t.clinic = clinic;
  return page_(t, (clinic['院名'] || '') + ' 交通事故カウンセリングシート');
}

/** テンプレートを評価して HtmlOutput にする（共通設定つき） */
function page_(template, title) {
  return template.evaluate()
    .setTitle(title)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** エラー画面 */
function errorPage_(message) {
  var html = '<!doctype html><html lang="ja"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>エラー</title>' + include('ui_style') + '</head><body>' +
    '<main class="wrap"><div class="card"><h1>開けませんでした</h1>' +
    '<p>' + esc_(message) + '</p></div></main></body></html>';
  return HtmlService.createHtmlOutput(html)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
