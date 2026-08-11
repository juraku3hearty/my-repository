/**
 * 鬼上司Bot — 06_Trigger
 * 毎時パトロール。攻撃チャネルは3段構え:
 *   LINE Push   … 重い一撃（1日最大2通 = 月60通で無料枠200通に収まる）
 *   メール       … 毎時攻撃（GAS無料枠 1日100通）
 *   カレンダー侵入 … サボり3時間目に「面談」を勝手に入れる（無料・通知付き）
 */
function hourlyPatrol() {
  const now = new Date();
  const hour = now.getHours();
  const todayKey = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyyMMdd');

  // ---- 休日 ----
  if (isRestDay(now)) {
    if (getSetting('HOLIDAY_MODE') === 'ON' &&
        hour >= 10 && hour < 12 &&
        getSetting('LAST_HOLIDAY_SCOLD') !== todayKey &&
        !hasAnyEvent(now)) {
      pushText(buildHolidayScoldMessage()); // 「休みなのに何も予定が無いのか！」
      setSetting('LAST_HOLIDAY_SCOLD', todayKey);
    }
    return;
  }

  // ---- 勤務時間外は黙る ----
  const win = getWorkWindow();
  if (hour < win.start || hour >= win.end) return;

  const free = getFreeHoursInWorkWindow(now);
  const windowHours = win.end - win.start;

  // ---- ちゃんと予定が入っている → 説教中だったら褒めて手打ち ----
  // 褒めはメールで送る（LINE無料枠を消費しない。件名からして偉そうなのが逆に良い）
  if (free < windowHours / 2) {
    if (Number(getSetting('ESCALATION_LEVEL')) > 0 &&
        getSetting('LAST_PRAISE_DATE') !== todayKey) {
      MailApp.sendEmail(
        Session.getEffectiveUser().getEmail(),
        '【人事評価】見直した',
        buildPraiseMessage() + '\n\n鬼頭'
      );
      setSetting('ESCALATION_LEVEL', 0);
      setSetting('LAST_PRAISE_DATE', todayKey);
    }
    return;
  }

  // ---- サボり検出 → 本日のストライク加算 ----
  let strikes;
  if (getSetting('STRIKE_DATE') === todayKey) {
    strikes = Number(getSetting('STRIKE_COUNT')) + 1;
  } else {
    strikes = 1;
    setSetting('STRIKE_DATE', todayKey);
    // サボりが日をまたぐと説教レベルが上がる（最大4）
    setSetting('ESCALATION_LEVEL', Math.min(Number(getSetting('ESCALATION_LEVEL')) + 1, 4));
  }
  setSetting('STRIKE_COUNT', strikes);

  const level = Math.max(1, Number(getSetting('ESCALATION_LEVEL')));

  if (strikes === 1) {
    pushText(buildScoldMessage(level, free, '今日'));            // LINE 本日1通目
  } else if (strikes === 3 && getSetting('CALENDAR_INVADE') === 'ON') {
    insertBossMeeting(now);                                       // カレンダー侵入
    sendNagEmail_(strikes, level);
  } else if (strikes === 6) {
    pushText(buildFinalRageMessage());                            // LINE 本日2通目（最終通告）
  } else {
    sendNagEmail_(strikes, level);                                // それ以外は毎時メール
  }
}

function sendNagEmail_(strikes, level) {
  if (getSetting('EMAIL_NAG') !== 'ON') return;
  const mail = buildNagEmail(strikes, level);
  MailApp.sendEmail(Session.getEffectiveUser().getEmail(), mail.subject, mail.body);
}
