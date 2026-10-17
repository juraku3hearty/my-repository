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
var X_PATTERN_SAMPLES = 24;

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
    '・一般的な文章構成の教科書を書かないでください。この投稿群にある型だけを書いてください',
    '・先に出てくる投稿ほど新しく、いまの発信の軸に近いものです。',
    '  古い投稿にしか無い型より、新しい投稿にある型を優先して拾ってください',
    '・骨組みは「何行目に何を置くか」ではなく「どういう順で読者を動かすか」で書いてください',
    '',
    '出力はJSONのみ。説明文やコードフェンスを付けないでください。'
  ].join('\n');

  var user = [
    '以下の投稿から、構成の型を' + X_PATTERN_COUNT + '種類に分けてください。',
    '',
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

  // 1. サンプル投稿・固定ポスト（今週分を足してもらう場所。最優先）
  xReadSamples_(8).forEach(add);

  var rows;
  try { rows = xReadLog_(); } catch (e) { rows = []; }
  var texts = rows.map(function (r) {
    return String(r['実投稿'] || r['雛形'] || '').trim();
  }).filter(function (t) { return t.length >= 150; });

  // 2. 過去ログの直近ぶん（新しい順）
  for (var i = texts.length - 1; i >= 0 && out.length < n - 4; i--) add(texts[i]);

  // 3. 残り枠で、古いほうからも少しだけ（型の幅を見るため）
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
