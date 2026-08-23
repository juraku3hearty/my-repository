/**
 * ハヨヤレ Chatwork版 — 05_Patrol
 * 5分おきの巡回本体：
 *   1. 監視ルームから上司のメッセージを拾う（全自動）
 *   2. マイチャットでの自分のコマンド（やった/ちゃう/リスト/設定/直して 等）を処理
 *   3. 期限が近いタスクを催促（😗→😤→💢→👹）
 *   4. 金曜17時の棚卸し
 *
 * Chatworkの messages?force=0 は「前回取得以降の新着だけ」を返すので、位置管理が要らない。
 * ただし初回だけは過去分が返るため、ルームごとに初回スキップする。
 */
function patrol() {
  scanBosses_();
  scanMyCommands_();
  nagDue_();
  weeklyDigest_();
}

/** 1. 監視ルームから上司のメッセージを拾う */
function scanBosses_() {
  const bosses = getBossIds();
  const me = myAccountId_();
  getWatchRooms().forEach(room => {
    const msgs = cwGet_('/rooms/' + room + '/messages?force=0');
    if (!msgs || !msgs.length) return;

    // 初回は位置合わせだけ（過去ログに反応しない）
    const initKey = 'INIT_' + room;
    if (!PROPS.getProperty(initKey)) {
      PROPS.setProperty(initKey, '1');
      return;
    }

    msgs.forEach(m => {
      const from = String(m.account && m.account.account_id);
      if (!from || from === me) return;
      if (bosses.length && bosses.indexOf(from) === -1) return;
      const text = stripCwTags_(m.body);
      if (!text) return;

      const judged = classifyBossMessage(text, new Date());
      if (!judged || !judged.is_task || !judged.task) return;

      let due = null;
      if (judged.due) {
        due = new Date(String(judged.due).replace(' ', 'T') + ':00+09:00');
        if (isNaN(due.getTime())) due = null;
      }
      if (!due) { // 期限が読めなければ翌朝9時に催促
        due = new Date();
        due.setDate(due.getDate() + 1);
        due.setHours(9, 0, 0, 0);
      }
      const bossName = (m.account && m.account.name) || from;
      addTask(bossName, judged.task, due, text, room);
      obaDm_(buildCaughtMessage(bossName, judged.task, due, text));
      Utilities.sleep(500);
    });
  });
}

/** 2. マイチャットでの自分のコマンドを処理 */
function scanMyCommands_() {
  const msgs = cwGet_('/rooms/' + myChatRoom_() + '/messages?force=0');
  if (!msgs || !msgs.length) return;

  const initKey = 'INIT_MYCHAT';
  if (!PROPS.getProperty(initKey)) {
    PROPS.setProperty(initKey, '1');
    return;
  }

  msgs.forEach(m => {
    const text = stripCwTags_(m.body);
    if (!text) return;
    // おばちゃん自身の投稿（👂😗😤💢👹🍬📋⚙️✏️等で始まる）はコマンド形式に一致しないので素通りする
    let mt;

    if ((mt = text.match(/^(?:やった|完了|done|できた)\s+(\d+)/))) {
      const done = completeByIndex(Number(mt[1]));
      obaDm_(done ? buildDoneMessage([done]) : 'その番号は無いで。「リスト」で確認しよか。');
    } else if ((mt = text.match(/^(?:消して|削除|消す)\s*(\d+)/))) {
      const gone = cancelByIndex(Number(mt[1]));
      obaDm_(gone ? '「' + gone.task + '」消しといたで。逃げたんとちゃうやろな？' : 'その番号は無いで。「リスト」で確認しよか。');
    } else if ((mt = text.match(/^直して\s*(\d+)\s+([\s\S]+)/))) {
      const open = listOpen();
      const n = Number(mt[1]);
      if (n < 1 || n > open.length) {
        obaDm_('その番号は無いで。「リスト」で確認しよか。');
      } else {
        const target = open[n - 1];
        const fixed = parseCorrection(mt[2], target.task, target.due, new Date());
        if (!fixed || !fixed.task) {
          obaDm_('すまん、直し方がよう分からんかったわ。「直して ' + n + ' 期限は金曜15時」みたいに言うてみ？');
        } else {
          let due = null;
          if (fixed.due) {
            due = new Date(String(fixed.due).replace(' ', 'T') + ':00+09:00');
            if (isNaN(due.getTime())) due = target.due;
          }
          updateTask(target, fixed.task, due);
          obaDm_('✏️ ほい、直しといたで。\n📌 ' + fixed.task + '（期限: ' + fmtDue_(due) + '）\nこれでええか？あかんかったらまた「直して ' + n + ' …」て言いや。');
        }
      }
    } else if (/^(やった|やったで|やったよ|完了|done|できた)$/.test(text)) {
      const done = completeTasks();
      obaDm_(done.length ? buildDoneMessage(done) : 'ん？いま追い込んでるもんは無いで。「リスト」で確認しよか。');
    } else if (/^(ちゃう|違う|ちがう)$/.test(text)) {
      const cancelled = cancelLatest();
      obaDm_(cancelled ? buildCancelMessage(cancelled.task) : '取り消すもんが見当たらんわ。「リスト」見てみ？');
    } else if (text === 'リスト') {
      const open = listOpen();
      obaDm_(open.length
        ? '📋 いま抱えてるんはこれやで。\n' + open.map((t, i) =>
            (i + 1) + '. ' + t.task + '（期限: ' + fmtDue_(t.due) + '）— ' + t.boss + 'さんから' +
            (t.status === 'nagging' ? '（催促中！）' : '') +
            '\n> ' + truncate_(t.original || '（元メッセージなし）', 80)
          ).join('\n')
        : 'いま登録は無いわ。平和やねえ。');
    } else if (text === '設定') {
      const rooms = getWatchRooms().map(roomLabel_);
      obaDm_('⚙️ いまの見張り体制やで。\n' +
        '・監視してるルーム: ' + (rooms.join('、') || '★未設定！') + '\n' +
        '・上司リスト: ' + (getBossIds().join('、') || '（指定なし＝あんた以外の全員）') + '\n' +
        '・巡回: ' + PATROL_MINUTES + '分ごと\n' +
        '・催促: 期限60分前から' + NAG_STEP_MIN + '分おきに最大' + MAX_NAGS + '回（😗→😤→💢→👹）\n' +
        '変更はGASのスクリプトプロパティ（WATCH_ROOMS / BOSS_ACCOUNT_IDS）でな。');
    } else if (text === 'ヘルプ') {
      obaDm_('おばちゃんへの言葉はこれだけ覚えとき。\n' +
        '・やった … 催促ストップ（飴ちゃん出る）／「やった 2」で番号指定\n' +
        '・ちゃう … 直前に拾ったやつを取り消し\n' +
        '・消して 2 … リストの2番を消す\n' +
        '・直して 2 期限は金曜15時 … おばちゃんの間違いを修正（内容でも期限でもOK）\n' +
        '・リスト … 一覧（期限の早い順・誰から来たか・元の本文つき）\n' +
        '・設定 … いまの見張り体制\n' +
        'あとは黙っててもおばちゃんが勝手に拾うから、あんたは仕事しとき。');
    }
  });
}

/** ルームIDを名前に */
function roomLabel_(roomId) {
  const cache = PROPS.getProperty('RMNAME_' + roomId);
  if (cache) return cache;
  const info = cwGet_('/rooms/' + roomId);
  const label = (info && info.name) ? info.name : roomId;
  PROPS.setProperty('RMNAME_' + roomId, label);
  return label;
}

/** 3. 期限60分前から30分おきに催促（最大4回） */
function nagDue_() {
  const now = new Date();
  listOpen().forEach(r => {
    if (!r.due || r.nags >= MAX_NAGS) return;
    const nextNagAt = r.due.getTime() - 60 * 60000 + r.nags * NAG_STEP_MIN * 60000;
    if (now.getTime() < nextNagAt) return;
    obaDm_(buildNagMessage(r.task, r.due, r.nags + 1));
    recordNag_(r);
    Utilities.sleep(500);
  });
}

/** 4. 金曜17時の棚卸し */
function weeklyDigest_() {
  const now = new Date();
  const todayKey = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyyMMdd');
  if (now.getDay() !== 5 || now.getHours() !== 17) return;
  if (PROPS.getProperty('LAST_DIGEST') === todayKey) return;
  PROPS.setProperty('LAST_DIGEST', todayKey);
  const open = listOpen();
  if (open.length) obaDm_(buildDigestMessage(open));
}
