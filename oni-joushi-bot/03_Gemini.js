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
        generationConfig: { temperature: 1.0, maxOutputTokens: 300 }
      }),
      muteHttpExceptions: true
    });
    if (res.getResponseCode() !== 200) return null;
    const json = JSON.parse(res.getContentText());
    const text = json.candidates &&
      json.candidates[0] &&
      json.candidates[0].content &&
      json.candidates[0].content.parts &&
      json.candidates[0].content.parts[0].text;
    return text ? text.trim() : null;
  } catch (err) {
    console.warn('Gemini呼び出し失敗: ' + err);
    return null;
  }
}
