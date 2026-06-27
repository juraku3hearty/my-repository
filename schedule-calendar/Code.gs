/**
 * 予定表 → Googleカレンダー 自動登録システム（100チャレ）
 * ------------------------------------------------------------------
 * 学校の行事予定表や部活動の予定表（写真/PDF）をフォルダに入れると、
 * Geminiで読み取り、確認シートに一覧化（怪しい所は色付け）。
 * 人が確認したあと、ボタンでGoogleカレンダーへ登録する。
 *
 *  予定表(PDF/写真) → フォルダ投入
 *      → OCR(Flash×2＋Pro全件再読＋論理チェック)
 *      → 確認シート（日付/時刻/予定名、怪しい所は色）
 *      → 人が確認・修正
 *      → ボタンでカレンダー登録（時刻あり=時間付き / 無し=終日）
 *
 * タイムカードOCRと同じ2段構え・同じ品質チェックを流用。
 */

const CONFIG = {
  GEMINI_MODEL: 'gemini-3.5-flash',     // 認識率最優先（2回読む）
  RECHECK_WITH_PRO: true,
  RECHECK_MODEL: 'gemini-2.5-pro',      // 全件再読の上位モデル

  // 設置時に setupSystem が自動設定（スクリプトプロパティに保存）
  UNPROCESSED_FOLDER_ID: '',
  CONFIRM_SHEET_ID: '',
  CONFIRM_TAB: '確認',
  SETTING_TAB: '設定',

  // 登録先カレンダー。'primary' = 普段使うメインカレンダー。
  // 専用カレンダーにするときは、そのカレンダーIDに変更。
  CALENDAR_ID: 'primary',

  DEFAULT_YEAR: 2026,  // 予定表に西暦が無いとき使う年
};

const COLOR_MISMATCH = '#fff3b0'; // 🟡 2回の読みが食い違い
const COLOR_UNREAD   = '#ffc7ce'; // 🟥 読めなかった
const COLOR_CHECK    = '#ffd9a0'; // 🟧 上位AIと食い違い/論理矛盾

/* ============ メニュー ============ */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('予定表→カレンダー')
    .addItem('① 初期セットアップ', 'setupSystem')
    .addItem('② 接続テスト', 'selfTest')
    .addItem('予定表を読み取り', 'processSchedules')
    .addItem('★ カレンダーに登録', 'registerToCalendar')
    .addToUi();
}

/* ============ 設定の解決 ============ */
function getConfig_() {
  const p = PropertiesService.getScriptProperties();
  return {
    unprocessedFolderId: p.getProperty('UNPROCESSED_FOLDER_ID') || CONFIG.UNPROCESSED_FOLDER_ID,
    confirmSheetId:      p.getProperty('CONFIRM_SHEET_ID')      || CONFIG.CONFIRM_SHEET_ID,
  };
}

/** 設定タブから「お子さんの学年」を読む（1/2/3、未設定なら null=全部入れる） */
function getGrade_(ss) {
  const sh = ss.getSheetByName(CONFIG.SETTING_TAB);
  if (!sh) return null;
  const v = sh.getRange('B1').getValue();
  const n = parseInt(v, 10);
  return (n >= 1 && n <= 3) ? n : null;
}

/** 設定タブから「お子さんの名前」を読む（専用カレンダー名に使う） */
function getChildName_(ss) {
  const sh = ss.getSheetByName(CONFIG.SETTING_TAB);
  return sh ? String(sh.getRange('B2').getValue() || '').trim() : '';
}

/** 登録先カレンダーを決める：お子さんの名前があれば「○○の予定」専用カレンダーを作って使う／無ければメイン */
function resolveCalendar_(ss) {
  const p = PropertiesService.getScriptProperties();
  const saved = p.getProperty('CHILD_CALENDAR_ID');
  if (saved) {
    const c = CalendarApp.getCalendarById(saved);
    if (c) return c;
  }
  const name = getChildName_(ss);
  if (!name) return CalendarApp.getDefaultCalendar();      // 名前未設定ならメインカレンダー
  const calName = name + 'の予定';
  const found = CalendarApp.getCalendarsByName(calName);
  const cal = (found && found.length) ? found[0] : CalendarApp.createCalendar(calName);
  p.setProperty('CHILD_CALENDAR_ID', cal.getId());
  return cal;
}

/* ============ 初期セットアップ ============ */
/**
 * デプロイ後に1回実行：未処理フォルダ・確認タブ・設定タブ・自動実行を用意し、
 * 各IDをスクリプトプロパティに記録する。人がやるのはAPIキー登録と学年入力だけ。
 */
function setupSystem() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const p = PropertiesService.getScriptProperties();

  // 確認タブ＋見出し
  let sh = ss.getSheetByName(CONFIG.CONFIRM_TAB) || ss.insertSheet(CONFIG.CONFIRM_TAB);
  if (sh.getLastRow() === 0) {
    sh.appendRow(['年','月','日','開始','終了','予定名','対象学年','登録済']);
  }

  // 設定タブ（学年・お子さんの名前・共有先をここで管理）
  let st = ss.getSheetByName(CONFIG.SETTING_TAB) || ss.insertSheet(CONFIG.SETTING_TAB);
  if (st.getRange('A1').getValue() === '') {
    st.getRange('A1:B3').setValues([
      ['お子さんの学年（1〜3）', 1],
      ['お子さんの名前（専用カレンダー名になります）', ''],
      ['共有したい人のメール（任意・いなければ空欄）', '']
    ]);
    st.getRange('A5').setValue('★毎年、学年が上がったら B1 の数字を変えてください（1〜3）★');
    st.getRange('A1:A3').setFontWeight('bold');
    st.getRange('B1').setBackground('#fff3b0');
    st.getRange('B2').setBackground('#fff3b0');
    st.setColumnWidth(1, 280); st.setColumnWidth(2, 260);
  }

  // 未処理フォルダ
  const folderName = '予定表＿未処理';
  const itf = DriveApp.getFoldersByName(folderName);
  const folder = itf.hasNext() ? itf.next() : DriveApp.createFolder(folderName);

  p.setProperty('CONFIRM_SHEET_ID', ss.getId());
  p.setProperty('UNPROCESSED_FOLDER_ID', folder.getId());

  // 自動読み取り（10分ごと）
  ScriptApp.getProjectTriggers().forEach(function(t){
    if (t.getHandlerFunction() === 'processSchedules') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('processSchedules').timeBased().everyMinutes(10).create();

  const msg = 'セットアップ完了。\n未処理フォルダ: ' + folder.getUrl() +
              '\n①「設定」タブで 学年(B1)・お子さんの名前(B2)・共有先メール(B3) を入力' +
              '\n②APIキーをスクリプトプロパティ GEMINI_API_KEY に登録' +
              '\n③「★カレンダーに登録」で、お子さん名の専用カレンダーに入ります';
  try { SpreadsheetApp.getUi().alert(msg); } catch(e) { Logger.log(msg); }
}

/* ============ 接続テスト ============ */
function selfTest() {
  const ui = (function(){ try { return SpreadsheetApp.getUi(); } catch(e){ return null; } })();
  let msg;
  try {
    const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
    if (!apiKey) throw new Error('GEMINI_API_KEY が未設定です');
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/'
              + CONFIG.GEMINI_MODEL + ':generateContent?key=' + apiKey;
    const res = UrlFetchApp.fetch(url, {
      method:'post', contentType:'application/json',
      payload: JSON.stringify({ contents:[{ parts:[{ text:'「OK」とだけ返して' }] }] }),
      muteHttpExceptions:true
    });
    if (res.getResponseCode() !== 200) throw new Error('APIエラー ' + res.getResponseCode() + '：' + res.getContentText().slice(0,200));
    msg = '接続OK：APIキー・課金・モデル（' + CONFIG.GEMINI_MODEL + '）正常です。';
  } catch(e) { msg = '接続NG：' + e.message; }
  if (ui) ui.alert(msg); else Logger.log(msg);
}

/* ============ メイン：予定表を読み取り → 確認シート ============ */
function processSchedules() {
  const cfg = getConfig_();
  const folder = DriveApp.getFolderById(cfg.unprocessedFolderId);
  const ss = SpreadsheetApp.openById(cfg.confirmSheetId);
  const sheet = ss.getSheetByName(CONFIG.CONFIRM_TAB);
  if (!sheet) throw new Error('確認タブが見つかりません');

  const it = folder.getFiles();
  let processed = 0;
  while (it.hasNext()) {
    const file = it.next();
    const mime = file.getMimeType();
    if (!isImageMime_(mime) && mime !== 'application/pdf') continue;
    if (processOneFile_(file.getBlob(), file.getName(), sheet)) processed++;
  }
  Logger.log('完了: ' + processed + 'ファイル処理');
}

/** 1ファイル（画像/PDF）をOCRして確認シートに追記。成功でtrue */
function processOneFile_(blob, name, sheet) {
  try {
    const data = Utilities.base64Encode(blob.getBytes());
    const mime = blob.getContentType();

    // Flash×2（温度差）＋Pro再読 を並行
    const reqs = [
      buildOcrRequest_(data, mime, CONFIG.GEMINI_MODEL, 0.0),
      buildOcrRequest_(data, mime, CONFIG.GEMINI_MODEL, 0.5)
    ];
    const proIdx = CONFIG.RECHECK_WITH_PRO
      ? reqs.push(buildOcrRequest_(data, mime, CONFIG.RECHECK_MODEL, 0.0)) - 1 : -1;
    const res = UrlFetchApp.fetchAll(reqs);

    const a = parseOcr_(res[0]);
    const b = parseOcr_(res[1]);
    const rows = buildEvents_(a, b, name);

    if (proIdx >= 0) {
      try { crossCheckPro_(rows, parseOcr_(res[proIdx])); }
      catch(e) { Logger.log('Pro再読スキップ（' + CONFIG.RECHECK_MODEL + '）: ' + e.message); }
    }
    writeRows_(sheet, rows);
    Logger.log('OK: ' + name + ' (' + rows.length + '件)');
    return true;
  } catch (err) {
    Logger.log('NG: ' + name + ' / ' + err.message);
    return false;
  }
}

/* ============ Gemini ============ */
const OCR_PROMPT =
  'これは学校または部活動の月間予定表（写真またはPDF）です。各日付の予定を読み取り、厳密なJSONで返してください。\n' +
  '【無視するもの】授業の時間割グリッド（1年/2年/3年 × 1〜6限の○などの記号の表）は読まないでください。\n' +
  '【読むもの】日付ごとの「行事・イベント・部活動の時間」だけです。\n' +
  '  - year_western: 西暦（無ければ推測せず null）\n' +
  '  - month: 月（1〜12）\n' +
  '  - events: 配列。各要素:\n' +
  '      day   : 日（1〜31）\n' +
  '      start : 開始時刻 "H:MM"（時刻があれば。無ければ null）\n' +
  '      end   : 終了時刻 "H:MM"（無ければ null）\n' +
  '      title : 予定名（例 運動会／期末考査1日目／部活動）。時刻だけで内容が無い日は "部活動"\n' +
  '      grade : その予定が特定学年向けなら 1/2/3、学校全体や部活なら null\n' +
  '      allday: 時刻が無い終日予定なら true、時間付きなら false\n' +
  '【除外】「OFF」「なし」「休み」など予定が無い日は出力しないでください。\n' +
  '読み取れない箇所は推測せず null にしてください（後で人が確認します）。\n' +
  '出力例:\n' +
  '{"year_western":2026,"month":6,"events":[{"day":6,"start":null,"end":null,"title":"運動会","grade":null,"allday":true},{"day":2,"start":"16:00","end":"18:00","title":"部活動","grade":null,"allday":false}]}';

function buildOcrRequest_(b64, mime, model, temp) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!apiKey) throw new Error('スクリプトプロパティ GEMINI_API_KEY が未設定です');
  return {
    url: 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + apiKey,
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify({
      contents: [{ parts: [{ text: OCR_PROMPT }, { inline_data: { mime_type: mime, data: b64 } }] }],
      generationConfig: { temperature: temp, responseMimeType: 'application/json' }
    }),
    muteHttpExceptions: true
  };
}

function parseOcr_(res) {
  if (res.getResponseCode() !== 200) {
    throw new Error('Gemini API ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 300));
  }
  const j = JSON.parse(res.getContentText());
  return JSON.parse(j.candidates[0].content.parts[0].text);
}

/* ============ 2回分を突き合わせ、確認シート用の行に ============ */
function buildEvents_(a, b, fileName) {
  const year  = a.year_western || b.year_western || CONFIG.DEFAULT_YEAR;
  const month = a.month || b.month;

  const mapA = indexEvents_(a.events);
  const mapB = indexEvents_(b.events);
  const keys = Object.keys(mapA).concat(Object.keys(mapB)).filter((v,i,s)=>s.indexOf(v)===i);

  const out = [];
  keys.forEach(function(k) {
    const ea = mapA[k] || {}, eb = mapB[k] || {};
    const day = ea.day || eb.day;
    if (!day) return;
    const title = reconcile_(norm_(ea.title), norm_(eb.title));
    const start = reconcile_(normT_(ea.start), normT_(eb.start));
    const end   = reconcile_(normT_(ea.end),   normT_(eb.end));
    const grade = (ea.grade || eb.grade || '');
    out.push({ year:year, month:month, day:day, start:start, end:end, title:title, grade:grade });
  });
  out.sort(function(x,y){ return (x.day - y.day) || 0; });
  return out;
}

function indexEvents_(events) {
  const m = {};
  (events||[]).forEach(function(e){
    if (e && e.day) m[e.day + '|' + (e.title||'') ] = e;
  });
  return m;
}

function reconcile_(va, vb) {
  if (!va && !vb) return { value:'', flag:'' };
  if (!va || !vb) return { value: va||vb, flag:'mismatch' };
  if (va !== vb)  return { value: va, flag:'mismatch' };
  return { value: va, flag:'' };
}

/** Pro再読と突き合わせ（食い違い＝色＋メモ） */
function crossCheckPro_(rows, pro) {
  const map = indexEvents_(pro.events);
  rows.forEach(function(r){
    // 日付＋予定名でゆるく対応付け
    const key = Object.keys(map).filter(function(k){ return map[k].day == r.day; });
    if (!key.length) return;
    const p = map[key[0]];
    compareToPro_(r.title, norm_(p.title));
    compareToPro_(r.start, normT_(p.start));
    compareToPro_(r.end,   normT_(p.end));
  });
}
function compareToPro_(cell, proVal) {
  if (!proVal || !cell) return;
  if (cell.value && cell.value !== proVal) {
    cell.flag = upgrade_(cell.flag, 'check');
    cell.note = 'Pro再読: ' + proVal;
  }
}

/* ============ 確認シート書き込み ============ */
function writeRows_(sheet, rows) {
  if (!rows.length) return;
  const startRow = sheet.getLastRow() + 1;
  const values = rows.map(function(r){
    return [r.year, r.month, r.day, r.start.value, r.end.value, r.title.value, r.grade, ''];
  });
  sheet.getRange(startRow, 1, values.length, 8).setValues(values);
  rows.forEach(function(r,i){
    const row = startRow + i;
    paint_(sheet, row, 4, r.start.flag);
    paint_(sheet, row, 5, r.end.flag);
    paint_(sheet, row, 6, r.title.flag);
    if (r.start.note) sheet.getRange(row,4).setNote(r.start.note);
    if (r.end.note)   sheet.getRange(row,5).setNote(r.end.note);
    if (r.title.note) sheet.getRange(row,6).setNote(r.title.note);
  });
}
function paint_(sheet, row, col, flag) {
  if (flag === 'unread') sheet.getRange(row,col).setBackground(COLOR_UNREAD);
  else if (flag === 'mismatch') sheet.getRange(row,col).setBackground(COLOR_MISMATCH);
  else if (flag === 'check') sheet.getRange(row,col).setBackground(COLOR_CHECK);
}

/* ============ ★ カレンダー登録 ============ */
/**
 * 確認シートの内容を、設定の学年で絞り込みつつ Googleカレンダーへ登録。
 * 時刻あり=時間付きイベント / 無し=終日。登録済みの行はスキップ（重複防止）。
 */
function registerToCalendar() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.CONFIRM_TAB);
  const grade = getGrade_(ss);
  const cal = resolveCalendar_(ss);   // お子さん名の専用カレンダー（名前未設定ならメイン）

  const last = sheet.getLastRow();
  if (last < 2) { toast_(ss, '登録する予定がありません'); return; }
  const data = sheet.getRange(2, 1, last - 1, 8).getValues();

  let added = 0, skipped = 0, filtered = 0;
  for (let i = 0; i < data.length; i++) {
    const [y, m, d, start, end, title, evGrade, done] = data[i];
    if (done) { skipped++; continue; }
    if (!y || !m || !d || !title) continue;

    // 学年フィルタ：対象学年が指定されていて、設定学年と違うなら入れない
    if (evGrade !== '' && evGrade != null && grade != null && parseInt(evGrade,10) !== grade) {
      filtered++; continue;
    }

    const title2 = String(title);

    // ★重複防止：その日に同じ（または近い）予定が既にあれば作らない
    //   → 試合要項と月間カレンダーで同じ予定が来ても二重に入らない＝消す作業が不要
    const dayDate = makeDate_(y, m, d, '00:00');
    const already = cal.getEventsForDay(dayDate).some(function(ev){ return sameEvent_(ev.getTitle(), title2); });
    if (already) {
      sheet.getRange(i + 2, 8).setValue('既存');
      skipped++;
      continue;
    }

    try {
      if (start && String(start).match(/^\d{1,2}:\d{2}$/)) {
        const s = makeDate_(y, m, d, String(start));
        const e = (end && String(end).match(/^\d{1,2}:\d{2}$/)) ? makeDate_(y, m, d, String(end))
                                                                : new Date(s.getTime() + 60*60*1000);
        cal.createEvent(title2, s, e);
      } else {
        cal.createAllDayEvent(title2, makeDate_(y, m, d, '00:00'));
      }
      sheet.getRange(i + 2, 8).setValue('✓');
      added++;
    } catch (err) {
      Logger.log('登録NG: ' + y + '/' + m + '/' + d + ' ' + title2 + ' / ' + err.message);
    }
  }
  toast_(ss, '登録完了：追加 ' + added + ' / 既登録スキップ ' + skipped + ' / 学年で除外 ' + filtered);
}

/* ============ ヘルパー ============ */
function makeDate_(y, m, d, hhmm) {
  const t = String(hhmm).match(/^(\d{1,2}):(\d{2})$/);
  const hh = t ? parseInt(t[1],10) : 0, mm = t ? parseInt(t[2],10) : 0;
  return new Date(parseInt(y,10), parseInt(m,10) - 1, parseInt(d,10), hh, mm);
}
/** 同じ予定とみなすか（空白を無視して、一致 or 片方がもう片方を含む） */
function sameEvent_(a, b) {
  const x = String(a).replace(/\s/g, ''), y = String(b).replace(/\s/g, '');
  if (!x || !y) return false;
  return x === y || x.indexOf(y) >= 0 || y.indexOf(x) >= 0;
}
function isImageMime_(mime) { return mime === 'image/jpeg' || mime === 'image/png'; }
function upgrade_(cur, next) { const r={'':0,'check':1,'mismatch':2,'unread':3}; return r[next]>r[cur]?next:cur; }
function norm_(s) { return s == null ? '' : String(s).trim(); }
function normT_(t) {
  if (!t) return '';
  const m = String(t).replace(/：/g,':').match(/(\d{1,2}):(\d{2})/);
  return m ? (parseInt(m[1],10) + ':' + m[2]) : '';
}
function toast_(ss, msg) { try { ss.toast(msg, '予定表→カレンダー', 8); } catch(e) { Logger.log(msg); } }
