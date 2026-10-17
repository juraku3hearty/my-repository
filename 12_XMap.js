/**
 * 12_XMap.js
 * シートの読み取り
 *
 * 2つのレイアウトに対応する。
 *   表（横）    : 1行目が見出しで、1行＝1投稿
 *   ブロック（縦）: A列にラベルが縦に繰り返し、B列以降に中身が入る
 *
 * 業者さんと共有していたシートは後者（日付／投稿日／投稿文／修正欄／空白行 の繰り返し）。
 */

/** 表（横）レイアウトのときに使う列マッピング */
var X_MAP_ITEMS = [
  ['対象シート名', '過去ログが入っているシートの名前', true, []],
  ['レイアウト', 'ブロック（縦） または 表（横）', true, []],
  ['投稿日', '表（横）のときの列名', false, ['日付', '投稿日', 'date', '日時']],
  ['雛形', '表（横）のときの列名', false, ['雛形', 'テンプレ', '投稿文', '原文', '案']],
  ['実投稿', '表（横）のときの列名', false, ['修正', '実投稿', '本文', '完成', 'post']],
  ['インプレッション', '任意', false, ['インプレ', 'impression', '表示']],
  ['いいね', '任意', false, ['いいね', 'like']],
  ['リポスト', '任意', false, ['リポスト', 'リツイート', 'repost']],
  ['返信', '任意', false, ['返信', 'リプ', 'reply']]
];

/** ブロック（縦）レイアウトのときの設定 */
var X_BLOCK_ITEMS = [
  ['ラベル列', 'ラベルが入っている列（既定 A）', 'A'],
  ['値の開始列', '1週間の最初の曜日の列（既定 B）', 'B'],
  ['値の終了列', '1週間の最後の曜日の列（既定 H）', 'H'],
  ['ブロックの先頭ラベル', 'ここが来たら次の投稿とみなす（既定 日付）', '日付'],
  ['雛形のラベル', '業者さんの原文が入っているラベル（既定 投稿文）', '投稿文'],
  ['実投稿のラベル', '書き換え後が入っているラベル（既定 修正欄）', '修正欄'],
  ['投稿日のラベル', '任意（既定 投稿日）', '投稿日'],
  ['無視するラベル', '読み飛ばすラベル。カンマ区切り', '空白行']
];

/** 自由記述の設定 */
var X_TEXT_ITEMS = [
  ['これからのコンセプト', '今後の発信の軸。ここが生成の内容を決めます', true],
  ['アカウント紹介', 'プロフィール文など。読者像の判断に使います', false],
  ['投稿の方向性', '業者さんのシートに分類があればそれを貼る（改行区切り）', false],
  ['扱わないこと', '書かないテーマがあれば（改行区切り）', false]
];

/**
 * 初期セットアップ。X_設定シートを作り、推測で埋める。
 */
function xSetup() {
  var ss = xBook_();
  var sh = xSheet_(X_SHEETS.SETTING, ['項目', '値', '説明']);
  var current = xReadSetting_();

  var own = [X_SHEETS.SETTING, X_SHEETS.RULE, X_SHEETS.BATCH, X_SHEETS.DRAFT];
  var candidates = ss.getSheets()
    .map(function (s) { return s.getName(); })
    .filter(function (n) { return own.indexOf(n) < 0; });

  var targetName = current['対象シート名'] || candidates[0] || '';
  var headers = targetName ? xHeadersOf_(targetName) : [];
  var guessedLayout = current['レイアウト'] || (targetName ? xGuessLayout_(targetName) : 'ブロック（縦）');

  var rows = X_MAP_ITEMS.map(function (item) {
    var key = item[0], desc = item[1], required = item[2], hints = item[3];
    var val = current[key] || '';
    if (!val) {
      if (key === '対象シート名') val = targetName;
      else if (key === 'レイアウト') val = guessedLayout;
      else val = xGuessHeader_(headers, hints);
    }
    return [key, val, (required ? '【必須】' : '【任意】') + desc];
  });

  var blockRows = X_BLOCK_ITEMS.map(function (item) {
    return ['▼' + item[0], current['▼' + item[0]] || item[2], '【ブロック（縦）用】' + item[1]];
  });

  var textRows = X_TEXT_ITEMS.map(function (item) {
    return [item[0], current[item[0]] || '', (item[2] ? '【必須】' : '【任意】') + item[1]];
  });

  var all = rows.concat([['', '', '']], blockRows, [['', '', '']], textRows);
  sh.getRange(2, 1, all.length, 3).setValues(all);
  sh.getRange(2, 2, all.length, 1).setBackground('#fff8e1').setWrap(true);
  sh.setColumnWidth(2, 420);
  sh.setColumnWidth(3, 380);

  // 参考情報
  var info = [['', '', ''], ['── 参考 ──', '', '']];
  info.push(['このブックのシート', candidates.join(' / '), '']);
  if (headers.length) info.push(['1行目の内容', headers.join(' / '), '']);
  if (targetName) info.push(['A列の先頭20件', xColumnPeek_(targetName, 1, 20).join(' / '), '']);
  sh.getRange(all.length + 3, 1, info.length, 3).setValues(info);

  Logger.log('X_設定を作成/更新しました: ' + ss.getUrl());
  xToast_('X_設定シートを作りました。値を確認してください。');
}

/** レイアウトを推測する */
function xGuessLayout_(sheetName) {
  var peek = xColumnPeek_(sheetName, 1, 30).join('\n');
  // A列に同じラベルが繰り返し出てくるならブロック（縦）
  var hits = (peek.match(/投稿文|修正欄|投稿日/g) || []).length;
  return hits >= 3 ? 'ブロック（縦）' : '表（横）';
}

/** 指定列の先頭n件を覗く */
function xColumnPeek_(sheetName, col, n) {
  var sh = xBook_().getSheetByName(sheetName);
  if (!sh || sh.getLastRow() === 0) return [];
  var last = Math.min(n, sh.getLastRow());
  return sh.getRange(1, col, last, 1).getValues()
    .map(function (r) { return String(r[0]).trim(); })
    .filter(function (v) { return v; });
}

function xHeadersOf_(sheetName) {
  var sh = xBook_().getSheetByName(sheetName);
  if (!sh || sh.getLastColumn() === 0) return [];
  return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0]
    .map(function (v) { return String(v).trim(); });
}

function xGuessHeader_(headers, hints) {
  for (var h = 0; h < hints.length; h++) {
    for (var i = 0; i < headers.length; i++) {
      if (headers[i] && headers[i].toLowerCase().indexOf(hints[h].toLowerCase()) >= 0) {
        return headers[i];
      }
    }
  }
  return '';
}

function xReadSetting_() {
  var sh = xBook_().getSheetByName(X_SHEETS.SETTING);
  var out = {};
  if (!sh) return out;
  var values = sh.getDataRange().getValues();
  for (var r = 1; r < values.length; r++) {
    var k = String(values[r][0]).trim();
    if (k && k.indexOf('──') < 0) out[k] = String(values[r][1]).trim();
  }
  return out;
}

/** 列名（A, B, …）を1始まりの番号に */
function xColNum_(letter) {
  var s = String(letter || '').trim().toUpperCase();
  if (/^\d+$/.test(s)) return Number(s);
  var n = 0;
  for (var i = 0; i < s.length; i++) {
    n = n * 26 + (s.charCodeAt(i) - 64);
  }
  return n || 1;
}

/**
 * 過去ログを読む。レイアウトに応じて切り替える。
 * @return {Array<Object>} [{ row, 投稿日, 雛形, 実投稿, ... }]
 */
function xReadLog_() {
  var map = xReadSetting_();
  var sheetName = map['対象シート名'];
  if (!sheetName) throw new Error('X_設定の「対象シート名」が空です。xSetup() を実行してください。');

  var sh = xBook_().getSheetByName(sheetName);
  if (!sh) throw new Error('シートが見つかりません: ' + sheetName);

  return (map['レイアウト'] === '表（横）')
    ? xReadTable_(sh, map)
    : xReadBlocks_(sh, map);
}

/**
 * ブロック（縦）レイアウトを読む。
 *
 * A列にラベル（日付／投稿日／投稿文／修正欄…）が縦に繰り返し、
 * B〜H列が1週間分（1列＝1日＝1投稿）。
 * 1ブロック（＝1週間）から、列の数だけレコードを取り出す。
 *
 * ラベルが空の行は、直前のラベルの続きとして同じ列に足す
 * （長文が複数行に分かれていても取りこぼさない）。
 */
function xReadBlocks_(sh, map) {
  var labelCol = xColNum_(map['▼ラベル列'] || 'A');
  var colFrom  = xColNum_(map['▼値の開始列'] || 'B');
  var colTo    = xColNum_(map['▼値の終了列'] || 'H');
  var startLabel = (map['▼ブロックの先頭ラベル'] || '日付').trim();
  var tmplLabel  = (map['▼雛形のラベル'] || '投稿文').trim();
  var postLabel  = (map['▼実投稿のラベル'] || '修正欄').trim();
  var dateLabel  = (map['▼投稿日のラベル'] || '投稿日').trim();
  var ignore = String(map['▼無視するラベル'] || '空白行')
    .split(/[,、]/).map(function (s) { return s.trim(); }).filter(String);

  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  if (lastRow < 1 || lastCol < colFrom) return [];
  if (colTo > lastCol) colTo = lastCol;

  var values = sh.getRange(1, 1, lastRow, lastCol).getValues();
  var width = colTo - colFrom + 1;

  var known = {};
  known[startLabel] = '見出し';
  known[tmplLabel]  = '雛形';
  known[postLabel]  = '実投稿';
  known[dateLabel]  = '投稿日';

  var rows = [];
  var cur = null;      // { row, 見出し:[], 投稿日:[], 雛形:[], 実投稿:[] }
  var curField = null;

  function newBlock(r) {
    var o = { row: r + 1 };
    ['見出し', '投稿日', '雛形', '実投稿'].forEach(function (f) {
      o[f] = [];
      for (var i = 0; i < width; i++) o[f].push('');
    });
    return o;
  }

  function put(block, field, r) {
    for (var i = 0; i < width; i++) {
      var raw = values[r][colFrom - 1 + i];
      var v = (raw === null || raw === undefined) ? '' : String(raw).trim();
      if (!v) continue;
      block[field][i] = block[field][i] ? (block[field][i] + '\n' + v) : v;
    }
  }

  function flush() {
    if (!cur) return;
    for (var i = 0; i < width; i++) {
      var t = String(cur['雛形'][i] || '').trim();
      var p = String(cur['実投稿'][i] || '').trim();
      if (!t && !p) continue;   // その曜日は空
      rows.push({
        row: cur.row,
        col: colFrom + i,
        '見出し': cur['見出し'][i],
        '投稿日': cur['投稿日'][i] || cur['見出し'][i],
        '雛形': t,
        '実投稿': p,
        'インプレッション': '', 'いいね': '', 'リポスト': '', '返信': ''
      });
    }
    cur = null;
    curField = null;
  }

  for (var r = 0; r < lastRow; r++) {
    var label = String(values[r][labelCol - 1] || '').trim();

    if (label && ignore.indexOf(label) >= 0) { curField = null; continue; }

    if (label && known[label]) {
      if (known[label] === '見出し') {
        flush();
        cur = newBlock(r);
      } else if (!cur) {
        cur = newBlock(r);
      }
      curField = known[label];
      put(cur, curField, r);
      continue;
    }

    if (!label && cur && curField) { put(cur, curField, r); continue; }

    if (label && !known[label]) { curField = null; }
  }
  flush();
  return rows;
}

/** 表（横）レイアウトを読む */
function xReadTable_(sh, map) {
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return [];

  var headers = values[0].map(function (v) { return String(v).trim(); });
  var keys = ['投稿日', '雛形', '実投稿', 'インプレッション', 'いいね', 'リポスト', '返信'];
  var idx = {};
  keys.forEach(function (k) { idx[k] = map[k] ? headers.indexOf(map[k]) : -1; });

  if (idx['雛形'] < 0 && idx['実投稿'] < 0) {
    throw new Error('X_設定の「雛形」「実投稿」の列名が見出しと一致していません。\n' +
      '見出し: ' + headers.join(' / '));
  }

  var rows = [];
  for (var r = 1; r < values.length; r++) {
    var o = { row: r + 1 };
    keys.forEach(function (k) { o[k] = (idx[k] >= 0) ? values[r][idx[k]] : ''; });
    if (!String(o['雛形']).trim() && !String(o['実投稿']).trim()) continue;
    rows.push(o);
  }
  return rows;
}

/**
 * 読み取り結果を確認する（実行してログを見る）。
 */
function xPreviewLog() {
  var rows = xReadLog_();
  Logger.log('読み取れた件数: ' + rows.length);
  rows.slice(0, 3).forEach(function (r, i) {
    Logger.log('--- ' + (i + 1) + ' (行' + r.row + (r.col ? ' 列' + r.col : '') + ') ---');
    Logger.log('投稿日: ' + r['投稿日']);
    Logger.log('雛形  : ' + String(r['雛形']).slice(0, 120));
    Logger.log('実投稿: ' + String(r['実投稿']).slice(0, 120));
  });
  xToast_(rows.length + '件を読み取りました。ログを確認してください。');
  return rows.length;
}
