/**
 * 11_XClaude.js
 * GASからClaude APIを呼ぶ（UrlFetchApp。GASはSDKが使えないので素のHTTP）
 */

var X_API_URL = 'https://api.anthropic.com/v1/messages';

/**
 * Messages API を1回呼ぶ。
 * @param {Object} opt { system, userText, maxTokens, effort }
 * @return {string} 本文テキスト
 */
function xClaude_(opt) {
  var key = xConfig_().apiKey;
  if (!key) throw new Error('スクリプトプロパティ ANTHROPIC_API_KEY が未設定です。');

  var res = xFetchWithRetry_(X_API_URL, xClaudeParams_(opt, key));
  var r = xClaudeResult_(res.getResponseCode(), res.getContentText());
  if (!r.ok) throw new Error(r.error);
  return r.text;
}

/**
 * Messages API を「同時に」何回も呼ぶ。
 *
 * 1本ずつ順番に待つと、1回1〜2分 × 回数ぶんかかって6分制限に当たる。
 * UrlFetchApp.fetchAll は並列に投げるので、全体が「いちばん遅い1回」で終わる。
 *
 * @param {Array<Object>} reqs xClaude_ と同じ形の配列
 * @return {Array<Object>} 各要素 {ok:true, text} または {ok:false, error}
 */
function xClaudeBatch_(reqs) {
  var key = xConfig_().apiKey;
  if (!key) throw new Error('スクリプトプロパティ ANTHROPIC_API_KEY が未設定です。');
  if (!reqs || !reqs.length) return [];

  var out = reqs.map(function () { return null; });
  var pending = reqs.map(function (_, i) { return i; });
  var waits = [2000, 4000, 8000, 16000];

  for (var attempt = 0; attempt <= waits.length && pending.length; attempt++) {
    var params = pending.map(function (i) { return xClaudeParams_(reqs[i], key); });

    var res;
    try {
      res = UrlFetchApp.fetchAll(params);
    } catch (e) {
      // 通信そのものが落ちた場合は、待って全部を投げ直す
      if (attempt < waits.length) { Utilities.sleep(waits[attempt]); continue; }
      pending.forEach(function (i) { out[i] = { ok: false, error: e.message }; });
      return out;
    }

    var retry = [];
    for (var k = 0; k < pending.length; k++) {
      var idx = pending[k];
      var code = res[k].getResponseCode();
      if (code === 429 || code >= 500) { retry.push(idx); continue; }
      out[idx] = xClaudeResult_(code, res[k].getContentText());
    }

    pending = retry;
    if (pending.length && attempt < waits.length) Utilities.sleep(waits[attempt]);
  }

  pending.forEach(function (i) {
    out[i] = { ok: false, error: 'APIが混み合っています（429/5xx）。しばらく待ってやり直してください。' };
  });
  return out;
}

/** fetch / fetchAll に渡すパラメータを作る */
function xClaudeParams_(opt, key) {
  var body = {
    model: X_MODEL,
    max_tokens: opt.maxTokens || 8000,
    // Opus 5.5 は thinking を切れない。深さは effort で調整する。
    // （budget_tokens や thinking:disabled を送ると 400 になる）
    output_config: { effort: opt.effort || 'medium' },
    messages: [{ role: 'user', content: opt.userText }]
  };
  if (opt.system) body.system = opt.system;

  return {
    url: X_API_URL,
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01'
    },
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  };
}

/** 応答を {ok, text} / {ok, error} に直す */
function xClaudeResult_(code, text) {
  if (code !== 200) {
    return { ok: false, error: 'Claude API エラー (' + code + '): ' + String(text).slice(0, 500) };
  }

  var json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: '応答をJSONとして読めませんでした: ' + String(text).slice(0, 200) };
  }

  if (json.stop_reason === 'refusal') {
    return {
      ok: false,
      error: 'リクエストが拒否されました: ' +
        ((json.stop_details && json.stop_details.explanation) || '')
    };
  }

  // thinking ブロックは既定で空。text ブロックだけ拾う。
  var out = (json.content || [])
    .filter(function (b) { return b.type === 'text'; })
    .map(function (b) { return b.text; })
    .join('\n');

  if (json.stop_reason === 'max_tokens') {
    Logger.log('警告: max_tokens に達しました。出力が途中で切れている可能性があります。');
  }
  return { ok: true, text: out };
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
