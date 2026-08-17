/**
 * 鬼頭ゲート — 01_OAuth
 * X API v2 用の OAuth 1.0a 署名（ユーザーコンテキスト）
 * ライブラリ不要・GAS標準機能のみで実装
 */
function rfc3986_(s) {
  return encodeURIComponent(s)
    .replace(/!/g, '%21')
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/\*/g, '%2A');
}

/**
 * OAuth 1.0a の Authorization ヘッダーを作る
 * @param method 'GET' | 'POST'
 * @param baseUrl クエリを含まないURL
 * @param queryParams GETのクエリ（署名に含める）。POST(JSON)なら {} でよい
 */
function oauthHeader_(method, baseUrl, queryParams) {
  const oauth = {
    oauth_consumer_key: PROPS.getProperty('X_CONSUMER_KEY'),
    oauth_nonce: Utilities.getUuid().replace(/-/g, ''),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_token: PROPS.getProperty('X_ACCESS_TOKEN'),
    oauth_version: '1.0'
  };
  const all = {};
  Object.keys(oauth).forEach(k => { all[k] = oauth[k]; });
  Object.keys(queryParams || {}).forEach(k => { all[k] = String(queryParams[k]); });

  const paramStr = Object.keys(all).sort()
    .map(k => rfc3986_(k) + '=' + rfc3986_(all[k]))
    .join('&');
  const base = [method.toUpperCase(), rfc3986_(baseUrl), rfc3986_(paramStr)].join('&');
  const signKey = rfc3986_(PROPS.getProperty('X_CONSUMER_SECRET')) + '&' +
    rfc3986_(PROPS.getProperty('X_ACCESS_TOKEN_SECRET'));
  oauth.oauth_signature = Utilities.base64Encode(
    Utilities.computeHmacSignature(Utilities.MacAlgorithm.HMAC_SHA_1, base, signKey)
  );

  return 'OAuth ' + Object.keys(oauth).sort()
    .map(k => rfc3986_(k) + '="' + rfc3986_(oauth[k]) + '"')
    .join(', ');
}

/** 署名付きGET */
function xGet_(path, queryParams) {
  const baseUrl = X_API_BASE + path;
  const qs = Object.keys(queryParams || {})
    .map(k => encodeURIComponent(k) + '=' + encodeURIComponent(queryParams[k]))
    .join('&');
  const res = UrlFetchApp.fetch(baseUrl + (qs ? '?' + qs : ''), {
    method: 'get',
    headers: { Authorization: oauthHeader_('GET', baseUrl, queryParams) },
    muteHttpExceptions: true
  });
  return { code: res.getResponseCode(), body: JSON.parse(res.getContentText() || '{}') };
}

/** 署名付きPOST（JSONボディ） */
function xPost_(path, jsonBody) {
  const baseUrl = X_API_BASE + path;
  const res = UrlFetchApp.fetch(baseUrl, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(jsonBody),
    headers: { Authorization: oauthHeader_('POST', baseUrl, {}) },
    muteHttpExceptions: true
  });
  return { code: res.getResponseCode(), body: JSON.parse(res.getContentText() || '{}') };
}
