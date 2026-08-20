/**
 * 鬼上司Bot — 03_Gemini
 * 説教文の生成。失敗したら null を返し、呼び出し側が固定セリフにフォールバックする
 */
function callGemini(prompt) {
  const key = PROPS.getProperty('GEMINI_API_KEY');
  if (!key) return null;
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
    GEMINI_MODEL + ':generateContent?key=' + key;
  try {
    const res = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 1.0, maxOutputTokens: 4096 }
      }),
      muteHttpExceptions: true
    });
    if (res.getResponseCode() !== 200) return null;
    const json = JSON.parse(res.getContentText());
    const cand = json.candidates && json.candidates[0];
    // 思考トークンで上限に達して本文が途切れた場合は、中途半端な文を出さず固定セリフへ
    if (!cand || cand.finishReason === 'MAX_TOKENS') return null;
    const parts = (cand.content && cand.content.parts) || [];
    const text = parts.filter(p => p.text).map(p => p.text).join('');
    return text ? text.trim() : null;
  } catch (err) {
    console.warn('Gemini呼び出し失敗: ' + err);
    return null;
  }
}
