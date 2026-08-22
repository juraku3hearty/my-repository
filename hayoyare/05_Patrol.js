/**
 * ハヨヤレ — 05_Patrol
 * 5分おきの巡回本体：
 *   1. 上司の連絡を拾う（全自動）
 *   2. 自分の返事（やった/ちゃう/リスト）を処理
 *   3. 期限が近いタスクを催促（😗→😤→💢→👹）
 *   4. 金曜17時の棚卸し
 */
function patrol() {
  scanBosses_();
  scanMyReplies_();
  nagDue_();
  weeklyDigest_();
}

/** 1. 監視対象の会話から上司のメッセージを拾う */
function scanBosses_() {
  const bosses = getBossIds();
  const me = myUserId_();
  getWatchChannels().forEach(ch => {
    const key = 'LAST_TS_' + ch;
    const lastTs = PROPS.getProperty(key);
    const json = fetchHistory_(ch, lastTs);
    if (!json.ok || !json.messages || !json.messages.length) return;
    PROPS.setProperty(key, json.messages[0].ts); // 最新位置を先に記録

    // 初回はここまで（過去ログ全部に反応しないため、位置合わせだけして終了）
    if (!lastTs) return;

    json.messages.slice().reverse().forEach(m => {
      if (m.subtype || m.bot_id || !m.user || !m.text) return;
      if (m.user === me) return;
      if (bosses.length && bosses.indexOf(m.user) === -1) return;

      const judged = classifyBossMessage(m.text, new Date());
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
      const bossName = userName_(m.user);
      addTask(bossName, judged.task, due, m.text, ch);
      obaDm_(buildCaughtMessage(bossName, judged.task, due, m.text));
      Utilities.sleep(1000);
    });
  });
}

function userName_(userId) {
  const cache = PROPS.getProperty('NAME_' + userId);
  if (cache) return cache;
  const json = slackApi_('users.info', { user: userId });
  const name = (json.user && (json.user.profile.display_name || json.user.real_name)) || userId;
  PROPS.setProperty('NAME_' + userId, name);
  return name;
}

/** 2. おばちゃんDMでの自分の返事を処理 */
function scanMyReplies_() {
  const ch = myDmChannel_();
  const key = 'LAST_DM_TS';
  const lastTs = PROPS.getProperty(key);
  const json = fetchHistory_(ch, lastTs);
  if (!json.ok || !json.messages || !json.messages.length) return;
  PROPS.setProperty(key, json.messages[0].ts);
  if (!lastTs) return;

  json.messages.slice().reverse().forEach(m => {
    if (m.bot_id || m.user !== myUserId_() || !m.text) return;
    const text = m.text.trim();
    let mt;

    // 番号つきコマンドを先に判定（「やった 2」が素の「やった」に吸われないように）
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
    } else if (/^(やった|やったで|やったよ|完了|done|できた)/.test(text)) {
      const done = completeTasks();
      obaDm_(done.length ? buildDoneMessage(done) : 'ん？いま追い込んでるもんは無いで。「リスト」で確認しよか。');
    } else if (/^(ちゃう|違う|ちがう)/.test(text)) {
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
      const channels = getWatchChannels().map(channelLabel_);
      const bosses = getBossIds().map(userName_);
      obaDm_('⚙️ いまの見張り体制やで。\n' +
        '・監視してる会話: ' + (channels.join('、') || '★未設定！') + '\n' +
        '・上司リスト: ' + (bosses.join('、') || '（指定なし＝あんた以外の全員）') + '\n' +
        '・巡回: ' + PATROL_MINUTES + '分ごと\n' +
        '・催促: 期限60分前から' + NAG_STEP_MIN + '分おきに最大' + MAX_NAGS + '回（😗→😤→💢→👹）\n' +
        '変更はGASのスクリプトプロパティ（WATCH_CHANNELS / BOSS_USER_IDS）でな。');
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

/** 会話IDを人が読める名前に（#チャンネル名 or DM:相手名） */
function channelLabel_(ch) {
  const cache = PROPS.getProperty('CHNAME_' + ch);
  if (cache) return cache;
  const json = slackApi_('conversations.info', { channel: ch }, ch.charAt(0) === 'D');
  let label = ch;
  if (json.ok && json.channel) {
    label = json.channel.is_im ? 'DM: ' + userName_(json.channel.user) : '#' + json.channel.name;
  }
  PROPS.setProperty('CHNAME_' + ch, label);
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
    Utilities.sleep(1000);
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
