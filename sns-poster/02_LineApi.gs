/**
 * 02_LineApi.gs — LINE Messaging API の呼び出し
 */

/** 返信メッセージを送る（replyToken は1回のみ有効・有効期限は約1分） */
function replyText_(replyToken, text) {
  if (!replyToken) return;
  var res = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + lineToken_() },
    payload: JSON.stringify({
      replyToken: replyToken,
      messages: [{ type: 'text', text: truncate_(text, 4900) }]
    }),
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) {
    Logger.log('LINE reply failed ' + res.getResponseCode() + ': ' + res.getContentText());
  }
}

/**
 * 画像メッセージの実体を取得する。
 * 通常の api.line.me ではなく api-data.line.me を使う点に注意。
 */
function fetchLineMessageContent_(messageId) {
  var res = UrlFetchApp.fetch(
    'https://api-data.line.me/v2/bot/message/' + encodeURIComponent(messageId) + '/content',
    {
      method: 'get',
      headers: { Authorization: 'Bearer ' + lineToken_() },
      muteHttpExceptions: true
    }
  );
  var code = res.getResponseCode();
  if (code !== 200) {
    throw new Error('LINE画像の取得に失敗しました (HTTP ' + code + ')\n' + res.getContentText());
  }
  return res.getBlob();
}

function truncate_(s, max) {
  s = String(s);
  return s.length <= max ? s : s.slice(0, max - 3) + '...';
}
