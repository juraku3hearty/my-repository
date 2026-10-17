var fs = require('fs');
var M = require(require('path').join(__dirname, 'gasmock.js'));
global.__toasts = []; global.__logs = []; global.__payloads = [];

function sheet(rows) { return M.makeSheet('', rows); }
var S = {};
function add(name, rows) { var s = M.makeSheet(name, rows); S[name] = s; return s; }

add('X_設定', [
  ['項目','値','説明'],
  ['対象シート名','過去ログ',''],
  ['戦略シート名','コンセプト(2026.10-)',''],
  ['今週あったこと','',''],
  ['今週のテーマ','','']
]);
add('コンセプト(2026.10-)', [['ターゲット','中小企業の社長'],['タグライン','社長語を、現場語に']]);
add('X_文体ルール', [['項目','内容','メモ'],['禁止語','矢印、正体、厳選しました','']]);
add('X_型カタログ', [['型名','骨組み','向いている分類','冒頭の作り方','締め方','効く理由','使わない'],
  ['場面→気づき','場面\n↓\n気づき','共感','場面から','気づきで','',''],
  ['問い→経験','問い\n↓\n経験','専門','問いから','経験で','',''],
  ['捨てた型','x','x','x','x','','使わない']]);
add('X_一次情報', [['記録日','ジャンル','質問','回答','使用回数'],
  ['2026-09-01','ヒアリング','起業理由','14歳で入退院を繰り返して…（古い話）',0],
  ['2026-10-05','Xでの返信','Xでの返信: 古い','十日前の返信。これは入らないはずの古い返信です。長さを稼ぐために文字を足しています。',0],
  ['2026-10-12','Xでの返信','Xでの返信: a','全社では達成しているけど、現場ごとに見ると未達が見えにくくなることもあるなと思いました。',0],
  ['2026/10/16','Xでの引用（推定）','Xでの引用（推定）: b','導入の前に一回だけ現場の人と話しておくのは、安心材料だったりします。長さを足しています。',0],
  [new Date(2026,9,17),'今週あったこと','今週あったこと（10/17）','スタッフに聞かれた回数を数えたら1日12回だった',0]
]);
add('X_反応ログ', [['日付','種類','内容','誰の言葉か','気づいたこと'],[new Date(2026,9,15),'もらったコメント','REACTION_ROW こういう視点もあるんですね','Aさん','']]);
add('サンプル投稿', [['本文'],['SAMPLE_SHOULD_NOT_APPEAR 業者の完成投稿']]);
add('インタビュー', [['Q','A'],['経歴','INTERVIEW_SHOULD_NOT_APPEAR 入院していた頃の話']]);
// 古い列順（9列）の投稿案
add('X_投稿案', [
  ['作成日時','ターゲット層','テーマ','本文','冒頭3行','狙い','自己チェック','投稿予定日','状態'],
  ['2026-10-10 10:00','潜在層','古いテーマ','OLD_BODY 今日、何回スタッフに聞かれましたか？','今日、','狙い','','','未']
]);

var book = M.makeBook(S);
global.SpreadsheetApp = {
  getUi: function () { throw new Error('no ui'); },
  getActive: function () { return book; },
  getActiveSpreadsheet: function () { return book; },
  openById: function () { return book; },
  newDataValidation: function () { var b = { requireValueInList: function(){return b;}, setAllowInvalid:function(){return b;}, build:function(){return {};} }; return b; }
};
global.PropertiesService = { getScriptProperties: function () { return { getProperty: function (k) { return k === 'ANTHROPIC_API_KEY' ? 'test' : ''; }, setProperty: function(){}, deleteProperty: function(){} }; } };
global.Logger = { log: function (m) { __logs.push(String(m)); } };
global.Utilities = {
  sleep: function () {},
  formatDate: function (d, tz, f) {
    var p = function (n) { return ('0' + n).slice(-2); };
    return f.replace('yyyy', d.getFullYear()).replace('MM', p(d.getMonth() + 1)).replace('dd', p(d.getDate()))
            .replace('HH', p(d.getHours())).replace('mm', p(d.getMinutes())).replace('M/d', (d.getMonth()+1)+'/'+d.getDate());
  }
};

var call = 0;
global.UrlFetchApp = {
  fetchAll: function (reqs) {
    return reqs.map(function (q) {
      var body = JSON.parse(q.payload);
      if (/編集者です/.test(body.system)) { var er = JSON.stringify({ content: [{ type: 'text', text: '{"重複":[],"作り直す":[]}' }], stop_reason: 'end_turn' }); return { getResponseCode: function () { return 200; }, getContentText: function () { return er; } }; }
      __payloads.push(body.system + '\n=====\n' + body.messages[0].content);
      var m = body.messages[0].content.match(/(\d+)本目から(\d+)本目までの/);
      var a = +m[1], b = +m[2];
      var posts = [];
      for (var k = a; k <= b; k++) {
        posts.push({ 'テーマ': 'T' + k, '分類': '共感', '役割': 'R' + k, '使った型': '場面→気づき', 'ターゲット層': '潜在層',
          '投稿の狙い': 'ねらい' + k, '元になった返信・切り口': '10/12の返信', '本文': 'BODY' + k + (k === 3 ? ' 入院の話' : '') + (k === 5 ? '\n【要確認：何の数字か】' : '') + (k === 6 ? '\n結局、仕組み化すればラクになる。' : ''),
          '冒頭3行': 'BODY' + k, '事実確認が必要な箇所': k === 5 ? '何の数字か' : 'なし' });
      }
      var text = JSON.stringify({ posts: posts });
      call++;
      if (call === 1) text = text.slice(0, text.length - 40); // 1回目は途中で切れる
      var resp = JSON.stringify({ content: [{ type: 'text', text: text }], stop_reason: call === 1 ? 'max_tokens' : 'end_turn' });
      return { getResponseCode: function () { return 200; }, getContentText: function () { return resp; } };
    });
  },
  fetch: function () { throw new Error('fetch should not be used'); }
};

eval(fs.readFileSync(require('path').join(__dirname, '..', '..', 'dist', 'X文体ツール_全部入り.gs'), 'utf8') + '\n;global.__run = xGeneratePosts;');
__run();

// ---- 検証 ----
var all = __payloads.join('\n#########\n');
function ok(cond, label) { console.log((cond ? '✅ ' : '❌ ') + label); if (!cond) process.exitCode = 1; }
ok(__payloads.length === 4 + 1 && __logs.some(function (l) { return /^週の編集: 重なり0組/.test(l); }), 'API呼び出し: 4束を並列 + 切れた束の再試行、そのあと週の編集が実行された');
ok(all.indexOf('SAMPLE_SHOULD_NOT_APPEAR') < 0, '過去の投稿本文（サンプル投稿）を渡していない');
ok(all.indexOf('INTERVIEW_SHOULD_NOT_APPEAR') < 0, '経歴・インタビューを渡していない');
ok(all.indexOf('14歳で入退院') < 0, '古い一次情報（ヒアリング）を渡していない');
ok(all.indexOf('まだ結びついていない') < 0, '「2つを結ぶ」指示が消えている');
ok(all.indexOf('十日前の返信') < 0, '7日より古い返信は入っていない');
ok(all.indexOf('見えにくくなることもある') >= 0, '直近の返信が入っている');
ok(all.indexOf('安心材料だったりします') >= 0, '引用（推定）が入っている');
ok(all.indexOf('1日12回') >= 0, '今週あったことが入っている');
ok(all.indexOf('捨てた型') < 0, '「使わない」印の型は渡していない');
ok(/1本目の役割: 実際に取り組んだ仕事/.test(all) && /2本目の役割: 経営者が見落としやすい問題/.test(all) && /3本目の役割: 失敗や試行錯誤/.test(all), '役割が1本ずつ割り振られている');
ok(all.indexOf('× 入院') >= 0 && all.indexOf('× 仕組み化すれば') >= 0, '禁止エピソード・禁止着地が既定値で入っている');
ok(all.indexOf('複数の過去エピソードを1本に混ぜない') >= 0, '本人のルール（1投稿1テーマ）が入っている');
ok(all.indexOf('事実確認が必要な箇所') >= 0, '出力に「事実確認が必要な箇所」を求めている');

var d = S['X_投稿案']._d;
var head = d[0];
ok(head.join('|') === X_DRAFT_HEADERS.join('|') + '|使った事実'.slice(0,0) || head.slice(0, X_DRAFT_HEADERS.length).join('|') === X_DRAFT_HEADERS.join('|'), '見出しが新しい列順に直っている');
var bodyCol = head.indexOf('本文');
ok(String(d[1][bodyCol]).indexOf('OLD_BODY') === 0, '古い行の本文が「本文」列に移っている');
ok(String(d[1][head.indexOf('投稿の狙い')]) === '' && head.indexOf('狙い') >= 0 && String(d[1][head.indexOf('狙い')]) === '狙い', '古い「狙い」列は末尾に残っている（消えていない）');
var newRows = d.slice(2).filter(function (r) { return r && r[0]; });
ok(newRows.length === 7, '新しい投稿案が7本書かれている (' + newRows.length + '本)');
ok(newRows.every(function (r, i) { return String(r[bodyCol]).indexOf('BODY') === 0; }), '新しい行の本文が「本文」列に入っている');
var chk = head.indexOf('自己チェック');
var flagged = function (k) { var r = newRows.filter(function (x) { return String(x[bodyCol]).indexOf('BODY' + k) === 0; })[0]; return r ? String(r[chk]) : 'なし'; };
ok(flagged(3).indexOf('使わないエピソード: 入院') >= 0, '「入院」を自己チェックで検出: ' + flagged(3));
ok(flagged(5).indexOf('埋める必要あり') >= 0, '【要確認】を自己チェックで検出: ' + flagged(5));
ok(flagged(6).indexOf('禁止した着地: 仕組み化すれば') >= 0, '禁止着地を自己チェックで検出: ' + flagged(6));
ok(flagged(1) === 'OK', '問題ない投稿はOK: ' + flagged(1));
ok(newRows.some(function (r) { return String(r[head.indexOf('事実確認が必要な箇所')]) === '何の数字か'; }), '「事実確認が必要な箇所」列に入っている');
ok(!!S['X_投稿案_週形式'] && S['X_投稿案_週形式'].getLastRow() >= 5, '週形式ブロックが書かれている');
ok(__logs.some(function (l) { return l.indexOf('上限で切れました') >= 0; }), '切れたことがログに残る');
console.log('---- 最後のトースト ----\n' + __toasts[__toasts.length - 1]);
console.log('---- ログ ----\n' + __logs.join('\n'));
var wk = S['X_投稿案_週形式']._d;
var textRow = wk.filter(function (r) { return r && r[0] === '投稿文'; }).pop();
console.log('週形式の並び: ' + textRow.slice(1).map(function (b) { return String(b).slice(0, 5); }).join(' / '));
ok(textRow.slice(1).map(function (b) { return String(b).slice(0, 5); }).join(',') === 'BODY1,BODY2,BODY3,BODY4,BODY5,BODY6,BODY7', '週形式で1本目〜7本目が月〜日の順に並んでいる');
ok(all.indexOf('REACTION_ROW') >= 0 && all.indexOf('2026-10-15') >= 0, '日付つきの反応ログで生成が止まらず、日付も入っている');
