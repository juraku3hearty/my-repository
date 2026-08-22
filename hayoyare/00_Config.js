/**
 * ハヨヤレ — 00_Config
 * 上司からのSlack連絡を関西弁おばちゃんが全自動で拾って、期限まで詰めてくれるリマインダー。
 *
 * スクリプトプロパティ:
 *   SLACK_BOT_TOKEN   … xoxb-… （必須。Slackアプリのボットトークン）
 *   SLACK_USER_TOKEN  … xoxp-… （任意。上司との「DM」も監視したい場合のみ）
 *   GEMINI_API_KEY    … Google AI Studio で取得（必須）
 *   MY_SLACK_USER_ID  … 自分のメンバーID（U…）。SLACK_USER_TOKENがあれば initialize() が自動設定
 *   WATCH_CHANNELS    … 監視する会話IDをカンマ区切り（C…=チャンネル / D…=DM）。listMyChannels()/listMyDms()で調べられる
 *   BOSS_USER_IDS     … 上司のメンバーID（U…）をカンマ区切り。空なら「自分以外の全員」を上司扱い
 */
const PROPS = PropertiesService.getScriptProperties();

const GEMINI_MODEL = 'gemini-3.5-flash'; // 無料枠

const PATROL_MINUTES = 5;  // 巡回間隔（分）
const NAG_STEP_MIN = 30;   // 催促の間隔（分）
const MAX_NAGS = 4;        // 期限60分前から最大4連発（😗→😤→💢→👹）

function getWatchChannels() {
  return (PROPS.getProperty('WATCH_CHANNELS') || '').split(',').map(s => s.trim()).filter(s => s);
}

function getBossIds() {
  return (PROPS.getProperty('BOSS_USER_IDS') || '').split(',').map(s => s.trim()).filter(s => s);
}

function myUserId_() {
  return PROPS.getProperty('MY_SLACK_USER_ID') || '';
}
