// 書く前の「週の企画」のテスト
var fs = require('fs');
var path = require('path');
var M = require(path.join(__dirname, 'gasmock.js'));
global.__toasts = []; global.__logs = []; global.__payloads = [];
var S = {};
function add(name, rows) { S[name] = M.makeSheet(name, rows); return S[name]; }
add('X_設定', [['項目','値','説明'],['戦略シート名','コンセプト',''],['企画の方式','先行割り当て','']]);
add('コンセプト', [['ターゲット','中小企業の社長'], ['やりたいこと','交通事故実務デスクを広げたい']]);
add('X_文体ルール', [['項目','内容','メモ'],['禁止語','矢印','']]);
add('X_一次情報', [['記録日','ジャンル','質問','回答','使用回数'],
  ['2026-10-12','Xでの返信','k1','REPLY_A 任せる範囲を決めておかないと、結局全部戻ってくるんですよね。長さを足しています。',0],
  ['2026-10-13','Xでの返信','k2','REPLY_B 叔母が店をたたんだ理由を、最近やっと聞けた。長さを足しています。長さを足しています。',0],
  ['2026-10-14','Xでの返信','k3','REPLY_C 叔母は言葉を飲み込む人だった。だから気づけなかった。長さを足しています。長さを足しています。',0],
  ['2026-10-15','Xでの返信','k4','REPLY_D 採用面接で前の職場で困ったことを聞くと、見ている場所がわかる気がします。長さを足しています。',0],
  ['2026-10-16','Xでの引用（推定）','k5','REPLY_E 道具を変えると、会話の量が変わるのはおもしろい。長さを足しています。長さを足しています。',0]
]);
var book = M.makeBook(S);
global.SpreadsheetApp = { getUi: function () { throw new Error('no ui'); }, getActive: function () { return book; }, getActiveSpreadsheet: function () { return book; }, openById: function () { return book; } };
global.PropertiesService = { getScriptProperties: function () { return { getProperty: function (k) { return k === 'ANTHROPIC_API_KEY' ? 'test' : ''; } }; } };
global.Logger = { log: function (m) { __logs.push(String(m)); } };
global.Utilities = { sleep: function () {}, formatDate: function (d, tz, f) { var p = function (n) { return ('0' + n).slice(-2); };
  return f.replace('yyyy', d.getFullYear()).replace('MM', p(d.getMonth() + 1)).replace('dd', p(d.getDate())).replace('HH', p(d.getHours())).replace('mm', p(d.getMinutes())).replace('ss', p(d.getSeconds())).replace('M/d', (d.getMonth()+1)+'/'+d.getDate()); } };

// R番号は新しい順：R1=E(10/16) R2=D R3=C R4=B R5=A
var PLAN = { '枠': [
  { '本': 1, '材料': ['R5'], '企画': '任せる範囲', '主張': '任せる範囲を決めないと仕事は戻ってくる' },
  { '本': 2, '材料': ['R4', 'R3'], '企画': '叔母の話', '主張': '言葉を飲み込む人の理由は、聞くまでわからない' },
  { '本': 3, '材料': ['R2'], '企画': '採用の質問', '主張': '前の職場で困ったことに、その人の目線が出る' },
  { '本': 4, '材料': ['R1'], '企画': '道具と会話', '主張': '道具を変えると会話の量が変わる' },
  { '本': 5, '材料': ['R3'], '企画': '叔母（重複）', '主張': '重複した材料' },
  { '本': 6, '材料': [], '題材': 'これからやりたい仕事', '企画': '相談の受け方', '主張': 'こうしたい' }
] };
var planMode = 'ok';
global.UrlFetchApp = { fetchAll: function (reqs) { return reqs.map(function (q) {
  var body = JSON.parse(q.payload); var u = body.messages[0].content; __payloads.push({ sys: body.system, u: u });
  var out;
  if (/投稿を書く前に、1週間ぶんの企画を決めます/.test(body.system)) out = planMode === 'ok' ? PLAN : { 'だめ': 1 };
  else if (/編集者です/.test(body.system)) out = { '重複': [], '作り直す': [] };
  else {
    var m = u.match(/(\d+)本目から(\d+)本目までの/); var posts = [];
    for (var k = +m[1]; k <= +m[2]; k++) posts.push({ 'テーマ': 'T' + k, '本文': 'BODY' + k, '冒頭3行': 'B', '投稿の狙い': 'x', '元になった返信・切り口': 'y', '事実確認が必要な箇所': 'なし' });
    out = { posts: posts };
  }
  var resp = JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(out) }], stop_reason: 'end_turn' });
  return { getResponseCode: function () { return 200; }, getContentText: function () { return resp; } };
}); } };

eval(fs.readFileSync(path.join(__dirname, '..', '..', 'dist', 'X文体ツール_全部入り.gs'), 'utf8') + '\n;global.__G = xGeneratePosts;');
function ok(c, l) { console.log((c ? '✅ ' : '❌ ') + l); if (!c) process.exitCode = 1; }

console.log('===== 企画 → 執筆 =====');
__G();
var planCalls = __payloads.filter(function (p) { return /1週間ぶんの企画を決めます/.test(p.sys); });
var genCalls = __payloads.filter(function (p) { return /本目までの/.test(p.u) && !/1週間ぶんの企画/.test(p.sys); });
ok(planCalls.length === 1, '書く前に企画会議を1回だけ行う');
ok(__payloads.indexOf(planCalls[0]) < __payloads.indexOf(genCalls[0]), '企画会議は執筆より先');
ok(/1週間に同じ主張は原則1本/.test(planCalls[0].sys) && /長文と短文で同じ主張を言い直すのも/.test(planCalls[0].sys), '企画の指示：同じ主張は原則1本（長文と短文の言い直しも含む）');
ok(/同じ出来事について書いた返信が複数あるなら、それらは1本の材料にまとめます/.test(planCalls[0].sys), '企画の指示：同じ出来事の返信は1本にまとめる');
ok(/そこからテーマを作らないでください/.test(planCalls[0].sys), '企画の指示：方向性シートからテーマを作らない');
ok(/\[R1・/.test(planCalls[0].u) && /・1本目/.test(planCalls[0].u) && /・7本目/.test(planCalls[0].u), '企画会議に返信と7枠が渡っている');

var g12 = genCalls.filter(function (p) { return /全7本のうち、1本目から2本目/.test(p.u); })[0].u;
ok(/### 2本目\n企画: 叔母の話\n主張: 言葉を飲み込む人の理由は、聞くまでわからない\n使う材料（これだけを使う）:\n  \[R4\] REPLY_B[^\n]*\n  \[R3\] REPLY_C/.test(g12), '2本目の依頼に、叔母の返信2件がまとめて渡っている');
ok(/## 同じ週の他の本（この主張を言わない・この材料を使わない）/.test(g12) && /3本目: 前の職場で困ったことに、その人の目線が出る（材料 R2）/.test(g12), '他の本の主張と材料が「言わない・使わない」として渡っている');
var g56 = genCalls.filter(function (p) { return /全7本のうち、5本目から6本目/.test(p.u); })[0].u;
ok(!/### 5本目\n[^#]*\[R3\]/.test(g56), '2枠目に指定されたR3（重複）は5本目から外れている');
ok(/### 5本目\n[^#]*題材: /.test(g56), '材料が外れた5本目には題材が割り当てられている');
ok(/### 6本目\n[^#]*題材: これからやりたい仕事/.test(g56), '6本目は企画どおり「これからやりたい仕事」');
var g7 = genCalls.filter(function (p) { return /全7本のうち、7本目から7本目/.test(p.u); })[0].u;
ok(/### 7本目\n[^#]*題材: /.test(g7) && !/### 7本目\n[^#]*題材: これからやりたい仕事/.test(g7), '企画に無かった7本目にも題材（これから以外）');
ok(genCalls.every(function (p) { return !/切り出す|素材を共有/.test(p.u); }), '「長文の論点を短文で切り出す」指示は無い');
ok(genCalls.every(function (p) { return /長文と短文で同じ主張・同じ材料を使わないでください/.test(p.u); }), '長文と短文で同じ主張・材料を使わない指示がある');
ok(genCalls.every(function (p) { return /1週間に同じ主張は原則1本です/.test(p.sys); }), '執筆の指示にも「同じ主張は原則1本」');
var d = S['X_投稿案']._d, h = d[0];
var row6 = d.filter(function (r) { return r && +r[h.indexOf('枠')] === 6; }).pop();
ok(/題材: これからやりたい仕事/.test(String(row6[h.indexOf('役割')])), '6本目の役割欄に題材が残る: ' + row6[h.indexOf('役割')]);
ok(__logs.some(function (l) { return /^週の企画: 1本目=R5「/.test(l); }), '企画の内容がログに残る');

console.log('===== 企画会議が失敗したとき =====');
planMode = 'ng'; __payloads = [];
var w = Date.now(); while (Date.now() - w < 1100) {}
__G();
var gen2 = __payloads.filter(function (p) { return /本目までの/.test(p.u) && !/1週間ぶんの企画/.test(p.sys); });
ok(gen2.length === 4 && gen2.every(function (p) { return !/この回の企画/.test(p.u); }), '企画なしで従来どおり書く（止まらない）');
ok(__logs.some(function (l) { return /週の企画が空でした|週の企画の返答を読めませんでした/.test(l); }), '企画が使えなかったことをログに残す');
var d2 = S['X_投稿案']._d; var last = String(d2[d2.length - 1][0]);
ok(d2.filter(function (r) { return r && String(r[0]) === last && String(r[h.indexOf('本文')]).indexOf('BODY') === 0; }).length === 7, '7本書けている');
