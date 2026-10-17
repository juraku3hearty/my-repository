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
