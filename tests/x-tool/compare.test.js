// 改修前後の比較（メニュー「改修前後を比べる」）のテスト
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var M = require(path.join(__dirname, 'gasmock.js'));
var AFTER = fs.readFileSync(path.join(__dirname, '..', '..', 'dist', 'X文体ツール_全部入り.gs'), 'utf8');
function ok(c, l) { console.log((c ? '✅ ' : '❌ ') + l); if (!c) process.exitCode = 1; }

var S = {};
var add = function (n, rows) { S[n] = M.makeSheet(n, rows); };
add('X_設定', [['項目', '値', '説明'], ['戦略シート名', 'コンセプト', '']]);
add('コンセプト', [['ターゲット', '中小企業の社長']]);
add('X_文体ルール', [['項目', '内容', 'メモ（手で直してください）', '区分'],
  ['禁止語', '矢印', '', '文体'], ['語尾', 'です', '', '文体'],
  ['繰り返している主張', '社長が抱え込まないことが大切', '', '過去の主張・エピソード'],
  ['発信の軸・価値観', '社長語を、現場語に', '', '軸・価値観']]);
add('X_一次情報', [['記録日', 'ジャンル', '質問', '回答', '使用回数'],
  ['2026-10-14', 'Xでの返信', 'k1', 'REPLY_A 任せる範囲を決めておかないと、結局全部戻ってくるんですよね。長さを足しています。', 0]]);
add('X_投稿案', [['作成日時', '本文']]);
var book = M.makeBook(S);
var payloads = [];
var judgeSys = '';
var sandbox = {
  console: console, __toasts: [], Math: Math,
  SpreadsheetApp: { getUi: function () { throw new Error('no ui'); }, getActive: function () { return book; }, getActiveSpreadsheet: function () { return book; }, openById: function () { return book; } },
  PropertiesService: { getScriptProperties: function () { return { getProperty: function (k) { return k === 'ANTHROPIC_API_KEY' ? 'test' : ''; } }; } },
  Logger: { log: function () {} },
  Utilities: { sleep: function () {}, formatDate: function (d, tz, f) { var p = function (n) { return ('0' + n).slice(-2); };
    return f.replace('yyyy', d.getFullYear()).replace('MM', p(d.getMonth() + 1)).replace('dd', p(d.getDate())).replace('HH', p(d.getHours())).replace('mm', p(d.getMinutes())).replace('ss', p(d.getSeconds())).replace('M/d', (d.getMonth() + 1) + '/' + d.getDate()); } },
  UrlFetchApp: { fetchAll: function (reqs) { return reqs.map(function (q) {
    var body = JSON.parse(q.payload); var u = body.messages[0].content;
    payloads.push({ sys: body.system, u: u });
    var isNew = /■ 言い切りの基準/.test(body.system);
    var out;
    if (/1週間ぶんの企画を決めます/.test(body.system)) out = { '枠': [] };
    else if (/2つの方法（X と Y）/.test(body.system)) {
      judgeSys = body.system;
      // X と Y のどちらが改修後かを、本文の目印で判定して答える（伏せ方が正しく読み替えられるかを確かめる）
      var xIsNew = /# X\n## 1本目\nNEW/.test(u);
      var N = xIsNew ? 'X' : 'Y', O = xIsNew ? 'Y' : 'X';
      out = { '文体': { 'より良い': '同じ', '理由': 'どちらも語尾が同じ' },
        '結論の似通い': { '少ない': N, 'Xの傾向': xIsNew ? '新' : '旧', 'Yの傾向': xIsNew ? '旧' : '新' },
        '根拠のない断定': (function () { var o = {}; o[O] = [{ '本': 2, '箇所': '社長はみんな不安です', '種類': '他人の気持ち' }]; o[N] = []; return o; })(),
        '冒頭と締め': { '変化が大きい': N, '理由': '締めが散った' },
        '編集の手間': (function () { var o = { '理由': 'x' }; o[O] = [1, 1, 0, 0, 0, 0, 0]; o[N] = [0, 1, 0, 0, 0, 0, 0]; return o; })(),
        '総評': N + 'のほうが結論が散っている' };
    } else {
      var m = u.match(/全(\d+)本のうち、(\d+)本目から(\d+)本目までの/); var posts = [];
      for (var k = +m[2]; k <= +m[3]; k++) {
        posts.push({ 'テーマ': 'T' + k,
          '本文': isNew ? ('NEW' + k + ' 場面' + k + 'から入る\n私はこう考えています。\n締め' + k + 'はそれぞれ違う')
                        : ('「同じ書き出し」OLD' + k + '\nたぶん大事なのかもしれません。\n結局、仕組みが大切だと思います'),
          '冒頭3行': 'B', '投稿の狙い': 'x', '元になった返信・切り口': 'y', '事実確認が必要な箇所': k === 3 ? '確認したい' : 'なし' });
      }
      out = { posts: posts };
    }
    var resp = JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(out) }], stop_reason: 'end_turn' });
    return { getResponseCode: function () { return 200; }, getContentText: function () { return resp; } };
  }); } }
};
vm.createContext(sandbox);
vm.runInContext(AFTER, sandbox);

var draftsBefore = JSON.stringify(S['X_投稿案']._d);
for (var round = 0; round < 6; round++) {   // X/Y の伏せ方はランダムなので何回か回す
  payloads = [];
  vm.runInContext('xCompareModes();', sandbox);
  var C = S['X_改修比較']._d;
  var find = function (label) { return C.filter(function (r) { return r && r[0] === label; })[0] || []; };
  if (round === 0) {
    var plans = payloads.filter(function (p) { return /1週間ぶんの企画を決めます/.test(p.sys); });
    var gens = payloads.filter(function (p) { return /本目までの/.test(p.u) && !/1週間ぶんの企画/.test(p.sys); });
    ok(plans.length === 2, '企画会議は2つの方式ぶん（同時）');
    ok(gens.length === 8 && gens.filter(function (p) { return /■ 言い切りの基準/.test(p.sys); }).length === 4 &&
       gens.filter(function (p) { return /■ 言い切りの使い分け/.test(p.sys); }).length === 4, '執筆は改修前4回・改修後4回（同時）');
    var replyIn = function (p) { return /REPLY_A/.test(p.u); };
    ok(gens.every(replyIn), '両方の方式に同じ材料（今週の返信）が入っている');
    ok(!payloads.some(function (p) { return /編集者です/.test(p.sys) && /# 今週の7本/.test(p.u); }), '週の編集・作り直しはしていない（執筆までの差だけを見る）');
    ok(/どちらが新しい方法かは伏せています/.test(judgeSys), 'AIの比較は、どちらが改修後かを伏せている');
    ok(String(find('1本目')[4]).indexOf('OLD1') >= 0 && String(find('1本目')[5]).indexOf('NEW1') === 0, '1本目：改修前と改修後の本文が並んでいる');
    ok(find('冒頭がカギカッコの本')[2] === 7 && find('冒頭がカギカッコの本')[3] === 0, '目安：冒頭がカギカッコの本（改修前7／改修後0）');
    ok(find('締めに「大切・大事・必要」がある本')[2] === 7 && find('締めに「大切・大事・必要」がある本')[3] === 0, '目安：締めの教訓（改修前7／改修後0）');
    ok(find('締めどうしの似ている度合い（平均）')[2] > find('締めどうしの似ている度合い（平均）')[3], '目安：締めの似ている度合いは改修前のほうが高い');
    ok(find('留保の言い回し（かもしれません・気がします 等）')[2] === 21 && find('留保の言い回し（かもしれません・気がします 等）')[3] === 0, '目安：留保の言い回し（改修前21／改修後0）');
    ok(find('事実確認の質問がある本')[2] === 1 && find('事実確認の質問がある本')[3] === 1, '目安：事実確認の質問（どちらも1）');
    ok(C.some(function (r) { return r && r[0] === '■ 4. あなたの判定（ここに書き込んでください）'; }), '本人が判定を書き込む欄がある');
    ok(JSON.stringify(S['X_投稿案']._d) === draftsBefore && !S['X_投稿案_週形式'], '投稿案シート・週形式シートには何も書いていない');
  }
  var st = find('似た結論に寄る傾向が減ったか');
  var oc = find('根拠のない断定が増えていないか');
  var ed = find('編集する負担が増えていないか');
  var sum = find('総評');
  if (!(st[1] === '少ない: 改修後' && /改修前 1箇所／改修後 0箇所/.test(oc[1]) && /社長はみんな不安です/.test(oc[2]) && /改修前 2／改修後 1/.test(ed[1]) && /改修後のほうが結論が散っている/.test(sum[1]))) {
    ok(false, '伏せたX/Yを改修前/改修後に正しく読み替えられていない（' + round + '回目）: ' + JSON.stringify([st[1], oc[1], ed[1], sum[1]]));
    break;
  }
  if (round === 5) ok(true, '伏せたX/Yを、6回とも改修前/改修後に正しく読み替えた（結論・断定・編集の手間・総評）');
}
