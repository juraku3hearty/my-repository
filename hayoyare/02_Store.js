/**
 * ハヨヤレ — 02_Store
 * タスクはスプレッドシートに保存
 * 列: A=登録日時, B=依頼者, C=内容, D=期限, E=状態(pending/nagging/done/cancelled), F=通知回数, G=元メッセージ, H=会話ID
 */
function getSheet_() {
  const ss = SpreadsheetApp.openById(PROPS.getProperty('SPREADSHEET_ID'));
  let sh = ss.getSheetByName('タスク');
  if (!sh) {
    sh = ss.insertSheet('タスク');
    sh.appendRow(['登録日時', '依頼者', '内容', '期限', '状態', '通知回数', '元メッセージ', '会話ID']);
  }
  return sh;
}

function addTask(bossName, task, due, original, channel) {
  getSheet_().appendRow([new Date(), bossName, task, due, 'pending', 0, original || '', channel || '']);
}

function getRows_() {
  const sh = getSheet_();
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, 8).getValues().map((v, i) => ({
    row: i + 2,
    created: new Date(v[0]),
    boss: String(v[1]),
    task: String(v[2]),
    due: v[3] ? new Date(v[3]) : null,
    status: String(v[4]),
    nags: Number(v[5]) || 0,
    original: String(v[6] || ''),
    channel: String(v[7] || '')
  }));
}

function listOpen() {
  return getRows_()
    .filter(r => r.status === 'pending' || r.status === 'nagging')
    .sort((a, b) => (a.due || a.created) - (b.due || b.created));
}

/** 「やった」→ 催促中を完了。催促中が無ければ一番古い未完了を完了 */
function completeTasks() {
  const sh = getSheet_();
  const nagging = getRows_().filter(r => r.status === 'nagging');
  const targets = nagging.length ? nagging : listOpen().slice(0, 1);
  targets.forEach(r => sh.getRange(r.row, 5).setValue('done'));
  return targets;
}

/** 「ちゃう」→ 直近に登録された未催促タスクを取り消し */
function cancelLatest() {
  const candidates = getRows_()
    .filter(r => r.status === 'pending' && r.nags === 0)
    .sort((a, b) => b.created - a.created);
  if (!candidates.length) return null;
  getSheet_().getRange(candidates[0].row, 5).setValue('cancelled');
  return candidates[0];
}

function recordNag_(r) {
  getSheet_().getRange(r.row, 5, 1, 2).setValues([['nagging', r.nags + 1]]);
}
