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
  var concept = setting['これからのコンセプト'] || '';
  if (!concept) throw new Error('X_設定の「これからのコンセプト」が空です。ここが無いと内容が決まりません。');

  var rules = xReadRules_();
  var samples = xPickSamples_(3);

  var system = [
    'あなたは、ある書き手の文体を完全に再現して X の投稿を書く人です。',
    '',
    '最重要のルール:',
    '- 「文体ルール」の禁止語は、絶対に使わないでください。',
    '  これは過去にこの書き手が自分で消した語です。1つでも混ざると、本人の文ではなくなります。',
    '- 一般的によくあるSNS文章術の型に寄せないでください。この書き手の型に寄せてください。',
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
  parts.push('# これからのコンセプト');
  parts.push(concept);
  parts.push('');

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
  parts.push('--- 出力形式 ---');
  parts.push('{"posts":[{');
  parts.push('  "テーマ": "この投稿のテーマ",');
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
    ['作成日時', 'テーマ', '本文', '冒頭3行', '狙い', '自己チェック', '投稿予定日', '状態']);

  var now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
  var rows = posts.map(function (p) {
    return [
      now,
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
  sh.setColumnWidth(3, 520);
  sh.getRange(2, 3, sh.getLastRow() - 1, 1).setWrap(true);
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
