/**
 * 01_Webhook.gs — LINE Webhook の受信と振り分け
 *
 * 注意: Apps Script の doPost はリクエストヘッダーを読めないため、
 * X-Line-Signature による署名検証はできない。
 * 代わりに ALLOWED_USER_IDS による userId 許可リストで保護する。
 */

function doPost(e) {
  // LINE は 200 を素早く返すことを要求する。例外は必ず内部で握りつぶす。
  try {
    var body = JSON.parse(e.postData.contents);
    var events = body.events || [];
    for (var i = 0; i < events.length; i++) {
      try {
        handleEvent_(events[i]);
      } catch (err) {
        Logger.log('event error: ' + err.message + '\n' + err.stack);
        if (events[i] && events[i].replyToken) {
          try {
            replyText_(events[i].replyToken, '⚠️ エラーが発生しました\n' + err.message);
          } catch (_) { /* 返信失敗は無視 */ }
        }
      }
    }
  } catch (err) {
    Logger.log('doPost error: ' + err.message + '\n' + err.stack);
  }
  return ContentService.createTextOutput('OK');
}

function handleEvent_(event) {
  if (event.type !== 'message') return;

  var userId = event.source && event.source.userId;
  if (!userId) return;

  if (!isAllowedUser_(userId)) {
    replyText_(event.replyToken,
      'このアカウントからの投稿は許可されていません。\n\n' +
      'あなたのID:\n' + userId + '\n\n' +
      'このIDを管理者に伝えてください。');
    return;
  }

  // 同一ユーザーの下書きを同時に書き換えないようロックを取る
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (event.message.type === 'image') {
      handleImageMessage_(event, userId);
    } else if (event.message.type === 'text') {
      handleTextMessage_(event, userId, event.message.text);
    } else {
      replyText_(event.replyToken, '画像かテキストを送ってください。\n「ヘルプ」で使い方を表示します。');
    }
  } finally {
    lock.releaseLock();
  }
}

/** 画像メッセージ: Cloudinary にアップロードして下書きに保存 */
function handleImageMessage_(event, userId) {
  var blob = fetchLineMessageContent_(event.message.id);
  var uploaded = uploadToCloudinary_(blob);

  var draft = getDraft_(userId);
  var replaced = !!draft.imageUrl;
  draft.imageUrl = uploaded.url;
  draft.googleImageUrl = uploaded.googleUrl;
  draft.imageInfo = uploaded.width + '×' + uploaded.height;
  draft.imageWarning = uploaded.warning || '';
  saveDraft_(userId, draft);

  var msg = (replaced ? '🔄 画像を差し替えました\n' : '🖼 画像を受け取りました\n') +
            'サイズ: ' + uploaded.width + '×' + uploaded.height + '\n';
  if (uploaded.warning) msg += '\n' + uploaded.warning + '\n';

  // テキストが揃っていれば確定、まだなら待ち
  if (draft.text) {
    msg += '\n' + commitDraft_(userId, draft);
  } else {
    msg += '\n次に投稿文を送ってください。';
  }
  replyText_(event.replyToken, msg);
}

/** テキストメッセージ: コマンドか投稿文かを判定 */
function handleTextMessage_(event, userId, text) {
  var handled = handleCommand_(event, userId, text);
  if (handled) return;

  var draft = getDraft_(userId);

  // 先頭行が「10/15」形式なら投稿日として切り出す
  var parsed = extractLeadingDate_(text);
  if (parsed.dateStr) {
    draft.dateStr = parsed.dateStr;
    text = parsed.rest;
  }

  var replaced = !!draft.text;
  draft.text = text;
  saveDraft_(userId, draft);

  var msg = (replaced ? '🔄 投稿文を差し替えました\n' : '📝 投稿文を受け取りました\n') +
            '文字数: ' + text.length + '文字\n';

  if (draft.imageUrl) {
    msg += '\n' + commitDraft_(userId, draft);
  } else {
    msg += '\n次に画像を送ってください。';
  }
  replyText_(event.replyToken, msg);
}

/** 画像とテキストが揃ったのでシートへ書き込む */
function commitDraft_(userId, draft) {
  var result = appendPost_(draft.dateStr, draft.text, draft.imageUrl, draft.googleImageUrl);
  clearDraft_(userId);

  // 「やり直し」で取り消せるように控えておく
  saveLastCommit_(userId, {
    dateStr: result.dateStr,
    imageUrl: draft.imageUrl,
    text: draft.text
  });

  var msg = '✅ 登録しました\n' +
            '投稿日: ' + result.dateStr + '（' + result.weekday + '）\n' +
            '行: ' + result.row + '\n\n' +
            '画像URL:\n' + draft.imageUrl;

  if (!draft.dateStr) {
    msg += '\n\n※日付は自動割り当てです。変えたい場合はシートのA列を直接編集してください。';
  }
  if (draft.imageWarning) {
    msg += '\n\n' + draft.imageWarning;
  }

  msg += '\n\n間違えていたら「やり直し」と送ってください。';
  return msg;
}
