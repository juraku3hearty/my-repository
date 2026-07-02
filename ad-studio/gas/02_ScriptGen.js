/**
 * 台本生成 — LLMでA/B/C 3バリアントを一括生成して「台本」シートに書き込む。
 * 使うLLMは設定シート「台本LLM」で切替(gemini / claude)。デフォルトはGemini(無料枠)。
 * Claudeを使う場合はスクリプトプロパティ ANTHROPIC_API_KEY を設定する。
 * メニューまたは generateScripts('肩こりの30〜50代女性', '骨盤矯正の初回割引') のように実行。
 */
function generateScriptsFromMenu() {
  const ui = SpreadsheetApp.getUi();
  const category = ui.prompt('カテゴリは?(事業カテゴリシート参照。例: 脱毛 / 整体 / 睡眠)').getResponseText();
  if (!category) return;
  const target = ui.prompt('ターゲット層は?(例: 産後の骨盤が気になる30代ママ)').getResponseText();
  if (!target) return;
  const appeal = ui.prompt('訴求ポイントは?(空欄=カテゴリの「強み」を使用)').getResponseText();
  const ids = generateScripts(category, target, appeal);
  ui.alert('台本を' + ids.length + '本生成しました: ' + ids.join(', '));
}

function generateScripts(category, target, appeal) {
  const duration = Number(getSetting_('動画の長さ(秒)', 90));
  const cat = getCategory_(category);
  // 名乗り: カテゴリ側の指定を優先(分院・店名未定などに対応)。空なら設定シートの院名
  const clinicName = cat.brandName || getSetting_('院名', '当院');
  const effectiveAppeal = appeal || cat.strengths;
  const voices = getVoiceList_();

  const voiceSection = voices.length
    ? [
        '',
        '# 使えるナレーションボイス一覧(この中からターゲットに最適な声を各台本ごとに1つ選ぶ)',
      ].concat(voices.map(function(v) {
        return '- ' + v.name + '(' + v.gender + ' / ' + v.tone + ')';
      }))
    : [];

  const prompt = [
    'あなたは整骨院・サロン専門の広告動画ディレクターです。',
    'SNS縦型動画広告(' + duration + '秒)のナレーション台本を3パターン作成してください。',
    '',
    '# 事業カテゴリ: ' + cat.name,
    '- サービス内容: ' + cat.desc,
    '- このカテゴリのNG表現・注意点(必ず守る): ' + cat.ng,
    '',
    '# この広告の方針(最優先)',
    '- ' + (cat.policy || getSetting_('広告の方針', 'ターゲットに響く自然な構成にする')),
    '',
    '# 条件',
    '- 院名: ' + clinicName,
    '- ターゲット: ' + target,
    '- 訴求ポイント: ' + effectiveAppeal,
    '- ナレーションは音声合成(スタッフの声のクローン)で読み上げるため、話し言葉として自然で、読み間違えにくい表現にする',
    '- 数字を含む固有名詞・商品名(例: 24時間◯◯システム)はナレーションでは読み上げが不自然になりやすいので、「朝も昼も寝ているあいだも」のような自然な言い換えにする(正式名称は字幕で見せる前提)',
    '- 医療広告ガイドラインに配慮し、効果の断定(「必ず治る」等)や誇大表現は使わない',
    '- 3パターンは切り口を変える: A=共感型(悩みに寄り添う) / B=実績・信頼型 / C=オファー型(特典訴求)',
  ].concat(voiceSection).concat([
    '',
    '# フック映像シーン',
    '各台本の冒頭(フック)には、ターゲットの悩みを再現する演技シーンをAI動画で生成して使う。',
    'そのための動画生成プロンプトを hook_scene として英語で書くこと。',
    '条件: 日本人の人物、縦型(9:16)構図、5秒で伝わる1シーン、院内や施術は含めない(実写を使うため)。',
    '例: "Japanese man in his 30s looking at his beard in the bathroom mirror with a troubled expression, morning light, vertical composition"',
    '',
    '# 出力形式(JSONのみ、コードブロック不要)',
    '{"scripts":[{"variant":"A","hook":"冒頭2秒のつかみ一文","body":"本文ナレーション","cta":"締めの行動喚起一文",' +
    '"hook_scene":"フック用AI動画生成プロンプト(英語)",' +
    '"recommended_voice":"ボイス一覧から選んだ名前(一覧が無ければ空文字)","voice_reason":"その声を選んだ理由(一覧が無ければ空文字)"}, ...]}',
  ]).join('\n');

  const scripts = callLlm_(prompt);

  const sheet = ADS.sheet(ADS.SHEETS.SCRIPTS);
  const today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  const ids = [];
  scripts.forEach(function(p) {
    const id = newId_('SC') + '-' + p.variant;
    const voice = findVoiceByName_(voices, p.recommended_voice);
    const voiceNote = voice ? voice.name + ' — ' + (p.voice_reason || '') : '';
    sheet.appendRow([
      id, today, target, effectiveAppeal, p.hook, p.body, p.cta, duration, '未使用', cat.name,
      voice ? voice.id : '', voiceNote, p.hook_scene || '',
    ]);
    ids.push(id);
  });
  return ids;
}

/** ボイス一覧シートを読む */
function getVoiceList_() {
  const sh = ADS.ss().getSheetByName(ADS.SHEETS.VOICES);
  if (!sh) return [];
  return sh.getDataRange().getValues().slice(1)
    .filter(function(r) { return r[0]; })
    .map(function(r) {
      return { id: String(r[0]).trim(), name: String(r[1] || r[0]).trim(), gender: r[2] || '', tone: r[3] || '' };
    });
}

function findVoiceByName_(voices, name) {
  if (!name) return null;
  const n = String(name).trim();
  for (let i = 0; i < voices.length; i++) {
    if (voices[i].name === n || voices[i].id === n) return voices[i];
  }
  return null;
}

/** 事業カテゴリシートから1行引く */
function getCategory_(name) {
  const values = ADS.sheet(ADS.SHEETS.CATEGORIES).getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]).trim() === String(name).trim()) {
      return {
        name: values[i][0],
        desc: values[i][1] || '',
        strengths: values[i][2] || '',
        ng: values[i][3] || '特になし',
        voiceId: values[i][4] || '',
        policy: values[i][5] || '',
        brandName: values[i][6] || '',
      };
    }
  }
  const available = values.slice(1).map(function(r) { return r[0]; }).filter(Boolean).join(' / ');
  throw new Error('カテゴリ「' + name + '」が事業カテゴリシートにありません。登録済み: ' + available);
}

/**
 * LLMアダプタ — 設定シート「台本LLM」で切替。
 * 戻り値: [{variant, hook, body, cta}, ...]
 */
function callLlm_(prompt) {
  const provider = String(getSetting_('台本LLM', 'gemini')).toLowerCase();
  if (provider === 'claude') return callClaude_(prompt);
  return callGemini_(prompt);
}

// ---- Gemini(デフォルト・無料枠) ----
function callGemini_(prompt) {
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
    ADS.GEMINI_MODEL + ':generateContent?key=' + ADS.get('GEMINI_API_KEY');
  const res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.9, responseMimeType: 'application/json' },
    }),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) {
    throw new Error('Gemini APIエラー: ' + res.getContentText().slice(0, 300));
  }
  const text = JSON.parse(res.getContentText()).candidates[0].content.parts[0].text;
  const parsed = JSON.parse(text.replace(/^```json\s*/i, '').replace(/```\s*$/, ''));
  return Array.isArray(parsed) ? parsed : parsed.scripts;
}

// ---- Claude(高品質・従量課金) ----
const CLAUDE_MODEL = 'claude-opus-4-8';

const CLAUDE_SCRIPT_SCHEMA = {
  type: 'object',
  properties: {
    scripts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          variant: { type: 'string', enum: ['A', 'B', 'C'] },
          hook: { type: 'string' },
          body: { type: 'string' },
          cta: { type: 'string' },
          hook_scene: { type: 'string' },
          recommended_voice: { type: 'string' },
          voice_reason: { type: 'string' },
        },
        required: ['variant', 'hook', 'body', 'cta', 'hook_scene', 'recommended_voice', 'voice_reason'],
        additionalProperties: false,
      },
    },
  },
  required: ['scripts'],
  additionalProperties: false,
};

function callClaude_(prompt) {
  const res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-api-key': ADS.get('ANTHROPIC_API_KEY'),
      'anthropic-version': '2023-06-01',
    },
    payload: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 16000,
      // structured outputs: スキーマ通りのJSONが保証される
      output_config: { format: { type: 'json_schema', schema: CLAUDE_SCRIPT_SCHEMA } },
      messages: [{ role: 'user', content: prompt }],
    }),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) {
    throw new Error('Claude APIエラー: ' + res.getContentText().slice(0, 300));
  }
  const data = JSON.parse(res.getContentText());
  if (data.stop_reason === 'refusal') {
    throw new Error('Claudeが生成を拒否しました。台本の訴求内容を見直してください');
  }
  const text = data.content
    .filter(function(b) { return b.type === 'text'; })
    .map(function(b) { return b.text; })
    .join('');
  return JSON.parse(text).scripts;
}
