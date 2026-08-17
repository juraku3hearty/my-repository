/**
 * 鬼頭ゲート — 02_XApi
 * 必要なX APIは3つだけ: 自分の確認 / メンション取得 / DM送信（＋失敗時の公開リプライ）
 */

/** 自分のユーザーID（初回だけAPIを呼び、以後キャッシュ） */
function getMyUserId_() {
  let id = PROPS.getProperty('X_MY_USER_ID');
  if (id) return id;
  const res = xGet_('/users/me', {});
  if (res.code !== 200) throw new Error('users/me 失敗 (' + res.code + '): ' + JSON.stringify(res.body));
  id = res.body.data.id;
  PROPS.setProperty('X_MY_USER_ID', id);
  PROPS.setProperty('X_MY_USERNAME', res.body.data.username);
  return id;
}

/** 自分宛のメンションを差分取得（since_id方式＝読み取り最小） */
function fetchMentions_(sinceId) {
  const params = {
    max_results: 100,
    'tweet.fields': 'author_id,conversation_id',
    expansions: 'author_id',
    'user.fields': 'username'
  };
  if (sinceId) params.since_id = sinceId;
  const res = xGet_('/users/' + getMyUserId_() + '/mentions', params);
  if (res.code !== 200) {
    console.warn('mentions取得失敗 (' + res.code + '): ' + JSON.stringify(res.body));
    return null;
  }
  const users = {};
  ((res.body.includes || {}).users || []).forEach(u => { users[u.id] = u.username; });
  return {
    newestId: (res.body.meta || {}).newest_id || sinceId,
    tweets: (res.body.data || []).map(t => ({
      id: t.id,
      text: t.text,
      authorId: t.author_id,
      username: users[t.author_id] || ''
    }))
  };
}

/** DM送信。成功でtrue */
function sendDm_(participantId, text) {
  const res = xPost_('/dm_conversations/with/' + participantId + '/messages', { text: text });
  if (res.code === 201 || res.code === 200) return true;
  console.warn('DM送信失敗 (' + res.code + '): ' + JSON.stringify(res.body));
  return false;
}

/** 公開リプライ（DM不達時のフォールバック） */
function replyTo_(tweetId, text) {
  const res = xPost_('/tweets', { text: text, reply: { in_reply_to_tweet_id: tweetId } });
  if (res.code !== 201) console.warn('リプライ失敗 (' + res.code + '): ' + JSON.stringify(res.body));
}
