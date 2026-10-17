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
  STRATEGY: 'X_戦略',
  PATTERN: 'X_型カタログ',
  WEEKPLAN: 'X_週の傾向',
  REACTION: 'X_反応ログ',
  ANALYTICS: 'X_反応データ',
  IDEA: 'X_企画案'
};

/**
 * 投稿の分類（紫微斗数の宮と対応）。
 * 本人が毎週、星を見て各日に割り当てる。
 */
var X_CATEGORIES = [
  { name: '拡散',       desc: '広く届けたい・外に出す',          palace: '遷移宮', layer: '潜在層' },
  { name: '共感',       desc: '気持ちに寄り添う・「わかる」',    palace: '福徳宮', layer: '潜在層' },
  { name: '人脈',       desc: 'つながり・DM誘導・相談どうぞ',    palace: '僕役宮', layer: '明確層' },
  { name: '助け',       desc: '差し出す・「一緒に考えます」',    palace: '子女宮', layer: '顕在層' },
  { name: '成果',       desc: '結果・数字・売上',                palace: '財帛宮', layer: '顕在層' },
  { name: '専門',       desc: '仕事の知識・ノウハウ',            palace: '官禄宮', layer: '準顕在層' },
  { name: '自分の言葉', desc: '自分語り・実感・経歴',            palace: '命宮',   layer: '準顕在層' },
  { name: '仕組み化',   desc: '「仕組みになる」「長く効く」',    palace: '田宅宮', layer: '顕在層' }
];

/**
 * 視点の角度。
 *
 * 素材が同じでも、どの向きから見るかで結論が変わる。
 * 文体の再現だけだと既出の焼き直しになるので、週の中で角度を散らす。
 */
var X_ANGLES = [
  '自分が過去にしていた判断を否定する。「前はこう思っていたが、違った」から入る',
  'よく言われていることの逆を、自分の経験から言う。「〜と言われるけれど、現場では逆だった」',
  'うまくいかなかった話から入る。失敗の中身を具体的に書き、そこから何を変えたかで締める',
  '数字の裏側を書く。表に出ている数字ではなく、そこに含まれない部分の話をする',
  '読者の予想を外す。「〜の話だと思われるかもしれませんが、違います」から入る',
  '別の分野の出来事を、この仕事に重ねて見せる',
  '結論を先に言い切り、そこに至るまでに捨てた選択肢を並べる',
  '相手の立場に寄り切って書く。社長ではなく、聞かれる側（スタッフ）から見た景色を書く'
];

/** 使うモデル。文体の再現が目的なので安いモデルに落とさない。 */
var X_MODEL = 'claude-opus-5-5';

/** 1回のAPI呼び出しで渡す過去ログの件数。GASの実行時間に合わせて小さめ。 */
var X_BATCH_SIZE = 8;

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
  ['戦略シート名', '発信設計のシート名（カンマ区切り）。丸ごと読み込みます', true],
  ['一次情報シート名', 'インタビュー・年表など、実際の出来事が書いてあるシート（カンマ区切り）', false],
  ['文体サンプルシート名', 'サンプル投稿・固定ポストなど、完成した投稿があるシート（カンマ区切り）', false],
  ['これからのコンセプト', '戦略シートがあれば空でも可。補足したいことがあれば', false],
  ['アカウント紹介', 'プロフィール文など。読者像の判断に使います', false],
  ['投稿の方向性', '業者さんのシートに分類があればそれを貼る（改行区切り）', false],
  ['扱わないこと', '書かないテーマがあれば（改行区切り）', false],
  ['1本の文字数の目安', '空なら指定なし。長さを変えたいときだけ数字を入れる（例: 500）', false]
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

/** これ以上の長さの値が入っていたら「本文の行」とみなす */
var X_CONTENT_MIN_LEN = 80;

/**
 * ブロック（縦）レイアウトを読む。
 *
 * A列にラベル、B〜H列が1週間分（1列＝1日＝1投稿）。
 *
 * 実際のシートではブロックによってラベルが食い違っている
 * （本文の行が「投稿文」だったり「日付」だったりする）。
 * そのためラベルだけに頼らず、「値が長文ならそれは本文」と判定する。
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

  var rows = [];
  var cur = null;
  var curField = null;

  function newBlock(r) {
    var o = { row: r + 1 };
    ['見出し', '投稿日', '雛形', '実投稿'].forEach(function (f) {
      o[f] = [];
      for (var i = 0; i < width; i++) o[f].push('');
    });
    return o;
  }

  /** その行の値セルを配列で返す */
  function cellsOf(r) {
    var out = [];
    for (var i = 0; i < width; i++) {
      var raw = values[r][colFrom - 1 + i];
      out.push((raw === null || raw === undefined) ? '' : String(raw).trim());
    }
    return out;
  }

  function maxLenOf(cells) {
    var m = 0;
    cells.forEach(function (v) { if (v.length > m) m = v.length; });
    return m;
  }

  function put(block, field, cells) {
    for (var i = 0; i < width; i++) {
      if (!cells[i]) continue;
      block[field][i] = block[field][i] ? (block[field][i] + '\n' + cells[i]) : cells[i];
    }
  }

  function filled(block, field) {
    return block[field].some(function (v) { return String(v).trim(); });
  }

  function flush() {
    if (!cur) return;
    for (var i = 0; i < width; i++) {
      var t = String(cur['雛形'][i] || '').trim();
      var p = String(cur['実投稿'][i] || '').trim();
      if (!t && !p) continue;
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
    var cells = cellsOf(r);
    var maxLen = maxLenOf(cells);
    var hasValue = maxLen > 0;

    if (label && ignore.indexOf(label) >= 0) { curField = null; continue; }

    // ラベルが無い行は、直前のラベルの続きとして同じ列に足す
    if (!label) {
      if (cur && curField && hasValue) put(cur, curField, cells);
      continue;
    }

    var isLongRow = maxLen >= X_CONTENT_MIN_LEN;
    var field = null;
    var boundary = false;

    if (label === tmplLabel)      field = '雛形';
    else if (label === postLabel) field = '実投稿';
    else if (label === dateLabel) field = isLongRow ? null : '投稿日';
    else if (label === startLabel) {
      // 「日付」でも中身が長文なら、ラベルの付け間違い。本文として扱う
      if (isLongRow) field = null;
      else { boundary = true; field = '見出し'; }
    } else {
      // 想定外のラベル。長文なら本文、そうでなければ読み飛ばす
      if (!isLongRow) { curField = null; continue; }
      field = null;
    }

    // ラベルから決まらなかった長文行は、雛形→実投稿の順に入れる
    if (field === null) {
      if (!cur) cur = newBlock(r);
      field = filled(cur, '雛形') ? '実投稿' : '雛形';
    }

    if (boundary) { flush(); cur = newBlock(r); }
    if (!cur) cur = newBlock(r);

    // 同じ項目が二度出てきたら、そこから次のブロック
    if (!boundary && filled(cur, field)) { flush(); cur = newBlock(r); }

    curField = field;
    if (hasValue) put(cur, field, cells);
  }
  flush();
  return rows;
}

/**
 * A列にどんなラベルが並んでいるかを一覧にする（診断用）。
 */
function xPreviewLabels() {
  var map = xReadSetting_();
  var sh = xBook_().getSheetByName(map['対象シート名']);
  if (!sh) throw new Error('対象シートが見つかりません。');

  var labelCol = xColNum_(map['▼ラベル列'] || 'A');
  var colFrom  = xColNum_(map['▼値の開始列'] || 'B');
  var colTo    = Math.min(xColNum_(map['▼値の終了列'] || 'H'), sh.getLastColumn());
  var values = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();

  var counts = {};
  for (var r = 0; r < values.length; r++) {
    var label = String(values[r][labelCol - 1] || '').trim();
    if (!label) continue;
    var maxLen = 0;
    for (var c = colFrom - 1; c < colTo; c++) {
      var v = String(values[r][c] || '').trim();
      if (v.length > maxLen) maxLen = v.length;
    }
    var key = label + (maxLen >= X_CONTENT_MIN_LEN ? '（長文あり）' : '');
    counts[key] = (counts[key] || 0) + 1;
  }

  Logger.log('--- A列のラベル別件数 ---');
  Object.keys(counts).forEach(function (k) { Logger.log(k + ' : ' + counts[k] + '行'); });
  xToast_('ラベル一覧をログに出しました。');
  return counts;
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
  var all = xReadLog_();
  if (!all.length) throw new Error('過去ログが読めませんでした。X_設定を確認してください。');

  // 雛形と実投稿が両方そろっている行だけが「書き換えの差分」になる。
  // 修正欄がまばらなので、十分な数が無ければ差分抽出はあきらめ、
  // 投稿文そのものから文体を読む方式に切り替える。
  var pairs = all.filter(function (r) {
    return String(r['雛形'] || '').trim() && String(r['実投稿'] || '').trim();
  });
  var useDiff = pairs.length >= 5;
  var rows = useDiff ? pairs : all;

  Logger.log(useDiff
    ? ('差分あり ' + pairs.length + '件で抽出します（全' + all.length + '件中）')
    : ('書き換えの差分が ' + pairs.length + '件しかないため、投稿文そのものから文体を読みます（全' + all.length + '件）'));

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
    var result = null;

    try {
      result = xExtractBatch_(batch, useDiff);
    } catch (err1) {
      Logger.log('バッチ失敗（1回目）: ' + err1.message);
      // 件数を半分にして再試行する（出力が長すぎたケースの救済）
      try {
        var half = batch.slice(0, Math.max(1, Math.ceil(batch.length / 2)));
        result = xExtractBatch_(half, useDiff);
        batch = half;
        Logger.log('半分にして再試行し、成功しました（' + half.length + '件）');
      } catch (err2) {
        Logger.log('バッチ失敗（2回目）。この分は飛ばして続けます: ' + err2.message);
        logSh.appendRow([
          Math.floor(cursor / X_BATCH_SIZE) + 1,
          batch[0].row + '〜' + batch[batch.length - 1].row,
          '',
          '失敗のため省略 ' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm')
        ]);
        cursor += batch.length;
        p.setProperty(X_PROGRESS_KEY, String(cursor));
        continue;
      }
    }

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

/**
 * 1バッチ分を抽出する。
 * @param {Array} batch
 * @param {boolean} useDiff 雛形と実投稿の差分が取れるか
 */
function xExtractBatch_(batch, useDiff) {
  var items = batch.map(function (r, i) {
    if (useDiff) {
      return [
        '--- ' + (i + 1) + ' (行' + r.row + ') ---',
        '【雛形】',
        String(r['雛形'] || '(なし)'),
        '【実投稿】',
        String(r['実投稿'] || '(なし)')
      ].join('\n');
    }
    return [
      '--- ' + (i + 1) + ' (行' + r.row + ') ---',
      String(r['実投稿'] || r['雛形'] || '')
    ].join('\n');
  }).join('\n\n');

  var system = useDiff ? [
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
    '',
    '【出力量の制限】必ず守ってください。超えると読み取れなくなります。',
    '・各配列は最大15件まで。多いときは、繰り返し出てきたものだけを残す',
    '・1件は30字以内。語か短い言い回しだけを書く',
    '・かっこ書きの説明を付けない',
    '',
    '出力はJSONのみ。説明文やコードフェンスを付けないでください。'
  ].join('\n') : [
    'あなたは日本語の文体を分析する専門家です。',
    '与えられるのは、ある書き手が実際に出した投稿です。',
    '',
    '目的は、この書き手の文体を再現できるルールを取り出すことです。',
    'この書き手が使っていない種類の語（一般的なSNS文章によく出るが、ここには出てこない語）に',
    '気づいたら、それも「使わない語」として記録してください。',
    '',
    '文体に加えて、次の2つも記録してください。',
    '1. 扱っているテーマと、繰り返し出てくる主張',
    '2. 構成の型（どういう順で組み立てているか）',
    '',
    '推測で一般的な文章術を書かないでください。与えられた実例から読み取れることだけを書いてください。',
    '',
    '【出力量の制限】必ず守ってください。超えると読み取れなくなります。',
    '・各配列は最大15件まで。多いときは、繰り返し出てきたものだけを残す',
    '・1件は30字以内。語か短い言い回しだけを書く',
    '・かっこ書きの説明を付けない',
    '',
    '出力はJSONのみ。説明文やコードフェンスを付けないでください。'
  ].join('\n');

  var user = [
    useDiff ? '以下の対を分析し、JSONで返してください。' : '以下の投稿を分析し、JSONで返してください。',
    '',
    items,
    '',
    '--- 出力形式 ---',
    '{',
    (useDiff ? '  "消した語": ["雛形にあったが実投稿で消された語・言い回し"],'
             : '  "消した語": ["この書き手が使っていない、不自然になる語"],'),
    (useDiff ? '  "足した語": ["雛形になく実投稿で足された語・言い回し"],'
             : '  "足した語": ["この書き手が特徴的に使う語"],'),
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

  var text = xClaude_({ system: system, userText: user, maxTokens: 8000, effort: 'medium' });
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
    '【出力量の制限】各配列は最大25件、1件30字以内。かっこ書きの説明を付けない。',
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
    system: system, userText: user, maxTokens: 16000, effort: 'high'
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

    // 今週あったことを1行だけ。ここが新しい視点のいちばんの素になる。
    var r3 = ui.prompt(
      '今週あったこと（1行でOK・空でも進みます）',
      '相談で言われた言葉、詰まったこと、作ったもの、現場で見たこと。\n' +
      'ひとつだけ、短く。きれいに書かなくて大丈夫です。\n' +
      '例：「スタッフに聞かれた回数を数えたら1日12回だった」',
      ui.ButtonSet.OK_CANCEL);
    if (r3.getSelectedButton() === ui.Button.OK) {
      var note = String(r3.getResponseText() || '').trim();
      if (note) xSaveThisWeekNote_(note);
    }
  }

  var posts = xGenerate_(themes, count);
  xWriteDrafts_(posts);
  xWriteWeekBlock_(posts);

  // 全文を読まずに済むよう、機械で照合できる分はここで検査する
  var ng = 0;
  try { ng = xCheckDrafts() || 0; } catch (e) { Logger.log('チェック失敗: ' + e.message); }

  xToast_(posts.length + '本できました。' +
    (ng ? ('要確認が' + ng + '本あります（J列の赤い行）。') : '自動チェックは全部OKでした。') +
    ' X_投稿案_週形式 からコピーできます。');
}

/** 1回のAPI呼び出しで作る本数。多いと出力が上限に達して切れる。 */
var X_GEN_CHUNK = 3;

/** 生成全体の時間の上限（GASの6分制限に対する安全マージン） */
var X_GEN_TIME_LIMIT_MS = 4.8 * 60 * 1000;

/**
 * 生成の本体。
 *
 * 7本を1回で出すと出力が上限に達して切れるので、3本ずつに分けて呼ぶ。
 * 分けると冒頭が被りやすくなるため、前の回で使った1行目を次の回に渡す。
 *
 * @param {string} themesText テーマ（空なら提案させる）
 * @param {number} count 本数
 * @return {Array<Object>}
 */
function xGenerate_(themesText, count) {
  var started = Date.now();

  var setting = xReadSetting_();
  var strategy = xReadStrategy_();
  var concept = setting['これからのコンセプト'] || '';
  if (!strategy && !concept) {
    throw new Error('発信の軸がありません。X_設定の「戦略シート名」にヒアリング・戦略シートの名前を入れるか、' +
      '「これからのコンセプト」を書いてください。');
  }

  var rules = xReadRules_();
  var samples = xReadSamples_(2);
  if (!samples.length) samples = xPickSamples_(2);
  var facts = xReadFacts_(40);
  var factSheets = xReadFactSheets_();
  var sampleSheets = xReadSampleSheets_();
  var patterns = xPatternsText_();
  var plan = xReadWeekPlan_();
  var pastThemes = xPastThemes_(40);
  var reactions = xReadReactions_(30);
  var adopted = xAdoptedIdeas_();

  var system = xGenSystem_();
  var context = xGenContext_(setting, strategy, concept, rules,
                             samples, facts, factSheets, sampleSheets, patterns, reactions, adopted);

  var themes = String(themesText || '').trim();
  var all = [];
  var usedOpenings = [];
  var usedPatterns = [];

  for (var from = 0; from < count; from += X_GEN_CHUNK) {
    if (Date.now() - started > X_GEN_TIME_LIMIT_MS) {
      Logger.log('時間切れのため ' + all.length + ' 本で打ち切りました。');
      break;
    }

    var n = Math.min(X_GEN_CHUNK, count - from);
    var req = xGenRequest_(from, n, count, themes, plan, usedOpenings, usedPatterns, pastThemes);

    var posts;
    try {
      posts = xParseJson_(xClaude_({
        system: system,
        userText: context + '\n' + req,
        maxTokens: 16000,
        effort: 'high'
      })).posts || [];
    } catch (err) {
      Logger.log((from + 1) + '本目からの生成に失敗しました: ' + err.message);
      // 1本ずつに落として作り直す
      posts = [];
      for (var k = 0; k < n; k++) {
        if (Date.now() - started > X_GEN_TIME_LIMIT_MS) break;
        try {
          var one = xParseJson_(xClaude_({
            system: system,
            userText: context + '\n' +
              xGenRequest_(from + k, 1, count, themes, plan, usedOpenings, usedPatterns, pastThemes),
            maxTokens: 12000,
            effort: 'high'
          })).posts || [];
          posts = posts.concat(one);
        } catch (err2) {
          Logger.log((from + k + 1) + '本目を飛ばしました: ' + err2.message);
        }
      }
    }

    posts.forEach(function (p) {
      all.push(p);
      var head = String(p['冒頭3行'] || p['本文'] || '').split('\n')[0].trim();
      if (head) usedOpenings.push(head);
      if (p['使った型']) usedPatterns.push(String(p['使った型']));
    });
  }

  return all;
}

/** 生成のシステムプロンプト */
function xGenSystem_() {
  return [
    'あなたは、ある書き手の文体を完全に再現して X の投稿を書く人です。',
    '',
    '■ 言い切りの使い分け（この書き手の核になる規則）',
    '',
    '言い切っていいのは、この書き手が自分で経験したことだけです。',
    '  例：「早いのは、今日だけ」「あの冷や汗が怖くて、結局自分で見るしかなかった」',
    '  自分の経験は、留保をつけずにはっきり言い切ってください。そこがこの書き手の強みです。',
    '',
    '他人の傾向・統計・一般論は、言い切らないでください。',
    '  「9割が」「ほぼ全員」「絶対に」「本質は」「決め手はこれだけ」は使いません。',
    '  必ず留保をつけてください。「〜な気がします」「たぶん」「〜かもしれません」',
    '',
    '確かめていないことを本当のように書くのが、この書き手が一番嫌うことです。',
    '',
    '元になった発言がある場合、その発言より強く言い切らないでください。',
    '「〜だったりします」「〜かもしれません」という留保は、そのまま残します。',
    '元の発言に無い因果関係（だから成功する、など）を足さないでください。',
    '',
    '■ 最重要のルール',
    '',
    '- 「文体ルール」の禁止語は、絶対に使わないでください。',
    '  これは過去にこの書き手が自分で消した語です。1つでも混ざると本人の文ではなくなります。',
    '- 一次情報が与えられている場合、それを必ず使ってください。',
    '  数字・固有名詞・実際にあった出来事は、一次情報にあるものだけを書いてください。',
    '  それらしい具体例を作らないでください。',
    '- 年齢・時期・頻度・回数は、一次情報に書かれている表現をそのまま使ってください。',
    '  例：「14歳で」とあれば「14歳で」。「30代の頃」などに変えない。',
    '  元の表現が不自然に見えても、直さずにそのまま使ってください。',
    '  書かれていない頻度（「年に1回」など）を足さないでください。',
    '- 投稿例（文体の手本）に書かれている出来事や数字は、事実とは限りません。',
    '  外部ライターが作った話が混ざっています。文体だけを見て、事実は拾わないでください。',
    '- 新しいほうの投稿例を手本にしてください。古い投稿はいまの軸とは違います。',
    '- 一般的によくあるSNS文章術の型に寄せないでください。この書き手の型に寄せてください。',
    '',
    '出力はJSONのみ。説明文やコードフェンスを付けないでください。'
  ].join('\n');
}

/** 毎回共通で渡す材料 */
function xGenContext_(setting, strategy, concept, rules, samples, facts,
                      factSheets, sampleSheets, patterns, reactions, adopted) {
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
  if (setting['扱わないこと']) {
    parts.push('# 扱わないこと（書かない）');
    parts.push(setting['扱わないこと']);
    parts.push('');
  }

  parts.push('# 文体ルール（過去の書き換え履歴から抽出）');
  parts.push(rules);
  parts.push('');

  if (patterns) {
    parts.push('# 構成の型（この書き手が実際に使っている骨組み）');
    parts.push(patterns);
    parts.push('');
  }

  if (sampleSheets) {
    parts.push('# 完成した投稿（文体の手本）');
    parts.push('⚠️ ここは「書き方」だけを見てください。');
    parts.push('外部ライターが作った事実でない話が混ざっています。');
    parts.push('ここに書かれている出来事・数字は一切使わないでください。');
    parts.push(sampleSheets);
    parts.push('');
  }

  if (factSheets) {
    parts.push('# 経歴・インタビュー（一次情報の出どころ）');
    parts.push('ここに書かれている事実・数字・出来事だけを使ってください。');
    parts.push(factSheets);
    parts.push('');
  }

  if (facts) {
    parts.push('# 追加の一次情報');
    parts.push('「今週あったこと」が含まれている場合、それを最優先で使ってください。');
    parts.push('いちばん新しい出来事なので、過去の棚卸しより読む価値があります。');
    parts.push('7本のうち最低1本は、この出来事を中心に組み立ててください。');
    parts.push(facts);
    parts.push('');
  }

  if (adopted) {
    parts.push('# 今回書く企画（本人が選んだもの）');
    parts.push('この企画を書いてください。テーマを自分で考える必要はありません。');
    parts.push('「もとの返信」は、本人が実際に書いた文です。');
    parts.push('**その返信より強く言い切らないでください。**');
    parts.push('「〜だったりします」を「〜する」に変えない。根拠のない因果を足さない。');
    parts.push('「要確認」がある企画は、その部分を創作せず、');
    parts.push('本文の該当箇所に【要確認：〜】と書いて残してください。');
    parts.push(adopted);
    parts.push('');
  }

  if (reactions) {
    parts.push('# 読者からの反応・引用した相手の投稿（外からの入力）');
    parts.push('ここは他人の言葉です。扱い方に注意してください。');
    parts.push('・実際に言われた言葉として、そのまま引用してよいです。');
    parts.push('  「こう言われたことがあります」の形で使ってください。');
    parts.push('・「みんながそう思っている」「よくある悩みです」と一般化しないでください。');
    parts.push('  1人が言ったことは、1人が言ったこととして書いてください。');
    parts.push('・ここにある他人の視点は、本人が自分では思いつかない角度です。');
    parts.push('  内側の棚卸しだけで書くと既出の繰り返しになるので、積極的に使ってください。');
    parts.push('');
    parts.push('【「参考になった他人の投稿」「引用した相手の投稿」の扱い】');
    parts.push('借りてよいのは、扱っている"論点"だけです。');
    parts.push('・その投稿の言い回し、構成、たとえ話、事例は使わないでください。');
    parts.push('・「こういうことが問題になるのか」という問いだけを受け取り、');
    parts.push('  その問いに対する答えは、必ずこの書き手自身の経験から書いてください。');
    parts.push('・結果として、元の投稿とは違う結論になって構いません。');
    parts.push('・発信の軸（発信設計書）からは外れないでください。');
    parts.push('  論点が軸に合わない場合は、使わずに飛ばしてください。');
    parts.push(reactions);
    parts.push('');
  }

  return parts.join('\n');
}

/** その回ぶんの依頼 */
function xGenRequest_(from, n, total, themes, plan, usedOpenings, usedPatterns, pastThemes) {
  var parts = [];
  parts.push('# 依頼');
  parts.push('全' + total + '本のうち、' + (from + 1) + '本目から' + (from + n) + '本目までの ' +
             n + '本を書いてください。');

  if (themes) {
    parts.push('テーマ（全体ぶん。この中から、今回の' + n + '本に合うものを使ってください）:');
    parts.push(themes);
  } else {
    parts.push('テーマはあなたが決めてください。似たテーマを並べず、角度を変えてください。');
    parts.push('これまで繰り返し書いてきたテーマを、新しい角度で書き直すのも有効です。');
  }
  parts.push('');

  // 各本の分類
  parts.push('## この回で書く分（1本ずつ）');
  for (var i = 0; i < n; i++) {
    var idx = from + i;
    var slot = plan[idx];
    if (slot) {
      var line = '・' + (idx + 1) + '本目（' + slot.date + '）: ' + (slot.len || '長文');
      if (slot.cat) line += ' / 本文=' + slot.cat;
      if (slot.closeCat && slot.closeCat !== slot.cat) line += ' / 締め=' + slot.closeCat;
      var layer = xLayerOf_(slot.cat);
      if (layer) line += ' / 読者の温度=' + layer;
      if (slot.memo) line += ' / メモ=' + slot.memo;
      parts.push(line);
    } else {
      parts.push('・' + (idx + 1) + '本目: ' + xLayerPlan_(total)[idx]);
    }
  }
  if (plan.length) {
    parts.push('「締め」が本文と違う分は、最後の一文だけをその分類に寄せてください。');
  }
  parts.push('');

  // 視点の角度
  parts.push('## 視点の角度（1本ずつ違う角度から書く）');
  parts.push('素材が同じでも、どの向きから見るかで結論が変わります。');
  parts.push('文体をなぞるだけだと、過去に書いたことの焼き直しになります。');
  for (var a = 0; a < n; a++) {
    var ai = (from + a) % X_ANGLES.length;
    parts.push('・' + (from + a + 1) + '本目の角度: ' + X_ANGLES[ai]);
  }
  parts.push('');

  parts.push('## まだ結びついていない2つを結ぶ');
  parts.push('一次情報の中から、これまで同じ投稿で語られていない2つの出来事を選び、');
  parts.push('その2つを結びつけて1つの話にしてください。');
  parts.push('（例：別々の現場で起きたことを並べて、共通する構造を見せる）');
  parts.push('すでに何度も一緒に語られている組み合わせは避けてください。');
  parts.push('');

  if (pastThemes && pastThemes.length) {
    parts.push('## すでに書いたテーマ（同じ結論に着地しない）');
    parts.push('同じテーマを扱っても構いませんが、下と同じ着地にはしないでください。');
    parts.push('「結局いちばん大事なのは◯◯でした」で終わる形が繰り返されています。');
    parts.push('読み終えたときに、読者が前と違うことを考えている状態にしてください。');
    pastThemes.slice(0, 30).forEach(function (t) { parts.push('  ・' + t); });
    parts.push('');
  }

  // 冒頭と型の重複を避ける
  parts.push('## 重複を避ける');
  if (usedOpenings.length) {
    parts.push('すでに書いた投稿の1行目です。**これと同じ形で始めないでください。**');
    usedOpenings.forEach(function (h) { parts.push('  × ' + h); });
  }
  if (usedPatterns.length) {
    parts.push('すでに使った型です。別の型を使ってください: ' + usedPatterns.join('、'));
  }
  parts.push('・カギカッコで誰かの台詞や心の声を置いて始める形は、全' + total + '本のうち最大2本までです。');
  parts.push('・残りは、事実・数字・場面の描写・自分の行動など、別の入り方にしてください。');
  parts.push('');

  parts.push('');
  parts.push('## 長文と短文');
  parts.push('・長文 … じっくり書く。背景・具体例・そこから言えることまで入れる');
  parts.push('・短文 … 110〜150字。長文で書いた論点をひとつだけ切り出す。');
  parts.push('  　　　 結論を1つに絞り、具体例は1つだけ。説明を足さない。');
  parts.push('  　　　 内容を薄めるのではなく、範囲を狭めてください。');
  parts.push('・短文は、同じ週の長文と素材を共有して構いません。');
  parts.push('  同じ材料を違う角度で切り直すほうが、新しい素材を薄く広げるより濃くなります。');
  parts.push('');

  var lenHint = xLengthHint_();
  if (lenHint) {
    parts.push('## 長さ');
    parts.push(lenHint);
    parts.push('');
  }

  parts.push('--- 出力形式 ---');
  parts.push('{"posts":[{');
  parts.push('  "テーマ": "この投稿のテーマ（30字以内）",');
  parts.push('  "ターゲット層": "潜在層／準顕在層／顕在層／明確層 のどれか",');
  parts.push('  "使った型": "構成の型の型名",');
  parts.push('  "分類": "拡散／共感／人脈／助け／成果／専門／自分の言葉／仕組み化 のどれか",');
  parts.push('  "本文": "そのまま投稿できる完成文。改行もそのまま",');
  parts.push('  "冒頭3行": "最初の3行だけを抜き出したもの",');
  parts.push('  "狙い": "30字以内",');
  parts.push('  "使った事実": "本文で触れた事実の出どころ。60字以内",');
  parts.push('  "使った禁止語チェック": "20字以内"');
  parts.push('}]}');
  parts.push('※ posts には必ず ' + n + ' 本だけ入れてください。');

  return parts.join('\n');
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
    ['作成日時', '分類', '使った型', 'ターゲット層', 'テーマ', '本文', '冒頭3行', '狙い', '使った事実', '自己チェック', '投稿予定日', '状態']);

  var now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
  var rows = posts.map(function (p) {
    return [
      now,
      p['分類'] || '',
      p['使った型'] || '',
      p['ターゲット層'] || '',
      p['テーマ'] || '',
      p['本文'] || '',
      p['冒頭3行'] || '',
      p['狙い'] || '',
      p['使った事実'] || '',
      p['使った禁止語チェック'] || '',
      '',
      '未'
    ];
  });

  if (!rows.length) return;
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  sh.setColumnWidth(6, 520);
  sh.setColumnWidth(9, 300);
  sh.getRange(2, 6, sh.getLastRow() - 1, 1).setWrap(true);
  sh.getRange(2, 9, sh.getLastRow() - 1, 1).setWrap(true);
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

  var plan = xReadWeekPlan_();

  var headRow = [startLabel];
  var dateRow = [dateLabel];
  var textRow = [tmplLabel];
  var fixRow  = [postLabel];

  for (var i = 0; i < width; i++) {
    var d = new Date(base.getTime());
    d.setDate(base.getDate() + i);
    var ymd = Utilities.formatDate(d, 'Asia/Tokyo', 'yyyy-MM-dd');
    var slot = plan[i];
    headRow.push(wdays[d.getDay()] + '（' + Utilities.formatDate(d, 'Asia/Tokyo', 'M/d') + '）' +
                 (slot && slot.cat ? ' ' + slot.cat : ''));
    dateRow.push(ymd + (slot && slot.time ? ' ' + slot.time : ''));
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


/**
 * すでに生成した投稿のテーマを集める（新規性の判定に使う）。
 */
function xPastThemes_(limit) {
  var out = [];
  var sh = xBook_().getSheetByName(X_SHEETS.DRAFT);
  if (sh && sh.getLastRow() > 1) {
    // 列順: 作成日時, 分類, 使った型, ターゲット層, テーマ, ...
    var values = sh.getRange(2, 5, sh.getLastRow() - 1, 1).getValues();
    for (var i = values.length - 1; i >= 0 && out.length < limit; i--) {
      var t = String(values[i][0]).trim();
      if (t && out.indexOf(t) < 0) out.push(t);
    }
  }
  return out;
}


/**
 * 「今週あったこと」を一次情報として保存する。
 * アンケートを別途送るような手間を増やさず、生成のついでに1行だけ溜める。
 */
function xSaveThisWeekNote_(note) {
  var sh = xSheet_(X_SHEETS.FACT, ['記録日', 'ジャンル', '質問', '回答', '使用回数']);
  sh.appendRow([
    Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd'),
    '今週あったこと',
    '今週あったこと（' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'M/d') + '）',
    note,
    0
  ]);
  sh.getRange(sh.getLastRow(), 4).setWrap(true);
}


/** X_設定 の「1本の文字数の目安」を読む。空なら指定なし。 */
function xLengthHint_() {
  var v = String(xReadSetting_()['1本の文字数の目安'] || '').trim();
  var n = parseInt(v.replace(/[^0-9]/g, ''), 10);
  if (!n || isNaN(n)) return '';
  return '本文は ' + n + '字前後にしてください（±2割まで）。' +
         '短くするために内容を削るのではなく、言い回しを詰めてください。';
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
      .addItem('　 A列のラベルを数える', 'xPreviewLabels')
      .addSeparator()
      .addItem('② 質問リストを取り込む', 'xImportQuestionSheet')
      .addItem('② メインシートの回答を取り込む', 'xImportMainAnswers')
      .addItem('③ 文体を抽出する（完了まで数回押す）', 'xExtractStyle')
      .addItem('③ 構成の型を取り出す', 'xExtractPatterns')
      .addSeparator()
      .addItem('今週の傾向シートを作る（紫微斗数）', 'xSetupWeekPlan')
      .addItem('反応ログのシートを作る', 'xSetupReactionLog')
      .addSeparator()
      .addItem('アナリティクス: 貼り付けシートを作る', 'xSetupAnalyticsSheet')
      .addItem('アナリティクス: 取り込む（返信を一次情報に）', 'xImportAnalytics')
      .addItem('アナリティクス: 状況を見る', 'xAnalyticsSummary')
      .addSeparator()
      .addItem('★ 返信から新しい企画を発掘する', 'xMineTopics')
      .addItem('　 発掘をやり直す', 'xResetMining')
      .addItem('　 抽出をやり直す', 'xResetExtract')
      .addSeparator()
      .addItem('④ 今週の投稿案を作る', 'xGeneratePosts')
      .addItem('　 投稿案を自動チェックする', 'xCheckDrafts')
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
var X_STRATEGY_DEFAULTS = ['コンセプト', 'アカウント設計', '戦略', 'ヒアリング', '設計', '目標達成', '運用マニュアル'];
var X_FACTSHEET_DEFAULTS = ['インタビュー', '年表', 'メイン'];
var X_SAMPLESHEET_DEFAULTS = ['サンプル投稿', '固定ポスト'];

/** 1シートから読む最大文字数（プロンプトが膨らみすぎないように） */
var X_STRATEGY_MAX = 12000;

/**
 * 指定したシート群を、丸ごとテキストとして読む。
 * 行の形がシートごとにバラバラなので、表として解釈せず、
 * 空でないセルをつないで素のテキストにする。取りこぼしが出ない。
 *
 * @param {Array<string>} names シート名
 * @param {number} maxPerSheet 1シートあたりの最大文字数
 */
function xReadSheetsAsText_(names, maxPerSheet) {
  var ss = xBook_();
  var out = [];
  (names || []).forEach(function (name) {
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
    var cap = maxPerSheet || X_STRATEGY_MAX;
    if (text.length > cap) text = text.slice(0, cap) + '\n…（以下省略）';
    if (text) out.push('## ' + name + '\n' + text);
  });
  return out.join('\n\n');
}

/**
 * 設定からシート名のリストを得る。
 * 設定が空なら、既定候補に部分一致するシートを探す。
 * 「(2026.10-)」のような新しい版があれば、そちらを優先する。
 */
function xResolveSheetNames_(settingKey, defaults) {
  var setting = xReadSetting_();
  var names = String(setting[settingKey] || '')
    .split(/[,、]/).map(function (s) { return s.trim(); }).filter(String);
  if (names.length) return names;

  var all = xBook_().getSheets().map(function (s) { return s.getName(); });
  var hit = all.filter(function (n) {
    return defaults.some(function (d) { return n.indexOf(d) >= 0; });
  });

  // 「コンセプト」と「コンセプト(2026.10-)」が両方ある場合、新しい方だけ使う
  var dropped = {};
  hit.forEach(function (a) {
    hit.forEach(function (b) {
      if (a !== b && b.indexOf(a) === 0 && b.length > a.length) dropped[a] = true;
    });
  });
  return hit.filter(function (n) { return !dropped[n]; });
}

/**
 * 戦略シートを読み、1つのテキストにする。
 * X_設定 の「戦略シート名」（カンマ区切り）で指定。空なら既定候補から探す。
 */
function xReadStrategy_() {
  return xReadSheetsAsText_(xResolveSheetNames_('戦略シート名', X_STRATEGY_DEFAULTS), X_STRATEGY_MAX);
}

/** インタビュー・年表・メインなどを、一次情報として丸ごと読む */
function xReadFactSheets_() {
  return xReadSheetsAsText_(xResolveSheetNames_('一次情報シート名', X_FACTSHEET_DEFAULTS), 10000);
}

/** サンプル投稿・固定ポストを、文体サンプルとして丸ごと読む */
function xReadSampleSheets_() {
  return xReadSheetsAsText_(xResolveSheetNames_('文体サンプルシート名', X_SAMPLESHEET_DEFAULTS), 10000);
}

/**
 * 読み込めているか確認する（実行してログを見る）。
 */
function xPreviewStrategy() {
  var strategy = xReadStrategy_();
  var facts = xReadFactSheets_();
  var samples = xReadSampleSheets_();

  Logger.log('発信設計書 : ' + strategy.length + '文字  ' +
    xResolveSheetNames_('戦略シート名', X_STRATEGY_DEFAULTS).join(' / '));
  Logger.log('一次情報   : ' + facts.length + '文字  ' +
    xResolveSheetNames_('一次情報シート名', X_FACTSHEET_DEFAULTS).join(' / '));
  Logger.log('文体サンプル: ' + samples.length + '文字  ' +
    xResolveSheetNames_('文体サンプルシート名', X_SAMPLESHEET_DEFAULTS).join(' / '));

  var text = strategy;
  if (!text) {
    xToast_('戦略シートが見つかりませんでした。X_設定の「戦略シート名」にシート名を入れてください。');
    Logger.log('戦略シートが見つかりません。このブックのシート: ' +
      xBook_().getSheets().map(function (s) { return s.getName(); }).join(' / '));
    return 0;
  }
  Logger.log('読み込んだ文字数: ' + text.length);
  Logger.log('--- 先頭1500字 ---');
  Logger.log(text.slice(0, 1500));
  xToast_('設計書' + strategy.length + '字 / 一次情報' + facts.length +
          '字 / サンプル' + samples.length + '字 を読み込みました。ログを確認してください。');
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


/**
 * サンプル投稿・固定ポストのシートから、投稿を1本ずつ取り出す。
 *
 * xReadSampleSheets_() はシートを丸ごと1つのテキストにするが、
 * 型の分析には「1本ずつ」の形が要る。
 * セル単位で読み、十分な長さのものを1投稿として扱う。
 *
 * @param {number} minLen これ以上の長さを投稿とみなす
 * @return {Array<string>} 新しいほうが先（シートの下にあるものを先頭に）
 */
function xReadSampleSheetPosts_(minLen) {
  minLen = minLen || 150;
  var names = xResolveSheetNames_('文体サンプルシート名', X_SAMPLESHEET_DEFAULTS);
  var ss = xBook_();
  var out = [];

  names.forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh || sh.getLastRow() === 0) return;
    var values = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();

    // 下の行ほど新しいとみなして、後ろから拾う
    for (var r = values.length - 1; r >= 0; r--) {
      for (var c = 0; c < values[r].length; c++) {
        var v = String(values[r][c] === null || values[r][c] === undefined ? '' : values[r][c]).trim();
        if (v.length >= minLen) out.push(v);
      }
    }
  });
  return out;
}

// ============================================================
// 18_XPattern.js
// ============================================================

/**
 * 18_XPattern.js
 * 型カタログ
 *
 * 過去の投稿から「構成の型」を複数取り出す。
 *
 * 文体ルールだけだと、同じ骨組みの投稿が並んでしまう。
 * 内容を変えても形が同じだと、読む側には「前と同じ」に見える。
 * そこで型を複数持たせ、週の中で散らす。
 */

/** 型を何種類取り出すか */
var X_PATTERN_COUNT = 8;

/** 分析に使う投稿の本数 */
var X_PATTERN_SAMPLES = 20;

/**
 * 過去の投稿から型を取り出して X_型カタログ に書く。
 */
function xExtractPatterns() {
  var posts = xPickPatternSamples_(X_PATTERN_SAMPLES);
  if (posts.length < 5) {
    throw new Error('分析できる投稿が足りません（' + posts.length + '本）。先に xPreviewLog で読み取りを確認してください。');
  }

  var items = posts.map(function (t, i) {
    return '--- 投稿' + (i + 1) + ' ---\n' + t;
  }).join('\n\n');

  var catList = X_CATEGORIES.map(function (c) {
    return '・' + c.name + '（' + c.desc + '）';
  }).join('\n');

  var system = [
    'あなたは日本語の文章構成を分析する専門家です。',
    '与えられるのは、同じ書き手の名前で出された投稿です。',
    '',
    '注意：この中には、外部ライターが作った事実でない内容が混ざっています。',
    '内容の真偽は見ないでください。見るのは骨組みだけです。',
    '',
    '目的は「構成の型」を複数取り出すことです。',
    'この書き手が無意識に使い分けている骨組みを、違いが分かる形で分けてください。',
    '',
    '守ること:',
    '・似た型をまとめないでください。違いが出るように分けてください',
    '・この書き手が「使わない」と決めているものを、型の説明に入れないでください。',
    '  使わないもの（後述の禁止リスト）に当たる書き方は、型として採用しないでください。',
    '・一般的な文章構成の教科書を書かないでください。この投稿群にある型だけを書いてください',
    '・先に出てくる投稿ほど新しく、いまの発信の軸に近いものです。',
    '  古い投稿にしか無い型より、新しい投稿にある型を優先して拾ってください',
    '・骨組みは「何行目に何を置くか」ではなく「どういう順で読者を動かすか」で書いてください',
    '',
    '出力はJSONのみ。説明文やコードフェンスを付けないでください。'
  ].join('\n');

  var rules = '';
  try { rules = xReadRules_(); } catch (e) { rules = ''; }

  var user = [
    '以下の投稿から、構成の型を' + X_PATTERN_COUNT + '種類に分けてください。',
    '',
    (rules ? ('--- この書き手の禁止リスト（これに当たる書き方は型にしない） ---\n' + rules + '\n') : ''),
    items,
    '',
    '--- 投稿の分類（この型がどれに向くかを選ぶ） ---',
    catList,
    '',
    '--- 出力形式 ---',
    '{"patterns":[{',
    '  "型名": "10字以内。この型を一言で",',
    '  "骨組み": ["順に3〜6段階。各20字以内"],',
    '  "向いている分類": ["上の分類から1〜3つ"],',
    '  "冒頭の作り方": "1行目をどう始めるか。20字以内",',
    '  "締め方": "最後の一文をどう置くか。20字以内",',
    '  "この型が効く理由": "30字以内"',
    '}]}'
  ].join('\n');

  var json = xParseJson_(xClaude_({
    system: system, userText: user, maxTokens: 12000, effort: 'high'
  }));

  xWritePatterns_(json.patterns || []);
  xToast_((json.patterns || []).length + '種類の型を X_型カタログ に書き出しました。');
  return (json.patterns || []).length;
}

/**
 * 分析用の投稿を拾う。
 *
 * 【重要】新しい投稿を優先する。
 * 古い投稿は外部ライターの雛形がもとになっており、その型を学ぶと
 * うまくいかなかった形を再生産してしまう。
 * 直近で手応えのあった投稿のほうが、いまの軸に近い。
 */
function xPickPatternSamples_(n) {
  var out = [];
  var seen = {};

  function add(t) {
    t = String(t || '').trim();
    if (t.length < 150) return;
    var key = t.slice(0, 60);
    if (seen[key]) return;
    seen[key] = true;
    out.push(t);
  }

  // 1. サンプル投稿・固定ポストのシート（今週分を足してもらう場所。最優先）
  //    ここが一番新しく、実際に手応えのあった投稿が入る。
  xReadSampleSheetPosts_(150).slice(0, 10).forEach(add);

  // 2. 取り込み済みの文体サンプルシートがあれば、それも
  xReadSamples_(4).forEach(add);

  var rows;
  try { rows = xReadLog_(); } catch (e) { rows = []; }
  var texts = rows.map(function (r) {
    return String(r['実投稿'] || r['雛形'] || '').trim();
  }).filter(function (t) { return t.length >= 150; });

  // 3. 過去ログの直近ぶん（新しい順）
  for (var i = texts.length - 1; i >= 0 && out.length < n - 4; i--) add(texts[i]);

  // 4. 残り枠で、古いほうからも少しだけ（型の幅を見るため）
  var step = Math.max(1, Math.floor(texts.length / 4));
  for (var j = 0; j < texts.length && out.length < n; j += step) add(texts[j]);

  return out.slice(0, n);
}

/** 型カタログをシートに書く（手で直せる形） */
function xWritePatterns_(patterns) {
  var sh = xSheet_(X_SHEETS.PATTERN,
    ['型名', '骨組み', '向いている分類', '冒頭の作り方', '締め方', '効く理由', '使わない']);
  if (sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent();
  }
  if (!patterns.length) return;

  var rows = patterns.map(function (p) {
    return [
      p['型名'] || '',
      (p['骨組み'] || []).join('\n↓\n'),
      (p['向いている分類'] || []).join('、'),
      p['冒頭の作り方'] || '',
      p['締め方'] || '',
      p['この型が効く理由'] || '',
      ''
    ];
  });
  sh.getRange(2, 1, rows.length, 7).setValues(rows);
  sh.setColumnWidth(2, 260);
  sh.setColumnWidth(6, 240);
  sh.getRange(2, 1, rows.length, 7).setWrap(true).setVerticalAlignment('top');
}

/**
 * 型カタログを読む。「使わない」に何か書いてある行は除く。
 */
function xReadPatterns_() {
  var sh = xBook_().getSheetByName(X_SHEETS.PATTERN);
  if (!sh || sh.getLastRow() < 2) return [];

  var values = sh.getRange(2, 1, sh.getLastRow() - 1, 7).getValues();
  return values
    .filter(function (r) { return String(r[0]).trim() && !String(r[6]).trim(); })
    .map(function (r) {
      return {
        name: String(r[0]).trim(),
        frame: String(r[1]).trim(),
        cats: String(r[2]).trim(),
        open: String(r[3]).trim(),
        close: String(r[4]).trim(),
        why: String(r[5]).trim()
      };
    });
}

/** 生成プロンプト用のテキストにする */
function xPatternsText_() {
  var list = xReadPatterns_();
  if (!list.length) return '';
  return list.map(function (p, i) {
    return [
      '【型' + (i + 1) + '：' + p.name + '】',
      '骨組み: ' + p.frame.replace(/\n/g, ' '),
      '向く分類: ' + p.cats,
      '冒頭: ' + p.open,
      '締め: ' + p.close
    ].join('\n');
  }).join('\n\n');
}

// ============================================================
// 19_XWeek.js
// ============================================================

/**
 * 19_XWeek.js
 * 週の傾向（紫微斗数で決めた、その日に向く投稿の種類）
 *
 * 計算はしない。本人が星を見て決めた結論だけを受け取る。
 * 本文の分類と締めの分類を分けて持つ（同じ内容でも締めで宮が変わるため）。
 */

/**
 * X_週の傾向 シートを作る（翌日から7日分の枠を用意する）。
 */
function xSetupWeekPlan() {
  var sh = xSheet_(X_SHEETS.WEEKPLAN,
    ['日付', '長さ', '本文の分類', '締めの分類', '投稿時刻', '回る人数', 'メモ']);

  if (sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent();
  }

  var wdays = ['日', '月', '火', '水', '木', '金', '土'];
  var base = new Date();
  base.setDate(base.getDate() + 1);

  var rows = [];
  for (var i = 0; i < 7; i++) {
    var d = new Date(base.getTime());
    d.setDate(base.getDate() + i);
    // 週2本を長文にする。間隔があくように3日目と6日目へ。
    var len = (i === 2 || i === 5) ? '長文' : '短文';
    rows.push([
      Utilities.formatDate(d, 'Asia/Tokyo', 'yyyy-MM-dd') +
        '（' + wdays[d.getDay()] + '）',
      len, '', '', '', '', ''
    ]);
  }
  sh.getRange(2, 1, rows.length, 7).setValues(rows);

  // 長さをプルダウンにする
  var lenRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['長文', '短文'], true).setAllowInvalid(true).build();
  sh.getRange(2, 2, rows.length, 1).setDataValidation(lenRule);

  // 分類をプルダウンにする
  var names = X_CATEGORIES.map(function (c) { return c.name; });
  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(names, true).setAllowInvalid(true).build();
  sh.getRange(2, 3, rows.length, 2).setDataValidation(rule);

  // 分類の意味を右側に添えておく
  var legend = [['', '', '', '', '', '', '']];
  legend.push(['── 分類 ──', '中身', '宮', '', '', '', '']);
  X_CATEGORIES.forEach(function (c) {
    legend.push([c.name, c.desc, c.palace, '', '', '', '']);
  });
  legend.push(['', '', '', '', '', '', '']);
  legend.push(['── 長さ ──', '長文=じっくり書く / 短文=長文の論点をひとつ切り出す', '', '', '', '', '']);
  sh.getRange(rows.length + 2, 1, legend.length, 7).setValues(legend);
  sh.setColumnWidth(1, 150);
  sh.setColumnWidth(2, 80);
  sh.setColumnWidth(3, 120);
  sh.setColumnWidth(4, 120);

  xToast_('X_週の傾向 を作りました。本文の分類を埋めてください（締めは空でもOK）。');
}

/**
 * 週の傾向を読む。
 * @return {Array<{date,cat,closeCat,time,people,memo}>}
 */
function xReadWeekPlan_() {
  var sh = xBook_().getSheetByName(X_SHEETS.WEEKPLAN);
  if (!sh || sh.getLastRow() < 2) return [];

  var values = sh.getRange(2, 1, sh.getLastRow() - 1, 7).getValues();
  var out = [];
  for (var i = 0; i < values.length; i++) {
    var date = String(values[i][0]).trim();
    if (!date || date.indexOf('──') >= 0) break;   // 凡例に入ったら終わり
    var len = String(values[i][1]).trim();
    var cat = String(values[i][2]).trim();
    if (!cat && !len) continue;                     // 何も指定がない日は飛ばす
    out.push({
      date: date,
      len: len || '長文',
      cat: cat,
      closeCat: String(values[i][3]).trim() || cat,
      time: String(values[i][4]).trim(),
      people: String(values[i][5]).trim(),
      memo: String(values[i][6]).trim()
    });
  }
  return out;
}

/** 分類名から、対応する読者の温度を引く */
function xLayerOf_(catName) {
  for (var i = 0; i < X_CATEGORIES.length; i++) {
    if (X_CATEGORIES[i].name === catName) return X_CATEGORIES[i].layer;
  }
  return '';
}

/** 生成プロンプト用のテキストにする */
function xWeekPlanText_() {
  var plan = xReadWeekPlan_();
  if (!plan.length) return '';

  var lines = plan.map(function (p, i) {
    var parts = [(i + 1) + '本目（' + p.date + '）: ' + (p.len || '長文') +
                 (p.cat ? ' / 本文=' + p.cat : '')];
    if (p.closeCat !== p.cat) parts.push('締め=' + p.closeCat);
    var layer = xLayerOf_(p.cat);
    if (layer) parts.push('読者の温度=' + layer);
    if (p.memo) parts.push('メモ=' + p.memo);
    return '  ' + parts.join(' / ');
  });
  return lines.join('\n');
}

/* ============================================================
 * 反応ログ
 *
 * 引用ポスト、もらったコメント、自分の返信を溜める。
 *
 * インタビューや年表は「自分の内側」の棚卸しなので、
 * そこからだけ書くと内側で完結した話しか出ない。
 * 他人の言葉は、自分では思いつかない角度をそのまま持ち込む。
 * ============================================================ */

/** 反応ログの種類 */
var X_REACTION_KINDS = [
  '自分の投稿',
  '引用した相手の投稿',
  'もらったコメント',
  '自分の返信',
  'DMでのやりとり',
  '対面で言われたこと',
  '参考になった他人の投稿'   // 論点だけ借りる。表現と事例は使わない
];

/**
 * X_反応ログ シートを作る。
 */
function xSetupReactionLog() {
  var sh = xSheet_(X_SHEETS.REACTION, ['日付', '種類', '内容', '誰の言葉か', '気づいたこと']);

  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(X_REACTION_KINDS, true).setAllowInvalid(true).build();
  sh.getRange(2, 2, 200, 1).setDataValidation(rule);

  sh.setColumnWidth(1, 100);
  sh.setColumnWidth(2, 150);
  sh.setColumnWidth(3, 520);
  sh.setColumnWidth(5, 280);
  sh.getRange(2, 3, sh.getMaxRows() - 1, 1).setWrap(true);
  sh.getRange(2, 5, sh.getMaxRows() - 1, 1).setWrap(true);

  xToast_('X_反応ログ を作りました。引用ポストやコメントを貼ってください。');
}

/**
 * 反応ログを、生成プロンプト用のテキストにする。
 * @param {number} limit 新しいほうから何件か
 */
function xReadReactions_(limit) {
  var sh = xBook_().getSheetByName(X_SHEETS.REACTION);
  if (!sh || sh.getLastRow() < 2) return '';

  var values = sh.getRange(2, 1, sh.getLastRow() - 1, 5).getValues();
  var rows = values.filter(function (r) { return String(r[2]).trim(); });
  if (!rows.length) return '';

  rows.reverse();
  if (limit) rows = rows.slice(0, limit);

  return rows.map(function (r) {
    var parts = [];
    var head = '- 【' + (String(r[1]).trim() || '記録') + '】';
    if (r[0]) head += ' ' + fmtDate_(r[0]);
    if (r[3]) head += '（' + String(r[3]).trim() + '）';
    parts.push(head);
    parts.push('  ' + String(r[2]).trim().replace(/\n/g, '\n  '));
    if (r[4]) parts.push('  → 気づいたこと: ' + String(r[4]).trim());
    return parts.join('\n');
  }).join('\n');
}

// ============================================================
// 20_XCheck.js
// ============================================================

/**
 * 20_XCheck.js
 * 投稿案の自動チェック
 *
 * 7本を全部読むのをやめるための仕組み。
 * 機械的に照合できることは機械にやらせ、人は赤くなった箇所だけ見る。
 *
 * APIは使わない（文字列の照合だけ）ので、一瞬で終わる。
 */

/**
 * X_投稿案 の未チェック分を検査し、結果を書き込む。
 * 問題があった行には色を付ける。
 */
function xCheckDrafts() {
  var sh = xBook_().getSheetByName(X_SHEETS.DRAFT);
  if (!sh || sh.getLastRow() < 2) {
    xToast_('X_投稿案 がありません。先に投稿案を作ってください。');
    return;
  }

  var banned = xBannedWords_();
  var known = xKnownFactsText_();

  // 列順: 作成日時,分類,使った型,ターゲット層,テーマ,本文,冒頭3行,狙い,使った事実,自己チェック,投稿予定日,状態
  var lastRow = sh.getLastRow();
  var bodies = sh.getRange(2, 6, lastRow - 1, 1).getValues();

  var results = [];
  var ngRows = [];

  for (var i = 0; i < bodies.length; i++) {
    var body = String(bodies[i][0] || '');
    if (!body.trim()) { results.push(['']); continue; }

    var problems = [];

    // 1) 禁止語
    var hits = banned.filter(function (w) { return body.indexOf(w) >= 0; });
    if (hits.length) problems.push('禁止語: ' + hits.join('、'));

    // 2) 一次情報に見当たらない数字
    var unknownNums = xUnknownNumbers_(body, known);
    if (unknownNums.length) problems.push('出どころ未確認の数字: ' + unknownNums.join('、'));

    // 3) 冒頭がカギカッコで始まっていないか（週で2本までの確認用）
    var head = body.split('\n')[0].trim();
    var quoted = /^[「『]/.test(head);

    var text = problems.length ? ('⚠ ' + problems.join(' / ')) : 'OK';
    if (quoted) text += '（冒頭カギカッコ）';

    results.push([text]);
    if (problems.length) ngRows.push(i + 2);
  }

  sh.getRange(2, 10, results.length, 1).setValues(results);
  sh.getRange(2, 10, results.length, 1).setBackground(null);
  ngRows.forEach(function (r) { sh.getRange(r, 10).setBackground('#fdeceb'); });

  var quotedCount = results.filter(function (r) {
    return String(r[0]).indexOf('冒頭カギカッコ') >= 0;
  }).length;

  var msg = ngRows.length
    ? (ngRows.length + '本に要確認があります。J列（自己チェック）の赤い行だけ見てください。')
    : '全部OKでした。そのまま使えます。';
  if (quotedCount > 2) msg += ' / カギカッコ始まりが' + quotedCount + '本あります（目安は2本まで）';

  Logger.log(msg);
  xToast_(msg);
  return ngRows.length;
}

/** 文体ルールの禁止語を配列で取り出す */
function xBannedWords_() {
  var sh = xBook_().getSheetByName(X_SHEETS.RULE);
  if (!sh || sh.getLastRow() < 2) return [];

  var values = sh.getDataRange().getValues();
  var out = [];
  for (var r = 1; r < values.length; r++) {
    var key = String(values[r][0]).trim();
    if (key !== '禁止語' && key !== 'やってはいけないこと') continue;
    String(values[r][1]).split('\n').forEach(function (w) {
      w = w.trim();
      // 1〜2字の語や、文章になっているものは誤検出するので外す
      if (w.length >= 3 && w.length <= 20 && w.indexOf('。') < 0) out.push(w);
    });
  }
  return out;
}

/** 事実の出どころになる文章を、1つにまとめて返す */
function xKnownFactsText_() {
  var parts = [];
  try { parts.push(xReadFactSheets_()); } catch (e) {}
  try { parts.push(xReadFacts_(200)); } catch (e) {}
  try { parts.push(xReadStrategy_()); } catch (e) {}
  try { parts.push(xReadReactions_(200)); } catch (e) {}
  return parts.filter(String).join('\n');
}

/**
 * 本文に出てくる数字のうち、一次情報の中に見当たらないものを返す。
 *
 * 「14歳」が「30代」に書き換わるような事故を見つけるための検査。
 * 日付や箇条書きの番号は対象外にする。
 */
function xUnknownNumbers_(body, known) {
  if (!known) return [];

  var out = [];
  var seen = {};

  // 数字＋単位（年/歳/件/人/回/分/時間/日/ヶ月/万/円/%）を拾う
  var re = /([0-9０-９]{1,6})\s*(年間|年|歳|件|人|回|分|時間|日|ヶ月|か月|万|円|%|％|割)/g;
  var m;
  while ((m = re.exec(body)) !== null) {
    var num = xToHalf_(m[1]);
    var unit = m[2];
    var token = num + unit;
    if (seen[token]) continue;
    seen[token] = true;

    // 箇条書きの番号や、1〜3の小さい数はノイズになりやすいので除く
    if (Number(num) <= 3 && (unit === '件' || unit === '人' || unit === '回' || unit === '分')) continue;

    // 一次情報の中に「数字＋単位」か、数字だけでも出てくれば良しとする
    if (known.indexOf(token) >= 0) continue;
    if (known.indexOf(num + ' ' + unit) >= 0) continue;
    if (known.indexOf(num) >= 0) continue;

    out.push(token);
  }
  return out;
}

/** 全角数字を半角に */
function xToHalf_(s) {
  return String(s).replace(/[０-９]/g, function (c) {
    return String.fromCharCode(c.charCodeAt(0) - 0xFEE0);
  });
}

// ============================================================
// 21_XAnalytics.js
// ============================================================

/**
 * 21_XAnalytics.js
 * アナリティクスCSVの取り込み
 *
 * 狙いは2つ。
 *
 * 1) 自分の返信を一次情報として拾う
 *    普段のやり取りで書いている返信は、投稿用に整えていない素の言葉。
 *    相手の文脈に反応して書いているので、自分では思いつかない角度が入る。
 *    毎日書いているので、追加の手間なしで素材が溜まる。
 *
 * 2) 反応の数字を貯める
 *    型ごとの当たり外れを見るのは、母数が溜まってから。
 *    それまでは貯めるだけ。
 *
 * ※CSVの「ポスト本文」は約150字で切られている。
 *   投稿の特定には使えるが、本文の長さの判断には使えない。
 */

/** CSVの列名（Xのアナリティクスの書き出し） */
var X_CSV_COLS = {
  id: 'ポストID', date: '日付', body: 'ポスト本文', link: 'ポストのリンク',
  imp: 'インプレッション数', like: 'いいね', eng: 'エンゲージメント',
  bookmark: 'ブックマーク', share: '共有された回数', follow: '新しいフォロー',
  reply: '返信', repost: 'リポスト', profile: 'プロフィールへのアクセス数'
};

/** これ以上の長さの返信を、一次情報として拾う（相槌を除くため） */
var X_REPLY_MIN_LEN = 60;

/**
 * 取り込み用のシートを作る。ここにCSVを貼ってもらう。
 */
function xSetupAnalyticsSheet() {
  var sh = xSheet_(X_SHEETS.ANALYTICS, []);
  if (sh.getLastRow() === 0) {
    var head = ['ポストID', '日付', 'ポスト本文', 'ポストのリンク', 'インプレッション数',
      'いいね', 'エンゲージメント', 'ブックマーク', '共有された回数', '新しいフォロー',
      '返信', 'リポスト', 'プロフィールへのアクセス数', '詳細のクリック数',
      'URLのクリック数', 'ハッシュタグのクリック数', 'パーマリンクのクリック数', '除外'];
    sh.getRange(1, 1, 1, head.length).setValues([head])
      .setFontWeight('bold').setBackground('#1f3a5f').setFontColor('#ffffff');
    sh.setFrozenRows(1);
  }
  sh.setColumnWidth(3, 480);

  xToast_('X_反応データ を作りました。アナリティクスのCSVを A1 から貼り付けてください。' +
          '（見出し行ごと貼ってOK。R列「除外」は、互助会で伸びた回に印をつける欄です）');
}

/**
 * 貼り付けたCSVを処理する。
 * ・自分の返信 → X_一次情報 へ
 * ・投稿の数字 → そのまま蓄積（集計は母数が溜まってから）
 */
function xImportAnalytics() {
  var sh = xBook_().getSheetByName(X_SHEETS.ANALYTICS);
  if (!sh || sh.getLastRow() < 2) {
    xToast_('X_反応データ にCSVが貼られていません。');
    return;
  }

  var values = sh.getDataRange().getValues();
  var head = values[0].map(function (v) { return String(v).trim(); });
  var ci = {};
  Object.keys(X_CSV_COLS).forEach(function (k) { ci[k] = head.indexOf(X_CSV_COLS[k]); });

  if (ci.body < 0) {
    throw new Error('「ポスト本文」の列が見つかりません。見出し行ごと貼り付けてください。');
  }

  var factSh = xSheet_(X_SHEETS.FACT, ['記録日', 'ジャンル', '質問', '回答', '使用回数']);
  var known = xAnsweredQuestions_();

  var posts = 0, replies = 0, added = 0;

  for (var r = 1; r < values.length; r++) {
    var body = String(values[r][ci.body] || '').trim();
    if (!body) continue;

    var isReply = body.charAt(0) === '@';
    if (isReply) replies++; else posts++;
    if (!isReply) continue;

    // 相手のIDを外し、短い相槌は捨てる
    var text = body.replace(/^(@\w+\s*)+/, '').trim();
    text = text.replace(/\s*https:\/\/t\.co\/\S+/g, '').trim();
    if (text.length < X_REPLY_MIN_LEN) continue;

    var key = 'Xでの返信: ' + text.slice(0, 30);
    if (known.indexOf(key) >= 0) continue;

    var date = values[r][ci.date] ? String(values[r][ci.date]) : '';
    factSh.appendRow([date || fmtDate_(new Date()), 'Xでの返信', key, text, 0]);
    known.push(key);
    added++;
  }

  factSh.setColumnWidth(4, 480);
  if (factSh.getLastRow() > 1) {
    factSh.getRange(2, 4, factSh.getLastRow() - 1, 1).setWrap(true);
  }

  var msg = '投稿' + posts + '件 / 返信' + replies + '件を読みました。' +
            'うち' + added + '件の返信を一次情報に追加しました。';
  Logger.log(msg);
  xToast_(msg);
  return added;
}

/**
 * 反応の状況をざっと見る（集計の判断材料）。
 * 「除外」に印のある行は外す。
 */
function xAnalyticsSummary() {
  var sh = xBook_().getSheetByName(X_SHEETS.ANALYTICS);
  if (!sh || sh.getLastRow() < 2) { xToast_('X_反応データ が空です。'); return; }

  var values = sh.getDataRange().getValues();
  var head = values[0].map(function (v) { return String(v).trim(); });
  var ci = {};
  Object.keys(X_CSV_COLS).forEach(function (k) { ci[k] = head.indexOf(X_CSV_COLS[k]); });
  var exCol = head.indexOf('除外');

  function n(row, idx) {
    if (idx < 0) return 0;
    var v = String(row[idx] || '0').replace(/,/g, '');
    var x = parseInt(v, 10);
    return isNaN(x) ? 0 : x;
  }

  var rows = [];
  for (var r = 1; r < values.length; r++) {
    var body = String(values[r][ci.body] || '').trim();
    if (!body || body.charAt(0) === '@') continue;           // 自分の投稿だけ
    if (exCol >= 0 && String(values[r][exCol] || '').trim()) continue;  // 除外済み
    rows.push(values[r]);
  }
  if (!rows.length) { xToast_('対象の投稿がありません。'); return; }

  var imps = rows.map(function (x) { return n(x, ci.imp); }).sort(function (a, b) { return a - b; });
  var med = imps[Math.floor(imps.length / 2)];
  var repSum = rows.reduce(function (s, x) { return s + n(x, ci.reply); }, 0);
  var folSum = rows.reduce(function (s, x) { return s + n(x, ci.follow); }, 0);

  Logger.log('--- 自分の投稿（除外を抜いた分） ---');
  Logger.log('件数: ' + rows.length);
  Logger.log('インプレッション中央値: ' + med + ' / 最大: ' + imps[imps.length - 1]);
  Logger.log('返信の合計: ' + repSum + ' / 新しいフォローの合計: ' + folSum);

  Logger.log('\n--- 返信が多い順 ---');
  rows.sort(function (a, b) { return n(b, ci.reply) - n(a, ci.reply); });
  rows.slice(0, 10).forEach(function (x) {
    Logger.log('返信' + n(x, ci.reply) + ' 表示' + n(x, ci.imp) +
      ' フォロー' + n(x, ci.follow) + ' | ' + String(x[ci.body]).slice(0, 44));
  });

  if (rows.length < 30) {
    Logger.log('\n※まだ ' + rows.length + '件です。型ごとの比較は、30件を超えてからにしてください。');
  }
  xToast_(rows.length + '件を集計しました。ログを見てください。');
}

// ============================================================
// 22_XMining.js
// ============================================================

/**
 * 22_XMining.js
 * 返信・引用から、新しい論点を発掘する
 *
 * 過去投稿のリライトでは新鮮さが出ない。
 * 自分が他の人に書いた返信には、相手の文脈に反応して出た
 * 「まだ単独投稿にしていない論点」が入っている。
 *
 * 【守るルール】
 *  1. A判定は「結論が過去と違う」ときだけ。テーマが違っても結論が同じならB/C。
 *     無理にAを増やさない。
 *  2. 元コメントより強く言い切らない。
 *     「安心材料になる」を「成功する」に変えるような、根拠のない因果を足さない。
 *  3. 相手の元投稿はデータに無い。何についての発言かを推測で確定しない。
 *  4. 個人・取引先の内部情報を含むものは、公開前の確認対象として印をつける。
 */

/** 1回の呼び出しで分析する返信の数 */
var X_MINE_BATCH = 20;

var X_MINE_CURSOR = 'X_MINE_CURSOR';

/**
 * 返信から論点を発掘して X_企画案 に書く。
 * 件数が多い場合は途中で止まるので、完了まで数回実行する。
 */
function xMineTopics() {
  var started = Date.now();
  var replies = xReplyPool_();
  if (!replies.length) {
    throw new Error('返信が見つかりません。先に「アナリティクス: 取り込む」を実行してください。');
  }

  var sh = xSheet_(X_SHEETS.IDEA,
    ['判定', '企画タイトル', '元の返信（原文）', '日付', '何が新しいか',
     '経営者との接点', '要確認・不明点', '公開前の確認', '採用']);

  var p = PropertiesService.getScriptProperties();
  var cursor = Number(p.getProperty(X_MINE_CURSOR) || 0);
  if (cursor === 0 && sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent();
  }

  var past = xPastCoverage_();
  var total = replies.length;

  while (cursor < total) {
    if (Date.now() - started > 4.5 * 60 * 1000) {
      p.setProperty(X_MINE_CURSOR, String(cursor));
      xToast_('時間切れで中断しました。' + cursor + ' / ' + total +
              '件まで完了。もう一度実行すると続きから再開します。');
      return;
    }

    var batch = replies.slice(cursor, cursor + X_MINE_BATCH);
    var ideas = [];
    try {
      ideas = xMineBatch_(batch, past);
    } catch (err) {
      Logger.log('この分は飛ばします: ' + err.message);
    }

    if (ideas.length) {
      var rows = ideas.map(function (x) {
        return [
          x['判定'] || '', x['企画タイトル'] || '', x['元の返信'] || '',
          x['日付'] || '', x['何が新しいか'] || '', x['経営者との接点'] || '',
          x['要確認'] || '', x['公開前の確認'] || '', ''
        ];
      });
      sh.getRange(sh.getLastRow() + 1, 1, rows.length, 9).setValues(rows);
    }

    cursor += batch.length;
    p.setProperty(X_MINE_CURSOR, String(cursor));
  }

  p.deleteProperty(X_MINE_CURSOR);
  xFormatIdeaSheet_(sh);

  var a = xCountIdeas_(sh, 'A');
  xToast_('発掘が完了しました。A判定 ' + a + '件。X_企画案 の「採用」列に○を入れてください。');
}

/** 発掘をやり直す */
function xResetMining() {
  PropertiesService.getScriptProperties().deleteProperty(X_MINE_CURSOR);
  xToast_('進捗をリセットしました。次回は最初から実行します。');
}

/** 分析対象の返信を集める（一次情報シートの「Xでの返信」） */
function xReplyPool_() {
  var sh = xBook_().getSheetByName(X_SHEETS.FACT);
  if (!sh || sh.getLastRow() < 2) return [];
  var values = sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues();
  var out = [];
  values.forEach(function (r) {
    if (String(r[1]).trim() !== 'Xでの返信') return;
    var t = String(r[3]).trim();
    if (t.length < 70) return;
    out.push({ date: String(r[0]).trim(), text: t });
  });
  return out;
}

/** 過去に扱った内容（新規性の判定に使う） */
function xPastCoverage_() {
  var parts = [];

  // 既に出した企画のタイトル
  var ideas = xPastThemes_(40);
  if (ideas.length) parts.push('【過去に生成した投稿のテーマ】\n' + ideas.join('\n'));

  // 文体ルールから「よく書くテーマ」「繰り返している主張」
  try {
    var sh = xBook_().getSheetByName(X_SHEETS.RULE);
    if (sh && sh.getLastRow() > 1) {
      var v = sh.getDataRange().getValues();
      for (var r = 1; r < v.length; r++) {
        var k = String(v[r][0]).trim();
        if (k === 'よく書くテーマ' || k === '繰り返している主張') {
          parts.push('【' + k + '】\n' + String(v[r][1]).trim());
        }
      }
    }
  } catch (e) {}

  // 過去の投稿の書き出し
  try {
    var rows = xReadLog_();
    var heads = rows.slice(-60).map(function (r) {
      return String(r['実投稿'] || r['雛形'] || '').split('\n')[0].slice(0, 50);
    }).filter(String);
    if (heads.length) parts.push('【過去投稿の書き出し】\n' + heads.join('\n'));
  } catch (e) {}

  return parts.join('\n\n');
}

/** 1バッチ分を分析する */
function xMineBatch_(batch, past) {
  var items = batch.map(function (r, i) {
    return '--- 返信' + (i + 1) + '（' + r.date + '）---\n' + r.text;
  }).join('\n\n');

  var system = [
    'あなたは、書き手が他の人に送った返信から、まだ単独投稿にしていない論点を見つける編集者です。',
    '',
    '■ 絶対に守ること',
    '',
    '1. 元コメントより強く言い切らないでください。',
    '   「〜だったりします」を「〜する」に変えない。',
    '   「安心材料になる」を「成功する」に変えるような、根拠のない因果を足さない。',
    '   企画タイトルも、元コメントの強さを超えないでください。',
    '',
    '2. 相手の元投稿はデータに含まれていません。',
    '   何についての発言かを、推測で確定しないでください。',
    '   返信文だけでは話題が分からない場合、「要確認・不明点」に',
    '   「何への返信か不明」と書いてください。',
    '',
    '3. 判定は厳しくつけてください。',
    '   A = 過去投稿と結論が違う。扱っていない論点',
    '   B = 扱ったテーマだが、場面と問いが新しい',
    '   C = 過去投稿と結論まで同じ',
    '   テーマが違っても、着地する結論が過去と同じならBかCです。',
    '   無理にAを増やさないでください。Aが0件でも構いません。',
    '',
    '4. 個人名・取引先・相手の社内事情が含まれるものは、',
    '   「公開前の確認」に「要確認」と書いてください。',
    '',
    '5. 相づち・挨拶・称賛だけの返信は、企画にしないでください。',
    '   件数を増やすより、新しい視点があるものだけを出してください。',
    '',
    '出力はJSONのみ。説明文やコードフェンスを付けないでください。'
  ].join('\n');

  var user = [
    past ? ('# すでに扱った内容（これと結論が同じならA判定にしない）\n' + past + '\n') : '',
    '# 分析対象の返信',
    items,
    '',
    '--- 出力形式 ---',
    '{"ideas":[{',
    '  "判定": "A / B / C のどれか",',
    '  "企画タイトル": "25字以内。元コメントより強く言い切らない",',
    '  "元の返信": "もとになった返信の原文をそのまま（省略可、120字まで）",',
    '  "日付": "返信の日付",',
    '  "何が新しいか": "過去と何が違うか。40字以内",',
    '  "経営者との接点": "店舗・サービス業の社長のどの場面に当たるか。40字以内",',
    '  "要確認": "追加で必要な実例。文脈が不明ならその旨。40字以内",',
    '  "公開前の確認": "個人・取引先の情報を含むなら「要確認」。無ければ空"',
    '}]}',
    '※ C判定のものは出力に含めないでください。',
    '※ 新しい視点が無ければ、ideas を空配列にして構いません。'
  ].filter(String).join('\n');

  var json = xParseJson_(xClaude_({
    system: system, userText: user, maxTokens: 12000, effort: 'high'
  }));
  return (json.ideas || []).filter(function (x) {
    return String(x['判定']).trim().toUpperCase() !== 'C';
  });
}

/** 見た目を整える */
function xFormatIdeaSheet_(sh) {
  var last = sh.getLastRow();
  if (last < 2) return;
  sh.setColumnWidth(1, 50);
  sh.setColumnWidth(2, 240);
  sh.setColumnWidth(3, 360);
  sh.setColumnWidth(5, 220);
  sh.setColumnWidth(6, 220);
  sh.setColumnWidth(7, 200);
  sh.getRange(2, 1, last - 1, 9).setWrap(true).setVerticalAlignment('top');

  // A判定を目立たせる
  var rules = sh.getConditionalFormatRules();
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('A').setBackground('#e6f4ea')
    .setRanges([sh.getRange(2, 1, last - 1, 1)]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo('要確認').setBackground('#fdeceb')
    .setRanges([sh.getRange(2, 8, last - 1, 1)]).build());
  sh.setConditionalFormatRules(rules);
}

function xCountIdeas_(sh, mark) {
  if (sh.getLastRow() < 2) return 0;
  return sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues()
    .filter(function (r) { return String(r[0]).trim().toUpperCase() === mark; }).length;
}

/**
 * 「採用」に印のある企画を読む。生成はこれを優先して使う。
 */
function xAdoptedIdeas_() {
  var sh = xBook_().getSheetByName(X_SHEETS.IDEA);
  if (!sh || sh.getLastRow() < 2) return '';

  var v = sh.getRange(2, 1, sh.getLastRow() - 1, 9).getValues();
  var out = [];
  v.forEach(function (r) {
    if (!String(r[8]).trim()) return;          // 採用印なし
    out.push([
      '【' + String(r[1]).trim() + '】（判定' + String(r[0]).trim() + '）',
      '  もとの返信: ' + String(r[2]).trim(),
      '  新しさ: ' + String(r[4]).trim(),
      '  接点: ' + String(r[5]).trim(),
      String(r[6]).trim() ? ('  要確認: ' + String(r[6]).trim()) : ''
    ].filter(String).join('\n'));
  });
  return out.join('\n\n');
}
