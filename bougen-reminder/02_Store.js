/**
 * 暴言リマインダー — 02_Store
 * スプレッドシートにリマインドを保存
 * 列: A=日時, B=内容, C=状態(pending/fired/done), D=通知回数, E=最終通知
 */
function getSheet_() {
  const ss = SpreadsheetApp.openById(PROPS.getProperty('SPREADSHEET_ID'));
  let sh = ss.getSheetByName('リマインド');
  if (!sh) {
    sh = ss.insertSheet('リマインド');
    sh.appendRow(['日時', '内容', '状態', '通知回数', '最終通知']);
  }
  return sh;
}

function addReminder(date, task) {
  getSheet_().appendRow([date, task, 'pending', 0, '']);
}

function getRows_() {
  const sh = getSheet_();
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, 5).getValues().map((v, i) => ({
    row: i + 2,
    date: new Date(v[0]),
    task: String(v[1]),
    status: String(v[2]),
    nags: Number(v[3]) || 0,
    lastNag: v[4] ? new Date(v[4]) : null
  }));
}

/** 未完了（未発火含む）一覧 */
function listPending() {
  return getRows_()
    .filter(r => r.status !== 'done')
    .sort((a, b) => a.date - b.date);
}

/** いま通知すべきもの */
function getDue(now) {
  return getRows_().filter(r =>
    r.status !== 'done' &&
    r.date <= now &&
    r.nags < MAX_NAGS &&
    (!r.lastNag || now.getTime() - r.lastNag.getTime() >= NAG_INTERVAL_MIN * 60000)
  );
}

function recordNag(r, now) {
  getSheet_().getRange(r.row, 3, 1, 3).setValues([['fired', r.nags + 1, now]]);
}

/** 「やった」→ 発火中のものを全部完了にする。完了させた配列を返す */
function completeFired() {
  const fired = getRows_().filter(r => r.status === 'fired');
  const sh = getSheet_();
  fired.forEach(r => sh.getRange(r.row, 3).setValue('done'));
  return fired;
}

/** リスト表示のn番目を削除。削除した項目を返す（無ければnull） */
function deleteByIndex(n) {
  const pending = listPending();
  if (n < 1 || n > pending.length) return null;
  getSheet_().deleteRow(pending[n - 1].row);
  return pending[n - 1];
}
