const fs = require('fs');
const vm = require('vm');
const path = require('path');
const DIR = path.join(__dirname, '..') + path.sep;

// ---- GAS グローバルのスタブ ----
function pad(n){ return String(n).padStart(2,'0'); }
const Utilities = {
  formatDate(d, tz, fmt) {
    // テストは TZ=Asia/Tokyo で実行する前提
    if (fmt === 'yyyy/MM/dd') return `${d.getFullYear()}/${pad(d.getMonth()+1)}/${pad(d.getDate())}`;
    if (fmt === 'HH:mm') return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    throw new Error('unsupported fmt ' + fmt);
  }
};
const store = {};
const PropertiesService = {
  getScriptProperties: () => ({
    getProperty: k => (k in store ? store[k] : null),
    setProperty: (k,v) => { store[k]=v; },
    deleteProperty: k => { delete store[k]; },
    getProperties: () => ({...store}),
    setProperties: (o) => { Object.assign(store,o); }
  })
};
const SpreadsheetApp = { flush(){}, openById(){ throw new Error('stubbed'); } };
const Logger = { log: (...a)=>console.log('[log]', ...a) };

// ---- 時間を 2026/10/11 に固定 ----
const FIXED_NOW = new Date(2026, 9, 11, 12, 0, 0);
const RealDate = Date;
class MockDate extends RealDate {
  constructor(...args){ if(args.length===0) super(FIXED_NOW.getTime()); else super(...args); }
  static now(){ return FIXED_NOW.getTime(); }
}

// ---- シートのモック ----
function makeSheet(rows) {
  const data = rows.map(r => r.slice());
  return {
    getName: () => 'シート1',
    getLastRow: () => data.length,
    getRange(row, col, nr = 1, nc = 1) {
      return {
        getValues() {
          const out = [];
          for (let i = 0; i < nr; i++) {
            const r = data[row - 1 + i] || [];
            const line = [];
            for (let j = 0; j < nc; j++) line.push(r[col-1+j] === undefined ? '' : r[col-1+j]);
            out.push(line);
          }
          return out;
        },
        getValue() {
          const r = data[row - 1] || [];
          return r[col - 1] === undefined ? '' : r[col - 1];
        },
        setValue(v) {
          while (data.length < row) data.push(['','','','']);
          const r = data[row-1];
          while (r.length < col) r.push('');
          r[col-1] = v;
          return this;
        },
        setNumberFormat() { return this; }
      };
    },
    insertRowBefore(row) { data.splice(row-1, 0, ['','','','']); },
    deleteRow(row) { data.splice(row-1, 1); },
    _data: data
  };
}

const ctx = vm.createContext({
  Utilities, PropertiesService, SpreadsheetApp, Logger,
  Date: MockDate, console, JSON, String, Number, Object, Math, Array, Error, RegExp
});

['00_Config.gs','04_Draft.gs','05_Sheet.gs','06_Commands.gs'].forEach(f =>
  vm.runInContext(fs.readFileSync(DIR+f,'utf8'), ctx, { filename: f })
);
// 02_LineApi の truncate_ だけ必要
vm.runInContext('function truncate_(s,max){s=String(s);return s.length<=max?s:s.slice(0,max-3)+"...";}', ctx);

let pass = 0, fail = 0;
function eq(label, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log('  ✓ ' + label); }
  else { fail++; console.log('  ✗ ' + label + '\n      got : ' + g + '\n      want: ' + w); }
}
const run = code => vm.runInContext(code, ctx);

console.log('\n== parseDateStr_ ==（今日 = 2026/10/11）');
eq("'10/15'",       run("fmtDate_(parseDateStr_('10/15'))"), '2026/10/15');
eq("'1/3' 年跨ぎ",   run("fmtDate_(parseDateStr_('1/3'))"),   '2027/01/03');
eq("'2026/10/15'",  run("fmtDate_(parseDateStr_('2026/10/15'))"), '2026/10/15');
eq("'10月15日'",    run("fmtDate_(parseDateStr_('10月15日'))"), '2026/10/15');
eq("'10-15'",       run("fmtDate_(parseDateStr_('10-15'))"), '2026/10/15');
eq("'10/11' 当日はOK", run("fmtDate_(parseDateStr_('10/11'))"), '2026/10/11');
eq("'あいうえお' → null", run("parseDateStr_('あいうえお')"), null);
eq("'1500文字の本文' → null", run("parseDateStr_('今日は寒暖差について')"), null);

console.log('\n== extractLeadingDate_ ==');
eq('1行目が日付',   run("extractLeadingDate_('10/15\\n本文です\\n2行目')"), {dateStr:'2026/10/15', rest:'本文です\n2行目'});
eq('1行目が本文',   run("extractLeadingDate_('本文だけ\\n2行目')"),        {dateStr:'', rest:'本文だけ\n2行目'});
eq('日付+空行',     run("extractLeadingDate_('10/15\\n\\n本文')"),        {dateStr:'2026/10/15', rest:'本文'});

console.log('\n== nextAutoDate_ ==');
eq('予定なし → 明日', run("fmtDate_(nextAutoDate_([]))"), '2026/10/12');
eq('最終日が過去(実データ8/12) → 明日',
   run("fmtDate_(nextAutoDate_([{row:2,date:new Date(2026,7,12)}]))"), '2026/10/12');
eq('最終日が未来(10/20) → +3日',
   run("fmtDate_(nextAutoDate_([{row:2,date:new Date(2026,9,20)}]))"), '2026/10/23');

console.log('\n== appendPost_ 行挿入位置 ==');
run(`
  var _sheet = null;
  getSheet_ = function(){ return _sheet; };
`);
ctx.makeSheet = makeSheet;

// 既存: ヘッダー + 11/05, 11/15, 11/25（すべて未来日にして年繰り上げの影響を排除）
function setup() {
  return run(`
    _sheet = makeSheet([
      ['投稿日','テキスト','画像URL','投稿済み'],
      [new Date(2026,10,5),  'A', 'a.jpg', ''],
      [new Date(2026,10,15), 'B', 'b.jpg', ''],
      [new Date(2026,10,25), 'C', 'c.jpg', '']
    ]);
    'ok';
  `);
}
function dates() {
  return run("_sheet._data.slice(1).map(function(r){return r[0] instanceof Date ? fmtDate_(r[0]) : String(r[0]);})");
}

setup();
run("appendPost_('11/20','NEW','n.jpg')");
eq('中間(11/20)に挿入', dates(), ['2026/11/05','2026/11/15','2026/11/20','2026/11/25']);

setup();
run("appendPost_('10/20','NEW','n.jpg')");
eq('先頭(10/20)に挿入', dates(), ['2026/10/20','2026/11/05','2026/11/15','2026/11/25']);

setup();
run("appendPost_('12/30','NEW','n.jpg')");
eq('末尾(12/30)に追加', dates(), ['2026/11/05','2026/11/15','2026/11/25','2026/12/30']);

setup();
run("appendPost_('11/15','NEW','n.jpg')");
eq('同日(11/15)は既存の後ろ', dates(), ['2026/11/05','2026/11/15','2026/11/15','2026/11/25']);

setup();
const r = run("JSON.stringify(appendPost_('','NEW','n.jpg'))");
eq('日付未指定 → 11/25+3日 = 11/28', JSON.parse(r).dateStr, '2026/11/28');
eq('  行は末尾', JSON.parse(r).row, 5);

setup();
run("appendPost_('11/20','本文テキスト','img.jpg','img_google.jpg')");
eq('挿入行の内容', run("_sheet._data[3].slice(1)"),
   ['本文テキスト','img.jpg','','img_google.jpg']);

console.log('\n== 過去日を指定したときの繰り上げ（仕様） ==');
eq("今日10/11に'10/01'は翌年扱い", run("fmtDate_(parseDateStr_('10/01'))"), '2027/10/01');
eq("年を明示すれば過去日も通る", run("fmtDate_(parseDateStr_('2026/10/01'))"), '2026/10/01');

console.log('\n== 空シート（ヘッダーのみ）==');
run("_sheet = makeSheet([['投稿日','テキスト','画像URL','投稿済み']]);");
const r2 = JSON.parse(run("JSON.stringify(appendPost_('','初投稿','i.jpg'))"));
eq('2行目に書き込み', r2.row, 2);
eq('日付は明日', r2.dateStr, '2026/10/12');

console.log('\n== 下書き（Draft）==');
run("saveDraft_('U1',{text:'あ'});");
eq('保存/取得', run("getDraft_('U1').text"), 'あ');
run("var d=getDraft_('U1'); d.imageUrl='x.jpg'; saveDraft_('U1',d);");
eq('追記後も保持', run("[getDraft_('U1').text, getDraft_('U1').imageUrl]"), ['あ','x.jpg']);
run("clearDraft_('U1');");
eq('破棄', run("JSON.stringify(getDraft_('U1'))"), '{}');
// TTL 超過
run("PropertiesService.getScriptProperties().setProperty('draft_U2', JSON.stringify({text:'古い', updatedAt: Date.now() - 25*3600*1000}));");
eq('25時間前の下書きは破棄される', run("JSON.stringify(getDraft_('U2'))"), '{}');

console.log('\n== 許可ユーザー ==');
eq('未設定なら全員許可', run("isAllowedUser_('Uxxx')"), true);
run("PropertiesService.getScriptProperties().setProperty('ALLOWED_USER_IDS','Uaaa, Ubbb');");
eq('許可リスト内', run("isAllowedUser_('Ubbb')"), true);
eq('許可リスト外', run("isAllowedUser_('Uccc')"), false);

console.log('\n== E列（Google用画像URL）==');
run(`
  _sheet = makeSheet([
    ['投稿日','テキスト','画像URL','投稿済み',''],
  ]);
`);
run("appendPost_('11/20','本文','https://x/ig.jpg','https://x/google.jpg')");
eq('C列=Instagram用', run("_sheet._data[1][2]"), 'https://x/ig.jpg');
eq('E列=Google用',    run("_sheet._data[1][4]"), 'https://x/google.jpg');
eq('E1にヘッダーが入る', run("_sheet._data[0][4]"), 'Google用画像URL');
run("appendPost_('11/21','本文2','https://x/only.jpg')");
eq('Google用未指定ならC列と同じ', run("_sheet._data[2][4]"), 'https://x/only.jpg');

console.log('\n== deletePostByImageUrl_ ==');
function setup3() {
  return run(`
    _sheet = makeSheet([
      ['投稿日','テキスト','画像URL','投稿済み','Google用画像URL'],
      [new Date(2026,10,5),  'A', 'https://x/a.jpg', '', 'https://x/ag.jpg'],
      [new Date(2026,10,15), 'B', 'https://x/b.jpg', '', 'https://x/bg.jpg'],
      [new Date(2026,10,25), 'C', 'https://x/c.jpg', '', 'https://x/cg.jpg']
    ]);
    'ok';
  `);
}
setup3();
const del = JSON.parse(run("JSON.stringify(deletePostByImageUrl_('https://x/b.jpg'))"));
eq('見つかる', del.found, true);
eq('正しい日付を返す', del.dateStr, '2026/11/15');
eq('本文も返す', del.text, 'B');
eq('その行だけ消える',
   run("_sheet._data.slice(1).map(function(r){return r[1];})"), ['A','C']);

setup3();
eq('存在しないURLはfound:false',
   JSON.parse(run("JSON.stringify(deletePostByImageUrl_('https://x/zzz.jpg'))")).found, false);
eq('  行は減らない', run("_sheet._data.length"), 4);

console.log('\n== isLikelyPosted_ ==（今日 = 2026/10/11 12:00）');
eq('未来の日付 → まだ',   run("isLikelyPosted_(new Date(2026,10,1), '')"), false);
eq('過去の日付 → 投稿済み', run("isLikelyPosted_(new Date(2026,8,1), '')"), true);
eq('今日・11:30以降 → 投稿済み', run("isLikelyPosted_(new Date(2026,9,11), '')"), true);
eq('投稿済み列が埋まっている → 投稿済み',
   run("isLikelyPosted_(new Date(2026,10,1), '11/1')"), true);

console.log('\n== やり直し（undoLastCommit_）==');
run("PropertiesService.getScriptProperties().setProperty('ALLOWED_USER_IDS','');");
setup3();
run("saveLastCommit_('U9', {dateStr:'2026/11/15', imageUrl:'https://x/b.jpg', text:'B'});");
const undo = run("undoLastCommit_('U9')");
eq('取り消しメッセージが出る', /取り消しました/.test(undo), true);
eq('行が消える', run("_sheet._data.slice(1).map(function(r){return r[1];})"), ['A','C']);
eq('文章が下書きに戻る', run("getDraft_('U9').text"), 'B');
eq('日付も下書きに戻る', run("getDraft_('U9').dateStr"), '2026/11/15');
eq('記録はクリアされる', run("getLastCommit_('U9')"), null);
eq('2回目はやり直せない', /やり直せる登録がありません/.test(run("undoLastCommit_('U9')")), true);

setup3();
run("saveLastCommit_('U8', {dateStr:'2026/09/01', imageUrl:'https://x/a.jpg', text:'A'});");
run("_sheet._data[1][0] = new Date(2026,8,1);");
const undoOld = run("undoLastCommit_('U8')");
eq('投稿済みの可能性を警告する', /すでにSNSへ公開された可能性/.test(undoOld), true);

console.log('\n---------------------------');
console.log(`pass: ${pass}  fail: ${fail}`);
process.exit(fail ? 1 : 0);
