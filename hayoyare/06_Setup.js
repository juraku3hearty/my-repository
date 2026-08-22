/**
 * ハヨヤレ — 06_Setup
 */
function initialize() {
  // タスク保存用スプレッドシート
  if (!PROPS.getProperty('SPREADSHEET_ID')) {
    const ss = SpreadsheetApp.create('ハヨヤレ_タスク');
    PROPS.setProperty('SPREADSHEET_ID', ss.getId());
    console.log('スプレッドシート作成: ' + ss.getUrl());
  }
  getSheet_();

  // Bot認証確認
  const bot = slackApi_('auth.test', {});
  if (!bot.ok) throw new Error('SLACK_BOT_TOKEN が無効です');
  console.log('Bot認証OK: ' + bot.user + ' @ ' + bot.team);

  // ユーザートークンがあれば自分のIDを自動設定
  if (!PROPS.getProperty('MY_SLACK_USER_ID') && PROPS.getProperty('SLACK_USER_TOKEN')) {
    const me = slackApi_('auth.test', {}, true);
    if (me.ok) {
      PROPS.setProperty('MY_SLACK_USER_ID', me.user_id);
      console.log('MY_SLACK_USER_ID を自動設定: ' + me.user_id);
    }
  }
  if (!myUserId_()) {
    console.log('★ MY_SLACK_USER_ID が未設定です。Slackのプロフィール → その他 → メンバーIDをコピーして設定してください');
    return;
  }

  // 巡回トリガー設置
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'patrol') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('patrol').timeBased().everyMinutes(PATROL_MINUTES).create();

  // 着任の挨拶
  obaDm_('👂 今日からあんたの上司の連絡、おばちゃんが見張っとくからな。' +
    '拾ってほしい会話は WATCH_CHANNELS に入れとくんやで。ほな、はよ仕事し！');
  console.log('セットアップ完了。' + PATROL_MINUTES + '分ごとに巡回します。');
  console.log('WATCH_CHANNELS: ' + (getWatchChannels().join(', ') || '★未設定！listMyChannels()/listMyDms()で調べて設定してください'));
}

/** 監視候補: 自分が参加しているチャンネル一覧（IDをWATCH_CHANNELSへ） */
function listMyChannels() {
  const useUser = !!PROPS.getProperty('SLACK_USER_TOKEN');
  const json = slackApi_('users.conversations', { types: 'public_channel,private_channel', limit: 200 }, useUser);
  (json.channels || []).forEach(c => console.log(c.id + '  #' + c.name));
  if (!(json.channels || []).length) {
    console.log(useUser
      ? 'チャンネルが取得できませんでした。User Token Scopesに channels:read / groups:read が入っているか確認してください'
      : 'SLACK_USER_TOKEN未設定のためBotの参加チャンネルを表示します。Botをチャンネルに入れるか、ユーザートークンを設定してください');
  }
}

/** 監視候補: 自分のDM一覧（ユーザートークン必須。上司とのDMのD…をWATCH_CHANNELSへ） */
function listMyDms() {
  if (!PROPS.getProperty('SLACK_USER_TOKEN')) {
    console.log('SLACK_USER_TOKEN が未設定のためDM一覧は取得できません');
    return;
  }
  const json = slackApi_('users.conversations', { types: 'im', limit: 200 }, true);
  (json.channels || []).forEach(c => console.log(c.id + '  相手: ' + userName_(c.user)));
}

/** 動作テスト: 今すぐおばちゃんに詰められる */
function testNag() {
  obaDm_(buildNagMessage('銀行に行く', new Date(), 2));
}
