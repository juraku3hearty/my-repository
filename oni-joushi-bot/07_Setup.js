/**
 * 鬼上司Bot — 07_Setup
 * 初回に initialize() を手動実行する（権限承認もここでまとめて済む）
 */
function initialize() {
  // 既存トリガーを掃除してから毎時パトロールを設置
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'hourlyPatrol') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('hourlyPatrol').timeBased().everyHours(1).create();

  // 権限承認を先に走らせるためのダミーアクセス
  getCalendar_().getName();

  console.log('セットアップ完了。');
  console.log('次の手順:');
  console.log('1. デプロイ → 新しいデプロイ → ウェブアプリ（全員がアクセス可能）');
  console.log('2. 発行されたURLをLINE DevelopersのWebhook URLに設定');
  console.log('3. Botに「ヘルプ」と話しかけて動作確認（最初の1通でPush先が自動登録される）');
}

/** 動作テスト: 今すぐ説教を1回もらう */
function testScold() {
  pushText(buildScoldMessage(1, 8, '今日'));
}
