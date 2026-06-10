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
