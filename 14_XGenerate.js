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

  var system = xGenSystem_();
  var context = xGenContext_(setting, strategy, concept, rules,
                             samples, facts, factSheets, sampleSheets, patterns, reactions);

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
                      factSheets, sampleSheets, patterns, reactions) {
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
      var line = '・' + (idx + 1) + '本目（' + slot.date + '）: 本文=' + slot.cat;
      if (slot.closeCat !== slot.cat) line += ' / 締め=' + slot.closeCat;
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
