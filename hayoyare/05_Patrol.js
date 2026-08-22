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
      addTask(bossName, judged.task, due);
      obaDm_(buildCaughtMessage(bossName, judged.task, due));
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

    if (/^(やった|やったで|やったよ|完了|done|できた)/.test(text)) {
      const done = completeTasks();
      obaDm_(done.length ? buildDoneMessage(done) : 'ん？いま追い込んでるもんは無いで。「リスト」で確認しよか。');
    } else if (/^(ちゃう|違う|ちがう)/.test(text)) {
      const cancelled = cancelLatest();
      obaDm_(cancelled ? buildCancelMessage(cancelled.task) : '取り消すもんが見当たらんわ。「リスト」見てみ？');
    } else if (text === 'リスト') {
      const open = listOpen();
      obaDm_(open.length
        ? '📋 いま抱えてるんはこれやで。\n' + open.map((t, i) =>
            (i + 1) + '. ' + t.task + '（期限: ' + fmtDue_(t.due) + '）' + (t.status === 'nagging' ? '（催促中！）' : '')
          ).join('\n')
        : 'いま登録は無いわ。平和やねえ。');
    }
  });
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
