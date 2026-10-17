/**
 * 19_XWeek.js
 * 週の傾向（紫微斗数で決めた、その日に向く投稿の種類）
 *
 * 計算はしない。本人が星を見て決めた結論だけを受け取る。
 * 本文の分類と締めの分類を分けて持つ（同じ内容でも締めで宮が変わるため）。
 */

/**
 * X_週の傾向 シートを作る（翌日から7日分の枠を用意する）。
 */
function xSetupWeekPlan() {
  var sh = xSheet_(X_SHEETS.WEEKPLAN,
    ['日付', '本文の分類', '締めの分類', '投稿時刻', '回る人数', 'メモ']);

  if (sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent();
  }

  var wdays = ['日', '月', '火', '水', '木', '金', '土'];
  var base = new Date();
  base.setDate(base.getDate() + 1);

  var rows = [];
  for (var i = 0; i < 7; i++) {
    var d = new Date(base.getTime());
    d.setDate(base.getDate() + i);
    rows.push([
      Utilities.formatDate(d, 'Asia/Tokyo', 'yyyy-MM-dd') +
        '（' + wdays[d.getDay()] + '）',
      '', '', '', '', ''
    ]);
  }
  sh.getRange(2, 1, rows.length, 6).setValues(rows);

  // 分類をプルダウンにする
  var names = X_CATEGORIES.map(function (c) { return c.name; });
  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(names, true).setAllowInvalid(true).build();
  sh.getRange(2, 2, rows.length, 2).setDataValidation(rule);

  // 分類の意味を右側に添えておく
  var legend = [['', '', '', '', '', '']];
  legend.push(['── 分類 ──', '中身', '宮', '', '', '']);
  X_CATEGORIES.forEach(function (c) {
    legend.push([c.name, c.desc, c.palace, '', '', '']);
  });
  sh.getRange(rows.length + 2, 1, legend.length, 6).setValues(legend);
  sh.setColumnWidth(1, 150);
  sh.setColumnWidth(2, 120);
  sh.setColumnWidth(3, 120);

  xToast_('X_週の傾向 を作りました。本文の分類を埋めてください（締めは空でもOK）。');
}

/**
 * 週の傾向を読む。
 * @return {Array<{date,cat,closeCat,time,people,memo}>}
 */
function xReadWeekPlan_() {
  var sh = xBook_().getSheetByName(X_SHEETS.WEEKPLAN);
  if (!sh || sh.getLastRow() < 2) return [];

  var values = sh.getRange(2, 1, sh.getLastRow() - 1, 6).getValues();
  var out = [];
  for (var i = 0; i < values.length; i++) {
    var date = String(values[i][0]).trim();
    var cat = String(values[i][1]).trim();
    if (!date || date.indexOf('──') >= 0) break;   // 凡例に入ったら終わり
    if (!cat) continue;                             // 分類が空の日は飛ばす
    out.push({
      date: date,
      cat: cat,
      closeCat: String(values[i][2]).trim() || cat,
      time: String(values[i][3]).trim(),
      people: String(values[i][4]).trim(),
      memo: String(values[i][5]).trim()
    });
  }
  return out;
}

/** 分類名から、対応する読者の温度を引く */
function xLayerOf_(catName) {
  for (var i = 0; i < X_CATEGORIES.length; i++) {
    if (X_CATEGORIES[i].name === catName) return X_CATEGORIES[i].layer;
  }
  return '';
}

/** 生成プロンプト用のテキストにする */
function xWeekPlanText_() {
  var plan = xReadWeekPlan_();
  if (!plan.length) return '';

  var lines = plan.map(function (p, i) {
    var parts = [(i + 1) + '本目（' + p.date + '）: 本文=' + p.cat];
    if (p.closeCat !== p.cat) parts.push('締め=' + p.closeCat);
    var layer = xLayerOf_(p.cat);
    if (layer) parts.push('読者の温度=' + layer);
    if (p.memo) parts.push('メモ=' + p.memo);
    return '  ' + parts.join(' / ');
  });
  return lines.join('\n');
}
