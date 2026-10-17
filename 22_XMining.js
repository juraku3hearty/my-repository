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
