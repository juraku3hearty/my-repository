/**
 * 台本生成 — Gemini でA/B/C 3バリアントを一括生成して「台本」シートに書き込む。
 * メニューまたは generateScripts('肩こりの30〜50代女性', '骨盤矯正の初回割引') のように実行。
 */
function generateScriptsFromMenu() {
  const ui = SpreadsheetApp.getUi();
  const target = ui.prompt('ターゲット層は?(例: 産後の骨盤が気になる30代ママ)').getResponseText();
  if (!target) return;
  const appeal = ui.prompt('訴求ポイントは?(例: 国家資格者による骨盤矯正・初回2980円)').getResponseText();
  if (!appeal) return;
  const ids = generateScripts(target, appeal);
  ui.alert('台本を' + ids.length + '本生成しました: ' + ids.join(', '));
}

function generateScripts(target, appeal) {
  const clinicName = getSetting_('院名', '当院');
  const duration = Number(getSetting_('動画の長さ(秒)', 30));

  const prompt = [
    'あなたは整骨院専門の広告動画ディレクターです。',
    'SNS縦型動画広告(' + duration + '秒)のナレーション台本を3パターン作成してください。',
    '',
    '# 条件',
    '- 院名: ' + clinicName,
    '- ターゲット: ' + target,
    '- 訴求ポイント: ' + appeal,
    '- ナレーションは音声合成(スタッフの声のクローン)で読み上げるため、話し言葉として自然で、読み間違えにくい表現にする',
    '- 数字・固有名詞はひらがな/カタカナ交じりでも読み上げが自然になる表記にする',
    '- 医療広告ガイドラインに配慮し、効果の断定(「必ず治る」等)や誇大表現は使わない',
    '- 3パターンは切り口を変える: A=共感型(悩みに寄り添う) / B=実績・信頼型 / C=オファー型(特典訴求)',
    '',
    '# 出力形式(JSONのみ、コードブロック不要)',
    '[{"variant":"A","hook":"冒頭2秒のつかみ一文","body":"本文ナレーション","cta":"締めの行動喚起一文"}, ...]',
  ].join('\n');

  const parsed = callGemini_(prompt);

  const sheet = ADS.sheet(ADS.SHEETS.SCRIPTS);
  const today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  const ids = [];
  parsed.forEach(function(p) {
    const id = newId_('SC') + '-' + p.variant;
    sheet.appendRow([id, today, target, appeal, p.hook, p.body, p.cta, duration, '未使用']);
    ids.push(id);
  });
  return ids;
}

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
  return JSON.parse(text.replace(/^```json\s*/i, '').replace(/```\s*$/, ''));
}
