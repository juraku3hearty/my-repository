/**
 * 06_Analytics.gs
 * 見える化（ダッシュボード集計）
 * 蓄積数・Skill数・活用回数・削減時間・削減費用を集計する。
 */

/**
 * 集計を返す。targetUserId を渡すとそのユーザーだけ、null なら全体。
 * monthYM ('2026-06') を渡すとその月のみ、null なら全期間。
 */
function computeDashboard_(targetUserId, monthYM) {
  const ssTz = Session.getScriptTimeZone();

  // ナレッジ
  const kData = sheet_(CONFIG.SHEET_KNOWLEDGE).getDataRange().getValues();
  let knowledgeCount = 0;
  const categoryCount = {};
  for (let i = 1; i < kData.length; i++) {
    const r = kData[i];
    if (targetUserId && r[2] !== targetUserId) continue;
    if (monthYM && Utilities.formatDate(new Date(r[1]), ssTz, 'yyyy-MM') !== monthYM) continue;
    knowledgeCount++;
    const cat = r[4] || '未分類';
    categoryCount[cat] = (categoryCount[cat] || 0) + 1;
  }

  // Skill 総数（全体のみ。ユーザー紐付けはナレッジ側で見る）
  const sData = sheet_(CONFIG.SHEET_SKILLS).getDataRange().getValues();
  const skillCount = Math.max(0, sData.length - 1);

  // 活用ログ
  const uData = sheet_(CONFIG.SHEET_USAGE).getDataRange().getValues();
  let usageCount = 0, savedMinutes = 0, savedYen = 0;
  const perSkillYen = {};
  for (let i = 1; i < uData.length; i++) {
    const r = uData[i];
    if (targetUserId && r[2] !== targetUserId) continue;
    if (monthYM && Utilities.formatDate(new Date(r[1]), ssTz, 'yyyy-MM') !== monthYM) continue;
    usageCount++;
    savedMinutes += Number(r[4]) || 0;
    savedYen += Number(r[5]) || 0;
    const sk = r[3] || '(無名)';
    perSkillYen[sk] = (perSkillYen[sk] || 0) + (Number(r[5]) || 0);
  }

  // 貢献度トップSkill
  const topSkills = Object.keys(perSkillYen)
    .map(function (k) { return { skill: k, yen: perSkillYen[k] }; })
    .sort(function (a, b) { return b.yen - a.yen; })
    .slice(0, 3);

  return {
    scope: targetUserId ? '個人' : '全体',
    period: monthYM || '全期間',
    knowledgeCount: knowledgeCount,
    skillCount: skillCount,
    usageCount: usageCount,
    savedMinutes: savedMinutes,
    savedHours: Math.round((savedMinutes / 60) * 10) / 10,
    savedYen: savedYen,
    categoryCount: categoryCount,
    topSkills: topSkills,
  };
}

/** ダッシュボードを人が読むテキストに整形（LINE通知用） */
function formatDashboard_(d) {
  let msg = '📊 知識の複利ループ ダッシュボード\n';
  msg += '（' + d.scope + ' / ' + d.period + '）\n\n';
  msg += '🧠 蓄積ナレッジ: ' + d.knowledgeCount + '件\n';
  msg += '🛠 生成Skill: ' + d.skillCount + '件\n';
  msg += '⚡ 活用回数: ' + d.usageCount + '回\n';
  msg += '⏱ 削減時間: ' + d.savedHours + '時間\n';
  msg += '💰 削減費用: ' + d.savedYen.toLocaleString() + '円\n';

  if (d.topSkills.length) {
    msg += '\n🏆 貢献トップSkill\n';
    d.topSkills.forEach(function (t, i) {
      msg += (i + 1) + '. ' + t.skill + '（' + t.yen.toLocaleString() + '円）\n';
    });
  }

  const cats = Object.keys(d.categoryCount);
  if (cats.length) {
    msg += '\n📁 カテゴリ内訳\n';
    cats.forEach(function (c) { msg += '・' + c + ': ' + d.categoryCount[c] + '件\n'; });
  }
  return msg;
}
