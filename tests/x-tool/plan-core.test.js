// 企画会議（材料に合わせる方式）のテスト
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var M = require(path.join(__dirname, 'gasmock.js'));
var AFTER = fs.readFileSync(path.join(__dirname, '..', '..', 'dist', 'X文体ツール_全部入り.gs'), 'utf8');
function ok(c, l) { console.log((c ? '✅ ' : '❌ ') + l); if (!c) process.exitCode = 1; }

// R番号は新しい順：R1=E R2=D R3=C R4=B R5=A
var REPLIES = [
  ['2026-10-12', 'Xでの返信', 'k1', 'REPLY_A 任せる範囲を決めておかないと、結局全部戻ってくるんですよね。長さを足しています。'],
  ['2026-10-13', 'Xでの返信', 'k2', 'REPLY_B 社長にとって当たり前の判断ほど、言葉になっていない気がします。長さを足しています。'],
  ['2026-10-14', 'Xでの返信', 'k3', 'REPLY_C 娘が「お母さんの仕事ってなに？」と聞いてきて、うまく答えられなかった。ちょっと悔しかった。'],
  ['2026-10-15', 'Xでの返信', 'k4', 'REPLY_D 採用面接で前の職場で困ったことを聞くと、見ている場所がわかる気がします。長さを足しています。'],
  ['2026-10-16', 'Xでの引用（推定）', 'k5', 'REPLY_E 道具を変えると、会話の量が変わるのはおもしろい。うちでもそうでした。長さを足しています。']
];

function sandboxFor(handlers, extraSetting) {
  var S = {};
  var add = function (n, rows) { S[n] = M.makeSheet(n, rows); };
  add('X_設定', [['項目', '値', '説明'], ['戦略シート名', 'コンセプト', '']].concat(extraSetting || []));
  add('コンセプト', [['ターゲット', '中小企業の社長']]);
  add('X_文体ルール', [['項目', '内容', 'メモ（手で直してください）', '区分'], ['禁止語', '矢印', '', '文体'], ['語尾', 'です', '', '文体'],
    ['繰り返している主張', '判断基準を言葉にする', '', '過去の主張・エピソード'], ['発信の軸・価値観', '社長語を、現場語に', '', '軸・価値観']]);
  add('X_型カタログ', [['型名', '骨組み', '向いている分類', '冒頭の作り方', '締め方', '効く理由', '使わない'],
    ['場面→気づき', '場面\n↓\n気づき', '共感', '場面から', '気づきで', '', ''],
    ['問い→経験', '問い\n↓\n経験', '専門', '問いから', '経験で', '', '']]);
  add('X_一次情報', [['記録日', 'ジャンル', '質問', '回答', '使用回数']].concat(REPLIES.map(function (r) { return r.concat([0]); })));
  var book = M.makeBook(S);
  var log = [];
  var payloads = [];
  var sb = {
    console: console, __toasts: [], Math: Math,
    SpreadsheetApp: { getUi: function () { throw new Error('no ui'); }, getActive: function () { return book; }, getActiveSpreadsheet: function () { return book; }, openById: function () { return book; } },
    PropertiesService: { getScriptProperties: function () { return { getProperty: function (k) { return k === 'ANTHROPIC_API_KEY' ? 'test' : ''; } }; } },
    Logger: { log: function (m) { log.push(String(m)); } },
    Utilities: { sleep: function () {}, formatDate: function (d, tz, f) { var p = function (n) { return ('0' + n).slice(-2); };
      return f.replace('yyyy', d.getFullYear()).replace('MM', p(d.getMonth() + 1)).replace('dd', p(d.getDate())).replace('HH', p(d.getHours())).replace('mm', p(d.getMinutes())).replace('ss', p(d.getSeconds())).replace('M/d', (d.getMonth() + 1) + '/' + d.getDate()); } },
    UrlFetchApp: { fetchAll: function (reqs) { return reqs.map(function (q) {
      var body = JSON.parse(q.payload); var u = body.messages[0].content;
      payloads.push({ sys: body.system, u: u, effort: body.output_config.effort });
      var out = handlers(body.system, u);
      var resp = JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(out) }], stop_reason: 'end_turn' });
      return { getResponseCode: function () { return 200; }, getContentText: function () { return resp; } };
    }); } }
  };
  vm.createContext(sb);
  vm.runInContext(AFTER, sb);
  return { sb: sb, S: S, payloads: payloads, log: log };
}

var isPlan = function (sys) { return /1週間ぶんの企画を決めます/.test(sys); };
var isFix = function (sys, u) { return isPlan(sys) && /# 基準に合わなかったところ/.test(u); };
var genPosts = function (u) {
  var m = u.match(/全(\d+)本のうち、(\d+)本目から(\d+)本目までの/); var posts = [];
  for (var k = +m[2]; k <= +m[3]; k++) posts.push({ 'テーマ': 'T' + k, '本文': 'BODY' + k + '\n締め' + k, '冒頭3行': 'B', '投稿の狙い': 'x', '元になった返信・切り口': 'y', '事実確認が必要な箇所': 'なし' });
  return { posts: posts };
};
var noEdit = { '重複': [], '作り直す': [], '言い過ぎ': [] };

// ============ 1. 良い企画 ============
console.log('===== 1. 企画会議 → 執筆（材料に合わせる） =====');
var GOOD = { '枠': [
  { '本': 1, '材料': ['R3'], '芯': '場面', '芯になる一文': '娘が「お母さんの仕事ってなに？」と聞いてきて', '読者に残るもの': 'なし', '読後感': 'しみじみ', '締め方': '場面で止める', '型': 'なし', '角度': 'なし', '役割': '人柄や日常の気づき', '冒頭カギカッコ': true, '企画': '娘の質問' },
  { '本': 2, '材料': ['R4'], '芯': '主張', '芯になる一文': '当たり前の判断ほど、言葉になっていない', '読者に残るもの': '当たり前の判断ほど言葉にしていない', '読後感': '背筋が伸びる', '締め方': '主張で終える', '型': '問い→経験', '角度': '1', '役割': '経営者が見落としやすい問題', '冒頭カギカッコ': false, '企画': '当たり前の判断', '主張': '当たり前ほど言葉にしていない' },
  { '本': 3, '材料': [], '題材': 'これからやりたい仕事', '芯': '主張', '読者に残るもの': '相談しやすい窓口をつくりたい', '読後感': 'ほっとする', '締め方': '自己表明で終える', '型': 'なし', '角度': 'なし', '役割': '実際に取り組んだ仕事', '冒頭カギカッコ': false, '企画': 'これからの窓口' },
  { '本': 4, '材料': ['R2'], '芯': '問い', '読者に残るもの': '面接で何を聞いているか', '読後感': 'もやっと', '締め方': '問いで終える', '型': 'なし', '角度': 'なし', '役割': '社長と現場のすれ違い', '冒頭カギカッコ': false, '企画': '面接の質問' },
  { '本': 5, '材料': ['R1'], '芯': '観察', '読者に残るもの': 'なし', '読後感': 'くすっと', '締め方': '見たことで止める', '型': 'なし', '角度': 'なし', '役割': '実際に取り組んだ仕事', '冒頭カギカッコ': false, '企画': '道具と会話' },
  { '本': 6, '材料': [], '題材': '人柄', '芯': '観察', '読者に残るもの': 'なし', '読後感': 'しみじみ', '締め方': '見たことで止める', '型': 'なし', '角度': 'なし', '役割': '人柄や日常の気づき', '冒頭カギカッコ': false, '企画': '好きなこと' },
  { '本': 7, '材料': [], '題材': '仕事の考え方', '芯': '問い', '読者に残るもの': '任せるとは何か', '読後感': 'ひやっと', '締め方': '問いで終える', '型': 'なし', '角度': '2', '役割': '経営者が見落としやすい問題', '冒頭カギカッコ': false, '企画': '任せる' }
], '使わなかった材料': [{ '材料': 'R5', '理由': '2本目と同じ論点' }] };
var A = sandboxFor(function (sys, u) {
  if (isPlan(sys)) return GOOD;
  if (/編集者です/.test(sys)) return noEdit;
  return genPosts(u);
});
vm.runInContext('xGeneratePosts();', A.sb);
var plan = A.payloads.filter(function (p) { return isPlan(p.sys); });
var gens = A.payloads.filter(function (p) { return /本目までの/.test(p.u) && !isPlan(p.sys); });
ok(plan.length === 1 && !A.payloads.some(function (p) { return isFix(p.sys, p.u); }), '企画会議は1回（基準を満たしているのでやり直しなし）');
ok(plan[0].effort === 'high', '企画会議は丁寧に考える設定（effort: high）');
ok(/主張…/.test(plan[0].sys) && /場面…/.test(plan[0].sys) && /問い…/.test(plan[0].sys) && /感情…/.test(plan[0].sys) && /観察…/.test(plan[0].sys), '芯の種類は主張・場面・問い・感情・観察の5つ');
ok(/3種類以上に散らしてください（努力目標）/.test(plan[0].sys) && /種類を増やすために、場面・感情・エピソードを作らないでください/.test(plan[0].sys), '芯の種類は努力目標。増やすための創作は禁止');
ok(/主張の本の数に上限はありません/.test(plan[0].sys), '主張の本の上限なし（材料しだい）');
ok(/教訓や問いかけで締める必要はありません/.test(plan[0].sys), '日常・人柄・場面・感情・観察は教訓で締めなくてよい');
ok(/実際に読んで面白いと思える/.test(plan[0].sys), '目標は「実際に読んで面白いと思える7本」');
ok(/使わなかった材料/.test(plan[0].sys), '採用しなかった材料を理由つきで挙げさせる');
ok(/## 型カタログ\n・場面→気づき：/.test(plan[0].u) && /## 角度\n・1\. /.test(plan[0].u) && /## 役割\n・/.test(plan[0].u), '企画会議には型カタログ・角度・役割の一覧を「選べるもの」として渡す');
ok(gens.length === 4, '執筆は2本ずつ4回');
ok(gens.every(function (p) { return !/## 使う型（割り当て済み/.test(p.u) && !/## 視点の角度/.test(p.u) && !/## 投稿の役割（目安）/.test(p.u) && !/## 冒頭の入り方/.test(p.u); }), '型・角度・役割・冒頭の先行割り当ては無い');
ok(gens.every(function (p) { return !/## 構成の型（骨組みだけ）/.test(p.u); }), '型カタログの全文は毎回は渡さない');
var g12 = gens.filter(function (p) { return /1本目から2本目/.test(p.u); })[0].u;
ok(/### 1本目\n芯: 場面（/.test(g12) && /芯になる一文: 「娘が「お母さんの仕事ってなに？」と聞いてきて」/.test(g12), '1本目：芯（場面）と芯になる一文が渡っている');
ok(/### 1本目[\s\S]*締め方: 場面で止める。教訓や問いかけを足さない。/.test(g12), '1本目：締め方は場面で止める（教訓や問いを足さない）');
ok(/### 1本目[\s\S]*冒頭: カギカッコ始まりにしてよい/.test(g12) && /### 2本目[\s\S]*冒頭: カギカッコで始めない/.test(g12), '冒頭のカギカッコは企画で決めた本だけ');
ok(/### 2本目[\s\S]*型: 問い→経験（骨組み: 問い ↓ 経験/.test(g12) && !/### 1本目\n[^#]*型: /.test(g12), '型は企画で選んだ本（2本目）だけ、その型の説明だけ');
ok(/### 2本目[\s\S]*角度: 自分が過去にしていた判断を否定する/.test(g12), '角度も選んだ本だけ');
ok(/## 同じ週の他の本（この気づき・主張・読後感と重ねない/.test(g12) && /4本目: 芯=問い \/ 残るもの=面接で何を聞いているか/.test(g12), '他の本の芯・気づき・読後感を「重ねない」として渡す');
var g34 = gens.filter(function (p) { return /3本目から4本目/.test(p.u); })[0].u;
ok(/### 3本目[\s\S]*方針の表明（〜したい・〜と思っています）で締めるのは、題材が「これからやりたい仕事」のときだけ/.test(g34), '材料なしの枠：方針の表明は「これからやりたい仕事」だけ');
ok(/実例が無い場合は、企画の芯（主張・問い・観察）に沿って/.test(gens[0].sys) && !/今後大切にしたい考え方・仕事の方針として書いてください/.test(gens[0].sys), '執筆の指示：「今後大切にしたい方針として書く」をやめた');
ok(/芯が主張・問いの本は、読み終えたときに/.test(g12) && /場面・感情・観察の本は、教訓や問いかけを足さず/.test(g12), '「読者が前と違うことを考える状態に」は主張・問いの本だけ');
var D = A.S['X_投稿案']._d, h = D[0];
var r1 = D.filter(function (r) { return r && +r[h.indexOf('枠')] === 1; }).pop();
ok(r1[h.indexOf('芯')] === '場面' && r1[h.indexOf('読後感')] === 'しみじみ', '投稿案シートに「芯」「読後感」が入る');
var P = A.S['X_企画会議']._d;
ok(P && P[1][1] === '芯' && P[2][1] === '場面' && P[2][3] === '娘が「お母さんの仕事ってなに？」と聞いてきて', '企画会議シートに、枠ごとの芯・芯になる一文などが残る');
var un = P.slice(P.findIndex(function (r) { return r[0] === '採用しなかった材料'; }) + 1).filter(function (r) { return r[1]; });
ok(un.length === 1 && un[0][1] === 'R5' && un[0][2] === '2本目と同じ論点' && /REPLY_A/.test(un[0][3]), '採用しなかった材料：R5・理由・材料の本文が残る');
ok(/芯の種類は4種類/.test(P[0][1]), '芯の種類の数が残る: ' + P[0][1]);

// ============ 2. 基準を超えた枠だけやり直す ============
console.log('===== 2. 基準を超えた枠だけ、企画をやり直す =====');
var BAD = JSON.parse(JSON.stringify(GOOD));
BAD['枠'][2] = { '本': 3, '材料': [], '題材': '日常の気づき', '芯': '場面', '芯になる一文': '', '読者に残るもの': 'なし', '読後感': 'ほっとする', '締め方': '場面で止める', '冒頭カギカッコ': true, '企画': '作った場面' };   // 材料なしで場面
BAD['枠'][4] = { '本': 5, '材料': ['R1'], '芯': '感情', '芯になる一文': 'とても悲しくて泣いた', '読者に残るもの': 'なし', '読後感': 'しみじみ', '締め方': '気持ちのまま', '冒頭カギカッコ': true, '企画': '道具' };     // 材料に無い気持ち・しみじみ3本目
BAD['枠'][5]['読者に残るもの'] = '当たり前の判断ほど言葉にしていない';   // 2本目と同じ気づき
BAD['枠'][6]['冒頭カギカッコ'] = true;
var fixReq = '';
var B = sandboxFor(function (sys, u) {
  if (isFix(sys, u)) {
    fixReq = u;
    return { '枠': [
      { '本': 3, '材料': [], '題材': '日常の気づき', '芯': '観察', '読者に残るもの': 'なし', '読後感': 'くすっと', '締め方': '見たことで止める', '企画': '直した3' },
      { '本': 5, '材料': ['R1'], '芯': '観察', '読者に残るもの': 'なし', '読後感': 'くすっと', '締め方': '見たことで止める', '企画': '直した5' },
      { '本': 6, '材料': [], '題材': '人柄', '芯': '観察', '読者に残るもの': '好きなことを仕事にしない', '読後感': 'ほっとする', '締め方': '見たことで止める', '企画': '直した6' },
      { '本': 2, '材料': ['R5'], '芯': '主張', '企画': '頼んでいない枠は無視される' }
    ] };
  }
  if (isPlan(sys)) return BAD;
  if (/編集者です/.test(sys)) return noEdit;
  return genPosts(u);
});
vm.runInContext('xGeneratePosts();', B.sb);
ok(/3本目: 材料が無いのに芯が場面/.test(fixReq), 'やり直し理由：材料が無いのに場面');
ok(/5本目: 芯になる一文が材料に見当たらない/.test(fixReq), 'やり直し理由：芯になる一文（気持ち）が材料に無い');
ok(/6本目: 2本目と同じ気づき・主張/.test(fixReq), 'やり直し理由：2本目と同じ気づき');
ok(/読後感「しみじみ」が週2本を超えた/.test(fixReq), 'やり直し理由：同じ読後感が週2本を超えた');
ok(/次の枠だけ、企画をやり直してください: 3本目・5本目・6本目/.test(fixReq) || /次の枠だけ、企画をやり直してください: 3本目・5本目・6本目・7本目/.test(fixReq), 'やり直すのは基準を超えた枠だけ: ' + (fixReq.match(/やり直してください: [^\n]*/) || [''])[0]);
var P2 = B.S['X_企画会議']._d;
var row = function (n) { return P2.filter(function (r) { return r[0] === n; })[0]; };
ok(row(3)[1] === '観察' && /直した3/.test(row(3)[10]) && row(5)[1] === '観察' && /直した6/.test(row(6)[10]), 'やり直した企画に差し替わった（3・5・6本目）');
ok(row(2)[2] === 'R4' && !/頼んでいない枠/.test(row(2)[10]), '頼んでいない枠（2本目）は変わらない');
var g7 = B.payloads.filter(function (p) { return /7本目から7本目/.test(p.u) && !isPlan(p.sys); })[0].u;
var g12b = B.payloads.filter(function (p) { return /1本目から2本目/.test(p.u) && !isPlan(p.sys); })[0].u;
ok(/### 7本目[\s\S]*冒頭: カギカッコで始めない/.test(g7) && /### 1本目[\s\S]*冒頭: カギカッコ始まりにしてよい/.test(g12b), 'カギカッコ始まり：材料の無い枠と、週2本を超えた分はプログラムで外す（1本目は残る）');

// ============ 3. 努力目標：主張ばかりでもやり直さない ============
console.log('===== 3. 芯の種類は努力目標 =====');
var ALLCLAIM = { '枠': [1, 2, 3, 4, 5].map(function (n) {
  var tk = ['道具を変えると会話が増える', '面接の問いで目線がわかる', '娘への説明で仕事を見直す', '当たり前ほど言葉にしない', '任せる範囲を先に決める'][n - 1];
  return { '本': n, '材料': ['R' + n], '芯': '主張', '読者に残るもの': tk, '読後感': ['a', 'b', 'c', 'd', 'e'][n - 1], '締め方': '主張で終える', '企画': 'p' + n };
}) };
var C = sandboxFor(function (sys, u) {
  if (isPlan(sys)) return ALLCLAIM;
  if (/編集者です/.test(sys)) return noEdit;
  return genPosts(u);
});
vm.runInContext('xGeneratePosts();', C.sb);
ok(!C.payloads.some(function (p) { return isFix(p.sys, p.u); }), '主張ばかりでも、種類を増やすためのやり直しはしない');
ok(/芯の種類は\d種類（努力目標の3種類に届かず。材料の都合）/.test(C.S['X_企画会議']._d[0][1]), '努力目標に届かないことは記録だけ: ' + C.S['X_企画会議']._d[0][1]);

// ============ 4. 企画会議が失敗したら、以前の方式で書く ============
console.log('===== 4. 企画会議が失敗したとき =====');
var F = sandboxFor(function (sys, u) {
  if (isPlan(sys)) return { 'だめ': 1 };
  if (/編集者です/.test(sys)) return noEdit;
  return genPosts(u);
});
vm.runInContext('xGeneratePosts();', F.sb);
var fg = F.payloads.filter(function (p) { return /本目までの/.test(p.u) && !isPlan(p.sys); });
ok(fg.length === 4 && fg.every(function (p) { return /## 使う型（割り当て済み/.test(p.u) && /## 構成の型（骨組みだけ）/.test(p.u); }), '以前の方式（先行割り当て＋型カタログ）で書く。止まらない');

// ============ 5. 週の編集（材料に合わせる方式） ============
console.log('===== 5. 週の編集 =====');
var edReq = '', refill = [];
var E = sandboxFor(function (sys, u) {
  if (isPlan(sys)) return GOOD;
  if (/編集者です/.test(sys) && /作り直した本:/.test(u)) return { '外す': [], '言い過ぎ': [] };
  if (/編集者です/.test(sys)) { edReq = sys + '\n' + u; return { '重複': [{ '本': [2, 7], '重なり': '気づき', '残す': 2 }], '作り直す': [{ '本': 7, '材料': 'R5', '芯': '観察', '締め方': '見たことで止める', '読後感': 'くすっと', '企画': '別の切り口' }] }; }
  if (/この枠は作り直しです/.test(u)) { refill.push(u); return { posts: [{ 'テーマ': 'N7', '本文': 'NEW7', '冒頭3行': 'N', '投稿の狙い': 'x', '事実確認が必要な箇所': 'なし' }] }; }
  return genPosts(u);
});
vm.runInContext('xGeneratePosts();', E.sb);
ok(/芯の種類と締め方：同じ芯・同じ締め方が多すぎないか/.test(edReq) && /日常・人柄の本を教訓や問いで締めていないか/.test(edReq), '週の編集は、芯の種類と締め方も比べる');
ok(/## 1本目（役割: 人柄や日常の気づき）\nテーマ: T1\n芯: 場面 \/ 読後感: しみじみ/.test(edReq), '編集者に各本の芯と読後感を見せる');
ok(/"芯"（主張・場面・問い・感情・観察）、"締め方"、"読後感" も決めてください/.test(edReq), '作り直す枠の芯・締め方・読後感も決めさせる');
ok(refill.length === 1 && /芯: 観察/.test(refill[0]) && /締め方: 見たことで止める（教訓や問いかけを足さない）/.test(refill[0]) && !/## 使う型（割り当て済み/.test(refill[0]), '作り直しの依頼に芯・締め方が入り、先行割り当ては無い');
var D5 = E.S['X_投稿案']._d, h5 = D5[0];
var r7 = D5.filter(function (r) { return r && +r[h5.indexOf('枠')] === 7; }).pop();
ok(r7[h5.indexOf('本文')] === 'NEW7' && r7[h5.indexOf('芯')] === '観察' && r7[h5.indexOf('読後感')] === 'くすっと', '作り直した7本目の芯・読後感がシートに入る');

// ============ 6. 自己チェック：締めの数 ============
console.log('===== 6. 自己チェック =====');
var G = sandboxFor(function (sys, u) {
  if (isPlan(sys)) return GOOD;
  if (/編集者です/.test(sys)) return noEdit;
  var m = u.match(/全(\d+)本のうち、(\d+)本目から(\d+)本目までの/); var posts = [];
  for (var k = +m[2]; k <= +m[3]; k++) posts.push({ 'テーマ': 'T' + k, '本文': 'BODY' + k + '\n' + (k <= 3 ? 'これからも大切にしていきたいと思っています。' : (k <= 6 ? 'あなたはどうですか？' : '以上です。')), '冒頭3行': 'B', '投稿の狙い': 'x', '事実確認が必要な箇所': 'なし' });
  return { posts: posts };
});
vm.runInContext('xGeneratePosts();', G.sb);
var t = G.sb.__toasts.length ? '' : '';
var lastLog = G.log.filter(function (l) { return /今回の分/.test(l); }).pop() || '';
ok(/自己表明（〜したい・〜と思っています）で締めた投稿が3本あります（目安は2本まで）/.test(lastLog), '自己表明の締めが週3本 → 知らせる');
ok(/問いで締めた投稿が3本あります（目安は2本まで）/.test(lastLog), '問いの締めが週3本 → 知らせる');
