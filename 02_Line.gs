/**
 * 02_Line.gs
 * LINE Messaging API のヘルパー（返信・プッシュ）
 */

/** replyToken を使って即時返信 */
function lineReply_(replyToken, text) {
  if (!replyToken) return;
  const url = 'https://api.line.me/v2/bot/message/reply';
  const payload = {
    replyToken: replyToken,
    messages: [{ type: 'text', text: String(text).slice(0, 4900) }],
  };
  UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + getLineToken_() },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
}

/** userId 宛にプッシュ送信（月次レポート等で使用） */
function linePush_(userId, text) {
  if (!userId) return;
  const url = 'https://api.line.me/v2/bot/message/push';
  const payload = {
    to: userId,
    messages: [{ type: 'text', text: String(text).slice(0, 4900) }],
  };
  UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + getLineToken_() },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
}
