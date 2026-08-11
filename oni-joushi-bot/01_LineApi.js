/**
 * 鬼上司Bot — 01_LineApi
 * Push = 無料枠 月200通を消費 / Reply = 無料・無制限
 */
const LINE_API_BASE = 'https://api.line.me/v2/bot';

function lineHeaders_() {
  return {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + PROPS.getProperty('LINE_CHANNEL_ACCESS_TOKEN')
  };
}

/** こちらから送る（無料枠を1通消費） */
function pushText(text) {
  const userId = PROPS.getProperty('USER_ID');
  if (!userId) {
    console.warn('USER_ID未登録。先にBotに何か話しかけてください。');
    return;
  }
  UrlFetchApp.fetch(LINE_API_BASE + '/message/push', {
    method: 'post',
    headers: lineHeaders_(),
    payload: JSON.stringify({
      to: userId,
      messages: [{ type: 'text', text: text }]
    }),
    muteHttpExceptions: true
  });
}

/** ユーザーの送信に返す（無料・無制限） */
function replyText(replyToken, text) {
  UrlFetchApp.fetch(LINE_API_BASE + '/message/reply', {
    method: 'post',
    headers: lineHeaders_(),
    payload: JSON.stringify({
      replyToken: replyToken,
      messages: [{ type: 'text', text: text }]
    }),
    muteHttpExceptions: true
  });
}
