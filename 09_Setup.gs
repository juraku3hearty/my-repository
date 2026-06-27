/**
 * 09_Setup.gs
 * 初期化・トリガー登録。GASエディタから手動で1回ずつ実行する。
 */

/** シートのヘッダーを作る（既存データは消さない） */
function initialize() {
  ensureHeader_(CONFIG.SHEET_KNOWLEDGE,
    ['id', '作成日時', 'LINE_userId', 'タイトル', 'カテゴリ', 'タグ', 'ソースURL', '元テキスト', '要約', 'Skill名', '状態']);
  ensureHeader_(CONFIG.SHEET_SKILLS,
    ['Skill名', '説明', 'SKILL.md', '作成日時', '元ナレッジid']);
  ensureHeader_(CONFIG.SHEET_USAGE,
    ['id', '日時', 'LINE_userId', 'Skill名', '削減分', '削減円', 'メモ']);
  Logger.log('initialize 完了');
}

function ensureHeader_(name, headers) {
  const sh = sheet_(name);
  if (sh.getLastRow() === 0) {
    sh.appendRow(headers);
    sh.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
}

/** 毎月1日 朝9時に月次レポートを送るトリガーを登録（重複登録は防ぐ） */
function setupMonthlyTrigger() {
  const exists = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === 'sendMonthlyReport';
  });
  if (exists) { Logger.log('既に登録済み'); return; }
  ScriptApp.newTrigger('sendMonthlyReport')
    .timeBased().onMonthDay(1).atHour(9).create();
  Logger.log('月次トリガー登録完了');
}

/** 動作確認用：ダッシュボードをログに出す */
function debugDashboard() {
  Logger.log(formatDashboard_(computeDashboard_(null, null)));
}

/** 動作確認用：サンプルナレッジを1件取り込む（要 GEMINI_API_KEY） */
function debugIngest() {
  const r = ingestKnowledge_(
    '請求書の送付漏れを防ぐため、毎月末にfreeeの未送付請求書を一覧化し、Slackでリマインドする運用にした。',
    'debug-user');
  Logger.log(r);
}
