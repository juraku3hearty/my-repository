/**
 * 01_Setup.gs : スプレッドシートの初期化と共通ユーティリティ
 * 最初に一度だけ initialize() を実行する。
 */

/** 初期化：必要なシートとヘッダーをすべて用意する */
function initialize() {
  const ss = ss_();

  ensureSheet_(CONFIG.SHEET_VIDEOS, VIDEO_HEADERS, [110, 320, 260, 90, 110, 100, 140, 140, 90, 110, 240]);
  ensureSheet_(CONFIG.SHEET_KNOWLEDGE, KB_HEADERS, [140, 150, 320, 520, 220, 260, 260, 110, 110, 100, 300, 90, 90, 110, 140, 140]);
  ensureSheet_(CONFIG.SHEET_REVIEW, REVIEW_HEADERS, [140, 90, 150, 320, 420, 300, 260, 140, 110, 140, 90, 300]);
  ensureSheet_(CONFIG.SHEET_TRANSCRIPT, TR_HEADERS, [110, 260, 80, 90, 140, 900]);
  ensureSheet_(CONFIG.SHEET_LOG, ['日時', '処理', '内容'], [140, 180, 800]);

  setupCategorySheet_(ss);
  setupSearchSheet_(ss);
  applyValidations_(ss);

  log_('initialize', '初期化完了');
  SpreadsheetApp.getActive && Logger.log('初期化完了');
}

/** シートが無ければ作り、ヘッダーを整える */
function ensureSheet_(name, headers, widths) {
  const ss = ss_();
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);

  sh.getRange(1, 1, 1, headers.length).setValues([headers])
    .setFontWeight('bold')
    .setBackground('#efefef')
    .setVerticalAlignment('middle');
  sh.setFrozenRows(1);
  if (widths) widths.forEach(function(w, i) { sh.setColumnWidth(i + 1, w); });
  return sh;
}

/** カテゴリーマスタ */
function setupCategorySheet_(ss) {
  let sh = ss.getSheetByName(CONFIG.SHEET_CATEGORY);
  if (!sh) sh = ss.insertSheet(CONFIG.SHEET_CATEGORY);
  sh.clear();
  sh.getRange(1, 1, 1, 2).setValues([['カテゴリー', '説明']]).setFontWeight('bold').setBackground('#efefef');
  const rows = CATEGORIES.map(function(c) { return [c, '']; });
  sh.getRange(2, 1, rows.length, 2).setValues(rows);
  sh.setColumnWidth(1, 180);
  sh.setColumnWidth(2, 400);
  sh.setFrozenRows(1);
}

/** 会員向け検索シート（キーワードを1か所入れるだけで絞り込める） */
function setupSearchSheet_(ss) {
  let sh = ss.getSheetByName(CONFIG.SHEET_SEARCH);
  if (!sh) sh = ss.insertSheet(CONFIG.SHEET_SEARCH);
  sh.clear();
  sh.getRange('A1').setValue('キーワード').setFontWeight('bold');
  sh.getRange('C1').setValue('確認済のみ表示(TRUE/FALSE)').setFontWeight('bold');
  sh.getRange('C2').setValue(true);
  sh.getRange('A2').setBackground('#fff2cc').setBorder(true, true, true, true, false, false);

  const header = ['ナレッジID', 'カテゴリー', '質問', '回答候補', '元動画URL', '開始時刻', '確認ステータス'];
  sh.getRange(4, 1, 1, header.length).setValues([header]).setFontWeight('bold').setBackground('#efefef');

  // ナレッジシートから キーワード一致 かつ（確認済フィルタ）で絞り込む
  const formula =
    '=IFERROR(' +
    'LET(' +
    'kw, TO_TEXT($A$2), onlyApproved, $C$2, ' +
    'src, FILTER(' +
    "'" + CONFIG.SHEET_KNOWLEDGE + "'!A2:P, " +
    "'" + CONFIG.SHEET_KNOWLEDGE + "'!A2:A<>\"\", " +
    'IF(kw="", TRUE, ' +
    "REGEXMATCH(" +
    "'" + CONFIG.SHEET_KNOWLEDGE + "'!B2:B&\" \"&" +
    "'" + CONFIG.SHEET_KNOWLEDGE + "'!C2:C&\" \"&" +
    "'" + CONFIG.SHEET_KNOWLEDGE + "'!D2:D&\" \"&" +
    "'" + CONFIG.SHEET_KNOWLEDGE + "'!E2:E&\" \"&" +
    "'" + CONFIG.SHEET_KNOWLEDGE + "'!F2:F, kw)), " +
    'IF(onlyApproved, ' + "'" + CONFIG.SHEET_KNOWLEDGE + "'!J2:J=\"" + CONFIG.REVIEW_STATUS.APPROVED + "\", TRUE)), " +
    'CHOOSECOLS(src, 1, 2, 3, 4, 7, 8, 10)' +
    '), "該当なし")';
  sh.getRange('A5').setFormula(formula);

  sh.setColumnWidth(1, 140);
  sh.setColumnWidth(2, 150);
  sh.setColumnWidth(3, 320);
  sh.setColumnWidth(4, 520);
  sh.setColumnWidth(5, 260);
  sh.setColumnWidth(6, 100);
  sh.setColumnWidth(7, 110);
  sh.setFrozenRows(4);
}

/** 入力規則（確認ステータス・判定・カテゴリー） */
function applyValidations_(ss) {
  const kb = ss.getSheetByName(CONFIG.SHEET_KNOWLEDGE);
  const review = ss.getSheetByName(CONFIG.SHEET_REVIEW);
  const statuses = [
    CONFIG.REVIEW_STATUS.PENDING,
    CONFIG.REVIEW_STATUS.APPROVED,
    CONFIG.REVIEW_STATUS.REJECTED,
    CONFIG.REVIEW_STATUS.NOT_REQUIRED
  ];

  const statusRule = SpreadsheetApp.newDataValidation().requireValueInList(statuses, true).setAllowInvalid(false).build();
  kb.getRange(2, COL_KB.REVIEW_STATUS, kb.getMaxRows() - 1, 1).setDataValidation(statusRule);

  const judgeRule = SpreadsheetApp.newDataValidation()
    .requireValueInList([CONFIG.REVIEW_STATUS.APPROVED, CONFIG.REVIEW_STATUS.REJECTED], true)
    .setAllowInvalid(false).build();
  review.getRange(2, COL_REVIEW.JUDGEMENT, review.getMaxRows() - 1, 1).setDataValidation(judgeRule);

  const expertRule = SpreadsheetApp.newDataValidation().requireValueInList(EXPERT_TYPES, true).setAllowInvalid(true).build();
  kb.getRange(2, COL_KB.EXPERT_TYPE, kb.getMaxRows() - 1, 1).setDataValidation(expertRule);
}

/** ログ出力（ログシート + Stackdriver） */
function log_(fn, message) {
  Logger.log('[' + fn + '] ' + message);
  try {
    const sh = ss_().getSheetByName(CONFIG.SHEET_LOG);
    if (sh) sh.appendRow([new Date(), fn, String(message).slice(0, 2000)]);
  } catch (e) {
    Logger.log('ログ書き込み失敗: ' + e.message);
  }
}

/** 実行時間の残りを見る（GASの6分制限対策） */
function newDeadline_() {
  const start = Date.now();
  return {
    expired: function() { return Date.now() - start > CONFIG.MAX_RUNTIME_MS; },
    elapsedSec: function() { return Math.round((Date.now() - start) / 1000); }
  };
}

/** 秒 → HH:MM:SS */
function secToHms_(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return [h, m, ss].map(function(n) { return ('0' + n).slice(-2); }).join(':');
}

/** HH:MM:SS(.mmm) → 秒 */
function hmsToSec_(hms) {
  if (hms === null || hms === undefined || hms === '') return 0;
  const str = String(hms).trim();
  const m = str.match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?$/);
  if (!m) {
    const n = Number(str);
    return isNaN(n) ? 0 : n;
  }
  const h = Number(m[1] || 0);
  const mi = Number(m[2]);
  const s = Number(m[3]);
  const ms = Number(m[4] || 0) / 1000;
  return h * 3600 + mi * 60 + s + ms;
}

/** 動画URL + 時刻 → 該当箇所へ飛ぶURL */
function videoUrlWithTime_(url, startSec) {
  if (!url) return '';
  const sec = Math.max(0, Math.floor(Number(startSec) || 0));
  return url.split('#')[0] + '#t=' + sec + 's';
}
