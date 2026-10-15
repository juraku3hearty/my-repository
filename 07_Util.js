/**
 * 07_Util.js
 * 共通ユーティリティ
 */

/** スプレッドシートを開く */
function openBook_() {
  var id = getConfig_().SPREADSHEET_ID;
  if (!id) throw new Error('スクリプトプロパティ SPREADSHEET_ID が設定されていません。setup() を実行してください。');
  return SpreadsheetApp.openById(id);
}

/** シートを取得（なければ例外） */
function getSheet_(name) {
  var sh = openBook_().getSheetByName(name);
  if (!sh) throw new Error('シートが見つかりません: ' + name + '  → setup() を実行してください。');
  return sh;
}

/** ランダムなIDを作る（推測されにくい長さ） */
function newId_(len) {
  var chars = 'abcdefghijkmnpqrstuvwxyz23456789'; // 紛らわしい文字(l,o,0,1)は除外
  var out = '';
  for (var i = 0; i < (len || 20); i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

/** シートを「ヘッダ行 + オブジェクト配列」として読む */
function readRows_(sheetName) {
  var sh = getSheet_(sheetName);
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  var head = values[0];
  var rows = [];
  for (var r = 1; r < values.length; r++) {
    var o = { _row: r + 1 };
    for (var c = 0; c < head.length; c++) o[head[c]] = values[r][c];
    rows.push(o);
  }
  return rows;
}

/** 列定義の順にオブジェクトを配列化して1行追記する */
function appendRow_(sheetName, cols, obj) {
  var sh = getSheet_(sheetName);
  var row = cols.map(function (c) {
    var v = obj[c];
    return (v === undefined || v === null) ? '' : v;
  });
  sh.appendRow(row);
  return sh.getLastRow();
}

/** 指定行の1セルを更新する */
function updateCell_(sheetName, rowNumber, colName, cols, value) {
  var idx = cols.indexOf(colName);
  if (idx < 0) throw new Error('列が定義にありません: ' + colName);
  getSheet_(sheetName).getRange(rowNumber, idx + 1).setValue(value);
}

/** 日付を yyyy-MM-dd で返す（空なら空文字） */
function fmtDate_(d) {
  if (!d) return '';
  var dt = (d instanceof Date) ? d : new Date(d);
  if (isNaN(dt.getTime())) return '';
  return Utilities.formatDate(dt, 'Asia/Tokyo', 'yyyy-MM-dd');
}

/** 日時を yyyy-MM-dd HH:mm で返す */
function fmtDateTime_(d) {
  if (!d) return '';
  var dt = (d instanceof Date) ? d : new Date(d);
  if (isNaN(dt.getTime())) return '';
  return Utilities.formatDate(dt, 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
}

/**
 * 事故日から今日までの経過日数（日単位、切り捨て）。
 * 判定できない場合は null。
 */
function daysSince_(accidentDateStr) {
  if (!accidentDateStr) return null;
  var d = new Date(accidentDateStr);
  if (isNaN(d.getTime())) return null;
  var a = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  var now = new Date();
  var b = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((b - a) / 86400000);
}

/** HTMLエスケープ */
function esc_(s) {
  return String(s === undefined || s === null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** HTMLファイルを文字列として差し込む（ui_style.html の共有用） */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/** LINEにプッシュメッセージを送る */
function linePush_(userId, text) {
  var token = getConfig_().LINE_CHANNEL_ACCESS_TOKEN;
  if (!token || !userId) return false;
  try {
    UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + token },
      payload: JSON.stringify({ to: userId, messages: [{ type: 'text', text: text }] }),
      muteHttpExceptions: true
    });
    return true;
  } catch (err) {
    Logger.log('linePush_ error: ' + err.message);
    return false;
  }
}

/** LINEの返信（replyToken 使用） */
function lineReply_(replyToken, text) {
  var token = getConfig_().LINE_CHANNEL_ACCESS_TOKEN;
  if (!token || !replyToken) return false;
  try {
    UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + token },
      payload: JSON.stringify({ replyToken: replyToken, messages: [{ type: 'text', text: text }] }),
      muteHttpExceptions: true
    });
    return true;
  } catch (err) {
    Logger.log('lineReply_ error: ' + err.message);
    return false;
  }
}
