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
    '文体に加えて、扱っているテーマと繰り返し出てくる主張も記録してください。',
    'この書き手の発信の軸が、過去から一貫しているかを見るために使います。',
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
    '  "テーマ": ["この投稿群で扱われているテーマ"],',
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
    '  "よく書くテーマ": ["繰り返し扱っているテーマ"],',
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
