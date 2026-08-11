/**
 * 暴言リマインダー — 07_Setup
 * 初回に initialize() を手動実行（保存用スプレッドシート作成＋トリガー設置＋権限承認）
 */
function initialize() {
  // 保存用スプレッドシートが無ければ自動作成
  if (!PROPS.getProperty('SPREADSHEET_ID')) {
    const ss = SpreadsheetApp.create('暴言リマインダー_データ');
    PROPS.setProperty('SPREADSHEET_ID', ss.getId());
    console.log('スプレッドシートを作成しました: ' + ss.getUrl());
  }
  getSheet_(); // ヘッダー行を作っておく

  // 既存トリガーを掃除してから5分おきの巡回を設置
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'checkReminders') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('checkReminders').timeBased().everyMinutes(5).create();

  console.log('セットアップ完了。');
  console.log('次の手順:');
  console.log('1. デプロイ → 新しいデプロイ → ウェブアプリ（全員がアクセス可能）');
  console.log('2. 発行されたURLをLINE DevelopersのWebhook URLに設定');
  console.log('3. Botに「ヘルプ」と話しかけて動作確認');
}

/** 動作テスト: 今すぐおばちゃんに催促してもらう */
function testNag() {
  pushText(buildNagMessage('銀行に行く', 2));
}
