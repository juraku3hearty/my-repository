/**
 * X投稿 文体ツール（全部入り）
 * このファイル1つをGASに貼れば動きます。
 *
 * 必要なスクリプトプロパティ:
 *   ANTHROPIC_API_KEY  … Claude APIキー
 */


// ============================================================
// 10_XConfig.js
// ============================================================

/**
 * 10_XConfig.js
 * X投稿 文体抽出・生成ツール  設定
 *
 * 【スクリプトプロパティ】
 *   ANTHROPIC_API_KEY   Claude APIキー
 *   X_SPREADSHEET_ID    過去ログが入っているスプレッドシートのID
 */

var X_PROPS = {
  API_KEY: 'ANTHROPIC_API_KEY',
  SPREADSHEET_ID: 'X_SPREADSHEET_ID'
};

/** このツールが作る/使うシート名 */
var X_SHEETS = {
  SETTING: 'X_設定',
  RULE: 'X_文体ルール',
  BATCH: 'X_抽出ログ',
  DRAFT: 'X_投稿案',
  WEEK: 'X_投稿案_週形式',
  FACT: 'X_一次情報',
  SAMPLE: 'X_文体サンプル',
  QSTOCK: 'X_未回答の質問',
  STRATEGY: 'X_戦略'
};

/** 使うモデル。文体の再現が目的なので安いモデルに落とさない。 */
var X_MODEL = 'claude-opus-5-5';

/** 1回のAPI呼び出しで渡す過去ログの件数。GASの実行時間に合わせて小さめ。 */
var X_BATCH_SIZE = 12;

function xConfig_() {
  var p = PropertiesService.getScriptProperties();
  return {
    apiKey: p.getProperty(X_PROPS.API_KEY) || '',
    spreadsheetId: p.getProperty(X_PROPS.SPREADSHEET_ID) || ''
  };
}

function xBook_() {
  var id = xConfig_().spreadsheetId;
  if (!id) {
    // 設定が無ければ、スクリプトがバインドされているシートを使う
    var active = SpreadsheetApp.getActiveSpreadsheet();
    if (active) return active;
    throw new Error('スクリプトプロパティ X_SPREADSHEET_ID が未設定です。');
  }
  return SpreadsheetApp.openById(id);
}

/** シートを取得（無ければ作る） */
function xSheet_(name, headers) {
  var ss = xBook_();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    if (headers && headers.length) {
      sh.getRange(1, 1, 1, headers.length).setValues([headers])
        .setFontWeight('bold').setBackground('#1f3a5f').setFontColor('#ffffff');
      sh.setFrozenRows(1);
    }
  }
  return sh;
}

// ============================================================
// 11_XClaude.js
// ============================================================

/**
 * 11_XClaude.js
 * GASからClaude APIを呼ぶ（UrlFetchApp。GASはSDKが使えないので素のHTTP）
 */

/**
 * Messages API を1回呼ぶ。
 * @param {Object} opt { system, userText, maxTokens, effort }
 * @return {string} 本文テキスト
 */
function xClaude_(opt) {
  var key = xConfig_().apiKey;
  if (!key) throw new Error('スクリプトプロパティ ANTHROPIC_API_KEY が未設定です。');

  var body = {
    model: X_MODEL,
    max_tokens: opt.maxTokens || 8000,
    // Opus 5.5 は thinking を切れない。深さは effort で調整する。
    // （budget_tokens や thinking:disabled を送ると 400 になる）
    output_config: { effort: opt.effort || 'medium' },
    messages: [{ role: 'user', content: opt.userText }]
  };
  if (opt.system) body.system = opt.system;

  var res = xFetchWithRetry_('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01'
    },
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });

  var code = res.getResponseCode();
  var text = res.getContentText();

  if (code !== 200) {
    throw new Error('Claude API エラー (' + code + '): ' + text.slice(0, 500));
  }

  var json = JSON.parse(text);

  if (json.stop_reason === 'refusal') {
    throw new Error('リクエストが拒否されました: ' +
      ((json.stop_details && json.stop_details.explanation) || ''));
  }

  // thinking ブロックは既定で空。text ブロックだけ拾う。
  var out = (json.content || [])
    .filter(function (b) { return b.type === 'text'; })
    .map(function (b) { return b.text; })
    .join('\n');

  if (json.stop_reason === 'max_tokens') {
    Logger.log('警告: max_tokens に達しました。出力が途中で切れている可能性があります。');
  }
  return out;
}

/** 429 / 5xx は待って再試行する */
function xFetchWithRetry_(url, params) {
  var waits = [2000, 4000, 8000, 16000];
  var res;
  for (var i = 0; i <= waits.length; i++) {
    res = UrlFetchApp.fetch(url, params);
    var code = res.getResponseCode();
    if (code !== 429 && code < 500) return res;
    if (i < waits.length) Utilities.sleep(waits[i]);
  }
  return res;
}

/**
 * 返答からJSONを取り出す。コードフェンスが付いていても剥がす。
 */
function xParseJson_(text) {
  var s = String(text || '').trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  var start = s.search(/[\[{]/);
  if (start > 0) s = s.slice(start);
  var lastBrace = Math.max(s.lastIndexOf('}'), s.lastIndexOf(']'));
  if (lastBrace >= 0) s = s.slice(0, lastBrace + 1);
  try {
    return JSON.parse(s);
  } catch (e) {
    throw new Error('AIの返答をJSONとして読めませんでした。先頭200字: ' + s.slice(0, 200));
  }
}

// ============================================================
// 12_XMap.js
// ============================================================

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
  ['戦略シート名', 'ヒアリング・戦略シートの名前（カンマ区切り）。丸ごと読み込みます', true],
  ['これからのコンセプト', '戦略シートがあれば空でも可。補足したいことがあれば', false],
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

// ============================================================
// 13_XExtract.js
// ============================================================

/**
 * 13_XExtract.js
 * 文体ルールの抽出
 *
 * 雛形（業者の原文）と実投稿（書き換え後）の差分から、文体のルールを取り出す。
 * 一番の狙いは「業者が書いたのに、あなたが消した言葉」＝禁止語リスト。
 *
 * GASの実行時間制限があるので、途中で止まっても続きから再開できるようにしてある。
 * 「X 文体抽出 > 抽出を実行」を、完了と出るまで何度か押せばよい。
 */

var X_PROGRESS_KEY = 'X_EXTRACT_CURSOR';
var X_TIME_LIMIT_MS = 4.5 * 60 * 1000; // GASの6分制限に対する安全マージン

/**
 * 抽出を実行する（途中から再開可）。
 */
function xExtractStyle() {
  var started = Date.now();
  var rows = xReadLog_();
  if (!rows.length) throw new Error('過去ログが読めませんでした。X_設定を確認してください。');

  var logSh = xSheet_(X_SHEETS.BATCH,
    ['バッチ', '対象行', '抽出結果(JSON)', '実行日時']);

  var p = PropertiesService.getScriptProperties();
  var cursor = Number(p.getProperty(X_PROGRESS_KEY) || 0);

  if (cursor === 0) {
    // 最初から始めるときは前回の結果を消す
    if (logSh.getLastRow() > 1) {
      logSh.getRange(2, 1, logSh.getLastRow() - 1, logSh.getLastColumn()).clearContent();
    }
  }

  var total = rows.length;
  var done = 0;

  while (cursor < total) {
    if (Date.now() - started > X_TIME_LIMIT_MS) {
      p.setProperty(X_PROGRESS_KEY, String(cursor));
      var msg = '時間切れで中断しました。' + cursor + ' / ' + total + ' 件まで完了。\n' +
                'もう一度「抽出を実行」を押すと続きから再開します。';
      Logger.log(msg);
      xToast_(msg);
      return;
    }

    var batch = rows.slice(cursor, cursor + X_BATCH_SIZE);
    var result = xExtractBatch_(batch);

    logSh.appendRow([
      Math.floor(cursor / X_BATCH_SIZE) + 1,
      batch[0].row + '〜' + batch[batch.length - 1].row,
      JSON.stringify(result),
      Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm')
    ]);

    cursor += batch.length;
    done += batch.length;
    p.setProperty(X_PROGRESS_KEY, String(cursor));
  }

  // 全バッチ完了 → 統合
  p.deleteProperty(X_PROGRESS_KEY);
  xMergeRules_();
  xToast_('抽出が完了しました（' + total + '件）。X_文体ルール を確認してください。');
}

/** 進捗をリセットして最初からやり直す */
function xResetExtract() {
  PropertiesService.getScriptProperties().deleteProperty(X_PROGRESS_KEY);
  xToast_('進捗をリセットしました。次回は最初から実行します。');
}

/** 1バッチ分を抽出する */
function xExtractBatch_(batch) {
  var items = batch.map(function (r, i) {
    return [
      '--- ' + (i + 1) + ' (行' + r.row + ') ---',
      '【雛形】',
      String(r['雛形'] || '(なし)'),
      '【実投稿】',
      String(r['実投稿'] || '(なし)')
    ].join('\n');
  }).join('\n\n');

  var system = [
    'あなたは日本語の文体を分析する専門家です。',
    '与えられるのは、外部ライターが書いた「雛形」と、本人が書き直した「実投稿」の対です。',
    '',
    '目的は、本人の文体を再現できるルールを取り出すことです。',
    '特に重要なのは「雛形にあったのに実投稿で消された言葉」です。',
    'それは本人が「自分の言葉ではない」と判断した語なので、禁止語として扱います。',
    '',
    '文体に加えて、次の2つも記録してください。',
    '1. 実投稿が扱っているテーマと、繰り返し出てくる主張',
    '   （この書き手の発信の軸が一貫しているかを見るため）',
    '2. 雛形の側が提案していたテーマと、雛形の構成の型',
    '   （雛形はプロのライターが作った企画案です。文章は本人のものに置き換えますが、',
    '    テーマの出し方と構成の型は、それ自体が使える資産なので残します）',
    '',
    '推測で一般的な文章術を書かないでください。与えられた実例から読み取れることだけを書いてください。',
    '出力はJSONのみ。説明文やコードフェンスを付けないでください。'
  ].join('\n');

  var user = [
    '以下の対を分析し、JSONで返してください。',
    '',
    items,
    '',
    '--- 出力形式 ---',
    '{',
    '  "消した語": ["雛形にあったが実投稿で消された語・言い回し"],',
    '  "足した語": ["雛形になく実投稿で足された語・言い回し"],',
    '  "文の長さ": "1文の長さの傾向を一言で",',
    '  "改行": "改行と空行の入れ方の傾向を一言で",',
    '  "語尾": ["よく使われている語尾"],',
    '  "一人称": "使われている一人称",',
    '  "冒頭": ["冒頭の入り方のパターン"],',
    '  "CTA": ["締め・誘導の言い回し"],',
    '  "テーマ": ["実投稿で扱われているテーマ"],',
    '  "雛形のテーマ": ["雛形の側で提案されていたテーマ・切り口"],',
    '  "雛形の構成": ["雛形の骨組み。どういう順で組み立てているか"],',
    '  "繰り返している主張": ["何度も出てくる考え方・言い切り"],',
    '  "具体例の出し方": ["どういう種類の例を出しているか"],',
    '  "その他": ["上に入らない特徴"]',
    '}'
  ].join('\n');

  var text = xClaude_({ system: system, userText: user, maxTokens: 4000, effort: 'medium' });
  return xParseJson_(text);
}

/** 全バッチの結果を1つの文体ルールにまとめる */
function xMergeRules_() {
  var logSh = xSheet_(X_SHEETS.BATCH);
  var values = logSh.getDataRange().getValues();
  var observations = [];
  for (var r = 1; r < values.length; r++) {
    if (values[r][2]) observations.push(values[r][2]);
  }
  if (!observations.length) throw new Error('抽出ログが空です。先に抽出を実行してください。');

  var system = [
    'あなたは日本語の文体を分析する専門家です。',
    '複数バッチの観察結果を統合し、1つの「文体ルール」にまとめてください。',
    '',
    '統合のルール:',
    '- 複数のバッチで繰り返し出てきたものを優先する（1回しか出ていないものは採用しない）',
    '- 似た表現はまとめる',
    '- 一般的な文章術は書かない。観察から読み取れたことだけを書く',
    '',
    '出力はJSONのみ。説明文やコードフェンスを付けないでください。'
  ].join('\n');

  var user = [
    '以下は、同じ書き手の投稿を分割して分析した結果です。統合してください。',
    '',
    observations.join('\n'),
    '',
    '--- 出力形式 ---',
    '{',
    '  "禁止語": ["使わない語。繰り返し消されていたもの"],',
    '  "採用語": ["よく使う語・言い回し"],',
    '  "文の長さ": "",',
    '  "改行": "",',
    '  "語尾": [],',
    '  "一人称": "",',
    '  "冒頭パターン": [],',
    '  "CTAパターン": [],',
    '  "よく書くテーマ": ["実投稿で繰り返し扱っているテーマ"],',
    '  "雛形にあったテーマ": ["雛形が提案していたテーマの一覧。企画の引き出しとして残す"],',
    '  "構成の型": ["雛形で繰り返し使われていた組み立て方。型として残す"],',
    '  "繰り返している主張": ["この書き手が何度も言っていること"],',
    '  "具体例の出し方": [],',
    '  "守るべきこと": ["生成時に必ず守るルール"],',
    '  "やってはいけないこと": ["生成時に避けること"]',
    '}'
  ].join('\n');

  var merged = xParseJson_(xClaude_({
    system: system, userText: user, maxTokens: 6000, effort: 'high'
  }));

  xWriteRules_(merged);
  return merged;
}

/** 文体ルールをシートに書く（手で直せる形） */
function xWriteRules_(rule) {
  var sh = xSheet_(X_SHEETS.RULE, ['項目', '内容', 'メモ（手で直してください）']);
  if (sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent();
  }

  var rows = [];
  Object.keys(rule).forEach(function (k) {
    var v = rule[k];
    rows.push([k, Array.isArray(v) ? v.join('\n') : String(v), '']);
  });

  sh.getRange(2, 1, rows.length, 3).setValues(rows);
  sh.setColumnWidth(2, 520);
  sh.getRange(2, 2, rows.length, 1).setWrap(true);
}

/** 文体ルールをシートから読む（手で直した内容が反映される） */
function xReadRules_() {
  var sh = xBook_().getSheetByName(X_SHEETS.RULE);
  if (!sh || sh.getLastRow() < 2) {
    throw new Error('X_文体ルール がありません。先に「抽出を実行」してください。');
  }
  var values = sh.getDataRange().getValues();
  var lines = [];
  for (var r = 1; r < values.length; r++) {
    var k = String(values[r][0]).trim();
    var v = String(values[r][1]).trim();
    var memo = String(values[r][2]).trim();
    if (!k) continue;
    lines.push('【' + k + '】');
    if (v) lines.push(v);
    if (memo) lines.push('（補足）' + memo);
    lines.push('');
  }
  return lines.join('\n');
}

function xToast_(msg) {
  try {
    var ss = SpreadsheetApp.getActive();
    if (ss) ss.toast(msg, 'X 文体抽出', 10);
  } catch (e) { /* UIが無い実行経路では無視 */ }
}


/**
 * 使わなかった雛形を一覧にする。
 *
 * 雛形はあるのに実投稿が空の行＝そのとき投稿しなかった企画。
 * 業者さんに依頼して作ってもらったものなので、まだ使える在庫として扱う。
 */
function xListUnusedTemplates() {
  var rows = xReadLog_();
  var unused = rows.filter(function (r) {
    return String(r['雛形'] || '').trim() && !String(r['実投稿'] || '').trim();
  });

  var sh = xSheet_('X_企画ストック', ['元の行', '元の列', '日付', '雛形（未使用）', '使うか']);
  if (sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent();
  }

  if (!unused.length) {
    xToast_('未使用の雛形はありませんでした（すべて投稿済みです）。');
    return 0;
  }

  var out = unused.map(function (r) {
    return [r.row, r.col || '', r['投稿日'] || r['見出し'] || '', String(r['雛形']), ''];
  });
  sh.getRange(2, 1, out.length, 5).setValues(out);
  sh.setColumnWidth(4, 520);
  sh.getRange(2, 4, out.length, 1).setWrap(true);

  xToast_('未使用の雛形が ' + unused.length + '本 ありました。X_企画ストック を見てください。');
  return unused.length;
}

// ============================================================
// 14_XGenerate.js
// ============================================================

/**
 * 14_XGenerate.js
 * 投稿案の生成
 *
 * コンセプト × テーマ × 文体ルール → 投稿案。
 * 文体ルールを先に適用するので、書き直す前提ではなく、そのまま出せる形を狙う。
 */

/**
 * メニューから呼ぶ。テーマと本数を聞いて生成する。
 */
function xGeneratePosts() {
  var ui;
  try { ui = SpreadsheetApp.getUi(); } catch (e) { ui = null; }

  var themes = '';
  var count = 7;

  if (ui) {
    var r1 = ui.prompt(
      '今週の投稿案を作ります',
      'テーマがあれば、改行またはカンマ区切りで入れてください。\n' +
      '空のままOKを押すと、コンセプトからこちらで提案します。',
      ui.ButtonSet.OK_CANCEL);
    if (r1.getSelectedButton() !== ui.Button.OK) return;
    themes = r1.getResponseText();

    var r2 = ui.prompt('本数', '何本つくりますか（既定 7）', ui.ButtonSet.OK_CANCEL);
    if (r2.getSelectedButton() !== ui.Button.OK) return;
    var n = parseInt(r2.getResponseText(), 10);
    if (!isNaN(n) && n > 0 && n <= 14) count = n;
  }

  var posts = xGenerate_(themes, count);
  xWriteDrafts_(posts);
  xWriteWeekBlock_(posts);
  xToast_(posts.length + '本できました。X_投稿案_週形式 からそのままコピーできます。');
}

/**
 * 生成の本体。
 * @param {string} themesText テーマ（空なら提案させる）
 * @param {number} count 本数
 * @return {Array<Object>}
 */
function xGenerate_(themesText, count) {
  var setting = xReadSetting_();
  var strategy = xReadStrategy_();
  var concept = setting['これからのコンセプト'] || '';
  if (!strategy && !concept) {
    throw new Error('発信の軸がありません。X_設定の「戦略シート名」にヒアリング・戦略シートの名前を入れるか、' +
      '「これからのコンセプト」を書いてください。');
  }

  var rules = xReadRules_();
  var samples = xReadSamples_(3);
  if (!samples.length) samples = xPickSamples_(3);
  var facts = xReadFacts_(40);

  var system = [
    'あなたは、ある書き手の文体を完全に再現して X の投稿を書く人です。',
    '',
    '最重要のルール:',
    '- 「文体ルール」の禁止語は、絶対に使わないでください。',
    '  これは過去にこの書き手が自分で消した語です。1つでも混ざると、本人の文ではなくなります。',
    '- 一般的によくあるSNS文章術の型に寄せないでください。この書き手の型に寄せてください。',
    '- 一次情報が与えられている場合、それを必ず使ってください。',
    '  数字・固有名詞・実際にあった出来事は、一次情報にあるものだけを書いてください。',
    '  それらしい具体例を作らないでください。',
    '- 内容は「これからのコンセプト」を軸に作ってください。',
    '  文体ルールの「よく書くテーマ」「繰り返している主張」は、この書き手が',
    '  これまで積み上げてきたものです。コンセプトと矛盾しない限り、活かしてください。',
    '  矛盾する場合だけ、コンセプトを優先してください。',
    '- 文体ルールの「雛形にあったテーマ」「構成の型」は、プロのライターが作った企画案です。',
    '  テーマの引き出しと、組み立ての型として活かしてください。',
    '  ただし文章そのものは、必ずこの書き手の文体に置き換えてください。',
    '',
    '出力はJSONのみ。説明文やコードフェンスを付けないでください。'
  ].join('\n');

  var parts = [];
  if (strategy) {
    parts.push('# 発信設計書（この書き手の戦略。ここが土台）');
    parts.push(strategy);
    parts.push('');
  }
  if (concept) {
    parts.push('# これからのコンセプト（補足）');
    parts.push(concept);
    parts.push('');
  }

  if (setting['アカウント紹介']) {
    parts.push('# アカウント紹介');
    parts.push(setting['アカウント紹介']);
    parts.push('');
  }
  if (setting['投稿の方向性']) {
    parts.push('# 投稿の方向性');
    parts.push(setting['投稿の方向性']);
    parts.push('');
  }
  if (setting['扱わないこと']) {
    parts.push('# 扱わないこと（書かない）');
    parts.push(setting['扱わないこと']);
    parts.push('');
  }

  parts.push('# 文体ルール（過去の書き換え履歴から抽出）');
  parts.push(rules);
  parts.push('');

  if (samples.length) {
    parts.push('# 実際の投稿の例（文体と、これまでの積み上げの参考）');
    samples.forEach(function (s, i) {
      parts.push('--- 例' + (i + 1) + ' ---');
      parts.push(s);
    });
    parts.push('');
  }

  if (facts) {
    parts.push('# あなたの一次情報（実際にあったこと・数字・言われた言葉）');
    parts.push('ここに無いことを、推測で書かないでください。');
    parts.push('具体を書くときは、必ずこの中から取ってください。');
    parts.push(facts);
    parts.push('');
  }

  parts.push('# 依頼');
  if (String(themesText || '').trim()) {
    parts.push('次のテーマで、' + count + '本の投稿を書いてください。');
    parts.push(String(themesText).trim());
  } else {
    parts.push('コンセプトに沿って、' + count + '本の投稿を書いてください。');
    parts.push('テーマはあなたが決めてください。似たテーマを並べず、角度を変えてください。');
    parts.push('これまで繰り返し書いてきたテーマを、新しい角度で書き直すのも有効です。');
    parts.push('「雛形にあったテーマ」で、まだ十分に書けていないものがあれば、それも候補にしてください。');
  }
  parts.push('');
  parts.push('# ターゲット層の配分');
  parts.push('発信設計書にターゲットが層（潜在層／準顕在層／顕在層／明確層）で分かれている場合、');
  parts.push('次の順で1本ずつ割り当ててください。');
  xLayerPlan_(count).forEach(function (layer, i) {
    parts.push('  ' + (i + 1) + '本目: ' + layer);
  });
  parts.push('各層の「ペイン」「反応するキーワード」「抱かせる感情」が設計書にあれば、');
  parts.push('その層の投稿に必ず反映してください。層の指定が設計書に無ければ、この配分は無視して構いません。');
  parts.push('');
  parts.push('--- 出力形式 ---');
  parts.push('{"posts":[{');
  parts.push('  "テーマ": "この投稿のテーマ",');
  parts.push('  "ターゲット層": "潜在層／準顕在層／顕在層／明確層 のどれか",');
  parts.push('  "本文": "そのまま投稿できる完成文。改行もそのまま",');
  parts.push('  "冒頭3行": "プレビューに出る最初の3行だけを抜き出したもの",');
  parts.push('  "狙い": "この投稿で何を伝えるか（1行）",');
  parts.push('  "使った禁止語チェック": "禁止語を使っていないか自己確認した結果"');
  parts.push('}]}');

  var text = xClaude_({
    system: system,
    userText: parts.join('\n'),
    maxTokens: 16000,
    effort: 'high'
  });

  var json = xParseJson_(text);
  return json.posts || [];
}

/** 文体の参考として、実投稿をいくつか拾う（反応が良い順があればそれを優先） */
function xPickSamples_(n) {
  var rows;
  try { rows = xReadLog_(); } catch (e) { return []; }
  if (!rows.length) return [];

  var withImp = rows.filter(function (r) {
    return Number(r['インプレッション']) > 0;
  });

  if (withImp.length >= n) {
    withImp.sort(function (a, b) {
      return Number(b['インプレッション']) - Number(a['インプレッション']);
    });
    return withImp.slice(0, n).map(function (r) { return String(r['実投稿']); });
  }

  // 反応データが無ければ、直近のものを使う
  return rows.slice(-n).map(function (r) { return String(r['実投稿']); })
    .filter(function (s) { return s.trim(); });
}

/** 投稿案をシートに書き出す */
function xWriteDrafts_(posts) {
  var sh = xSheet_(X_SHEETS.DRAFT,
    ['作成日時', 'ターゲット層', 'テーマ', '本文', '冒頭3行', '狙い', '自己チェック', '投稿予定日', '状態']);

  var now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
  var rows = posts.map(function (p) {
    return [
      now,
      p['ターゲット層'] || '',
      p['テーマ'] || '',
      p['本文'] || '',
      p['冒頭3行'] || '',
      p['狙い'] || '',
      p['使った禁止語チェック'] || '',
      '',
      '未'
    ];
  });

  if (!rows.length) return;
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  sh.setColumnWidth(4, 520);
  sh.getRange(2, 4, sh.getLastRow() - 1, 1).setWrap(true);
}


/**
 * いつものシートと同じ「1週間ブロック」の形で書き出す。
 *
 *   A列      B〜H列（1列＝1日）
 *   日付     月(10/19) …
 *   投稿日   2026-10-19 …
 *   投稿文   生成した本文 …
 *   修正欄   （空。直すときに使う）
 *   空白行
 *
 * そのまま選択してコピーすれば、既存のシートに貼れる。
 */
function xWriteWeekBlock_(posts) {
  if (!posts || !posts.length) return;

  var map = xReadSetting_();
  var startLabel = (map['▼ブロックの先頭ラベル'] || '日付').trim();
  var dateLabel  = (map['▼投稿日のラベル'] || '投稿日').trim();
  var tmplLabel  = (map['▼雛形のラベル'] || '投稿文').trim();
  var postLabel  = (map['▼実投稿のラベル'] || '修正欄').trim();
  var blankLabel = String(map['▼無視するラベル'] || '空白行').split(/[,、]/)[0].trim();

  var width = posts.length;
  var wdays = ['日', '月', '火', '水', '木', '金', '土'];

  // 実行日の翌日から順に割り当てる（日曜に回すと月曜始まりになる）
  var base = new Date();
  base.setDate(base.getDate() + 1);

  var headRow = [startLabel];
  var dateRow = [dateLabel];
  var textRow = [tmplLabel];
  var fixRow  = [postLabel];

  for (var i = 0; i < width; i++) {
    var d = new Date(base.getTime());
    d.setDate(base.getDate() + i);
    var ymd = Utilities.formatDate(d, 'Asia/Tokyo', 'yyyy-MM-dd');
    headRow.push(wdays[d.getDay()] + '（' + Utilities.formatDate(d, 'Asia/Tokyo', 'M/d') + '）');
    dateRow.push(ymd);
    textRow.push(posts[i]['本文'] || '');
    fixRow.push('');
  }

  var sh = xSheet_(X_SHEETS.WEEK);
  var startRow = sh.getLastRow() + (sh.getLastRow() ? 1 : 0) + 1;

  var block = [headRow, dateRow, textRow, fixRow, [blankLabel]];
  // 行の長さを揃える
  var cols = width + 1;
  block = block.map(function (row) {
    while (row.length < cols) row.push('');
    return row;
  });

  sh.getRange(startRow, 1, block.length, cols).setValues(block);
  sh.getRange(startRow, 2, block.length, width).setWrap(true).setVerticalAlignment('top');
  sh.setColumnWidth(1, 90);
  for (var c = 2; c <= cols; c++) sh.setColumnWidth(c, 300);
  sh.getRange(startRow, 1, block.length, 1).setFontWeight('bold').setBackground('#eef3f9');
}

// ============================================================
// 15_XMenu.js
// ============================================================

/**
 * 15_XMenu.js
 * スプレッドシートのメニュー
 *
 * このスクリプトを過去ログのスプレッドシートにバインドすると、
 * 開いたときに「X 文体ツール」メニューが出る。
 */

function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('X 文体ツール')
      .addItem('① 設定シートを作る / 更新する', 'xSetup')
      .addItem('　 過去ログを読めるか確認する', 'xPreviewLog')
      .addItem('　 戦略シートを読めるか確認する', 'xPreviewStrategy')
      .addSeparator()
      .addItem('② 質問リストを取り込む', 'xImportQuestionSheet')
      .addItem('② メインシートの回答を取り込む', 'xImportMainAnswers')
      .addItem('③ 文体を抽出する（完了まで数回押す）', 'xExtractStyle')
      .addItem('　 抽出をやり直す', 'xResetExtract')
      .addSeparator()
      .addItem('④ 今週の投稿案を作る', 'xGeneratePosts')
      .addSeparator()
      .addItem('質問に1つ答える（一次情報を足す）', 'xAskQuestion')
      .addSeparator()
      .addItem('使わなかった雛形を一覧にする', 'xListUnusedTemplates')
      .addToUi();
  } catch (e) {
    // バインドされていない環境では何もしない
  }
}

// ============================================================
// 16_XFact.js
// ============================================================

/**
 * 16_XFact.js
 * 一次情報を溜める
 *
 * 業者さんの仕組みは「ジャンル別の質問に答えてもらい、その回答から記事を書く」だった。
 * 質問の設計は正しいが、回答が入っていなければ出力は一般論になる。
 *
 * ここでは回答をシートに溜めて、生成時の素材として渡す。
 * 既存の「質問リスト」シートがあればそれを使い、無ければコンセプトから質問を作る。
 */

/** 既存の質問リストシートの候補名 */
var X_QLIST_NAMES = ['質問リスト', '質問', 'questions'];

/**
 * 質問を1つ出して、答えを X_一次情報 に保存する。
 * メニューから何度でも実行できる。空き時間に1問ずつ足していく使い方。
 */
function xAskQuestion() {
  var ui;
  try { ui = SpreadsheetApp.getUi(); } catch (e) { ui = null; }
  if (!ui) throw new Error('この機能はスプレッドシートのメニューから実行してください。');

  var q = xPickQuestion_();

  var res = ui.prompt(
    '一次情報を1つ足す',
    q.genre ? ('【' + q.genre + '】\n\n' + q.text + '\n\n' +
               '※実際にあったこと、数字、言われた言葉を、そのまま書いてください。\n' +
               '　短くて構いません。答えられなければキャンセルしてください。')
            : (q.text + '\n\n※実際にあったこと、数字、言われた言葉を、そのまま書いてください。'),
    ui.ButtonSet.OK_CANCEL);

  if (res.getSelectedButton() !== ui.Button.OK) return;
  var answer = String(res.getResponseText() || '').trim();
  if (!answer) { xToast_('空だったので保存しませんでした。'); return; }

  var sh = xSheet_(X_SHEETS.FACT, ['記録日', 'ジャンル', '質問', '回答', '使用回数']);
  sh.appendRow([
    Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd'),
    q.genre || '', q.text, answer, 0
  ]);
  sh.setColumnWidth(4, 480);
  sh.getRange(sh.getLastRow(), 4).setWrap(true);

  xToast_('保存しました。続けるなら、もう一度「質問に答える」を押してください。');
}

/**
 * 質問を1つ選ぶ。
 * 既存の質問リストがあれば、まだ答えていないものを優先する。
 */
function xPickQuestion_() {
  var list = xLoadQuestionList_().concat(xStockQuestions_());
  var answered = xAnsweredQuestions_();

  if (list.length) {
    var unanswered = list.filter(function (q) { return answered.indexOf(q.text) < 0; });
    var pool = unanswered.length ? unanswered : list;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // 質問リストが無い場合は、コンセプトから質問を作る
  return { genre: '', text: xGenerateQuestion_(answered) };
}

/** X_未回答の質問 から未回答のものを読む */
function xStockQuestions_() {
  var sh = xBook_().getSheetByName(X_SHEETS.QSTOCK);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues()
    .filter(function (r) { return String(r[1]).trim() && !String(r[2]).trim(); })
    .map(function (r) { return { genre: String(r[0]).trim(), text: String(r[1]).trim() }; });
}

/** 既存の「質問リスト」シートを読む（番号/ジャンル/質問 の並びを想定） */
function xLoadQuestionList_() {
  var ss = xBook_();
  var sh = null;
  for (var i = 0; i < X_QLIST_NAMES.length; i++) {
    sh = ss.getSheetByName(X_QLIST_NAMES[i]);
    if (sh) break;
  }
  if (!sh || sh.getLastRow() < 2) return [];

  var values = sh.getRange(2, 1, sh.getLastRow() - 1, Math.min(3, sh.getLastColumn())).getValues();
  var out = [];
  values.forEach(function (r) {
    var genre = String(r[1] || '').trim();
    var text = String(r[2] || '').trim();
    if (!text) { // 2列しかない場合などの保険
      text = String(r[1] || '').trim();
      genre = '';
    }
    if (text) out.push({ genre: genre, text: text });
  });
  return out;
}

/** すでに答えた質問の一覧 */
function xAnsweredQuestions_() {
  var sh = xBook_().getSheetByName(X_SHEETS.FACT);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 3, sh.getLastRow() - 1, 1).getValues()
    .map(function (r) { return String(r[0]).trim(); })
    .filter(String);
}

/** 質問リストが無いときに、コンセプトから質問を1つ作る */
function xGenerateQuestion_(answered) {
  var setting = xReadSetting_();
  var concept = setting['これからのコンセプト'] || '';
  if (!concept) {
    return 'この1週間で、仕事中に「これは書ける」と思った出来事を1つ教えてください。';
  }

  var user = [
    'あなたは、書き手から一次情報を引き出すインタビュアーです。',
    '',
    '# 書き手のコンセプト',
    concept,
    '',
    answered.length ? ('# すでに答えた質問（重複させない）\n' + answered.slice(-30).join('\n')) : '',
    '',
    '# 依頼',
    'この書き手しか答えられない質問を、1つだけ作ってください。',
    '条件:',
    '- 一般論ではなく、実際にあった出来事・数字・言われた言葉を引き出す質問にする',
    '- 抽象的な問い（「どう思いますか」など）にしない',
    '- 1文で、答えるのに1分かからない質問にする',
    '',
    '質問文だけを出力してください。前置きも記号も付けないでください。'
  ].filter(String).join('\n');

  return xClaude_({ userText: user, maxTokens: 1000, effort: 'low' }).trim();
}

/**
 * 溜まっている一次情報を、生成プロンプト用のテキストにする。
 */
function xReadFacts_(limit) {
  var sh = xBook_().getSheetByName(X_SHEETS.FACT);
  if (!sh || sh.getLastRow() < 2) return '';

  var values = sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues();
  var rows = values.filter(function (r) { return String(r[3]).trim(); });
  if (!rows.length) return '';

  rows.reverse();                       // 新しいものを優先
  if (limit) rows = rows.slice(0, limit);

  return rows.map(function (r) {
    return '- ' + (r[1] ? '【' + r[1] + '】' : '') + String(r[2]).trim() + '\n  → ' + String(r[3]).trim();
  }).join('\n');
}

/**
 * 既存の「メイン」シートに残っている回答を、X_一次情報 に取り込む。
 * 業者さんの仕組みで答えたものを引き継ぐための一回限りの処理。
 */
function xImportMainAnswers() {
  var sh = xBook_().getSheetByName('メイン');
  if (!sh || sh.getLastRow() < 2) { xToast_('「メイン」シートに取り込めるものがありませんでした。'); return 0; }

  // B=ジャンル, C=質問, D=回答（業者さんのスクリプトの並び）
  var values = sh.getRange(2, 2, sh.getLastRow() - 1, 3).getValues();
  var dst = xSheet_(X_SHEETS.FACT, ['記録日', 'ジャンル', '質問', '回答', '使用回数']);
  var already = xAnsweredQuestions_();

  var added = 0;
  values.forEach(function (r) {
    var genre = String(r[0] || '').trim();
    var q = String(r[1] || '').trim();
    var a = String(r[2] || '').trim();
    if (!a) return;
    if (q && already.indexOf(q) >= 0) return;
    dst.appendRow(['(メインから取込)', genre, q, a, 0]);
    added++;
  });

  xToast_(added + '件を X_一次情報 に取り込みました。');
  return added;
}

/* ============================================================
 * 既存の「質問リスト」シートの取り込み
 *
 * 業者さんのシートは、1つの表に性質の違うものが混ざっている。
 *   ・質問だけあって回答が空の行      → まだ答えていない質問
 *   ・短い回答が入っている行          → 一次情報
 *   ・長文（完成した投稿）が入っている行 → 文体サンプル
 * これを仕分けて、それぞれの使い道に振り分ける。
 * ============================================================ */

/** これ以上の長さなら「完成した投稿」とみなす */
var X_SAMPLE_MIN_LEN = 200;

/**
 * 質問リストシートを読み、3つのシートに仕分ける。
 * 何度実行しても重複しない。
 */
function xImportQuestionSheet() {
  var ss = xBook_();
  var sh = null;
  for (var i = 0; i < X_QLIST_NAMES.length; i++) {
    sh = ss.getSheetByName(X_QLIST_NAMES[i]);
    if (sh) break;
  }
  if (!sh || sh.getLastRow() < 2) {
    xToast_('「質問リスト」シートが見つかりませんでした。');
    return;
  }

  var lastCol = Math.max(5, sh.getLastColumn());
  var values = sh.getRange(1, 1, sh.getLastRow(), lastCol).getValues();

  // 見出し行を探す（「質問」を含む行）
  var headRow = 0;
  for (var r = 0; r < Math.min(values.length, 15); r++) {
    var joined = values[r].join('|');
    if (joined.indexOf('質問') >= 0 && joined.indexOf('回答') >= 0) { headRow = r; break; }
  }

  var factSh = xSheet_(X_SHEETS.FACT, ['記録日', 'ジャンル', '質問', '回答', '使用回数']);
  var sampleSh = xSheet_(X_SHEETS.SAMPLE, ['取込日', '出所', '本文']);
  var qSh = xSheet_(X_SHEETS.QSTOCK, ['ジャンル', '質問', '答えた']);

  var knownFacts = xAnsweredQuestions_();
  var knownSamples = xExistingSamples_();
  var knownQs = xExistingQuestions_();

  var today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  var addFact = 0, addSample = 0, addQ = 0;

  for (var r = headRow + 1; r < values.length; r++) {
    var genre = String(values[r][1] || '').trim();
    var question = String(values[r][2] || '').trim();
    var answer = String(values[r][3] || '').trim();
    var extra = String(values[r][4] || '').trim();   // DIL投稿など5列目

    if (!question && !answer && !extra) continue;

    // 長文は完成した投稿とみなして、文体サンプルへ
    [answer, extra].forEach(function (txt) {
      if (txt.length >= X_SAMPLE_MIN_LEN && knownSamples.indexOf(txt.slice(0, 80)) < 0) {
        sampleSh.appendRow([today, '質問リスト(' + (genre || question || '') + ')', txt]);
        knownSamples.push(txt.slice(0, 80));
        addSample++;
      }
    });

    // 短い回答は一次情報へ
    if (answer && answer.length < X_SAMPLE_MIN_LEN && question &&
        knownFacts.indexOf(question) < 0) {
      factSh.appendRow([today, genre, question, answer, 0]);
      knownFacts.push(question);
      addFact++;
    }
    // 5列目が短文で、回答が空なら、それも一次情報として拾う
    if (!answer && extra && extra.length < X_SAMPLE_MIN_LEN && question &&
        knownFacts.indexOf(question) < 0) {
      factSh.appendRow([today, genre, question, extra, 0]);
      knownFacts.push(question);
      addFact++;
    }

    // 回答が空の質問は、未回答ストックへ
    if (question && !answer && !extra && knownQs.indexOf(question) < 0) {
      qSh.appendRow([genre, question, '']);
      knownQs.push(question);
      addQ++;
    }
  }

  sampleSh.setColumnWidth(3, 560);
  if (sampleSh.getLastRow() > 1) sampleSh.getRange(2, 3, sampleSh.getLastRow() - 1, 1).setWrap(true);
  factSh.setColumnWidth(4, 480);
  qSh.setColumnWidth(2, 560);
  if (qSh.getLastRow() > 1) qSh.getRange(2, 2, qSh.getLastRow() - 1, 1).setWrap(true);

  var msg = '取り込みました。 一次情報 ' + addFact + '件 / 文体サンプル ' + addSample +
            '件 / 未回答の質問 ' + addQ + '件';
  Logger.log(msg);
  xToast_(msg);
}

function xExistingSamples_() {
  var sh = xBook_().getSheetByName(X_SHEETS.SAMPLE);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 3, sh.getLastRow() - 1, 1).getValues()
    .map(function (r) { return String(r[0]).slice(0, 80); }).filter(String);
}

function xExistingQuestions_() {
  var sh = xBook_().getSheetByName(X_SHEETS.QSTOCK);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 2, sh.getLastRow() - 1, 1).getValues()
    .map(function (r) { return String(r[0]).trim(); }).filter(String);
}

/** 文体サンプルを読む（長いものを優先） */
function xReadSamples_(n) {
  var sh = xBook_().getSheetByName(X_SHEETS.SAMPLE);
  if (!sh || sh.getLastRow() < 2) return [];
  var rows = sh.getRange(2, 3, sh.getLastRow() - 1, 1).getValues()
    .map(function (r) { return String(r[0]).trim(); })
    .filter(function (s) { return s.length >= X_SAMPLE_MIN_LEN; });
  rows.sort(function (a, b) { return b.length - a.length; });
  return rows.slice(0, n || 3);
}

// ============================================================
// 17_XStrategy.js
// ============================================================

/**
 * 17_XStrategy.js
 * 発信設計書の読み込み
 *
 * 業者さんのヒアリングシート・戦略シートには、
 *   ・発信の目的 / ターゲット4層 / ペイン / 反応するキーワード / 抱かせる感情
 *   ・独自性 / 他社にない価値 / タグライン
 *   ・ミッション / ビジョン / 創業ストーリー / 仮想敵 / 一人称
 * が揃っている。これはそのまま生成の土台になる。
 *
 * 転記させると抜けるので、シートを丸ごとテキストとして読む。
 */

/** 読み込むシート名の既定候補 */
var X_STRATEGY_DEFAULTS = ['ヒアリング', 'ヒアリングシート', '戦略', '戦略シート', '設計', 'コンセプト'];

/** 1シートから読む最大文字数（プロンプトが膨らみすぎないように） */
var X_STRATEGY_MAX = 12000;

/**
 * 戦略シートを読み、1つのテキストにする。
 * X_設定 の「戦略シート名」（カンマ区切り）で指定。空なら既定候補から探す。
 */
function xReadStrategy_() {
  var setting = xReadSetting_();
  var names = String(setting['戦略シート名'] || '')
    .split(/[,、]/).map(function (s) { return s.trim(); }).filter(String);

  var ss = xBook_();
  if (!names.length) {
    var all = ss.getSheets().map(function (s) { return s.getName(); });
    names = all.filter(function (n) {
      return X_STRATEGY_DEFAULTS.some(function (d) { return n.indexOf(d) >= 0; });
    });
  }
  if (!names.length) return '';

  var out = [];
  names.forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh || sh.getLastRow() === 0) return;

    var values = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
    var lines = [];
    values.forEach(function (row) {
      var cells = row.map(function (v) {
        return String(v === null || v === undefined ? '' : v).trim();
      }).filter(String);
      if (cells.length) lines.push(cells.join('　／　'));
    });

    var text = lines.join('\n');
    if (text.length > X_STRATEGY_MAX) text = text.slice(0, X_STRATEGY_MAX) + '\n…（以下省略）';
    if (text) out.push('## ' + name + '\n' + text);
  });

  return out.join('\n\n');
}

/**
 * 読み込めているか確認する（実行してログを見る）。
 */
function xPreviewStrategy() {
  var text = xReadStrategy_();
  if (!text) {
    xToast_('戦略シートが見つかりませんでした。X_設定の「戦略シート名」にシート名を入れてください。');
    Logger.log('戦略シートが見つかりません。このブックのシート: ' +
      xBook_().getSheets().map(function (s) { return s.getName(); }).join(' / '));
    return 0;
  }
  Logger.log('読み込んだ文字数: ' + text.length);
  Logger.log('--- 先頭1500字 ---');
  Logger.log(text.slice(0, 1500));
  xToast_(text.length + '文字を読み込みました。ログを確認してください。');
  return text.length;
}

/**
 * 週の中でターゲット層をどう配分するか。
 * 新規接点をつくる段階なので、潜在層を厚く、明確層（相談導線）を1本だけ置く。
 */
function xLayerPlan_(count) {
  var base = ['潜在層', '潜在層', '潜在層', '準顕在層', '準顕在層', '顕在層', '明確層'];
  var out = [];
  for (var i = 0; i < count; i++) out.push(base[i % base.length]);
  return out;
}
