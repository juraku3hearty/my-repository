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
 * 1. 契約台帳スプレッドシートに記録(同意の電子記録: 申込番号・日時・規約バージョン・反社表明込み)
 * 2. 申込者に「契約内容の控え」メールを自動送信(契約書代わりの電子記録)
 * 3. 運営に通知メール
 * 4. Square決済ページへ自動転送するHTMLを返す
 *
 * 必要なスクリプトプロパティ:
 *   SQUARE_PAY_URL : Squareサブスクリプションの申込リンク(必須)
 *   NOTIFY_EMAIL   : 通知先メールアドレス(必須)
 *   CONTRACT_SHEET_ID : 契約台帳のスプレッドシートID(未設定なら初回に自動作成して保存)
 */
function handleSignupForm(params) {
  var props = PropertiesService.getScriptProperties();
  var now = new Date();
  // 申込番号(控えメール・台帳・問い合わせ照合用)
  var appNo = 'LH-' + Utilities.formatDate(now, 'Asia/Tokyo', 'yyyyMMdd-HHmmss');
  var appDate = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy年MM月dd日 HH:mm');

  // 1. 契約台帳に記録(同意の電子記録: 日時・規約バージョン・反社表明込み)
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
    sheet.appendRow(['申込番号', '申込日時', '店舗名', '担当者名', 'メール', 'LINE名', '同意規約バージョン', '反社表明', 'ステータス']);
  }
  sheet.appendRow([
    appNo, now, params.shop || '', params.name || '', params.email || '',
    params.line_name || '', params.terms_version || '',
    params.antisocial === 'declared' ? '表明済み' : '未確認', '決済待ち',
  ]);

  // 2. 申込者に「契約内容の控え」を自動送信(同意の電子記録の控え)
  if (params.email) {
    var receipt =
      (params.name || '') + ' 様\n\n' +
      'Link Hokkaido「ページ管理プラン」へのお申し込みを受け付けました。\n' +
      'このメールはお申し込み内容と同意の記録の控えです。大切に保管してください。\n\n' +
      '────────────────────────\n' +
      '■ お申し込み内容\n' +
      '申込番号: ' + appNo + '\n' +
      '申込日時: ' + appDate + '\n' +
      '店舗名: ' + (params.shop || '') + '\n' +
      'ご担当者: ' + (params.name || '') + '\n\n' +
      '■ ご契約内容\n' +
      'サービス: 店舗ホームページの制作・公開・管理(更新対応・相談込み)\n' +
      '月額料金: 1,980円(税込)※先着30店舗・創業記念価格(契約継続中は変更されません)\n' +
      '初期費用・制作費・解約金: 0円\n' +
      '無料期間: 初月無料(無料期間中の解約は料金がかかりません)\n' +
      'お支払い: Squareによる毎月の自動決済\n\n' +
      '■ 解約について\n' +
      'いつでも解約できます(LINEまたはメールで一言ご連絡ください)。\n' +
      '解約はその課金期間の末日まで有効・日割り返金はありません。\n' +
      '解約後のページは非公開となり、90日後に削除されます。\n\n' +
      '■ ご同意いただいた内容\n' +
      '・利用規約(バージョン: ' + (params.terms_version || '') + ') https://link-hokkaido.com/terms/\n' +
      '・特定商取引法に基づく表記 https://link-hokkaido.com/tokushoho/\n' +
      '・毎月の自動決済(継続課金)\n' +
      '・反社会的勢力に該当しないことの表明(利用規約 第7条): ' +
      (params.antisocial === 'declared' ? '表明済み' : '未確認') + '\n' +
      '────────────────────────\n\n' +
      '※ご契約は、この後のSquareでのお支払い設定が完了した時点で成立します(利用規約 第2条)。\n' +
      '※お心当たりのない場合は、このメールに返信でお知らせください。\n\n' +
      'Link Hokkaido(株式会社famitect)\n' +
      '運営担当: 平井まゆみ\n' +
      'https://link-hokkaido.com/';
    MailApp.sendEmail(params.email,
      '【Link Hokkaido】お申し込み内容の控え(' + appNo + ')', receipt,
      { name: 'Link Hokkaido', replyTo: props.getProperty('NOTIFY_EMAIL') || undefined });
  }

  // 3. 運営に通知
  var notifyTo = props.getProperty('NOTIFY_EMAIL');
  if (notifyTo) {
    MailApp.sendEmail(
      notifyTo,
      '【Link Hokkaido】新規申込: ' + (params.shop || '(店舗名なし)') + ' (' + appNo + ')',
      '申込がありました。\n\n申込番号: ' + appNo +
      '\n店舗名: ' + (params.shop || '') +
      '\n担当者: ' + (params.name || '') +
      '\nメール: ' + (params.email || '') +
      '\nLINE名: ' + (params.line_name || '') +
      '\n規約バージョン: ' + (params.terms_version || '') +
      '\n反社表明: ' + (params.antisocial === 'declared' ? '表明済み' : '未確認') +
      '\n\n申込者には契約内容の控えメールを自動送信済み。' +
      '\nこの後、Squareの決済設定に進んでいます。決済完了メールを確認してください。\n台帳: ' + ss.getUrl()
    );
  }

  // 4. 次のステップへ転送
  //    SQUARE_PAY_URL が設定されていればSquare決済ページへ(自動リンク方式)、
  //    未設定なら受付完了ページへ(手動サブスク登録方式: 公開OK後にダッシュボードから登録)
  var payUrl = props.getProperty('SQUARE_PAY_URL') || 'https://link-hokkaido.com/signup-done/';
  var html = '<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8">' +
    '<meta http-equiv="refresh" content="2;url=' + payUrl + '">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<style>body{font-family:sans-serif;background:#f7f3ec;color:#2b2b2b;text-align:center;padding:80px 20px;line-height:2}' +
    'a{display:inline-block;margin-top:20px;background:#d97a2e;color:#fff;text-decoration:none;padding:14px 40px;border-radius:8px;font-weight:700}</style></head>' +
    '<body><h2>お申し込みを受け付けました</h2>' +
    '<p>このまま次のご案内ページに移動します。<br>自動で移動しない場合は下のボタンを押してください。</p>' +
    '<a href="' + payUrl + '">次へ進む</a></body></html>';
  return HtmlService.createHtmlOutput(html)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
