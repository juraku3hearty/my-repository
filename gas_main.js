const CONFIG = {
  LINE_CHANNEL_ACCESS_TOKEN: 'XADFvO2Sv0X1Ac3eBBvunXWVEF7mI5ftzXcZN/+7U0ebXv7Qvj80Xr7FoJ+k6S3S/4PPQ+SKfHsNQXFK6ZMAv7fMYFxQA/Y/+AtrlaVL2Cowz0NTM70Y2ZiMkhZULHbHmaxzJnj5acq3FRBTaeRLbwdB04t89/1O/w1cDnyilFU=',
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
