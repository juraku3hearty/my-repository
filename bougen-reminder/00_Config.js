/**
 * 暴言リマインダー — 00_Config
 *
 * スクリプトプロパティ:
 *   LINE_CHANNEL_ACCESS_TOKEN … LINE Developers で取得（必須）
 *   GEMINI_API_KEY            … Google AI Studio で取得（必須）
 *   SPREADSHEET_ID            … initialize() が自動作成するので手動設定不要
 */
const PROPS = PropertiesService.getScriptProperties();

const GEMINI_MODEL = 'gemini-3.5-flash'; // 無料枠（gemini-2.0系は2026年に廃止済み）

const MAX_NAGS = 3;          // 1件あたりの最大通知回数（無料枠200通/月の節約。3回=約66件/月フル暴言可能）
const NAG_INTERVAL_MIN = 30; // 「やった」と言うまで30分おきに再攻撃

function getCharacter() {
  return PROPS.getProperty('CHARACTER') || 'おばちゃん'; // デフォルトは関西弁のおばちゃん
}
