/**
 * ハヨヤレ — 03_Gemini
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
 * 「直して」の修正指示を解釈（内容・期限のどちらか片方でも、両方でもOK）
 * 戻り値: {task, due('yyyy-MM-dd HH:mm'|null)} / null(解釈失敗)
 */
function parseCorrection(instruction, currentTask, currentDue, now) {
  const nowStr = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy-MM-dd HH:mm (E)');
  const dueStr = currentDue ? Utilities.formatDate(currentDue, 'Asia/Tokyo', 'yyyy-MM-dd HH:mm') : 'なし';
  const prompt =
    '現在日時: ' + nowStr + '\n' +
    '登録済みタスク: 内容「' + currentTask + '」 期限「' + dueStr + '」\n' +
    'ユーザーの修正指示:「' + instruction + '」\n' +
    '修正後のタスクをJSONだけで返せ。指示に無い項目は元の値をそのまま使え。\n' +
    '形式: {"task":"内容","due":"yyyy-MM-dd HH:mm"}（期限を「なし」にする指示なら due は null）\n' +
    '過去日時になる場合は最も近い未来として解釈。';
  const res = callGemini(prompt);
  if (!res) return null;
  try {
    const m = res.match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : null;
  } catch (err) {
    return null;
  }
}

/**
 * 上司のメッセージが「自分への依頼」かをAIが判定
 * 戻り値: {is_task, task, due('yyyy-MM-dd HH:mm'|null)} / null(API失敗)
 */
function classifyBossMessage(text, now) {
  const nowStr = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy-MM-dd HH:mm (E)');
  const prompt =
    '現在日時: ' + nowStr + '\n' +
    '次のSlackメッセージは上司から部下への連絡である。JSONだけを返せ。説明は書くな。\n' +
    '依頼・指示・締切のあるタスクなら: {"is_task":true,"task":"内容を短く","due":"yyyy-MM-dd HH:mm"}\n' +
    '締切が読み取れない依頼なら due は null。\n' +
    '雑談・情報共有・返答だけで済むものなら: {"is_task":false}\n' +
    '「今日中」=本日18:00、「今週中」=金曜18:00、過去日時は最も近い未来として解釈。\n' +
    'メッセージ:「' + text + '」';
  const res = callGemini(prompt);
  if (!res) return null;
  try {
    const m = res.match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : null;
  } catch (err) {
    return null;
  }
}
