/**
 * 04_SkillGenerator.gs
 * 投げ込まれたテキストを Gemini で構造化し、Claude公式Skill(SKILL.md) を生成する
 */

/**
 * 生テキスト → 構造化 + Skill本文
 * @return {{title,category,tags:string[],summary,skillName,description,markdown}}
 */
function generateSkill_(rawText, sourceUrl) {
  const prompt =
    'あなたはナレッジ整理の専門家です。以下のテキストを、Claude用の再利用可能な「Skill」に変換します。\n' +
    '必ず次のJSONだけを返してください（前後の説明・コードフェンス禁止）。\n' +
    '{\n' +
    '  "title": "20字以内の日本語タイトル",\n' +
    '  "category": "業務カテゴリ（例: 営業, 経理, 接客, マーケ, 開発, 院内業務 など1語）",\n' +
    '  "tags": ["タグ", "最大5個"],\n' +
    '  "summary": "60字以内の日本語要約",\n' +
    '  "skillName": "英小文字とハイフンのみのスキルID（例: invoice-reminder）",\n' +
    '  "description": "このSkillをいつ使うかの説明。1文",\n' +
    '  "skillBody": "Claude向けの手順本文。Markdown。具体的な手順・チェックリスト・注意点を含める"\n' +
    '}\n\n' +
    '--- 入力テキスト ---\n' + rawText;

  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
    CONFIG.GEMINI_MODEL + ':generateContent?key=' + getGeminiKey_();

  const res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.4, responseMimeType: 'application/json' },
    }),
    muteHttpExceptions: true,
  });

  let parsed;
  try {
    const json = JSON.parse(res.getContentText());
    const text = json.candidates[0].content.parts[0].text;
    parsed = JSON.parse(text);
  } catch (e) {
    // Geminiが失敗してもナレッジ自体は残せるよう、最低限の形に落とす
    parsed = {
      title: rawText.slice(0, 20),
      category: '未分類',
      tags: [],
      summary: rawText.slice(0, 60),
      skillName: 'note-' + new Date().getTime().toString(36),
      description: 'メモから自動生成（構造化失敗）',
      skillBody: rawText,
    };
  }

  const skillName = sanitizeSkillName_(parsed.skillName);
  const markdown = buildSkillMd_(skillName, parsed.description, parsed.skillBody, sourceUrl);

  return {
    title: parsed.title,
    category: parsed.category || '未分類',
    tags: Array.isArray(parsed.tags) ? parsed.tags : [],
    summary: parsed.summary || '',
    skillName: skillName,
    description: parsed.description || '',
    markdown: markdown,
  };
}

function sanitizeSkillName_(name) {
  const s = String(name || 'skill').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return s || ('skill-' + new Date().getTime().toString(36));
}

/** Claude公式Skillの SKILL.md 形式（YAMLフロントマター + 本文） */
function buildSkillMd_(name, description, body, sourceUrl) {
  const fm = '---\n' +
    'name: ' + name + '\n' +
    'description: ' + (description || '').replace(/\n/g, ' ') + '\n' +
    '---\n\n';
  let md = fm + (body || '');
  if (sourceUrl) md += '\n\n---\n出典: ' + sourceUrl + '\n';
  return md;
}
