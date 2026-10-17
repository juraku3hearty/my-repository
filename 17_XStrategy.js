/**
 * 17_XStrategy.js
 * 発信設計書の読み込み
 *
 * 業者さんのヒアリングシート・戦略シートには、
 *   ・発信の目的 / ターゲット4層 / ペイン / 反応するキーワード / 抱かせる感情
 *   ・独自性 / 他社にない価値 / タグライン
 *   ・ミッション / ビジョン / 創業ストーリー / 仮想敵 / 一人称
 * が揃っている。これはそのまま生成の土台になる。
 *
 * 転記させると抜けるので、シートを丸ごとテキストとして読む。
 */

/** 読み込むシート名の既定候補 */
var X_STRATEGY_DEFAULTS = ['ヒアリング', 'ヒアリングシート', '戦略', '戦略シート', '設計', 'コンセプト'];

/** 1シートから読む最大文字数（プロンプトが膨らみすぎないように） */
var X_STRATEGY_MAX = 12000;

/**
 * 戦略シートを読み、1つのテキストにする。
 * X_設定 の「戦略シート名」（カンマ区切り）で指定。空なら既定候補から探す。
 */
function xReadStrategy_() {
  var setting = xReadSetting_();
  var names = String(setting['戦略シート名'] || '')
    .split(/[,、]/).map(function (s) { return s.trim(); }).filter(String);

  var ss = xBook_();
  if (!names.length) {
    var all = ss.getSheets().map(function (s) { return s.getName(); });
    names = all.filter(function (n) {
      return X_STRATEGY_DEFAULTS.some(function (d) { return n.indexOf(d) >= 0; });
    });
  }
  if (!names.length) return '';

  var out = [];
  names.forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh || sh.getLastRow() === 0) return;

    var values = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
    var lines = [];
    values.forEach(function (row) {
      var cells = row.map(function (v) {
        return String(v === null || v === undefined ? '' : v).trim();
      }).filter(String);
      if (cells.length) lines.push(cells.join('　／　'));
    });

    var text = lines.join('\n');
    if (text.length > X_STRATEGY_MAX) text = text.slice(0, X_STRATEGY_MAX) + '\n…（以下省略）';
    if (text) out.push('## ' + name + '\n' + text);
  });

  return out.join('\n\n');
}

/**
 * 読み込めているか確認する（実行してログを見る）。
 */
function xPreviewStrategy() {
  var text = xReadStrategy_();
  if (!text) {
    xToast_('戦略シートが見つかりませんでした。X_設定の「戦略シート名」にシート名を入れてください。');
    Logger.log('戦略シートが見つかりません。このブックのシート: ' +
      xBook_().getSheets().map(function (s) { return s.getName(); }).join(' / '));
    return 0;
  }
  Logger.log('読み込んだ文字数: ' + text.length);
  Logger.log('--- 先頭1500字 ---');
  Logger.log(text.slice(0, 1500));
  xToast_(text.length + '文字を読み込みました。ログを確認してください。');
  return text.length;
}

/**
 * 週の中でターゲット層をどう配分するか。
 * 新規接点をつくる段階なので、潜在層を厚く、明確層（相談導線）を1本だけ置く。
 */
function xLayerPlan_(count) {
  var base = ['潜在層', '潜在層', '潜在層', '準顕在層', '準顕在層', '顕在層', '明確層'];
  var out = [];
  for (var i = 0; i < count; i++) out.push(base[i % base.length]);
  return out;
}
