/**
 * 鬼頭ゲート — 04_Setup
 */
function initialize() {
  // 配布ログ用スプレッドシート
  if (!PROPS.getProperty('SPREADSHEET_ID')) {
    const ss = SpreadsheetApp.create('鬼頭ゲート_配布ログ');
    PROPS.setProperty('SPREADSHEET_ID', ss.getId());
    console.log('配布ログ用スプレッドシート: ' + ss.getUrl());
  }
  getLogSheet_();

  // 認証確認（自分のアカウント情報が取れれば4キーは正しい）
  const id = getMyUserId_();
  console.log('X認証OK: @' + PROPS.getProperty('X_MY_USERNAME') + ' (id: ' + id + ')');

  // 巡回トリガー設置
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'patrolGate') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('patrolGate').timeBased().everyMinutes(POLL_MINUTES).create();

  console.log('セットアップ完了。' + POLL_MINUTES + '分ごとに「' + GATE_KEYWORD + '」を見張ります。');
  console.log('KIT_URL: ' + (PROPS.getProperty('KIT_URL') || '★未設定！スクリプトプロパティに設定してください'));
}

/** 認証だけ確認したいとき */
function testAuth() {
  const id = getMyUserId_();
  console.log('X認証OK: @' + PROPS.getProperty('X_MY_USERNAME') + ' (id: ' + id + ')');
}

/** 手動で1回巡回してみる */
function testPatrol() {
  patrolGate();
  console.log('巡回完了。配布ログのスプレッドシートを確認してください。');
}
