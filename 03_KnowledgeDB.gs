/**
 * 03_KnowledgeDB.gs
 * ナレッジDB / Skill / 活用ログ シートのCRUD
 *
 * ■ ナレッジDB 列構成
 *   A:id  B:作成日時  C:LINE_userId  D:タイトル  E:カテゴリ
 *   F:タグ(カンマ区切り)  G:ソースURL  H:元テキスト  I:要約  J:Skill名  K:状態
 *
 * ■ Skill 列構成
 *   A:Skill名  B:説明  C:SKILL.md本文  D:作成日時  E:元ナレッジid
 *
 * ■ 活用ログ 列構成
 *   A:id  B:日時  C:LINE_userId  D:Skill名  E:削減分  F:削減円  G:メモ
 */

function sheet_(name) {
  const ss = getSpreadsheet_();
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  return sh;
}

function newId_(prefix) {
  // タイムスタンプ + 乱数。Date.now相当はGAS上で利用可。
  return prefix + '_' + new Date().getTime().toString(36) + Math.floor(Math.random() * 1e4);
}

/** ナレッジ1件を追加して id を返す */
function addKnowledge_(rec) {
  const sh = sheet_(CONFIG.SHEET_KNOWLEDGE);
  const id = newId_('K');
  sh.appendRow([
    id,
    new Date(),
    rec.userId || '',
    rec.title || '',
    rec.category || '',
    (rec.tags || []).join(','),
    rec.sourceUrl || '',
    rec.rawText || '',
    rec.summary || '',
    rec.skillName || '',
    rec.status || '生成済み',
  ]);
  return id;
}

/** Skill1件を保存（同名があれば上書き） */
function saveSkill_(skill) {
  const sh = sheet_(CONFIG.SHEET_SKILLS);
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === skill.name) {
      sh.getRange(i + 1, 1, 1, 5).setValues([[
        skill.name, skill.description, skill.markdown, new Date(), skill.knowledgeId || '',
      ]]);
      return;
    }
  }
  sh.appendRow([skill.name, skill.description, skill.markdown, new Date(), skill.knowledgeId || '']);
}

/** 活用ログ1件を追加 */
function addUsage_(rec) {
  const sh = sheet_(CONFIG.SHEET_USAGE);
  sh.appendRow([
    newId_('U'),
    new Date(),
    rec.userId || '',
    rec.skillName || '',
    Number(rec.savedMinutes) || 0,
    Number(rec.savedYen) || 0,
    rec.note || '',
  ]);
}

/** キーワード検索（タイトル/タグ/要約/本文を対象）。最大n件 */
function searchKnowledge_(keyword, n) {
  const sh = sheet_(CONFIG.SHEET_KNOWLEDGE);
  const data = sh.getDataRange().getValues();
  const kw = String(keyword).toLowerCase();
  const hits = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const hay = (row[3] + ' ' + row[4] + ' ' + row[5] + ' ' + row[8] + ' ' + row[7]).toLowerCase();
    if (hay.indexOf(kw) !== -1) {
      hits.push({ id: row[0], title: row[3], category: row[4], tags: row[5], skillName: row[9] });
    }
  }
  return hits.slice(-(n || 5)).reverse();
}

/** 直近n件 */
function recentKnowledge_(n) {
  const sh = sheet_(CONFIG.SHEET_KNOWLEDGE);
  const data = sh.getDataRange().getValues();
  const rows = data.slice(1).slice(-(n || 5)).reverse();
  return rows.map(function (r) {
    return { id: r[0], title: r[3], category: r[4], tags: r[5], skillName: r[9] };
  });
}

/** ユーザーの登録件数（無料プラン判定用） */
function countKnowledgeByUser_(userId) {
  const sh = sheet_(CONFIG.SHEET_KNOWLEDGE);
  const data = sh.getDataRange().getValues();
  let c = 0;
  for (let i = 1; i < data.length; i++) if (data[i][2] === userId) c++;
  return c;
}
