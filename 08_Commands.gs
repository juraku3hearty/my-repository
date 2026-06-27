/**
 * 08_Commands.gs
 * LINEメッセージの受信本体とコマンド解釈。
 *
 * ■ 使い方（LINEに送る言葉）
 *   ・ふつうのテキスト        → ナレッジとして蓄積し、自動でSkill化
 *   ・「使った <Skill名> <分> <円> [メモ]」 → 活用ログを記録（例: 使った invoice-reminder 30 5000 請求漏れ防止）
 *   ・「検索 <キーワード>」     → ナレッジを検索
 *   ・「一覧」                 → 直近のナレッジ
 *   ・「集計」 / 「レポート」   → 自分の見える化ダッシュボード
 *   ・「ヘルプ」               → 使い方
 */

function handleLineWebhook(body) {
  (body.events || []).forEach(function (event) {
    try {
      if (event.type !== 'message' || !event.message || event.message.type !== 'text') return;
      const userId = (event.source && event.source.userId) || '';
      const text = String(event.message.text || '').trim();
      const reply = routeCommand_(text, userId);
      lineReply_(event.replyToken, reply);
    } catch (err) {
      Logger.log('handleLineWebhook error: ' + err.message);
      lineReply_(event.replyToken, '⚠️ エラー: ' + err.message);
    }
  });
  return ContentService.createTextOutput('OK');
}

/** テキストを解釈して返信文字列を作る */
function routeCommand_(text, userId) {
  if (!text) return helpText_();

  if (/^(ヘルプ|help|使い方)$/i.test(text)) return helpText_();

  if (/^(集計|レポート|ダッシュボード|見える化)$/.test(text)) {
    return formatDashboard_(computeDashboard_(userId, null));
  }

  if (/^一覧/.test(text)) {
    const list = recentKnowledge_(8);
    return list.length ? formatList_('🧠 直近のナレッジ', list) : 'まだナレッジがありません。テキストを送ると蓄積されます。';
  }

  const mSearch = text.match(/^検索\s+(.+)$/);
  if (mSearch) {
    const hits = searchKnowledge_(mSearch[1], 8);
    return hits.length ? formatList_('🔎 「' + mSearch[1] + '」の検索結果', hits) : '該当なしでした。';
  }

  // 使った <skill> <分> <円> [メモ]
  const mUse = text.match(/^使った\s+(\S+)\s+(\d+)\s+(\d+)(?:\s+(.+))?$/);
  if (mUse) {
    addUsage_({
      userId: userId,
      skillName: mUse[1],
      savedMinutes: mUse[2],
      savedYen: mUse[3],
      note: mUse[4] || '',
    });
    return '⚡ 活用を記録しました。\nSkill: ' + mUse[1] + '\n削減: ' + mUse[2] + '分 / ' + Number(mUse[3]).toLocaleString() + '円\n\n「集計」で累計の見える化が見られます。';
  }

  // それ以外 → ナレッジ蓄積 + Skill自動生成
  return ingestKnowledge_(text, userId);
}

/** ナレッジ取り込みの本体 */
function ingestKnowledge_(text, userId) {
  if (CONFIG.FREE_PLAN_LIMIT > 0 && countKnowledgeByUser_(userId) >= CONFIG.FREE_PLAN_LIMIT) {
    return '⚠️ 無料プランの上限（' + CONFIG.FREE_PLAN_LIMIT + '件）に達しました。';
  }

  const sourceUrl = (text.match(/https?:\/\/\S+/) || [''])[0];
  const gen = generateSkill_(text, sourceUrl);

  const knowledgeId = addKnowledge_({
    userId: userId,
    title: gen.title,
    category: gen.category,
    tags: gen.tags,
    sourceUrl: sourceUrl,
    rawText: text,
    summary: gen.summary,
    skillName: gen.skillName,
    status: '生成済み',
  });

  saveSkill_({
    name: gen.skillName,
    description: gen.description,
    markdown: gen.markdown,
    knowledgeId: knowledgeId,
  });

  return '✅ ナレッジを蓄積し、Skillを生成しました\n\n' +
    '📌 ' + gen.title + '\n' +
    '📁 カテゴリ: ' + gen.category + '\n' +
    '🏷 タグ: ' + (gen.tags.join(' / ') || 'なし') + '\n' +
    '🛠 Skill名: ' + gen.skillName + '\n' +
    '📝 ' + gen.summary + '\n\n' +
    'このSkillを業務で使ったら\n「使った ' + gen.skillName + ' 30 5000」\nのように記録すると削減効果が見える化されます。';
}

function formatList_(title, list) {
  let msg = title + '\n';
  list.forEach(function (it, i) {
    msg += '\n' + (i + 1) + '. ' + it.title + '\n   📁' + (it.category || '-') + '  🛠' + (it.skillName || '-');
  });
  return msg;
}

function helpText_() {
  return '🤖 AI Skill Curator の使い方\n\n' +
    '① 蓄積：知見テキストをそのまま送る\n' +
    '  → 自動でClaude用Skillに変換して保存\n\n' +
    '② 活用：使った <Skill名> <分> <円> [メモ]\n' +
    '  例) 使った invoice-reminder 30 5000\n\n' +
    '③ 検索：検索 <キーワード>\n' +
    '④ 一覧：一覧\n' +
    '⑤ 見える化：集計\n\n' +
    '送るほど「知識の複利ループ」が回ります。';
}
