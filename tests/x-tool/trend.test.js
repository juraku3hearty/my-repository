var fs = require('fs');
var M = require(require('path').join(__dirname, 'gasmock.js'));
global.__toasts = []; global.__logs = []; global.__payloads = [];
var S = {};
function add(name, rows) { S[name] = M.makeSheet(name, rows); return S[name]; }

var head = ['ポストID','日付','ポスト本文','ポストのリンク','インプレッション数','いいね','エンゲージメント','ブックマーク','共有された回数','新しいフォロー','返信','リポスト','プロフィールへのアクセス数','除外'];
var rows = [head];
var roles = ['実際に取り組んだ仕事','経営者が見落としやすい問題','失敗や試行錯誤','社長と現場のすれ違い','人柄や日常の気づき'];
// 210本：役割ごとに中央値が違うように作る。すれ違いは表示は低いがフォローが多い
var base = { '実際に取り組んだ仕事': 120, '経営者が見落としやすい問題': 90, '失敗や試行錯誤': 150, '社長と現場のすれ違い': 70, '人柄や日常の気づき': 100 };
for (var i = 0; i < 210; i++) {
  var role = roles[i % 5];
  var d = new Date(2026, 6, 20); d.setDate(d.getDate() + Math.floor(i * 88 / 210));
  var imp = base[role] + (i % 7) * 3;
  var follow = role === '社長と現場のすれ違い' ? 1 : 0;
  // 互助会で伸びた3本（すべて「見落とし」）
  if (i === 11 || i === 41 || i === 71) { imp = 9000; follow = 0; }
  rows.push(['P' + i, Utilities_fmt(d), 'ROLE=' + role + ' POST_BODY_' + i + ' 本文の冒頭です', '', imp, 3, 0, 0, 0, follow, 1, 0, 2, '']);
}
// 期間が重なるCSVを貼った想定：同じIDを10本だけ再掲
for (var j = 0; j < 10; j++) rows.push(rows[1 + j].slice());
// 投稿したばかり（最新日）の投稿と返信
rows.push(['NEW1', '2026-10-17', 'ROLE=実際に取り組んだ仕事 できたて', '', 5, 0, 0,0,0,0,0,0,0,'']);
rows.push(['R1', '2026-10-16', '@someone 返信は数えない', '', 50, 0, 0,0,0,0,0,0,0,'']);
function Utilities_fmt(d) { var p = function (n) { return ('0' + n).slice(-2); }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
add('X_反応データ', rows);
add('X_設定', [['項目','値','説明'],['戦略シート名','コンセプト','']]);
add('コンセプト', [['ターゲット','社長']]);
add('X_文体ルール', [['項目','内容','メモ'],['禁止語','矢印','']]);

var book = M.makeBook(S);
global.SpreadsheetApp = { getUi: function () { throw new Error('no ui'); }, getActive: function () { return book; }, getActiveSpreadsheet: function () { return book; }, openById: function () { return book; } };
global.PropertiesService = { getScriptProperties: function () { return { getProperty: function (k) { return k === 'ANTHROPIC_API_KEY' ? 'test' : ''; } }; } };
global.Logger = { log: function (m) { __logs.push(String(m)); } };
global.Utilities = { sleep: function () {}, formatDate: function (d, tz, f) { var p = function (n) { return ('0' + n).slice(-2); };
  return f.replace('yyyy', d.getFullYear()).replace('MM', p(d.getMonth() + 1)).replace('dd', p(d.getDate())).replace('HH', p(d.getHours())).replace('mm', p(d.getMinutes())).replace('M/d', (d.getMonth()+1)+'/'+d.getDate()); } };
var classifyCalls = 0, classified = 0;
global.UrlFetchApp = { fetchAll: function (reqs) { return reqs.map(function (q) {
  var body = JSON.parse(q.payload); var u = body.messages[0].content;
  if (/編集者です/.test(body.system)) { var er = JSON.stringify({ content: [{ type: 'text', text: '{"重複":[],"作り直す":[]}' }], stop_reason: 'end_turn' }); return { getResponseCode: function () { return 200; }, getContentText: function () { return er; } }; } __payloads.push(body.system + '\n=====\n' + u);
  var text;
  if (/振り分けてください/.test(body.system)) {
    classifyCalls++;
    var items = u.split('\n').map(function (line) { var m = line.match(/^\[(\d+)\] ROLE=(\S+)/); return m ? { i: +m[1], '役割': m[2], '分類': '共感', '話題': '話題' + m[1] } : null; }).filter(Boolean);
    classified += items.length;
    text = JSON.stringify({ items: items });
  } else {
    var m = u.match(/(\d+)本目から(\d+)本目までの/); var posts = [];
    for (var k = +m[1]; k <= +m[2]; k++) posts.push({ 'テーマ':'T','本文':'BODY'+k,'冒頭3行':'B','投稿の狙い':'x','元になった返信・切り口':'y','事実確認が必要な箇所':'なし' });
    text = JSON.stringify({ posts: posts });
  }
  var resp = JSON.stringify({ content: [{ type: 'text', text: text }], stop_reason: 'end_turn' });
  return { getResponseCode: function () { return 200; }, getContentText: function () { return resp; } };
}); } };

eval(fs.readFileSync(require('path').join(__dirname, '..', '..', 'dist', 'X文体ツール_全部入り.gs'), 'utf8') + '\n;global.__A = xAnalyzeTrends; global.__T = xTrendText_; global.__G = xGeneratePosts;');

function ok(c, l) { console.log((c ? '✅ ' : '❌ ') + l); if (!c) process.exitCode = 1; }

__A();
var an = S['X_系統分析']._d.filter(function (r, i) { return i > 0 && r && r[0]; });
ok(an.length === 208, '振り分けたのは208件（重複10件・3日未満3件・返信1件を除外） → ' + an.length + '件');
ok(classifyCalls === 6, '40件ずつ6回を並列で振り分け → ' + classifyCalls + '回');
ok(!an.some(function (r) { return r[0] === 'NEW1'; }), '投稿3日未満は外している');

var sum = xTrendSummary_(S['X_系統分析']);
var g = {}; sum.byRole.forEach(function (x) { g[x.name] = x; });
console.log('   役割別: ' + sum.byRole.map(function (x) { return x.name + ' 中央値' + x.imp + ' n=' + x.n + ' フォロー' + x.follow; }).join(' / '));
ok(sum.byRole[0].name === '失敗や試行錯誤', '中央値で見ると「失敗や試行錯誤」が最も伸びる（互助の9000に引っぱられない）');
ok(g['経営者が見落としやすい問題'].imp < 120, '互助で9000が3本ある「見落とし」の中央値は通常の水準 → ' + g['経営者が見落としやすい問題'].imp);
ok(g['社長と現場のすれ違い'].follow === 1, '「すれ違い」はフォロー1本あたり1.0 → ' + g['社長と現場のすれ違い'].follow);

var t = __T();
console.log('   生成に渡す文:\n' + t.split('\n').map(function (l) { return '     ' + l; }).join('\n'));
ok(/つながりやすい順: 社長と現場のすれ違い/.test(t), 'つながりやすい順の先頭は「すれ違い」');
ok(t.indexOf('POST_BODY_') < 0, '生成に渡す文に過去の本文は含まれない');

var out = S['X_系統の傾向']._d;
ok(out.length > 10 && String(out[0][0]).indexOf('閲覧が伸びやすい系統') === 0, 'X_系統の傾向 に表が書かれている');

// 2回目は新しい投稿だけ
classifyCalls = 0;
__A();
ok(classifyCalls === 0, '2回目は振り分けなし（全部済み） → ' + classifyCalls + '回');
ok(S['X_系統分析']._d.filter(function (r, i) { return i > 0 && r && r[0]; }).length === 208, '2回目で行が増えていない');

// 生成に傾向が入り、過去の本文は入らない
__payloads = [];
__G();
var gen = __payloads.filter(function (p) { return /本目までの/.test(p); }).join('\n');
ok(gen.indexOf('読まれやすい系統・つながりやすい系統') >= 0, '投稿案の生成に系統の傾向が入っている');
ok(gen.indexOf('POST_BODY_') < 0, '投稿案の生成に過去の投稿本文は入っていない');
console.log('   ' + __toasts[__toasts.length - 1]);
var excludedRecent = S['X_反応データ']._d.slice(1).filter(function (r) { return r[0] && String(r[2]).charAt(0) !== '@' && r[1] >= '2026-10-15'; }).map(function (r) { return r[0] + '(' + r[1] + ')'; });
console.log('   3日未満で外した投稿: ' + excludedRecent.join(', '));
ok(!S['X_系統分析']._d.slice(1).some(function (r) { return r && r[1] >= '2026-10-15'; }), '10/15以降の投稿は分析に入っていない');
