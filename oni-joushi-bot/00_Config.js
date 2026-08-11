/**
 * 鬼上司Bot — 00_Config
 *
 * スクリプトプロパティ（GASエディタ: プロジェクトの設定 → スクリプトプロパティ）
 *   LINE_CHANNEL_ACCESS_TOKEN … LINE Developers で取得（必須）
 *   GEMINI_API_KEY            … Google AI Studio で取得（必須）
 *   CALENDAR_ID               … 監視するカレンダーID（省略時は自分のデフォルトカレンダー）
 *
 * 以下はLINEから「勤務時間 9-18」等のコマンドで変更できるのでここでは触らない
 */
const PROPS = PropertiesService.getScriptProperties();

const SETTING_DEFAULTS = {
  WORK_START: '9',       // 勤務開始（時）
  WORK_END: '18',        // 勤務終了（時）
  REST_DAYS: '0,6',      // 休みの曜日（0=日〜6=土）デフォルト土日休み
  HOLIDAY_MODE: 'ON',    // 休日おせっかいモード（休みの日に予定ゼロだと逆に怒られる）
  EMAIL_NAG: 'ON',       // 毎時メール攻撃（GAS無料枠 1日100通なので実質無制限）
  CALENDAR_INVADE: 'ON', // カレンダー侵入（サボり続けると勝手に面談予定を入れられる）
  ESCALATION_LEVEL: '0'  // 説教レベル（Botが自動管理）
};

const GEMINI_MODEL = 'gemini-2.0-flash-lite'; // 無料枠

// 鬼上司が勝手に入れる予定の目印（空き時間計算から除外するため）
const BOSS_EVENT_MARK = '鬼頭課長';

function getSetting(key) {
  return PROPS.getProperty(key) || SETTING_DEFAULTS[key] || '';
}

function setSetting(key, value) {
  PROPS.setProperty(key, String(value));
}

function getWorkWindow() {
  return {
    start: Number(getSetting('WORK_START')),
    end: Number(getSetting('WORK_END'))
  };
}

function getRestDays() {
  return getSetting('REST_DAYS').split(',').filter(s => s !== '').map(Number);
}

function isRestDay(date) {
  return getRestDays().indexOf(date.getDay()) !== -1;
}
