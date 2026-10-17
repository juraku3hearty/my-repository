/**
 * 11_XClaude.js
 * GASからClaude APIを呼ぶ（UrlFetchApp。GASはSDKが使えないので素のHTTP）
 */

/**
 * Messages API を1回呼ぶ。
 * @param {Object} opt { system, userText, maxTokens, effort }
 * @return {string} 本文テキスト
 */
function xClaude_(opt) {
  var key = xConfig_().apiKey;
  if (!key) throw new Error('スクリプトプロパティ ANTHROPIC_API_KEY が未設定です。');

  var body = {
    model: X_MODEL,
    max_tokens: opt.maxTokens || 8000,
    // Opus 5.5 は thinking を切れない。深さは effort で調整する。
    // （budget_tokens や thinking:disabled を送ると 400 になる）
    output_config: { effort: opt.effort || 'medium' },
    messages: [{ role: 'user', content: opt.userText }]
  };
  if (opt.system) body.system = opt.system;

  var res = xFetchWithRetry_('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01'
    },
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });

  var code = res.getResponseCode();
  var text = res.getContentText();

  if (code !== 200) {
    throw new Error('Claude API エラー (' + code + '): ' + text.slice(0, 500));
  }

  var json = JSON.parse(text);

  if (json.stop_reason === 'refusal') {
    throw new Error('リクエストが拒否されました: ' +
      ((json.stop_details && json.stop_details.explanation) || ''));
  }

  // thinking ブロックは既定で空。text ブロックだけ拾う。
  var out = (json.content || [])
    .filter(function (b) { return b.type === 'text'; })
    .map(function (b) { return b.text; })
    .join('\n');

  if (json.stop_reason === 'max_tokens') {
    Logger.log('警告: max_tokens に達しました。出力が途中で切れている可能性があります。');
  }
  return out;
}

/** 429 / 5xx は待って再試行する */
function xFetchWithRetry_(url, params) {
  var waits = [2000, 4000, 8000, 16000];
  var res;
  for (var i = 0; i <= waits.length; i++) {
    res = UrlFetchApp.fetch(url, params);
    var code = res.getResponseCode();
    if (code !== 429 && code < 500) return res;
    if (i < waits.length) Utilities.sleep(waits[i]);
  }
  return res;
}

/**
 * 返答からJSONを取り出す。コードフェンスが付いていても剥がす。
 */
function xParseJson_(text) {
  var s = String(text || '').trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  var start = s.search(/[\[{]/);
  if (start > 0) s = s.slice(start);
  var lastBrace = Math.max(s.lastIndexOf('}'), s.lastIndexOf(']'));
  if (lastBrace >= 0) s = s.slice(0, lastBrace + 1);
  try {
    return JSON.parse(s);
  } catch (e) {
    throw new Error('AIの返答をJSONとして読めませんでした。先頭200字: ' + s.slice(0, 200));
  }
}
