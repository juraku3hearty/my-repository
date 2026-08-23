/**
 * ハヨヤレ Chatwork版 — 00_Config
 * 上司からのChatwork連絡を関西弁おばちゃんが全自動で拾って、期限まで詰めてくれるリマインダー。
 * おばちゃんはマイチャット（自分専用ルーム）に住み着く。
 *
 * スクリプトプロパティ:
 *   CHATWORK_API_TOKEN … Chatwork 個人設定 → API → APIトークン（必須）
 *   GEMINI_API_KEY     … Google AI Studio で取得（必須）
 *   WATCH_ROOMS        … 監視するルームIDをカンマ区切り。listMyRooms()で調べられる
 *   BOSS_ACCOUNT_IDS   … 上司のアカウントIDをカンマ区切り。空なら「自分以外の全員」を上司扱い
 */
const PROPS = PropertiesService.getScriptProperties();

const GEMINI_MODEL = 'gemini-3.5-flash'; // 無料枠

const PATROL_MINUTES = 5;  // 巡回間隔（分）
const NAG_STEP_MIN = 30;   // 催促の間隔（分）
const MAX_NAGS = 4;        // 期限60分前から最大4連発（😗→😤→💢→👹）

function getWatchRooms() {
  return (PROPS.getProperty('WATCH_ROOMS') || '').split(',').map(s => s.trim()).filter(s => s);
}

function getBossIds() {
  return (PROPS.getProperty('BOSS_ACCOUNT_IDS') || '').split(',').map(s => s.trim()).filter(s => s);
}

function myAccountId_() {
  return PROPS.getProperty('MY_ACCOUNT_ID') || '';
}
