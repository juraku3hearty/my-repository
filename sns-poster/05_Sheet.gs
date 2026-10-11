/**
 * 05_Sheet.gs — スプレッドシートへの読み書きと投稿日の決定
 *
 * 行は投稿日の昇順を保つように挿入する。Make 側は「投稿日 == 今日 かつ
 * 投稿済みが空」で拾うため並び順自体は必須ではないが、人が読めなくなるのを防ぐ。
 */

var WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

function getSheet_() {
  var ss = SpreadsheetApp.openById(spreadsheetId_());
  var sh = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sh) {
    throw new Error('シート「' + CONFIG.SHEET_NAME + '」が見つかりません。');
  }
  return sh;
}

/** A列の最終データ行を返す（末尾の空行を無視する） */
function lastDataRow_(sh) {
  var last = sh.getLastRow();
  if (last <= CONFIG.HEADER_ROWS) return CONFIG.HEADER_ROWS;
  var values = sh.getRange(CONFIG.HEADER_ROWS + 1, CONFIG.COL_DATE,
                           last - CONFIG.HEADER_ROWS, 1).getValues();
  for (var i = values.length - 1; i >= 0; i--) {
    if (values[i][0] !== '' && values[i][0] !== null) {
      return CONFIG.HEADER_ROWS + i + 1;
    }
  }
  return CONFIG.HEADER_ROWS;
}

/** 既存の投稿日を [{row, date}] で返す（昇順前提だが実データ順のまま） */
function readSchedule_(sh) {
  var last = lastDataRow_(sh);
  if (last <= CONFIG.HEADER_ROWS) return [];
  var values = sh.getRange(CONFIG.HEADER_ROWS + 1, CONFIG.COL_DATE,
                           last - CONFIG.HEADER_ROWS, 1).getValues();
  var out = [];
  for (var i = 0; i < values.length; i++) {
    var d = toDate_(values[i][0]);
    if (d) out.push({ row: CONFIG.HEADER_ROWS + i + 1, date: d });
  }
  return out;
}

/**
 * 投稿を追加する。
 * @param {string} dateStr 'yyyy/MM/dd' もしくは空文字（空なら自動割り当て）
 * @return {{row:number, dateStr:string, weekday:string}}
 */
function appendPost_(dateStr, text, imageUrl) {
  var sh = getSheet_();
  var schedule = readSchedule_(sh);

  var target = dateStr ? parseDateStr_(dateStr) : nextAutoDate_(schedule);
  if (!target) throw new Error('投稿日を解釈できませんでした: ' + dateStr);

  // 同じ日付の行があればその後ろ、なければ日付順の位置に挿入する
  var insertAt = null;
  for (var i = 0; i < schedule.length; i++) {
    if (schedule[i].date.getTime() > target.getTime()) {
      insertAt = schedule[i].row;
      break;
    }
  }

  var row;
  if (insertAt === null) {
    row = lastDataRow_(sh) + 1;
  } else {
    sh.insertRowBefore(insertAt);
    row = insertAt;
  }

  sh.getRange(row, CONFIG.COL_DATE).setValue(target).setNumberFormat('yyyy/mm/dd');
  sh.getRange(row, CONFIG.COL_TEXT).setValue(text);
  sh.getRange(row, CONFIG.COL_IMAGE).setValue(imageUrl);
  sh.getRange(row, CONFIG.COL_DONE).setValue(''); // Make が投稿後に埋める
  SpreadsheetApp.flush();

  return {
    row: row,
    dateStr: fmtDate_(target),
    weekday: WEEKDAYS[target.getDay()]
  };
}

/** 日付未指定時の投稿日: 既存の最終日 + N日。ただし必ず明日以降にする */
function nextAutoDate_(schedule) {
  var base = null;
  for (var i = 0; i < schedule.length; i++) {
    if (!base || schedule[i].date.getTime() > base.getTime()) base = schedule[i].date;
  }

  var tomorrow = todayJst_();
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (!base) return tomorrow;

  var candidate = new Date(base.getTime());
  candidate.setDate(candidate.getDate() + CONFIG.DEFAULT_INTERVAL_DAYS);
  return candidate.getTime() < tomorrow.getTime() ? tomorrow : candidate;
}

/** 直近の予約投稿を一覧表示用に整形する */
function describeUpcoming_(limit) {
  var sh = getSheet_();
  var last = lastDataRow_(sh);
  if (last <= CONFIG.HEADER_ROWS) return '登録された投稿はありません。';

  var values = sh.getRange(CONFIG.HEADER_ROWS + 1, 1, last - CONFIG.HEADER_ROWS, 4).getValues();
  var today = todayJst_().getTime();
  var rows = [];

  for (var i = 0; i < values.length; i++) {
    var d = toDate_(values[i][CONFIG.COL_DATE - 1]);
    if (!d || d.getTime() < today) continue;
    rows.push({
      date: d,
      row: CONFIG.HEADER_ROWS + i + 1,
      text: String(values[i][CONFIG.COL_TEXT - 1] || ''),
      hasImage: !!values[i][CONFIG.COL_IMAGE - 1],
      done: !!values[i][CONFIG.COL_DONE - 1]
    });
  }

  if (!rows.length) return '今日以降の予約投稿はありません。';

  rows.sort(function (a, b) { return a.date - b.date; });
  rows = rows.slice(0, limit || 10);

  var lines = ['📅 今日以降の予約投稿', ''];
  rows.forEach(function (r) {
    var head = r.text.split('\n')[0];
    lines.push(
      fmtDate_(r.date) + '(' + WEEKDAYS[r.date.getDay()] + ') ' +
      (r.done ? '✅' : '🕒') + (r.hasImage ? '' : ' ⚠️画像なし')
    );
    lines.push('　' + truncate_(head, 40));
  });
  return lines.join('\n');
}

/* ---------- 日付ユーティリティ ---------- */

function todayJst_() {
  var s = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy/MM/dd');
  var p = s.split('/');
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
}

function fmtDate_(d) {
  return Utilities.formatDate(d, CONFIG.TIMEZONE, 'yyyy/MM/dd');
}

function toDate_(v) {
  if (v instanceof Date) {
    return new Date(v.getFullYear(), v.getMonth(), v.getDate());
  }
  if (typeof v === 'string' && v.trim()) {
    return parseDateStr_(v.trim());
  }
  return null;
}

/**
 * '2026/10/15' '10/15' '10月15日' を Date に変換する。
 * 年が省略された場合は「今日以降になる最も近い年」を採用する。
 */
function parseDateStr_(s) {
  s = String(s).trim();

  var m = s.match(/^(\d{4})[\/\-年](\d{1,2})[\/\-月](\d{1,2})日?$/);
  if (m) {
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }

  m = s.match(/^(\d{1,2})[\/\-月](\d{1,2})日?$/);
  if (m) {
    var today = todayJst_();
    var d = new Date(today.getFullYear(), Number(m[1]) - 1, Number(m[2]));
    if (d.getTime() < today.getTime()) {
      d = new Date(today.getFullYear() + 1, Number(m[1]) - 1, Number(m[2]));
    }
    return d;
  }
  return null;
}

/**
 * 本文の先頭行が日付だけの行なら、日付と残りの本文に切り分ける。
 * 例: "10/15\n今日は…" → {dateStr:'2026/10/15', rest:'今日は…'}
 */
function extractLeadingDate_(text) {
  var lines = String(text).split('\n');
  var first = lines[0].trim();
  var d = parseDateStr_(first);
  if (d) {
    return { dateStr: fmtDate_(d), rest: lines.slice(1).join('\n').replace(/^\n+/, '') };
  }
  return { dateStr: '', rest: text };
}
