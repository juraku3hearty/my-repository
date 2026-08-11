/**
 * 暴言リマインダー — 06_Trigger
 * 5分おきに巡回。時間が来たらキャラが催促Push。
 * 「やった」と言うまで30分おきに再攻撃（最大3回=無料枠の節約）
 */
function checkReminders() {
  const now = new Date();
  getDue(now).forEach(r => {
    pushText(buildNagMessage(r.task, r.nags + 1));
    recordNag(r, now);
  });
}
