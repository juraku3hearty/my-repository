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
  var factSheets = xReadFactSheets_();
  var sampleSheets = xReadSampleSheets_();
  var patterns = xPatternsText_();
  var weekPlan = xWeekPlanText_();

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
    '- 年齢・時期・頻度・回数は、一次情報に書かれている表現をそのまま使ってください。',
    '  言い換えたり、辻褄が合うように調整したりしないでください。',
    '  例：「14歳で」とあれば「14歳で」。「30代の頃」などに変えない。',
    '  元の表現が不自然に見えても、直さずにそのまま使ってください。',
    '  書かれていない頻度（「年に1回」など）を足さないでください。',
    '- 新しいほうの投稿例を手本にしてください。',
    '  古い投稿は外部ライターの原稿がもとになっており、いまの軸とは違います。',
    '- 投稿例（文体の手本）に書かれている出来事や数字は、事実とは限りません。',
    '  外部ライターが作った話が混ざっています。文体だけを見て、事実は拾わないでください。',
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

  if (sampleSheets) {
    parts.push('# 完成した投稿（文体の手本）');
    parts.push('⚠️ ここは「書き方」だけを見てください。');
    parts.push('この中には、外部ライターが作った事実でない話が混ざっています。');
    parts.push('ここに書かれている出来事・数字・エピソードは、一切使わないでください。');
    parts.push('事実は、下の「経歴・インタビュー」と「一次情報」からだけ取ってください。');
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
  if (patterns) {
    parts.push('# 構成の型（この書き手が実際に使っている骨組み）');
    parts.push('7本すべてを同じ型で書かないでください。');
    parts.push('内容を変えても骨組みが同じだと、読む側には前と同じものに見えます。');
    parts.push('1本ごとに違う型を使い、使った型名を出力に書いてください。');
    parts.push(patterns);
    parts.push('');
  }

  parts.push('');
  parts.push('# ターゲット層の配分');
  parts.push('発信設計書にターゲットが層（潜在層／準顕在層／顕在層／明確層）で分かれている場合、');
  parts.push('次の順で1本ずつ割り当ててください。');
  if (weekPlan) {
    parts.push('※この週は、本人が各日の分類を決めています。こちらに従ってください。');
    parts.push(weekPlan);
    parts.push('「締め」の分類が本文と違う日は、最後の一文だけをその分類に寄せてください。');
  } else {
    xLayerPlan_(count).forEach(function (layer, i) {
      parts.push('  ' + (i + 1) + '本目: ' + layer);
    });
  }
  parts.push('各層の「ペイン」「反応するキーワード」「抱かせる感情」が設計書にあれば、');
  parts.push('その層の投稿に必ず反映してください。層の指定が設計書に無ければ、この配分は無視して構いません。');
  parts.push('');
  parts.push('--- 出力形式 ---');
  parts.push('{"posts":[{');
  parts.push('  "テーマ": "この投稿のテーマ",');
  parts.push('  "ターゲット層": "潜在層／準顕在層／顕在層／明確層 のどれか",');
  parts.push('  "使った型": "構成の型の型名。型カタログが無ければ空",');
  parts.push('  "分類": "拡散／共感／人脈／助け／成果／専門／自分の言葉／仕組み化 のどれか",');
  parts.push('  "使った事実": "本文で触れた事実と、その出どころ（インタビュー・年表・一次情報のどれか）",');
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
