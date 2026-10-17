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
    ['日付', '長さ', '本文の分類', '締めの分類', '投稿時刻', '回る人数', 'メモ']);

  if (sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clearContent();
  }

  var wdays = ['日', '月', '火', '水', '木', '金', '土'];
  // 週は月曜始まり。次の月曜からの7日分を用意する。
  var base = new Date();
  var add = (8 - base.getDay()) % 7;
  if (add === 0) add = 7;
  base.setDate(base.getDate() + add);

  var rows = [];
  for (var i = 0; i < 7; i++) {
    var d = new Date(base.getTime());
    d.setDate(base.getDate() + i);
    // 週2本を長文にする。間隔があくように3日目と6日目へ。
    var len = (i === 2 || i === 5) ? '長文' : '短文';
    rows.push([
      Utilities.formatDate(d, 'Asia/Tokyo', 'yyyy-MM-dd') +
        '（' + wdays[d.getDay()] + '）',
      len, '', '', '', '', ''
    ]);
  }
  sh.getRange(2, 1, rows.length, 7).setValues(rows);

  // 長さをプルダウンにする
  var lenRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['長文', '短文'], true).setAllowInvalid(true).build();
  sh.getRange(2, 2, rows.length, 1).setDataValidation(lenRule);

  // 分類をプルダウンにする
  var names = X_CATEGORIES.map(function (c) { return c.name; });
  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(names, true).setAllowInvalid(true).build();
  sh.getRange(2, 3, rows.length, 2).setDataValidation(rule);

  // 分類の意味を右側に添えておく
  var legend = [['', '', '', '', '', '', '']];
  legend.push(['── 分類 ──', '中身', '宮', '', '', '', '']);
  X_CATEGORIES.forEach(function (c) {
    legend.push([c.name, c.desc, c.palace, '', '', '', '']);
  });
  legend.push(['', '', '', '', '', '', '']);
  legend.push(['── 長さ ──', '長文=じっくり書く / 短文=長文の論点をひとつ切り出す', '', '', '', '', '']);
  sh.getRange(rows.length + 2, 1, legend.length, 7).setValues(legend);
  sh.setColumnWidth(1, 150);
  sh.setColumnWidth(2, 80);
  sh.setColumnWidth(3, 120);
  sh.setColumnWidth(4, 120);

  xToast_('X_週の傾向 を作りました。本文の分類を埋めてください（締めは空でもOK）。');
}

/**
 * 週の傾向を読む。
 * @return {Array<{date,cat,closeCat,time,people,memo}>}
 */
function xReadWeekPlan_() {
  var sh = xBook_().getSheetByName(X_SHEETS.WEEKPLAN);
  if (!sh || sh.getLastRow() < 2) return [];

  var values = sh.getRange(2, 1, sh.getLastRow() - 1, 7).getValues();
  var out = [];
  for (var i = 0; i < values.length; i++) {
    var date = String(values[i][0]).trim();
    if (!date || date.indexOf('──') >= 0) break;   // 凡例に入ったら終わり
    var len = String(values[i][1]).trim();
    var cat = String(values[i][2]).trim();
    if (!cat && !len) continue;                     // 何も指定がない日は飛ばす
    out.push({
      date: date,
      len: len || '長文',
      cat: cat,
      closeCat: String(values[i][3]).trim() || cat,
      time: String(values[i][4]).trim(),
      people: String(values[i][5]).trim(),
      memo: String(values[i][6]).trim()
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
    var parts = [(i + 1) + '本目（' + p.date + '）: ' + (p.len || '長文') +
                 (p.cat ? ' / 本文=' + p.cat : '')];
    if (p.closeCat !== p.cat) parts.push('締め=' + p.closeCat);
    var layer = xLayerOf_(p.cat);
    if (layer) parts.push('読者の温度=' + layer);
    if (p.memo) parts.push('メモ=' + p.memo);
    return '  ' + parts.join(' / ');
  });
  return lines.join('\n');
}

/* ============================================================
 * 反応ログ
 *
 * 引用ポスト、もらったコメント、自分の返信を溜める。
 *
 * インタビューや年表は「自分の内側」の棚卸しなので、
 * そこからだけ書くと内側で完結した話しか出ない。
 * 他人の言葉は、自分では思いつかない角度をそのまま持ち込む。
 * ============================================================ */

/** 反応ログの種類 */
var X_REACTION_KINDS = [
  '自分の投稿',
  '引用した相手の投稿',
  'もらったコメント',
  '自分の返信',
  'DMでのやりとり',
  '対面で言われたこと',
  '参考になった他人の投稿'   // 論点だけ借りる。表現と事例は使わない
];

/**
 * X_反応ログ シートを作る。
 */
function xSetupReactionLog() {
  var sh = xSheet_(X_SHEETS.REACTION, ['日付', '種類', '内容', '誰の言葉か', '気づいたこと']);

  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(X_REACTION_KINDS, true).setAllowInvalid(true).build();
  sh.getRange(2, 2, 200, 1).setDataValidation(rule);

  sh.setColumnWidth(1, 100);
  sh.setColumnWidth(2, 150);
  sh.setColumnWidth(3, 520);
  sh.setColumnWidth(5, 280);
  sh.getRange(2, 3, sh.getMaxRows() - 1, 1).setWrap(true);
  sh.getRange(2, 5, sh.getMaxRows() - 1, 1).setWrap(true);

  xToast_('X_反応ログ を作りました。引用ポストやコメントを貼ってください。');
}

/**
 * 反応ログを、生成プロンプト用のテキストにする。
 * @param {number} limit 新しいほうから何件か
 */
function xReadReactions_(limit) {
  var sh = xBook_().getSheetByName(X_SHEETS.REACTION);
  if (!sh || sh.getLastRow() < 2) return '';

  var values = sh.getRange(2, 1, sh.getLastRow() - 1, 5).getValues();
  var rows = values.filter(function (r) { return String(r[2]).trim(); });
  if (!rows.length) return '';

  rows.reverse();
  if (limit) rows = rows.slice(0, limit);

  return rows.map(function (r) {
    var parts = [];
    var head = '- 【' + (String(r[1]).trim() || '記録') + '】';
    if (r[0]) head += ' ' + fmtDate_(r[0]);
    if (r[3]) head += '（' + String(r[3]).trim() + '）';
    parts.push(head);
    parts.push('  ' + String(r[2]).trim().replace(/\n/g, '\n  '));
    if (r[4]) parts.push('  → 気づいたこと: ' + String(r[4]).trim());
    return parts.join('\n');
  }).join('\n');
}
