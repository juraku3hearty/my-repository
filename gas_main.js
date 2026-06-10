// LINEトークンはGASの「プロジェクトの設定 → スクリプトプロパティ」に
// LINE_CHANNEL_ACCESS_TOKEN という名前で保存する(コードに直書きしない)。
// ※旧トークンはGit履歴に残っているため、LINE Developersで再発行すること
const CONFIG = {
  get LINE_CHANNEL_ACCESS_TOKEN() {
    return PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_ACCESS_TOKEN') || '';
  },
};

function doPost(e) {
  try {
    const params = (e && e.parameter) || {};
    let body = {};

    if (e && e.postData && e.postData.contents) {
      try {
        body = JSON.parse(e.postData.contents);
      } catch (_) {
        body = {};
      }
    }

    if (body.destination && Array.isArray(body.events) && typeof handleLineWebhook === 'function') {
      return handleLineWebhook(body);
    }

    // Link Hokkaido 申込フォーム(site/signup/)からのPOST
    if (params.form_type === 'signup') {
      return handleSignupForm(params);
    }

    if ((params.item_id || params.order_id) && typeof handleRobopayIPN === 'function') {
      return handleRobopayIPN(params);
    }

    if (body.type && body.type.startsWith('payment') && typeof handleSquareWebhook === 'function') {
      return handleSquareWebhook(body);
    }
  } catch (err) {
    Logger.log('doPost error: ' + err.message);
  }

  return ContentService.createTextOutput('OK');
}

function handleLineWebhook(body) {
  // 必要な処理はここに実装。現状は受信確認のみ。
  (body.events || []).forEach(function(event) {
    if (event && event.type === 'message' && event.message && event.message.text) {
      Logger.log('LINE message: ' + event.message.text);
    }
  });
  return ContentService.createTextOutput('OK');
}

/**
 * Link Hokkaido ページ管理プランの申込処理(契約の完全オンライン化)
 * 1. 契約台帳スプレッドシートに記録(同意の電子記録: 日時・規約バージョン込み)
 * 2. 運営に通知メール
 * 3. Square決済ページへ自動転送するHTMLを返す
 *
 * 必要なスクリプトプロパティ:
 *   SQUARE_PAY_URL : Squareサブスクリプションの申込リンク(必須)
 *   NOTIFY_EMAIL   : 通知先メールアドレス(必須)
 *   CONTRACT_SHEET_ID : 契約台帳のスプレッドシートID(未設定なら初回に自動作成して保存)
 */
function handleSignupForm(params) {
  var props = PropertiesService.getScriptProperties();

  // 1. 契約台帳に記録
  var sheetId = props.getProperty('CONTRACT_SHEET_ID');
  var ss;
  if (sheetId) {
    ss = SpreadsheetApp.openById(sheetId);
  } else {
    ss = SpreadsheetApp.create('LinkHokkaido_契約台帳');
    props.setProperty('CONTRACT_SHEET_ID', ss.getId());
  }
  var sheet = ss.getSheetByName('申込') || ss.insertSheet('申込');
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['申込日時', '店舗名', '担当者名', 'メール', 'LINE名', '同意規約バージョン', 'ステータス']);
  }
  sheet.appendRow([
    new Date(), params.shop || '', params.name || '', params.email || '',
    params.line_name || '', params.terms_version || '', '決済待ち',
  ]);

  // 2. 運営に通知
  var notifyTo = props.getProperty('NOTIFY_EMAIL');
  if (notifyTo) {
    MailApp.sendEmail(
      notifyTo,
      '【Link Hokkaido】新規申込: ' + (params.shop || '(店舗名なし)'),
      '申込がありました。\n\n店舗名: ' + (params.shop || '') +
      '\n担当者: ' + (params.name || '') +
      '\nメール: ' + (params.email || '') +
      '\nLINE名: ' + (params.line_name || '') +
      '\n規約バージョン: ' + (params.terms_version || '') +
      '\n\nこの後、Squareの決済設定に進んでいます。決済完了メールを確認してください。\n台帳: ' + ss.getUrl()
    );
  }

  // 3. Square決済ページへ転送
  var payUrl = props.getProperty('SQUARE_PAY_URL') || 'https://link-hokkaido.com/partner/';
  var html = '<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8">' +
    '<meta http-equiv="refresh" content="2;url=' + payUrl + '">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<style>body{font-family:sans-serif;background:#f7f3ec;color:#2b2b2b;text-align:center;padding:80px 20px;line-height:2}' +
    'a{display:inline-block;margin-top:20px;background:#d97a2e;color:#fff;text-decoration:none;padding:14px 40px;border-radius:8px;font-weight:700}</style></head>' +
    '<body><h2>お申し込みを受け付けました</h2>' +
    '<p>このままお支払い設定ページ(Square)に移動します。<br>自動で移動しない場合は下のボタンを押してください。</p>' +
    '<a href="' + payUrl + '">お支払い設定へ進む</a></body></html>';
  return HtmlService.createHtmlOutput(html)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
