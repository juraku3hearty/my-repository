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
