/**
 * ハヨヤレ Chatwork版 — 06_Setup
 */
function initialize() {
  // タスク保存用スプレッドシート
  if (!PROPS.getProperty('SPREADSHEET_ID')) {
    const ss = SpreadsheetApp.create('ハヨヤレCW_タスク');
    PROPS.setProperty('SPREADSHEET_ID', ss.getId());
    console.log('スプレッドシート作成: ' + ss.getUrl());
  }
  getSheet_();

  // 認証確認＋自分のアカウントID自動設定
  const me = cwGet_('/me');
  if (!me) throw new Error('CHATWORK_API_TOKEN が無効です');
  PROPS.setProperty('MY_ACCOUNT_ID', String(me.account_id));
  console.log('Chatwork認証OK: ' + me.name + ' (account_id: ' + me.account_id + ')');

  // 巡回トリガー設置
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'patrol') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('patrol').timeBased().everyMinutes(PATROL_MINUTES).create();

  // 着任の挨拶（マイチャットに届く）
  obaDm_('👂 今日からあんたの上司の連絡、おばちゃんが見張っとくからな。' +
    '拾ってほしいルームは WATCH_ROOMS に入れとくんやで。ほな、はよ仕事し！');
  console.log('セットアップ完了。' + PATROL_MINUTES + '分ごとに巡回します。');
  console.log('WATCH_ROOMS: ' + (getWatchRooms().join(', ') || '★未設定！listMyRooms()で調べて設定してください'));
}

/** 監視候補: 参加中のルーム一覧（IDをWATCH_ROOMSへ） */
function listMyRooms() {
  const rooms = cwGet_('/rooms') || [];
  rooms.forEach(r => {
    const kind = r.type === 'my' ? '（マイチャット）' : r.type === 'direct' ? '（DM）' : '';
    console.log(r.room_id + '  ' + r.name + ' ' + kind);
  });
  if (!rooms.length) console.log('ルームが取得できませんでした。CHATWORK_API_TOKENを確認してください');
}

/** 動作テスト: 今すぐおばちゃんに詰められる（マイチャットに届く） */
function testNag() {
  obaDm_(buildNagMessage('銀行に行く', new Date(), 2));
}
