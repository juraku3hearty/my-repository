/**
 * 店頭販売スキャン → zaiko Robot 在庫補正（100チャレ・酒屋／売り越し対策）
 * ------------------------------------------------------------------
 * レジがネット非接続でもOK。レジには一切触らない。
 *   スマホでJANバーコードをスキャン＋本数 → 「店頭販売」に記録
 *   レジ締めで「補正後CSV」を作成 → zaiko Robot に取込（全モール一斉反映）
 *
 * 方式：zaiko を在庫の親にする（絶対値上書き取込に合わせる）。
 *   レジ締めで「zaikoの現在庫 − 今日の店頭販売 = 補正後在庫」を作って戻す。
 *   オンライン分は zaiko が自動で引くので、こちらは店頭分だけ引く＝二重引きしない。
 *
 * 【シート構成】
 *   対応表   : JAN / 商品コード / 商品名          ← 商品データから流し込む（未知JANは自動追記）
 *   店頭販売 : 日時 / JAN / 商品コード / 商品名 / 数量 / 反映済
 *   zaiko在庫: 商品コード / 在庫数                ← zaikoからDLした現在庫を貼る
 *   アップロード用: 商品コード / 在庫数            ← 補正後（これをzaikoに取込）
 */

const CFG = {
  TAB_MAP:   '対応表',
  TAB_SALES: '店頭販売',
  TAB_STOCK: 'zaiko在庫',
  TAB_OUT:   'アップロード用',
};

/* ============ メニュー ============ */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('店頭在庫')
    .addItem('① 初期セットアップ', 'setupSystem')
    .addItem('② スキャン画面のURLを表示', 'showWebAppUrl')
    .addSeparator()
    .addItem('商品データCSVを取り込む（対応表へ）', 'importProductMasterPrompt')
    .addItem('★ レジ締め：補正後CSVを作る', 'makeUploadCsv')
    .addToUi();
}

/* ============ 初期セットアップ ============ */
function setupSystem() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureSheet_(CFG.TAB_MAP,   ['JAN', '商品コード', '商品名']);
  ensureSheet_(CFG.TAB_SALES, ['日時', 'JAN', '商品コード', '商品名', '数量', '反映済']);
  ensureSheet_(CFG.TAB_STOCK, ['商品コード', '在庫数']);
  ensureSheet_(CFG.TAB_OUT,   ['商品コード', '在庫数']);
  const msg = 'セットアップ完了。\n'
    + '・「対応表」に 商品データ（JAN/商品コード/商品名）を入れる（メニューから取込も可）\n'
    + '・「② スキャン画面のURLを表示」でURLを発行 → スマホのホームに追加\n'
    + '・レジ締めに「★ 補正後CSVを作る」';
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { Logger.log(msg); }
}

function ensureSheet_(name, header) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sh.getLastRow() === 0) { sh.appendRow(header); sh.getRange(1, 1, 1, header.length).setFontWeight('bold'); }
  return sh;
}

/* ============ スマホのスキャン画面（Webアプリ） ============ */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('scan')
    .setTitle('店頭販売スキャン')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1.0');
}

function showWebAppUrl() {
  const url = ScriptApp.getService().getUrl();
  const msg = url
    ? 'スキャン画面URL：\n' + url + '\n\n（先に「デプロイ→ウェブアプリ→アクセス：全員」でデプロイしてください）'
    : 'まだデプロイされていません。デプロイ→新しいデプロイ→ウェブアプリ→アクセス「全員」でURLを発行してください。';
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { Logger.log(msg); }
}

/** スキャン画面から呼ばれる：1点の店頭販売を記録 */
function saveSale(jan, qty) {
  jan = String(jan || '').replace(/\D/g, '');
  qty = parseInt(qty, 10) || 1;
  if (!jan) return { ok: false, msg: 'バーコードが読めませんでした' };
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const map = lookupByJan_(ss, jan);
  const sales = ss.getSheetByName(CFG.TAB_SALES);
  sales.appendRow([new Date(), jan, map.code, map.name, qty, '']);
  if (!map.code) {
    // 未知のJAN → 対応表に空で追記しておき、あとで商品コードを埋められるように
    ss.getSheetByName(CFG.TAB_MAP).appendRow([jan, '', '（未登録：あとで商品コードを入力）']);
    return { ok: true, unknown: true, name: '未登録の商品', jan: jan, qty: qty };
  }
  return { ok: true, unknown: false, name: map.name || map.code, jan: jan, qty: qty };
}

function lookupByJan_(ss, jan) {
  const sh = ss.getSheetByName(CFG.TAB_MAP);
  const last = sh.getLastRow();
  if (last < 2) return { code: '', name: '' };
  const v = sh.getRange(2, 1, last - 1, 3).getValues();
  for (let i = 0; i < v.length; i++) {
    if (String(v[i][0]).replace(/\D/g, '') === jan && String(v[i][1]).trim()) {
      return { code: String(v[i][1]).trim(), name: String(v[i][2] || '').trim() };
    }
  }
  return { code: '', name: '' };
}

/* ============ 商品データCSV → 対応表 ============ */
/** 「商品コード,JAN,商品名」または「JAN,商品コード,商品名」のCSVを貼って取り込む */
function importProductMasterPrompt() {
  const ui = SpreadsheetApp.getUi();
  const res = ui.prompt('商品データ取込',
    'zaiko/楽天の商品データCSVを貼り付け（1行目に JAN と 商品コード の列名があればOK。無ければ「JAN,商品コード,商品名」の順）',
    ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  const n = importProductMaster_(res.getResponseText());
  ui.alert(n + ' 件を対応表に取り込みました');
}

function importProductMaster_(csv) {
  const rows = csv.split(/\r?\n/).map(function(l){ return l.split(','); }).filter(function(r){ return r.length >= 2; });
  if (!rows.length) return 0;
  // ヘッダから JAN / 商品コード / 商品名 の列位置を推定
  const head = rows[0].map(function(s){ return String(s).trim(); });
  let ji = head.findIndex(function(h){ return /jan|ＪＡＮ|バーコード/i.test(h); });
  let ci = head.findIndex(function(h){ return /商品コード|コード|code|sku/i.test(h); });
  let ni = head.findIndex(function(h){ return /商品名|名称|name/i.test(h); });
  let start = 1;
  if (ji < 0 || ci < 0) { ji = 0; ci = 1; ni = 2; start = 0; } // ヘッダ無し→順番固定
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CFG.TAB_MAP);
  const out = [];
  for (let i = start; i < rows.length; i++) {
    const jan = String(rows[i][ji] || '').replace(/\D/g, '');
    const code = String(rows[i][ci] || '').trim();
    const name = ni >= 0 ? String(rows[i][ni] || '').trim() : '';
    if (jan && code) out.push([jan, code, name]);
  }
  if (out.length) sh.getRange(sh.getLastRow() + 1, 1, out.length, 3).setValues(out);
  return out.length;
}

/* ============ ★ レジ締め：補正後CSVを作る ============ */
/**
 * zaiko在庫（現在庫）から、今日（未反映）の店頭販売数を差し引いた在庫を「アップロード用」に出力し、
 * CSVファイルをドライブに作成してURLを表示。差し引いた店頭販売行は「反映済」に印。
 */
function makeUploadCsv() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = (function(){ try { return SpreadsheetApp.getUi(); } catch(e){ return null; } })();

  // 1) 未反映の店頭販売を 商品コードごとに集計
  const sales = ss.getSheetByName(CFG.TAB_SALES);
  const sLast = sales.getLastRow();
  const soldByCode = {};
  const markRows = [];
  if (sLast >= 2) {
    const sv = sales.getRange(2, 1, sLast - 1, 6).getValues(); // 日時,JAN,商品コード,商品名,数量,反映済
    sv.forEach(function(r, i){
      const code = String(r[2] || '').trim();
      const qty = parseInt(r[4], 10) || 0;
      const done = String(r[5] || '').trim();
      if (!code || done || qty <= 0) return;
      soldByCode[code] = (soldByCode[code] || 0) + qty;
      markRows.push(i + 2);
    });
  }
  const soldCodes = Object.keys(soldByCode);
  if (!soldCodes.length) { say_(ui, '反映する店頭販売がありません（未反映の記録なし）'); return; }

  // 2) zaiko現在庫を読む
  const stock = ss.getSheetByName(CFG.TAB_STOCK);
  const kLast = stock.getLastRow();
  if (kLast < 2) { say_(ui, '「zaiko在庫」シートに、zaikoからDLした現在庫（商品コード/在庫数）を貼ってください'); return; }
  const stockMap = {};
  stock.getRange(2, 1, kLast - 1, 2).getValues().forEach(function(r){
    const code = String(r[0] || '').trim();
    if (code) stockMap[code] = parseInt(r[1], 10) || 0;
  });

  // 3) 補正後＝現在庫−店頭販売（0未満は0）。zaikoに無い商品コードは警告
  const out = [], missing = [];
  soldCodes.forEach(function(code){
    if (!(code in stockMap)) { missing.push(code); return; }
    const corrected = Math.max(0, stockMap[code] - soldByCode[code]);
    out.push([code, corrected]);
  });

  // 4) 「アップロード用」シートへ
  const outSh = ss.getSheetByName(CFG.TAB_OUT);
  if (outSh.getLastRow() > 1) outSh.getRange(2, 1, outSh.getLastRow() - 1, 2).clearContent();
  if (out.length) outSh.getRange(2, 1, out.length, 2).setValues(out);

  // 5) CSVファイルをドライブに作成
  const csv = '商品コード,在庫数\n' + out.map(function(r){ return r[0] + ',' + r[1]; }).join('\n');
  const file = DriveApp.createFile('zaiko補正_' + ymd_() + '.csv', csv, MimeType.PLAIN_TEXT);

  // 6) 反映済に印
  markRows.forEach(function(row){ sales.getRange(row, 6).setValue('✓'); });

  let msg = '補正後CSVを作成しました（' + out.length + '品目）。\n' + file.getUrl()
          + '\n→ これを zaiko Robot に取込んでください。';
  if (missing.length) msg += '\n\n※zaiko在庫に無い商品コード（要確認）: ' + missing.join(', ');
  say_(ui, msg);
}

/* ============ ヘルパー ============ */
function say_(ui, msg) { if (ui) ui.alert(msg); else Logger.log(msg); }
function ymd_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmm');
}
