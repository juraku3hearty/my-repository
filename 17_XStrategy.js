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
var X_STRATEGY_DEFAULTS = ['コンセプト', 'アカウント設計', '戦略', 'ヒアリング', '設計', '目標達成', '運用マニュアル'];
var X_FACTSHEET_DEFAULTS = ['インタビュー', '年表', 'メイン'];
var X_SAMPLESHEET_DEFAULTS = ['サンプル投稿', '固定ポスト'];

/** 1シートから読む最大文字数（プロンプトが膨らみすぎないように） */
var X_STRATEGY_MAX = 12000;

/**
 * 指定したシート群を、丸ごとテキストとして読む。
 * 行の形がシートごとにバラバラなので、表として解釈せず、
 * 空でないセルをつないで素のテキストにする。取りこぼしが出ない。
 *
 * @param {Array<string>} names シート名
 * @param {number} maxPerSheet 1シートあたりの最大文字数
 */
function xReadSheetsAsText_(names, maxPerSheet) {
  var ss = xBook_();
  var out = [];
  (names || []).forEach(function (name) {
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
    var cap = maxPerSheet || X_STRATEGY_MAX;
    if (text.length > cap) text = text.slice(0, cap) + '\n…（以下省略）';
    if (text) out.push('## ' + name + '\n' + text);
  });
  return out.join('\n\n');
}

/**
 * 設定からシート名のリストを得る。
 * 設定が空なら、既定候補に部分一致するシートを探す。
 * 「(2026.10-)」のような新しい版があれば、そちらを優先する。
 */
function xResolveSheetNames_(settingKey, defaults) {
  var setting = xReadSetting_();
  var names = String(setting[settingKey] || '')
    .split(/[,、]/).map(function (s) { return s.trim(); }).filter(String);
  if (names.length) return names;

  var all = xBook_().getSheets().map(function (s) { return s.getName(); });
  var hit = all.filter(function (n) {
    return defaults.some(function (d) { return n.indexOf(d) >= 0; });
  });

  // 「コンセプト」と「コンセプト(2026.10-)」が両方ある場合、新しい方だけ使う
  var dropped = {};
  hit.forEach(function (a) {
    hit.forEach(function (b) {
      if (a !== b && b.indexOf(a) === 0 && b.length > a.length) dropped[a] = true;
    });
  });
  return hit.filter(function (n) { return !dropped[n]; });
}

/**
 * 戦略シートを読み、1つのテキストにする。
 * X_設定 の「戦略シート名」（カンマ区切り）で指定。空なら既定候補から探す。
 */
function xReadStrategy_() {
  return xReadSheetsAsText_(xResolveSheetNames_('戦略シート名', X_STRATEGY_DEFAULTS), X_STRATEGY_MAX);
}

/** インタビュー・年表・メインなどを、一次情報として丸ごと読む */
function xReadFactSheets_() {
  return xReadSheetsAsText_(xResolveSheetNames_('一次情報シート名', X_FACTSHEET_DEFAULTS), 10000);
}

/** サンプル投稿・固定ポストを、文体サンプルとして丸ごと読む */
function xReadSampleSheets_() {
  return xReadSheetsAsText_(xResolveSheetNames_('文体サンプルシート名', X_SAMPLESHEET_DEFAULTS), 10000);
}

/**
 * 読み込めているか確認する（実行してログを見る）。
 */
function xPreviewStrategy() {
  var strategy = xReadStrategy_();
  var facts = xReadFactSheets_();
  var samples = xReadSampleSheets_();

  Logger.log('発信設計書 : ' + strategy.length + '文字  ' +
    xResolveSheetNames_('戦略シート名', X_STRATEGY_DEFAULTS).join(' / '));
  Logger.log('一次情報   : ' + facts.length + '文字  ' +
    xResolveSheetNames_('一次情報シート名', X_FACTSHEET_DEFAULTS).join(' / '));
  Logger.log('文体サンプル: ' + samples.length + '文字  ' +
    xResolveSheetNames_('文体サンプルシート名', X_SAMPLESHEET_DEFAULTS).join(' / '));

  var text = strategy;
  if (!text) {
    xToast_('戦略シートが見つかりませんでした。X_設定の「戦略シート名」にシート名を入れてください。');
    Logger.log('戦略シートが見つかりません。このブックのシート: ' +
      xBook_().getSheets().map(function (s) { return s.getName(); }).join(' / '));
    return 0;
  }
  Logger.log('読み込んだ文字数: ' + text.length);
  Logger.log('--- 先頭1500字 ---');
  Logger.log(text.slice(0, 1500));
  xToast_('設計書' + strategy.length + '字 / 一次情報' + facts.length +
          '字 / サンプル' + samples.length + '字 を読み込みました。ログを確認してください。');
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
