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
  (body.events || []).forEach(function(event) {
    try {
      if (!event || event.type !== 'message' || !event.message) return;
      var msg = event.message;
      var reply = null;

      if (msg.type === 'image') {
        // 投稿アナリティクスのスクショ → Gemini OCR → シート追記
        reply = handleXAnalyticsImage(msg.id, '');
      } else if (msg.type === 'text') {
        // 「インプ いいね リポスト ...」のテキスト入力にも対応
        reply = handleXAnalyticsText(msg.text);
        if (reply === null) {
          reply = '📸 投稿アナリティクスのスクショを送ると自動で記録します。\n' +
                  '数値を直接送る場合は「インプ いいね リポスト コメント ブックマーク」の順で。';
        }
      }

      if (reply && event.replyToken) {
        replyLineMessage(event.replyToken, reply);
      }
    } catch (err) {
      Logger.log('handleLineWebhook error: ' + err.message);
      if (event && event.replyToken) {
        replyLineMessage(event.replyToken, '⚠️ 読み取りに失敗しました: ' + err.message);
      }
    }
  });
  return ContentService.createTextOutput('OK');
}

function replyLineMessage(replyToken, text) {
  UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + CONFIG.LINE_CHANNEL_ACCESS_TOKEN },
    payload: JSON.stringify({
      replyToken: replyToken,
      messages: [{ type: 'text', text: text }]
    }),
    muteHttpExceptions: true
  });
}
