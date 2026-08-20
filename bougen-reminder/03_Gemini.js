/**
 * 暴言リマインダー — 03_Gemini
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

/**
 * 自然文から日時とタスクを抽出（「明日15時 銀行」「8/15 請求書送る」等なんでも）
 * 戻り値: {datetime: 'yyyy-MM-dd HH:mm', task: '...'} / {error: '...'} / null(API死亡)
 */
function parseReminderText(text, now) {
  const nowStr = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy-MM-dd HH:mm (E)');
  const prompt =
    '現在日時: ' + nowStr + '\n' +
    '次の日本語からリマインドの日時と内容を抽出し、JSONだけを返せ。説明文は書くな。\n' +
    '成功: {"datetime":"yyyy-MM-dd HH:mm","task":"内容"}\n' +
    '抽出不能: {"error":"理由"}\n' +
    'ルール: 時刻の指定が無ければ09:00。過去になる場合は最も近い未来として解釈。\n' +
    '入力:「' + text + '」';
  const res = callGemini(prompt);
  if (!res) return null;
  try {
    const m = res.match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : null;
  } catch (err) {
    return null;
  }
}
