/**
 * 00_Config.gs
 * PUENTE風「AI Skill Curator」LINE版 — 共通設定
 *
 * 秘密情報はコードに直書きせず、スクリプトプロパティから読む。
 *   設定方法: GASエディタ → プロジェクトの設定 → スクリプトプロパティ
 *     LINE_CHANNEL_ACCESS_TOKEN  : LINE Messaging API のチャネルアクセストークン
 *     GEMINI_API_KEY             : Google AI Studio で取得したキー
 *     SPREADSHEET_ID             : ナレッジDBにするスプレッドシートのID
 */

const CONFIG = {
  // Gemini 無料枠モデル（No.1献立Botと同じ）
  GEMINI_MODEL: 'gemini-2.0-flash-lite',

  // シート名
  SHEET_KNOWLEDGE: 'ナレッジDB',
  SHEET_SKILLS: 'Skill',
  SHEET_USAGE: '活用ログ',

  // 1ユーザーあたりの無料上限（PUENTEの50エントリに合わせた擬似フリープラン。0で無制限）
  FREE_PLAN_LIMIT: 0,
};

/** スクリプトプロパティ取得（無ければ空文字） */
function prop_(key) {
  return PropertiesService.getScriptProperties().getProperty(key) || '';
}

function getLineToken_() {
  const t = prop_('LINE_CHANNEL_ACCESS_TOKEN');
  if (!t) throw new Error('スクリプトプロパティ LINE_CHANNEL_ACCESS_TOKEN が未設定です');
  return t;
}

function getGeminiKey_() {
  const k = prop_('GEMINI_API_KEY');
  if (!k) throw new Error('スクリプトプロパティ GEMINI_API_KEY が未設定です');
  return k;
}

function getSpreadsheet_() {
  const id = prop_('SPREADSHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  // 未設定ならコンテナバインドのアクティブシートを使う（手動実行用フォールバック）
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  throw new Error('スクリプトプロパティ SPREADSHEET_ID が未設定です');
}
