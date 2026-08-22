/**
 * ハヨヤレ — 01_SlackApi
 */
function slackApi_(method, params, useUserToken) {
  const userToken = PROPS.getProperty('SLACK_USER_TOKEN');
  const token = (useUserToken && userToken) ? userToken : PROPS.getProperty('SLACK_BOT_TOKEN');
  const res = UrlFetchApp.fetch('https://slack.com/api/' + method, {
    method: 'post',
    payload: params || {},
    headers: { Authorization: 'Bearer ' + token },
    muteHttpExceptions: true
  });
  const json = JSON.parse(res.getContentText() || '{}');
  if (!json.ok) console.warn(method + ' 失敗: ' + json.error);
  return json;
}

/** 会話履歴を差分取得（新しい順で返る）。DM(D…)はユーザートークン優先 */
function fetchHistory_(channel, oldestTs) {
  const params = { channel: channel, limit: 100 };
  if (oldestTs) params.oldest = oldestTs; // oldestは含まれない＝前回の続きから
  return slackApi_('conversations.history', params, channel.charAt(0) === 'D');
}

/** おばちゃん→自分のDMチャンネル（初回に開いてキャッシュ） */
function myDmChannel_() {
  let ch = PROPS.getProperty('DM_CHANNEL_ID');
  if (ch) return ch;
  const me = myUserId_();
  if (!me) throw new Error('MY_SLACK_USER_ID が未設定です');
  const json = slackApi_('conversations.open', { users: me });
  ch = json.channel && json.channel.id;
  if (ch) PROPS.setProperty('DM_CHANNEL_ID', ch);
  return ch;
}

/** おばちゃんが自分にDMを送る */
function obaDm_(text) {
  slackApi_('chat.postMessage', { channel: myDmChannel_(), text: text });
}
