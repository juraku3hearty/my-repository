/**
 * ABテスト管理 — 結果入力と集計レポート。
 * 「AB結果」シートに日々の数字(手入力 or 広告マネージャからコピペ)を貯めて、
 * updateReport() で バリアント×媒体 ごとに集計。作成コストも合算して
 * 「予約1件あたり総コスト」まで出す。
 */
function updateReport() {
  const results = ADS.sheet(ADS.SHEETS.RESULTS).getDataRange().getValues().slice(1);
  const variants = ADS.sheet(ADS.SHEETS.VARIANTS).getDataRange().getValues().slice(1);
  const jobs = ADS.sheet(ADS.SHEETS.JOBS).getDataRange().getValues().slice(1);

  // ジョブID → 作成コスト
  const jobCost = {};
  jobs.forEach(function(j) { jobCost[j[0]] = Number(j[9]) || 0; });

  // バリアントID → {名前, ジョブID}
  const varInfo = {};
  variants.forEach(function(v) { varInfo[v[0]] = { name: v[2], jobId: v[1] }; });

  // バリアント×媒体で集計
  const agg = {};
  results.forEach(function(r) {
    if (!r[1]) return;
    const key = r[1] + '|' + (r[2] || '不明');
    if (!agg[key]) agg[key] = { imp: 0, play: 0, click: 0, cv: 0, spend: 0 };
    agg[key].imp += Number(r[3]) || 0;
    agg[key].play += Number(r[4]) || 0;
    agg[key].click += Number(r[5]) || 0;
    agg[key].cv += Number(r[6]) || 0;
    agg[key].spend += Number(r[7]) || 0;
  });

  const rows = Object.keys(agg).map(function(key) {
    const parts = key.split('|');
    const variantId = parts[0];
    const media = parts[1];
    const a = agg[key];
    const info = varInfo[variantId] || { name: '?', jobId: '' };
    const createCost = jobCost[info.jobId] || 0;
    const total = a.spend + createCost;
    const ctr = a.imp ? (a.click / a.imp * 100).toFixed(2) + '%' : '-';
    const cvr = a.click ? (a.cv / a.click * 100).toFixed(2) + '%' : '-';
    const cpa = a.cv ? Math.round(total / a.cv) : '';
    return [variantId, info.name, media, a.imp, a.click, ctr, a.cv, cvr,
            a.spend, createCost, total, cpa, ''];
  });

  // CPA昇順(安く予約が取れた順)。CPA空欄は最後
  rows.sort(function(x, y) {
    const a = x[11] === '' ? Infinity : x[11];
    const b = y[11] === '' ? Infinity : y[11];
    return a - b;
  });
  rows.forEach(function(r, i) {
    if (r[11] !== '') r[12] = i === 0 ? '★勝ち' : '';
  });

  const sheet = ADS.sheet(ADS.SHEETS.REPORT);
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
  }
  if (rows.length) {
    sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  }
  Logger.log('レポート更新: ' + rows.length + '行');
}

/** 結果入力(メニューから1件ずつ) */
function addResultFromMenu() {
  const ui = SpreadsheetApp.getUi();
  const variantId = ui.prompt('バリアントIDは?').getResponseText();
  if (!variantId) return;
  const media = ui.prompt('媒体は?(Instagram/TikTok/YouTube/LINE/Google など)').getResponseText();
  const nums = ui.prompt('表示回数,再生数,クリック,予約数,費用(円) をカンマ区切りで').getResponseText();
  const n = nums.split(',').map(function(s) { return Number(s.trim()) || 0; });
  const today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  ADS.sheet(ADS.SHEETS.RESULTS).appendRow([today, variantId, media, n[0], n[1], n[2], n[3], n[4]]);
  updateReport();
  ui.alert('記録してレポートを更新しました');
}

/** 週次で自動更新したい場合: トリガーで updateReport を毎週月曜に設定 */
function installWeeklyTrigger() {
  ScriptApp.newTrigger('updateReport').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(7).create();
}
