/**
 * gas_main.js
 * Webhookルーター（doPostはプロジェクト内で1つだけ）
 *
 * 旧バージョンにあったアクセストークン直書き(CONFIG)は廃止。
 * 秘密情報はすべて 00_Config.gs 経由でスクリプトプロパティから読む。
 * handleLineWebhook の本体は 08_Commands.gs に実装。
 */

function doPost(e) {
  try {
    let body = {};
    if (e && e.postData && e.postData.contents) {
      try { body = JSON.parse(e.postData.contents); } catch (_) { body = {}; }
    }

    // LINE Messaging API
    if (body.destination && Array.isArray(body.events) && typeof handleLineWebhook === 'function') {
      return handleLineWebhook(body);
    }
  } catch (err) {
    Logger.log('doPost error: ' + err.message);
  }
  return ContentService.createTextOutput('OK');
}

/** ヘルスチェック用 */
function doGet() {
  return ContentService.createTextOutput('AI Skill Curator: OK');
}
