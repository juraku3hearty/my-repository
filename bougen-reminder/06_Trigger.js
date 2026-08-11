/**
 * 暴言リマインダー — 06_Trigger
 * 5分おきに巡回。時間が来たらキャラが催促Push。
 * 「やった」と言うまで30分おきに再攻撃（最大3回=無料枠の節約）
 */
function checkReminders() {
  const now = new Date();
  getDue(now).forEach(r => {
    // 催促の下に「✅ やった」ボタンを付ける（タップで即ストップ）
    pushText(buildNagMessage(r.task, r.nags + 1), ['✅ やった', '📋 リスト']);
    recordNag(r, now);
  });
}
