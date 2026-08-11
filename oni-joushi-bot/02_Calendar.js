/**
 * 鬼上司Bot — 02_Calendar
 * 勤務時間枠の中の「空き時間」を計算する
 */
function getCalendar_() {
  const id = PROPS.getProperty('CALENDAR_ID');
  return id ? CalendarApp.getCalendarById(id) : CalendarApp.getDefaultCalendar();
}

/** その日の勤務時間枠内の空き時間（時間単位） */
function getFreeHoursInWorkWindow(date) {
  const win = getWorkWindow();
  const start = new Date(date);
  start.setHours(win.start, 0, 0, 0);
  const end = new Date(date);
  end.setHours(win.end, 0, 0, 0);

  // 鬼上司が自分で入れた「面談」は空き時間としてカウント（自作自演で満足させない）
  const events = getCalendar_().getEvents(start, end)
    .filter(e => !e.isAllDayEvent())
    .filter(e => e.getTitle().indexOf(BOSS_EVENT_MARK) === -1);

  // 枠内に切り詰め → 開始順に並べ → 重なりをマージして忙しい時間を合計
  const iv = events
    .map(e => [
      Math.max(e.getStartTime().getTime(), start.getTime()),
      Math.min(e.getEndTime().getTime(), end.getTime())
    ])
    .filter(p => p[1] > p[0])
    .sort((a, b) => a[0] - b[0]);

  let busy = 0;
  let curS = null;
  let curE = null;
  iv.forEach(p => {
    if (curE === null) {
      curS = p[0];
      curE = p[1];
    } else if (p[0] <= curE) {
      curE = Math.max(curE, p[1]);
    } else {
      busy += curE - curS;
      curS = p[0];
      curE = p[1];
    }
  });
  if (curE !== null) busy += curE - curS;

  const total = end.getTime() - start.getTime();
  return Math.max(0, total - busy) / 3600000;
}

/** カレンダー侵入: 次の時間帯に30分の「面談」を勝手に入れる（通知付き） */
function insertBossMeeting(now) {
  const start = new Date(now.getTime());
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  const end = new Date(start.getTime() + 30 * 60000);
  const ev = getCalendar_().createEvent(
    '【緊急】' + BOSS_EVENT_MARK + 'との面談（カレンダーが空白の件）',
    start,
    end,
    { description: '議題: なぜカレンダーが真っ白なのか。\n持ち物: 反省の色。\n※この予定は鬼上司Botが自動で入れました。予定を入れれば面談は自然消滅します（削除してOK）。' }
  );
  ev.addPopupReminder(5);
}

/** その日（終日含む）に予定が1つでもあるか */
function hasAnyEvent(date) {
  const s = new Date(date);
  s.setHours(0, 0, 0, 0);
  const e = new Date(date);
  e.setHours(23, 59, 59, 999);
  return getCalendar_().getEvents(s, e).length > 0;
}
