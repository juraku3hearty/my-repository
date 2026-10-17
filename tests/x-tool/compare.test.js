// 企画の方式の比較（メニュー「改修前後を比べる」）のテスト
// 4段階に分けて自動で続く。トリガーは偽物で記録し、テスト側で順に呼ぶ。
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var M = require(path.join(__dirname, 'gasmock.js'));
var AFTER = fs.readFileSync(path.join(__dirname, '..', '..', 'dist', 'X文体ツール_全部入り.gs'), 'utf8');
function ok(c, l) { console.log((c ? '✅ ' : '❌ ') + l); if (!c) process.exitCode = 1; }

function build() {
  var S = {};
  var add = function (n, rows) { S[n] = M.makeSheet(n, rows); };
  add('X_設定', [['項目', '値', '説明'], ['戦略シート名', 'コンセプト', '']]);
  add('コンセプト', [['ターゲット', '中小企業の社長']]);
  add('X_文体ルール', [['項目', '内容', 'メモ（手で直してください）', '区分'],
    ['禁止語', '矢印', '', '文体'], ['語尾', 'です', '', '文体'],
    ['繰り返している主張', '社長が抱え込まないことが大切', '', '過去の主張・エピソード'],
    ['発信の軸・価値観', '社長語を、現場語に', '', '軸・価値観']]);
  add('X_型カタログ', [['型名', '骨組み', '向いている分類', '冒頭の作り方', '締め方', '効く理由', '使わない'], ['場面→気づき', '場面\n↓\n気づき', '共感', '場面から', '気づきで', '', '']]);
  add('X_一次情報', [['記録日', 'ジャンル', '質問', '回答', '使用回数'],
    ['2026-10-14', 'Xでの返信', 'k1', 'REPLY_A 任せる範囲を決めておかないと、結局全部戻ってくるんですよね。長さを足しています。', 0],
    ['2026-10-15', 'Xでの返信', 'k2', 'REPLY_B 娘が「お母さんの仕事ってなに？」と聞いてきて、うまく答えられなかった。', 0]]);
  add('X_投稿案', [['作成日時', '本文']]);
  return S;
}

function run(opt) {
  var S = build();
  var book = M.makeBook(S);
  var triggers = [];
  var payloads = [];
  var sb = {
    console: console, __toasts: [], Math: opt.random ? { random: opt.random, floor: Math.floor, max: Math.max, min: Math.min, round: Math.round } : Math,
    SpreadsheetApp: { getUi: function () { throw new Error('no ui'); }, getActive: function () { return book; }, getActiveSpreadsheet: function () { return book; }, openById: function () { return book; } },
    ScriptApp: {
      newTrigger: function (fn) { return { timeBased: function () { return { after: function (ms) { return { create: function () { var t = { fn: fn, ms: ms, getHandlerFunction: function () { return fn; } }; triggers.push(t); return t; } }; } }; } }; },
      getProjectTriggers: function () { return triggers.slice(); },
      deleteTrigger: function (t) { triggers.splice(triggers.indexOf(t), 1); }
    },
    PropertiesService: { getScriptProperties: function () { return { getProperty: function (k) { return k === 'ANTHROPIC_API_KEY' ? 'test' : ''; } }; } },
    Logger: { log: function () {} },
    Utilities: { sleep: function () {}, formatDate: function (d, tz, f) { var p = function (n) { return ('0' + n).slice(-2); };
      return f.replace('yyyy', d.getFullYear()).replace('MM', p(d.getMonth() + 1)).replace('dd', p(d.getDate())).replace('HH', p(d.getHours())).replace('mm', p(d.getMinutes())).replace('ss', p(d.getSeconds())).replace('M/d', (d.getMonth() + 1) + '/' + d.getDate()); } },
    UrlFetchApp: { fetchAll: function (reqs) { return reqs.map(function (q) {
      var body = JSON.parse(q.payload); var u = body.messages[0].content;
      payloads.push({ sys: body.system, u: u });
      var out = opt.api(body.system, u);
      var resp = JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(out) }], stop_reason: 'end_turn' });
      return { getResponseCode: function () { return 200; }, getContentText: function () { return resp; } };
    }); } }
  };
  vm.createContext(sb);
  vm.runInContext(AFTER, sb);
  if (opt.patch) opt.patch(sb);
  var statuses = [];
  var snap = function () { var c = S['X_改修比較']; if (c) statuses.push(String(c._d[0] && c._d[0][0])); };
  vm.runInContext('xCompareModes();', sb); snap();
  var guard = 0;
  var schedule = [triggers.length];
  while (triggers.length && guard++ < 10) { vm.runInContext('xCompareContinue();', sb); snap(); schedule.push(triggers.length); }
  return { S: S, payloads: payloads, triggers: triggers, statuses: statuses, schedule: schedule, sb: sb };
}

var isNewPlan = function (sys) { return /芯：次から1つ/.test(sys); };
var isOldPlan = function (sys) { return /1週間ぶんの企画を決めます/.test(sys) && !isNewPlan(sys); };
var PLAN_B = { '枠': [
  { '本': 1, '材料': ['R1'], '芯': '場面', '芯になる一文': '娘が「お母さんの仕事ってなに？」と聞いてきて', '読者に残るもの': 'なし', '読後感': 'しみじみ', '締め方': '場面で止める', '役割': '人柄や日常の気づき', '企画': '娘の質問' },
  { '本': 2, '材料': ['R2'], '芯': '主張', '読者に残るもの': '任せる範囲は先に決める', '読後感': '背筋が伸びる', '締め方': '主張で終える', '役割': '経営者が見落としやすい問題', '企画': '任せる範囲', '主張': '任せる範囲を先に決める' }
], '使わなかった材料': [] };
function api(judgeSwapSeen) {
  return function (sys, u) {
    var isB = /■ 投稿作成のルール/.test(sys) && /企画の芯（主張・問い・観察）/.test(sys);
    if (isNewPlan(sys)) return PLAN_B;
    if (isOldPlan(sys)) return { '枠': [{ '本': 1, '材料': ['R2'], '企画': '旧1', '主張': '任せる範囲' }] };
    if (/2つの方法（X と Y）/.test(sys)) {
      var xIsB = /# X\n## 1本目\nNEW/.test(u);
      if (judgeSwapSeen) judgeSwapSeen.push(xIsB);
      var N = xIsB ? 'X' : 'Y', O = xIsB ? 'Y' : 'X';
      var o = { '文体': { 'より良い': '同じ', '理由': '同じ語尾' }, '結論の似通い': { '少ない': N, 'Xの傾向': xIsB ? '新は散る' : '旧は寄る', 'Yの傾向': xIsB ? '旧は寄る' : '新は散る' },
        '根拠のない断定': {}, '冒頭と締め': { '変化が大きい': N, '理由': '締めが散った' }, '編集の手間': { '理由': 'x' }, '面白さ': {}, '芯': {}, '読後感': {}, '総評': N + 'のほうが面白い' };
      o['根拠のない断定'][O] = [{ '本': 2, '箇所': '社長はみんな不安です', '種類': '他人の気持ち' }]; o['根拠のない断定'][N] = [];
      o['編集の手間'][O] = [1, 1, 1, 0, 0, 0, 0]; o['編集の手間'][N] = [0, 1, 0, 0, 0, 0, 0];
      o['面白さ'][O] = [{ '本': 1, '評価': '○', '止まる一文': '旧の一文' }]; o['面白さ'][N] = [{ '本': 1, '評価': '◎', '止まる一文': '娘が聞いてきた' }, { '本': 2, '評価': '◎', '止まる一文': '先に決める' }];
      o['芯'][O] = ['主張', '主張', '主張', '主張', '主張', '問い', '主張']; o['芯'][N] = ['場面', '主張', '観察', '問い', '主張', '観察', '感情'];
      o['読後感'][O] = ['なるほど', 'なるほど', 'なるほど', 'ひやっと', 'なるほど', 'もやっと', 'なるほど']; o['読後感'][N] = ['しみじみ', '背筋が伸びる', 'くすっと', 'もやっと', 'ひやっと', 'ほっとする', 'しみじみ'];
      return o;
    }
    if (/編集者です/.test(sys) && /作り直した本:/.test(u)) return { '外す': [], '言い過ぎ': [] };
    if (/編集者です/.test(sys)) return { '重複': [], '作り直す': [], '言い過ぎ': [] };
    var m = u.match(/全(\d+)本のうち、(\d+)本目から(\d+)本目までの/); var posts = [];
    for (var k = +m[2]; k <= +m[3]; k++) posts.push({ 'テーマ': 'T' + k, '本文': (isB ? 'NEW' : 'OLD') + k + ' 本文\n' + (isB ? '締め' + k : 'これからも大切にしたいと思っています。'), '冒頭3行': 'B', '投稿の狙い': 'x', '事実確認が必要な箇所': 'なし' });
    return { posts: posts };
  };
}

console.log('===== 1. 4段階で自動に続く =====');
var seen = [];
var R = run({ api: api(seen) });
ok(R.schedule.join(',') === '1,1,1,0', '段階1〜3のあとに次の段階を予約し、4のあとは予約しない（' + R.schedule.join(',') + '）');
ok(/比較中: 2\/4 今の方式の週の編集/.test(R.statuses[0]) && /比較中: 3\/4 新しい方式の週の編集/.test(R.statuses[1]) && /比較中: 4\/4/.test(R.statuses[2]), '進み具合がシートの1行目に出る');
var plansNew = R.payloads.filter(function (p) { return isNewPlan(p.sys); });
var plansOld = R.payloads.filter(function (p) { return isOldPlan(p.sys); });
ok(plansNew.length === 1 && plansOld.length === 1, '企画会議は2つの方式ぶん（今の方式と新しい方式）');
var gens = R.payloads.filter(function (p) { return /本目までの/.test(p.u) && !/1週間ぶんの企画/.test(p.sys); });
var gA = gens.filter(function (p) { return /## 使う型（割り当て済み/.test(p.u); });
var gB = gens.filter(function (p) { return /### \d本目\n芯: /.test(p.u); });
ok(gA.length === 4 && gB.length === 4, '執筆：今の方式4回（先行割り当て）・新しい方式4回（企画の芯）');
ok(gens.every(function (p) { return /■ 言い切りの基準/.test(p.sys) && /# 文体ルール（書き方。必ず守る）/.test(p.u); }), '文体の分離（改修後）は両方とも同じ');
ok(gens.every(function (p) { return /REPLY_A/.test(p.u) && /REPLY_B/.test(p.u); }), '両方に同じ材料');
var edits = R.payloads.filter(function (p) { return /編集者です/.test(p.sys) && /# 今週の7本/.test(p.u); });
ok(edits.length === 2, '両方とも週の編集まで通した（編集2回）');
ok(edits.some(function (p) { return /芯の種類と締め方/.test(p.sys); }) && edits.some(function (p) { return !/芯の種類と締め方/.test(p.sys); }), '週の編集は、それぞれの方式の基準で行った');
var C = R.S['X_改修比較']._d;
var rowOf = function (label) { return C.filter(function (r) { return r && r[0] === label; })[0] || []; };
var at = function (label, offset) { var i = C.findIndex(function (r) { return r && r[0] === label; }); return i < 0 ? [] : C[i + (offset || 0)]; };
ok(String(rowOf('1本目')[2]).indexOf('型: 場面→気づき') === 0 && /材料: R2/.test(rowOf('1本目')[2]), '企画：今の方式は、先に配った型・角度・役割と材料が見える');
ok(/^芯: 場面\n芯になる一文: 「娘が「お母さんの仕事ってなに？」と聞いてきて」/.test(rowOf('1本目')[3]) && /材料: R1/.test(rowOf('1本目')[3]), '企画：新しい方式は、芯・芯になる一文・材料が見える');
var bodyRow = C.filter(function (r) { return r && r[0] === '1本目' && /OLD1 本文/.test(String(r[4])); })[0] || [];
ok(/NEW1 本文/.test(String(bodyRow[5])), '本文：週の編集のあとの本文が並ぶ');
var un = at('■ 3. 採用しなかった材料', 1);
ok(/\[R1\] （この方式は理由を出さない）/.test(un[2]) && /（なし）/.test(un[3]), '採用しなかった材料：今の方式はR1（理由なし）／新しい方式はなし');
ok(rowOf('締めが自己表明（〜したい・〜と思っています）の本')[2] === 7 && rowOf('締めが自己表明（〜したい・〜と思っています）の本')[3] === 0, '目安：自己表明の締め（今7／新0）');
ok(rowOf('主張ばかりになっていないか（主張の本数）')[2] === 6 && rowOf('主張ばかりになっていないか（主張の本数）')[3] === 2, '主張ばかりか：主張の本数（今6／新2）');
ok(/（2種類）/.test(rowOf('芯の内訳（種類の数）')[2]) && /（5種類）/.test(rowOf('芯の内訳（種類の数）')[3]), '芯の内訳：今2種類／新5種類');
ok(/最多5/.test(rowOf('読後感の重なり（同じ読後感の最多）')[2]) && /最多2/.test(rowOf('読後感の重なり（同じ読後感の最多）')[3]), '読後感の重なり：今は最多5／新は最多2');
ok(rowOf('実際に読んで面白いか（◎の本数）')[2] === 0 && rowOf('実際に読んで面白いか（◎の本数）')[3] === 2, '面白さ：◎の本数（今0／新2）');
ok(/娘が聞いてきた/.test(rowOf('止まる一文')[3]), '止まる一文が引用で残る');
ok(rowOf('■ 6. あなたの判定（ここに書き込んでください）').length && rowOf('実際に読んで面白いと思えた本の数').length, '本人の判定欄（面白いと思えた本の数から）');
ok(JSON.stringify(R.S['X_投稿案']._d) === JSON.stringify([['作成日時', '本文']]) && !R.S['X_投稿案_週形式'], '投稿案シート・週形式シートには書かない');

console.log('===== 2. 伏せたX/Yの読み替え =====');
var allGood = true;
[0.1, 0.9, 0.3, 0.7].forEach(function (r) {
  var s2 = []; var R2 = run({ api: api(s2), random: function () { return r; } });
  var C2 = R2.S['X_改修比較']._d;
  var g = function (label) { return C2.filter(function (x) { return x && x[0] === label; })[0] || []; };
  var good = g('主張ばかりになっていないか（主張の本数）')[3] === 2 && g('実際に読んで面白いか（◎の本数）')[3] === 2 &&
    /^0箇所/.test(String(g('根拠のない断定')[3])) && /^1箇所/.test(String(g('根拠のない断定')[2])) &&
    g('編集の負担（直す箇所の合計）')[2] === 3 && g('編集の負担（直す箇所の合計）')[3] === 1 &&
    /少ない: 新しい方式（材料に合わせる）/.test(String(g('似た結論に寄る傾向')[4])) && /新しい方式（材料に合わせる）のほうが面白い/.test(String(g('総評')[4]));
  if (!good) allGood = false;
});
ok(allGood, 'XとYの並びが逆でも、4回とも正しく今の方式／新しい方式に読み替えた');

console.log('===== 3. 途中で止まったとき =====');
var R3 = run({ api: api(), patch: function (sb) { sb.xEditWeek_ = function () { throw new Error('テスト用の失敗'); }; } });
ok(/比較が途中で止まりました（2\/4 今の方式の週の編集）: テスト用の失敗/.test(String(R3.S['X_改修比較']._d[0][0])), '止まった段階と理由がシートに出る');
ok(R3.triggers.length === 0, '止まったら、次の予約は残らない');
