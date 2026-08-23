/**
 * ハヨヤレ Chatwork版 — 01_CwApi
 * 認証はヘッダー X-ChatWorkToken 1本。レート上限は5分あたり300回（余裕）
 */
const CW_BASE = 'https://api.chatwork.com/v2';

function cwGet_(path) {
  const res = UrlFetchApp.fetch(CW_BASE + path, {
    method: 'get',
    headers: { 'X-ChatWorkToken': PROPS.getProperty('CHATWORK_API_TOKEN') },
    muteHttpExceptions: true
  });
  const code = res.getResponseCode();
  if (code === 204) return null; // 新着なし
  const body = res.getContentText() || '';
  if (code !== 200) {
    console.warn('GET ' + path + ' 失敗 (' + code + '): ' + body.slice(0, 200));
    return null;
  }
  return JSON.parse(body);
}

function cwPost_(path, params) {
  const res = UrlFetchApp.fetch(CW_BASE + path, {
    method: 'post',
    payload: params,
    headers: { 'X-ChatWorkToken': PROPS.getProperty('CHATWORK_API_TOKEN') },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) {
    console.warn('POST ' + path + ' 失敗 (' + res.getResponseCode() + '): ' + res.getContentText().slice(0, 200));
  }
}

/** マイチャット（自分専用ルーム）のID。初回に探してキャッシュ */
function myChatRoom_() {
  let id = PROPS.getProperty('MY_CHAT_ROOM_ID');
  if (id) return id;
  const rooms = cwGet_('/rooms') || [];
  const my = rooms.filter(r => r.type === 'my')[0];
  if (!my) throw new Error('マイチャットが見つかりません');
  id = String(my.room_id);
  PROPS.setProperty('MY_CHAT_ROOM_ID', id);
  return id;
}

/** おばちゃんがマイチャットに書き込む */
function obaDm_(text) {
  cwPost_('/rooms/' + myChatRoom_() + '/messages', { body: text });
}

/** Chatworkの装飾タグ（[To:xxx]等）をざっくり除去 */
function stripCwTags_(body) {
  return String(body)
    .replace(/\[(?:To|rp|返信|qt|qtmeta|info|title|hr|picon|piconname|task)[^\]]*\]/g, ' ')
    .replace(/\[\/(?:info|title|qt|code)\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
