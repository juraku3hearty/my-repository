/**
 * 鬼頭ゲート — 03_Gate
 * 巡回本体：キーワード付きメンションを拾って、未配布の人にDMでキットを送る
 * 配布ログはスプレッドシートに記録（同じ人への二重送信を防ぐ）
 */
function getLogSheet_() {
  const ss = SpreadsheetApp.openById(PROPS.getProperty('SPREADSHEET_ID'));
  let sh = ss.getSheetByName('配布ログ');
  if (!sh) {
    sh = ss.insertSheet('配布ログ');
    sh.appendRow(['日時', 'ユーザー名', 'ユーザーID', 'ツイートID', '結果']);
  }
  return sh;
}

function deliveredUserIds_() {
  const sh = getLogSheet_();
  const last = sh.getLastRow();
  if (last < 2) return {};
  const ids = {};
  sh.getRange(2, 3, last - 1, 3).getValues().forEach(v => {
    if (v[2] === 'DM送信済み') ids[String(v[0])] = true;
  });
  return ids;
}

/** 5〜10分おきトリガーで実行 */
function patrolGate() {
  const sinceId = PROPS.getProperty('LAST_MENTION_ID') || '';
  const result = fetchMentions_(sinceId);
  if (!result) return; // API失敗時は次の巡回でリトライ（since_id未更新なので取りこぼさない）

  const kitUrl = PROPS.getProperty('KIT_URL');
  if (!kitUrl) {
    console.warn('KIT_URL未設定。配布できません。');
    return;
  }

  const delivered = deliveredUserIds_();
  const myId = getMyUserId_();
  const sh = getLogSheet_();

  result.tweets.reverse().forEach(t => { // 古い順に処理
    if (t.authorId === myId) return;
    if (t.text.indexOf(GATE_KEYWORD) === -1) return;
    if (delivered[t.authorId]) {
      sh.appendRow([new Date(), t.username, t.authorId, t.id, '配布済みのためスキップ']);
      return;
    }
    const ok = sendDm_(t.authorId, DM_TEXT.replace('{url}', kitUrl));
    if (ok) {
      delivered[t.authorId] = true;
      sh.appendRow([new Date(), t.username, t.authorId, t.id, 'DM送信済み']);
    } else {
      replyTo_(t.id, REPLY_FALLBACK);
      sh.appendRow([new Date(), t.username, t.authorId, t.id, 'DM不達→リプライ案内']);
    }
    Utilities.sleep(2000); // 連投を避ける（レート・スパム対策）
  });

  if (result.newestId) PROPS.setProperty('LAST_MENTION_ID', result.newestId);
}
