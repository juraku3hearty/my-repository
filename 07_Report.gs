/**
 * 07_Report.gs
 * 月次レポート。時間トリガーで毎月1日に前月分の見える化をLINEへプッシュ。
 */

/** 前月のYYYY-MMを返す */
function lastMonthYM_() {
  const tz = Session.getScriptTimeZone();
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return Utilities.formatDate(d, tz, 'yyyy-MM');
}

/**
 * 月次レポートを配信。
 * 活用ログに登場する全userId宛に、本人分の前月集計をプッシュする。
 * トリガー登録は 09_Setup.gs の setupMonthlyTrigger() で行う。
 */
function sendMonthlyReport() {
  const ym = lastMonthYM_();
  const userIds = collectUserIds_();
  userIds.forEach(function (uid) {
    const d = computeDashboard_(uid, ym);
    if (d.knowledgeCount === 0 && d.usageCount === 0) return; // 活動なしはスキップ
    linePush_(uid, formatDashboard_(d) + '\n— 今月も複利を回していきましょう。');
  });
}

/** ナレッジ・活用ログに出てくる全userIdを重複なく集める */
function collectUserIds_() {
  const set = {};
  [CONFIG.SHEET_KNOWLEDGE, CONFIG.SHEET_USAGE].forEach(function (name) {
    const data = sheet_(name).getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      const uid = data[i][2];
      if (uid) set[uid] = true;
    }
  });
  return Object.keys(set);
}
