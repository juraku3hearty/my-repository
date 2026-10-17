// 「生成の方式 = 改修前」で、改修前（9e6e678）とまったく同じ指示文が送られることを確かめる
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var M = require(path.join(__dirname, 'gasmock.js'));

var BEFORE = fs.readFileSync(path.join(__dirname, 'fixtures', 'dist_before_9e6e678.gs'), 'utf8');
var AFTER = fs.readFileSync(path.join(__dirname, '..', '..', 'dist', 'X文体ツール_全部入り.gs'), 'utf8');

// 文体ルールシート（改修前の形：3列）
var RULE_ROWS = [['項目', '内容', 'メモ（手で直してください）'],
  ['禁止語', '矢印\n正体\n厳選しました', ''],
  ['採用語', 'なんだかんだ\nちょっと', ''],
  ['文の長さ', '短め。1文40字前後', ''],
  ['改行', '1〜2文で改行', ''],
  ['語尾', 'です\nなんですよね', ''],
  ['一人称', '私', ''],
  ['冒頭パターン', '場面から入る', ''],
  ['CTAパターン', '問いかけで締める', ''],
  ['よく書くテーマ', '社長と現場のすれ違い\n仕組み化', ''],
  ['雛形にあったテーマ', '月末の経理', ''],
  ['構成の型', '問題提起→経験→主張', ''],
  ['繰り返している主張', '社長が抱え込まないことが大切\n判断基準を言葉にする', ''],
  ['具体例の出し方', '自分の現場の場面', ''],
  ['守るべきこと', '自分の経験だけ言い切る', ''],
  ['やってはいけないこと', '煽らない', '']];

function makeData(extraSetting) {
  var S = {};
  var add = function (n, rows) { S[n] = M.makeSheet(n, rows); };
  add('X_設定', [['項目', '値', '説明'], ['戦略シート名', 'コンセプト', '']].concat(extraSetting || []));
  add('コンセプト', [['ターゲット', '中小企業の社長'], ['タグライン', '社長語を、現場語に']]);
  add('X_文体ルール', RULE_ROWS.map(function (r) { return r.slice(); }));
  add('X_型カタログ', [['型名', '骨組み', '向いている分類', '冒頭の作り方', '締め方', '効く理由', '使わない'],
    ['場面→気づき', '場面\n↓\n気づき', '共感', '場面から', '気づきで', '', ''],
    ['問い→経験', '問い\n↓\n経験', '専門', '問いから', '経験で', '', '']]);
  add('X_一次情報', [['記録日', 'ジャンル', '質問', '回答', '使用回数'],
    ['2026-10-12', 'Xでの返信', 'k1', 'REPLY_A 任せる範囲を決めておかないと、結局全部戻ってくるんですよね。長さを足しています。', 0],
    ['2026-10-14', 'Xでの返信', 'k2', 'REPLY_B 叔母が店をたたんだ理由を、最近やっと聞けた。言葉を飲み込む人だった。長さを足しています。', 0],
    ['2026-10-16', 'Xでの引用（推定）', 'k3', 'REPLY_C 道具を変えると、会話の量が変わるのはおもしろい。安心材料だったりします。長さを足しています。', 0]]);
  return S;
}

function run(src, extraSetting, prepare) {
  var S = makeData(extraSetting);
  var book = M.makeBook(S);
  var payloads = [];
  var call = 0;
  var sandbox = {
    console: console, __toasts: [],
    SpreadsheetApp: { getUi: function () { throw new Error('no ui'); }, getActive: function () { return book; }, getActiveSpreadsheet: function () { return book; }, openById: function () { return book; } },
    PropertiesService: { getScriptProperties: function () { return { getProperty: function (k) { return k === 'ANTHROPIC_API_KEY' ? 'test' : ''; } }; } },
    Logger: { log: function () {} },
    Utilities: { sleep: function () {}, formatDate: function (d, tz, f) { var p = function (n) { return ('0' + n).slice(-2); };
      return f.replace('yyyy', d.getFullYear()).replace('MM', p(d.getMonth() + 1)).replace('dd', p(d.getDate())).replace('HH', p(d.getHours())).replace('mm', p(d.getMinutes())).replace('ss', p(d.getSeconds())).replace('M/d', (d.getMonth() + 1) + '/' + d.getDate()); } },
    UrlFetchApp: { fetchAll: function (reqs) { return reqs.map(function (q) {
      var body = JSON.parse(q.payload); var u = body.messages[0].content;
      payloads.push('SYSTEM:\n' + body.system + '\nUSER:\n' + u + '\nEFFORT:' + body.output_config.effort);
      var out;
      if (/1週間ぶんの企画を決めます/.test(body.system)) {
        out = { '枠': [{ '本': 1, '材料': ['R3'], '企画': 'a', '主張': 'x' }, { '本': 2, '材料': ['R2'], '企画': 'b', '主張': 'y' }, { '本': 3, '材料': ['R1'], '企画': 'c', '主張': 'z' }] };
      } else if (/編集者です/.test(body.system) && /作り直した本:/.test(u)) {
        out = { '外す': [], '言い過ぎ': [] };
      } else if (/編集者です/.test(body.system)) {
        out = { '重複': [{ '本': [1, 6], '重なり': '主張', '残す': 1 }], '作り直す': [{ '本': 6, '材料': null }], '言い過ぎ': [{ '本': 2, '箇所': 'x', '直し方': 'y' }] };
      } else {
        var m = u.match(/全(\d+)本のうち、(\d+)本目から(\d+)本目までの/); var posts = [];
        for (var k = +m[2]; k <= +m[3]; k++) posts.push({ 'テーマ': 'T' + k, '本文': 'BODY' + k, '冒頭3行': 'B', '投稿の狙い': 'x', '元になった返信・切り口': 'y', '事実確認が必要な箇所': 'なし' });
        out = { posts: posts };
      }
      var resp = JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(out) }], stop_reason: 'end_turn' });
      return { getResponseCode: function () { return 200; }, getContentText: function () { return resp; } };
    }); } }
  };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  if (prepare) prepare(sandbox, S);
  vm.runInContext('xGeneratePosts();', sandbox);
  return { payloads: payloads, S: S, sandbox: sandbox };
}

function ok(c, l) { console.log((c ? '✅ ' : '❌ ') + l); if (!c) process.exitCode = 1; }

var before = run(BEFORE);
var legacy = run(AFTER, [['生成の方式', '改修前', '']]);
ok(before.payloads.length > 5, '改修前の実行で、企画・執筆・編集・作り直しの依頼が出ている（' + before.payloads.length + '件）');
ok(legacy.payloads.length === before.payloads.length, '依頼の件数が同じ（' + legacy.payloads.length + '件）');
var diffAt = -1;
for (var i = 0; i < before.payloads.length; i++) { if (before.payloads[i] !== legacy.payloads[i]) { diffAt = i; break; } }
ok(diffAt < 0, '「改修前」の方式は、改修前とすべての依頼が1文字も違わない' + (diffAt >= 0 ? '（' + (diffAt + 1) + '件目が違う）' : ''));
if (diffAt >= 0) {
  var a = before.payloads[diffAt], b = legacy.payloads[diffAt], j = 0;
  while (j < a.length && a[j] === b[j]) j++;
  console.log('   改修前: …' + a.slice(Math.max(0, j - 80), j + 120).replace(/\n/g, '⏎'));
  console.log('   今回  : …' + b.slice(Math.max(0, j - 80), j + 120).replace(/\n/g, '⏎'));
}


// ============ 改修後（既定）の中身 ============
var setupFn = function (sb) { sb.xSetupRuleKinds_(); };
var neu = run(AFTER, null, setupFn);
var gen = function (r) { return r.payloads.filter(function (p) { return /全7本のうち、1本目から2本目/.test(p) && !/1週間ぶんの企画/.test(p); })[0]; };
var plan = function (r) { return r.payloads.filter(function (p) { return /1週間ぶんの企画を決めます/.test(p); })[0]; };
var editor = function (r) { return r.payloads.filter(function (p) { return /編集者です/.test(p) && /# 今週の7本/.test(p); })[0]; };
var gOld = gen(before), gNew = gen(neu);

console.log('--- 1. 情報を3種類に分ける ---');
var section = function (text, head) {
  var i = text.indexOf(head); if (i < 0) return '';
  var j = text.indexOf('\n# ', i + head.length);
  return text.slice(i, j < 0 ? text.length : j);
};
var styleNew = section(gNew, '# 文体ルール（書き方。必ず守る）');
var pastNew = section(gNew, '# これまでに言ってきた主張・書いてきたテーマ（焼き直し防止）');
var axisNew = section(gNew, '# 発信の軸・価値観（この書き手が大切にしている考え方）');
var rulesOld = section(gOld, '# 文体ルール（過去の書き換え履歴から抽出）');
var block = function (text, key) { var i = text.indexOf('【' + key + '】'); if (i < 0) return ''; var j = text.indexOf('\n【', i + 1); return text.slice(i, j < 0 ? text.length : j).trim(); };
var STYLE = ['禁止語', '採用語', '文の長さ', '改行', '語尾', '一人称', '冒頭パターン', 'CTAパターン', '具体例の出し方', '守るべきこと', 'やってはいけないこと'];
var PAST = ['よく書くテーマ', '雛形にあったテーマ', '繰り返している主張'];
ok(STYLE.every(function (k) { return block(styleNew, k) && block(styleNew, k) === block(rulesOld, k); }), '文体の11行は、改修前と1文字も違わない形で「文体ルール」に入っている');
ok(PAST.every(function (k) { return !block(styleNew, k) && block(pastNew, k) === block(rulesOld, k); }), '「よく書くテーマ」「雛形にあったテーマ」「繰り返している主張」は文体ルールから外れ、「焼き直し防止」に移った');
ok(/同じ結論に着地しないでください。同じ主張を言い直さないでください。/.test(pastNew), '過去の主張は「同じ結論に着地しない」ための情報として渡している');
ok(!/【構成の型】/.test(gNew) && /【構成の型】/.test(gOld), '「構成の型」の行は生成に渡さない（型カタログと重複のため。型カタログはそのまま）');
ok(/## 構成の型（骨組みだけ）/.test(gNew) && /・1本目の型: /.test(gNew), '型カタログと型の割り当ては変わっていない');
ok(/・社長語を、現場語に/.test(axisNew) && /毎回この言葉や結論に着地させる必要はありません/.test(axisNew), '発信の軸に「社長語を、現場語に」が入り、毎回そこに着地させないと書いてある');
ok(axisNew && pastNew.indexOf('社長語を、現場語に') < 0, '発信の軸は「過去の主張（繰り返さない）」とは別の扱い');
ok(/発信の軸・価値観/.test(plan(neu)) && /これまでに言ってきた主張/.test(plan(neu)), '企画会議にも、軸と過去の主張が分けて渡っている');

console.log('--- 2. 言い切りの基準 ---');
ok(/■ 言い切りの基準/.test(gNew) && /強い文章が嫌なのではありません。根拠がないことを言い切るのが苦手です/.test(gNew), '新しい言い切りの基準が入っている');
ok(/確認済みの経験や実績/.test(gNew) && /自分で考えてきたこと、自分の方針/.test(gNew), 'はっきり書いてよい：確認済みの経験・実績／自分で考えてきたこと・方針');
ok(/他人の気持ち/.test(gNew) && /一般論・傾向・統計/.test(gNew) && /未確認の成果/.test(gNew), '断定しない：他人の気持ち・一般論・未確認の成果');
ok(/本人が言っていない因果関係/.test(gNew) && /本人が言っていない成果/.test(gNew), '付け加えない：本人が言っていない因果関係・成果');
ok(!/言い切っていいのは、この書き手が自分で経験したことだけです/.test(gNew) && !/その発言より強く言い切らないでください/.test(gNew), '改修前の「経験だけ」「元の発言より強く言い切らない」は改修後には無い');
ok(/言い切っていいのは、この書き手が自分で経験したことだけです/.test(gOld), '（比較）改修前の依頼には元の文面がある');
ok(/本人の考えははっきり書いてよい/.test(plan(neu)) && /元の返信より強く言い切らない/.test(plan(before)), '企画会議の「主張」の書き方も新しい基準に');
ok(/他人の気持ち・一般論・未確認の成果を断定している箇所/.test(editor(neu)) && /本人が言っていない因果関係や成果を付け加えている箇所/.test(editor(neu)), '編集の「言い過ぎ」に、他人の気持ち・一般論の断定と、言っていない因果・成果を追加');
ok(/言い過ぎではありません/.test(editor(neu)), '編集：本人の経験・考え・方針をはっきり書くのは言い過ぎではない、と明記');

console.log('--- 3. 他の部分は変えていない ---');
var strip = function (t) {
  return t
    .replace(/■ 言い切り[\s\S]*?\n■ 投稿作成のルール/, '■ 投稿作成のルール')
    .replace(/# 文体ルール（過去の書き換え履歴から抽出）[\s\S]*?\n(?=# )/, '')
    .replace(/# 文体ルール（書き方。必ず守る）[\s\S]*?\n(?=# 読まれやすい|# ② |# ① )/, '')
    .replace(/・本人の発言[^\n]*\n[^\n]*\n/, '')
    .replace(/\*\*その返信[^\n]*\n[^\n]*\n/, '');
};
ok(strip(gOld) === strip(gNew), '執筆の依頼は、文体ルールの渡し方と言い切りの基準以外、1文字も変わっていない');
var hasPlan = function (r) { return r.payloads.filter(function (p) { return /本目までの/.test(p) && !/1週間ぶんの企画/.test(p); }).length; };
ok(hasPlan(before) === hasPlan(neu) && before.payloads.length === neu.payloads.length, '企画・執筆・編集・作り直しの流れ（依頼の数）は同じ');

console.log('--- 4. シートの扱い ---');
var R = neu.S['X_文体ルール']._d;
ok(R[0][3] === '区分', '「区分」列が足された');
ok(RULE_ROWS.slice(1).every(function (orig, i) { return R[i + 1][0] === orig[0] && R[i + 1][1] === orig[1] && R[i + 1][2] === orig[2]; }), '既存の行（項目・内容・メモ）は1つも変わっていない');
var kindOf = function (k) { return (R.filter(function (r) { return r[0] === k; })[0] || [])[3]; };
ok(kindOf('禁止語') === '文体' && kindOf('繰り返している主張') === '過去の主張・エピソード' && kindOf('構成の型') === '使わない', '区分の既定値（禁止語=文体／繰り返している主張=過去の主張／構成の型=使わない）');
ok(R.filter(function (r) { return r && r[3] === '軸・価値観'; }).length === 1, '「軸・価値観」の行が1行足された');
neu.sandbox.xSetupRuleKinds_();
ok(neu.S['X_文体ルール']._d.filter(function (r) { return r && r[3] === '軸・価値観'; }).length === 1, '①をもう一度押しても、軸の行は増えない');

// 本人が区分を変え、軸を書き足したあとに文体を抽出し直しても消えない
var d = neu.S['X_文体ルール']._d;
d.forEach(function (r) { if (r && r[0] === '守るべきこと') r[3] = '軸・価値観'; if (r && r[3] === '軸・価値観' && r[0] === '発信の軸・価値観') r[1] = '社長語を、現場語に\n子どもとの時間を削らない働き方'; });
neu.sandbox.xWriteRules_({ '禁止語': ['矢印'], '採用語': ['ちょっと'], '新しい項目': ['x'], '繰り返している主張': ['a'] });
var d2 = neu.S['X_文体ルール']._d;
var k2 = function (k) { return (d2.filter(function (r) { return r && r[0] === k; })[0] || [])[3]; };
ok(k2('禁止語') === '文体' && k2('繰り返している主張') === '過去の主張・エピソード' && k2('新しい項目') === '文体', '抽出し直しても区分が残る（新しい項目は「文体」）');
ok(d2.some(function (r) { return r && r[0] === '発信の軸・価値観' && /子どもとの時間を削らない働き方/.test(r[1]) && r[3] === '軸・価値観'; }), '抽出し直しても、本人が書いた軸の行は消えない');

console.log('--- 5. 区分を付けたあとに「改修前」に戻しても、改修前と同じ ---');
var legacy2 = run(AFTER, [['生成の方式', '改修前', '']], setupFn);
var diff2 = -1;
for (var q = 0; q < before.payloads.length; q++) { if (before.payloads[q] !== legacy2.payloads[q]) { diff2 = q; break; } }
ok(diff2 < 0 && legacy2.payloads.length === before.payloads.length, '区分列と軸の行があっても、「改修前」の依頼は改修前と1文字も違わない');
