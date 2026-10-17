var fs = require('fs');
var M = require(require('path').join(__dirname, 'gasmock.js'));
global.__toasts = []; global.__logs = []; global.__payloads = [];
var S = {};
function add(name, rows) { S[name] = M.makeSheet(name, rows); return S[name]; }
add('X_設定', [['項目','値','説明'],['戦略シート名','コンセプト','']]);
add('コンセプト', [['ターゲット','中小企業の社長']]);
add('X_文体ルール', [['項目','内容','メモ'],['禁止語','矢印','']]);
add('X_一次情報', [['記録日','ジャンル','質問','回答','使用回数'],
  ['2026-10-12','Xでの返信','k1','REPLY_A 任せる範囲を決めておかないと、結局全部戻ってくるんですよね。長さを足しています。',0],
  ['2026-10-13','Xでの返信','k2','REPLY_B 採用面接で「前の職場で何に困っていたか」を聞くと、その人の見ている場所がわかる気がします。',0],
  ['2026-10-14','Xでの返信','k3','REPLY_C 数字を毎朝見るようになってから、見ないふりができなくなった。いいことなのかはまだわからない。',0],
  ['2026-10-15','Xでの返信','k4','REPLY_D 叔母が店をたたんだ理由を、最近やっと聞けた。言葉を飲み込む人だった。長さを足しています。',0],
  ['2026-10-16','Xでの引用（推定）','k5','REPLY_E 道具を変えると、会話の量が変わるのはおもしろい。うちでも似たことがありました。',0]
]);
var book = M.makeBook(S);
var UI_ANSWER = null;
var MEMO_ANSWER = '';
global.SpreadsheetApp = {
  getUi: function () {
    if (UI_ANSWER === null) throw new Error('no ui');
    return { ButtonSet: { OK_CANCEL: 1 }, Button: { OK: 'OK' },
      prompt: function (title) { var a = /今週あったこと/.test(title) ? MEMO_ANSWER : UI_ANSWER; return { getSelectedButton: function () { return 'OK'; }, getResponseText: function () { return a; } }; } };
  },
  getActive: function () { return book; }, getActiveSpreadsheet: function () { return book; }, openById: function () { return book; }
};
global.PropertiesService = { getScriptProperties: function () { return { getProperty: function (k) { return k === 'ANTHROPIC_API_KEY' ? 'test' : ''; } }; } };
global.Logger = { log: function (m) { __logs.push(String(m)); } };
global.Utilities = { sleep: function () {}, formatDate: function (d, tz, f) { var p = function (n) { return ('0' + n).slice(-2); };
  return f.replace('yyyy', d.getFullYear()).replace('MM', p(d.getMonth() + 1)).replace('dd', p(d.getDate())).replace('HH', p(d.getHours())).replace('mm', p(d.getMinutes())).replace('ss', p(d.getSeconds())).replace('M/d', (d.getMonth()+1)+'/'+d.getDate()); } };

// --- 偽のAPI ---
var THEMES = { 1:'判断基準と任せる範囲', 2:'言葉を飲み込む・叔母', 3:'叔母の店', 4:'採用の質問', 5:'言葉を飲み込む', 6:'任せる範囲の線引き', 7:'判断基準の共有' };
var EDITOR_AUTO = { '重複': [{ '本': [1,6,7], '重なり': 'テーマ・主張', '残す': 1 }, { '本': [2,3,5], '重なり': 'エピソード（叔母）', '残す': 2 }],
  '作り直す': [{ '本': 6, '材料': 'R2', '企画': '数字を毎朝見る' }, { '本': 7, '材料': null }, { '本': 3, '材料': 'R1', '企画': '道具と会話の量' }, { '本': 5, '材料': 'R3', '企画': '採用の質問' }], '不足': '7本目に使える材料なし' };
var EDITOR_FIXED = { '重複': [], '作り直す': [{ '本': 3, '材料': 'R1' }, { '本': 5, '材料': 'M2' }, { '本': 6, '材料': 'R3' }, { '本': 7, '材料': 'M1' }] };
var RECHECK = { '外す': [5], '理由': '4本目と同じ採用の話' };
var mode = 'auto';
var ON_EDITOR = null;
var refillReqs = [];
global.UrlFetchApp = { fetchAll: function (reqs) { return reqs.map(function (q) {
  var body = JSON.parse(q.payload); var u = body.messages[0].content; __payloads.push(body.system + '\n=====\n' + u);
  var out;
  if (/編集者です/.test(body.system) && /作り直した本:/.test(u)) out = RECHECK;
  else if (/編集者です/.test(body.system)) { if (ON_EDITOR) ON_EDITOR(); out = mode === 'auto' ? EDITOR_AUTO : EDITOR_FIXED; }
  else if (/この枠は作り直しです/.test(u)) {
    refillReqs.push(u);
    var m = u.match(/全\d+本のうち、(\d+)本目から/); var k = +m[1];
    var mat = (u.match(/### この枠で使う材料\n\[(R\d+|M\d+)\] /) || [])[1];
    out = { posts: [{ 'テーマ': 'NEW' + k, '本文': 'NEWBODY' + k + ' from ' + mat, '冒頭3行': 'N', '投稿の狙い': 'x', '元になった返信・切り口': '[' + mat + ']', '事実確認が必要な箇所': 'なし' }] };
  } else {
    var mm = u.match(/(\d+)本目から(\d+)本目までの/); var posts = [];
    for (var k2 = +mm[1]; k2 <= +mm[2]; k2++) posts.push({ 'テーマ': THEMES[k2], '本文': 'BODY' + k2 + ' ' + THEMES[k2] + (k2 === 4 ? '\n詳しくは固定ポストへ' : '') + (k2 === 1 ? '\nDMでどうぞ' : '') + (k2 === 2 ? '\n【要確認：叔母の年齢】' : ''),
      '冒頭3行': 'B', '投稿の狙い': 'x', '元になった返信・切り口': 'R' + k2, '事実確認が必要な箇所': 'なし' });
    out = { posts: posts };
  }
  var resp = JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(out) }], stop_reason: 'end_turn' });
  return { getResponseCode: function () { return 200; }, getContentText: function () { return resp; } };
}); } };

eval(fs.readFileSync(require('path').join(__dirname, '..', '..', 'dist', 'X文体ツール_全部入り.gs'), 'utf8') + '\n;global.__G = xGeneratePosts; global.__R = xRegenerateDrafts; global.xGenCtx_ = xGenCtx_; global.xEditWeek_ = xEditWeek_; global.xCheckDrafts = xCheckDrafts; global.X_DRAFT_HEADERS = X_DRAFT_HEADERS;');
function ok(c, l) { console.log((c ? '✅ ' : '❌ ') + l); if (!c) process.exitCode = 1; }
function batchRows() {
  var d = S['X_投稿案']._d, h = d[0];
  var col = function (n) { return h.indexOf(n); };
  var last = String(d[d.length - 1][col('作成日時')]);
  return { h: h, col: col, rows: d.slice(1).filter(function (r) { return r && String(r[col('作成日時')]) === last; }) };
}

console.log('===== A: 生成 → 週の編集（自動） =====');
__G();
var b = batchRows(), col = b.col, rows = b.rows;
var body = function (n) { return String(rows.filter(function (r) { return +r[col('枠')] === n; })[0][col('本文')]); };
var cell = function (n, h) { return String(rows.filter(function (r) { return +r[col('枠')] === n; })[0][col(h)]); };
ok(rows.length === 7 && rows.map(function (r) { return r[col('枠')]; }).join(',') === '1,2,3,4,5,6,7', '7枠すべてが1行ずつ、枠番号つきで書かれている');
ok(body(1).indexOf('BODY1') === 0 && body(2).indexOf('BODY2') === 0 && body(4).indexOf('BODY4') === 0, '残した1・2・4本目はそのまま');
ok(body(3).indexOf('NEWBODY3 from R1') === 0, '3本目はR1から作り直し: ' + body(3));
ok(body(6).indexOf('NEWBODY6 from R2') === 0, '6本目はR2から作り直し: ' + body(6));
ok(body(7) === '' && cell(7, '状態') === '空き', '7本目は材料なし → 無理に埋めず空き');
ok(body(5) === '' && cell(5, '状態') === '空き', '5本目は作り直したがまだ重なっていた → 空き');
ok(/重なり（1・6・7本目／テーマ・主張）の中から残した1本/.test(cell(1, '編集メモ')), '1本目の編集メモ: ' + cell(1, '編集メモ'));
ok(/重なりのため作り直し（材料: R2）/.test(cell(6, '編集メモ')), '6本目の編集メモ: ' + cell(6, '編集メモ'));
ok(cell(2, '状態') === '要確認', '【要確認】が残る2本目は状態「要確認」（完成稿扱いしない）');
ok(/誘導が週2本/.test(cell(1, '自己チェック')) && /誘導が週2本/.test(cell(4, '自己チェック')), '誘導が週2本 → 両方に印');
var t = __toasts[__toasts.length - 1];
ok(/【不足】5本目・7本目/.test(t), '不足を報告: ' + t);
var wk = S['X_投稿案_週形式']._d; var hd = wk.filter(function (r) { return r && r[0] === '日付'; }).pop();
ok(/（要確認・未完成）/.test(hd[2]) && /（空き）/.test(hd[5]) && /（空き）/.test(hd[7]), '週形式の見出しに（要確認・未完成）（空き）');
var r6 = refillReqs.filter(function (u) { return /\[R2\]/.test(u); })[0] || '';
ok(/1本目: 判断基準と任せる範囲/.test(r6) && /4本目: 採用の質問/.test(r6), '作り直しの依頼に「残す本」の一覧が入っている');
ok(/× 任せる範囲の線引き/.test(r6) && /× 判断基準の共有/.test(r6), '作り直しの依頼に「外した案」が入っている');
ok(/上の材料1つだけで書いてください/.test(r6), '材料1つだけで書かせている');
var gen = __payloads.filter(function (p) { return /本目までの/.test(p) && !/作り直しです/.test(p); })[0];
ok(/毎回サービス紹介や固定ポストへの誘導を入れないでください/.test(gen), '生成の指示に「誘導を毎回入れない」');
ok(/\[R1・/.test(gen), '返信に R番号が振られて生成に渡っている');

console.log('===== B: 1・2・4を残して作り直す（本人指定） =====');
mode = 'fixed'; refillReqs = []; __payloads = []; RECHECK = { '外す': [] };
// 今週あったことを、作り直しのダイアログで2行入れる
MEMO_ANSWER = 'MEMO_ONE スタッフに聞かれた回数を数えたら1日12回だった\nMEMO_TWO 見積もりの説明で、初めて「わからない」と言われた';
var w = Date.now(); while (Date.now() - w < 1100) {}  // 作成日時（秒）を分ける
UI_ANSWER = '1、２，4';
var before = batchRows();
var orig = {}; before.rows.forEach(function (r) { orig[r[before.col('枠')]] = String(r[before.col('本文')]); });
__R();
var b2 = batchRows(); col = b2.col; rows = b2.rows;
ok(b2.rows.length === 7, '新しい1回ぶんとして7枠書かれている');
ok(body(1) === orig[1] && body(2) === orig[2] && body(4) === orig[4], '1・2・4本目は本文そのまま');
ok(cell(1, '状態') === '残す' && cell(4, '状態') === '残す', '残した本の状態は「残す」');
ok(cell(2, '状態') === '残す', '【要確認】があっても本人が残した本は「残す」のまま（本人の印を上書きしない）');
ok(body(3).indexOf('NEWBODY3 from R1') === 0 && body(5).indexOf('NEWBODY5 from M') === 0 && body(6).indexOf('NEWBODY6 from R3') === 0 && body(7).indexOf('NEWBODY7 from M') === 0, '3・5・6・7本目は指定の材料から作り直し（5・7本目は今週あったこと）');
var memoRows = S['X_一次情報']._d.filter(function (r) { return r && r[1] === '今週あったこと'; });
ok(memoRows.length === 2, 'ダイアログの2行が、今週あったこととして2件保存された（' + memoRows.length + '件）');
var r5 = refillReqs.filter(function (u) { return /全7本のうち、5本目から/.test(u); })[0] || '';
var r7 = refillReqs.filter(function (u) { return /全7本のうち、7本目から/.test(u); })[0] || '';
var memoOf = function (u) { var m = u.match(/### この枠で使う材料\n\[M\d\] (MEMO_\w+)/); return m ? m[1] : ''; };
ok(memoOf(r5) && memoOf(r7) && memoOf(r5) !== memoOf(r7), '5本目と7本目に、別々のメモが1件ずつ渡っている（' + memoOf(r5) + ' / ' + memoOf(r7) + '）');
ok(r5.indexOf(memoOf(r7)) < 0 || /今週あったこと（本人が書いたメモ）/.test(r5), '材料欄には自分のメモ1件だけ');
var edReq = __payloads.filter(function (p) { return /本人が残すと決めた本: 1・2・4本目/.test(p); });
ok(edReq.length === 1 && /作り直す枠: 3・5・6・7本目/.test(edReq[0]), '編集者に「残す本」「作り直す枠」を伝えている');
ok(/本人が残すと決めた本/.test(cell(1, '編集メモ')), '1本目の編集メモ: ' + cell(1, '編集メモ'));
var wk2 = S['X_投稿案_週形式']._d; var tx = wk2.filter(function (r) { return r && r[0] === '投稿文'; }).pop();
ok(String(tx[3]).indexOf('NEWBODY3') === 0 && String(tx[4]).indexOf('BODY4') === 0, '週形式は枠の順（3本目＝水曜、4本目＝木曜）');
console.log('   ' + __toasts[__toasts.length - 1]);

console.log('===== C: 古い列順のシート（枠の列なし）からでも作り直せる =====');
S['X_投稿案'] = M.makeSheet('X_投稿案', [['作成日時','分類','役割','使った型','ターゲット層','テーマ','投稿の狙い','元になった返信・切り口','本文','冒頭3行','事実確認が必要な箇所','自己チェック','投稿予定日','状態']]
  .concat([1,2,3,4,5,6,7].map(function (k) { return ['2026-10-17 21:00','共感','','','','T'+k,'','','OLD'+k,'','','','','未']; })));
book._s = S; refillReqs = [];
var w2 = Date.now(); while (Date.now() - w2 < 1100) {}
UI_ANSWER = '1,2,4';
__R();
var b3 = batchRows(); col = b3.col; rows = b3.rows;
ok(body(1) === 'OLD1' && body(2) === 'OLD2' && body(4) === 'OLD4' && /^NEWBODY3/.test(body(3)), '行の順を枠番号として扱い、1・2・4を残せた');

console.log('===== D: 時間が足りないときは、重なった本を消さずに印だけ付ける =====');
S['X_投稿案'] = M.makeSheet('X_投稿案', []); book._s = S;
var w3 = Date.now(); while (Date.now() - w3 < 1100) {}
mode = 'auto'; UI_ANSWER = null;
var ctxD = xGenCtx_('', 7);
ctxD.started = Date.now() - 2.7 * 60 * 1000;   // 生成に2.7分かかった想定 → 編集は始められる
ON_EDITOR = function () { ctxD.started -= 60 * 1000; };  // 編集に1分かかった想定 → 3.7分で作り直しは無理
var postsD = [1,2,3,4,5,6,7].map(function (k) { return { _idx: k - 1, 'テーマ': THEMES[k], '本文': 'BODY' + k }; });
var refillBefore = refillReqs.length;
var eD = xEditWeek_(ctxD, postsD, null);
ok(refillReqs.length === refillBefore, '作り直しのAPIは呼んでいない');
ok(eD.posts.length === 7 && eD.shortage.length === 0, '7本とも残っている（消していない）');
ok(/作り直し未実施/.test(eD.posts[5]._note || '') && /作り直し未実施/.test(eD.posts[6]._note || ''), '重なった本に「作り直し未実施」の印');
ok(/時間の都合で作り直していません/.test(eD.skipped), '報告: ' + eD.skipped);

console.log('===== E: 自己チェックの報告は、直近の1回ぶんだけを数える =====');
S['X_投稿案'] = M.makeSheet('X_投稿案', [X_DRAFT_HEADERS.slice()]);
var hh = X_DRAFT_HEADERS;
function draftRow(stamp, slot, body) { var r = hh.map(function () { return ''; }); r[hh.indexOf('作成日時')] = stamp; r[hh.indexOf('枠')] = slot; r[hh.indexOf('本文')] = body; r[hh.indexOf('状態')] = '未'; return r; }
for (var oi = 1; oi <= 8; oi++) S['X_投稿案'].appendRow(draftRow('2026-10-10 10:00:00', oi, '「古い要確認」【要確認：昔の】'));
S['X_投稿案'].appendRow(draftRow('2026-10-17 23:05:00', 1, '今週の1本目'));
S['X_投稿案'].appendRow(draftRow('2026-10-17 23:05:00', 2, '「今週の2本目」【要確認：年齢】'));
S['X_投稿案'].appendRow(draftRow('2026-10-17 23:05:00', 3, '今週の3本目'));
book._s = S; __toasts = [];
var ngE = xCheckDrafts();
var tE = __toasts[__toasts.length - 1];
ok(ngE === 1, '今回の分の要確認は1本 → ' + ngE);
ok(/今回の分のうち1本に要確認/.test(tE) && !/カギカッコ始まりが/.test(tE), '報告に過去の8本が混ざっていない: ' + tE);
