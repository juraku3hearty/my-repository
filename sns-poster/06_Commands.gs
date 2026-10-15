/**
 * 06_Commands.gs — テキストコマンドの処理
 *
 * 投稿本文を誤ってコマンド扱いしないよう、完全一致（または「日付 」始まり）
 * のみをコマンドとして受け付ける。
 */

var HELP_TEXT = [
  '📖 使い方',
  '',
  '【基本】',
  '画像を送る → 投稿文を送る',
  'この2つが揃うと自動でシートに登録されます。',
  '（順番はどちらが先でもOK）',
  '',
  '【投稿日を指定する】',
  '投稿文の1行目に日付だけを書く:',
  '　10/15',
  '　今日は寒暖差について…',
  '',
  'または先に日付だけ送る:',
  '　日付 10/15',
  '',
  '日付を書かない場合は',
  '「シート最終日 + ' + CONFIG.DEFAULT_INTERVAL_DAYS + '日」に自動割り当てされます。',
  '',
  '【コマンド】',
  'やり直し … 直前に登録した投稿を取り消す',
  '確認 … 今の下書きを表示',
  '取消 … 下書きを破棄（まだ登録前のもの）',
  '一覧 … 今日以降の予約投稿を表示',
  'ID　 … 自分のLINE IDを表示',
  'ヘルプ … この説明'
].join('\n');

/**
 * コマンドとして処理できたら true を返す。
 * @return {boolean}
 */
function handleCommand_(event, userId, text) {
  var t = String(text).trim();

  if (t === 'ヘルプ' || t === 'help' || t === '使い方') {
    replyText_(event.replyToken, HELP_TEXT);
    return true;
  }

  if (t === '確認' || t === '下書き') {
    replyText_(event.replyToken, describeDraft_(getDraft_(userId)));
    return true;
  }

  // 直前に登録した投稿を取り消す。登録済みの行をシートから削除する
  if (t === 'やり直し' || t === 'やりなおし' || t === '取り消し') {
    replyText_(event.replyToken, undoLastCommit_(userId));
    return true;
  }

  if (t === '取消' || t === 'キャンセル' || t === 'リセット') {
    clearDraft_(userId);
    replyText_(event.replyToken, '🗑 下書きを破棄しました。');
    return true;
  }

  if (t === '一覧' || t === '予約' || t === 'リスト') {
    replyText_(event.replyToken, describeUpcoming_(10));
    return true;
  }

  if (t === 'ID' || t === 'id' || t === '自分のID') {
    replyText_(event.replyToken, 'あなたのLINE IDです:\n' + userId);
    return true;
  }

  // 「日付 10/15」形式
  var m = t.match(/^日付[\s　]*(.+)$/);
  if (m) {
    var d = parseDateStr_(m[1].trim());
    if (!d) {
      replyText_(event.replyToken,
        '日付を解釈できませんでした: ' + m[1] + '\n' +
        '「日付 10/15」「日付 2026/10/15」の形式で送ってください。');
      return true;
    }
    var draft = getDraft_(userId);
    draft.dateStr = fmtDate_(d);
    saveDraft_(userId, draft);

    var msg = '📅 投稿日を ' + draft.dateStr + '（' + WEEKDAYS[d.getDay()] + '）に設定しました。\n';
    if (draft.text && draft.imageUrl) {
      msg += '\n' + commitDraft_(userId, draft);
    } else {
      var need = [];
      if (!draft.imageUrl) need.push('画像');
      if (!draft.text) need.push('投稿文');
      msg += '\n次に' + need.join('と') + 'を送ってください。';
    }
    replyText_(event.replyToken, msg);
    return true;
  }

  return false;
}


/**
 * 直前に登録した投稿をシートから削除し、文章を下書きに戻す。
 * 画像だけ送り直せば再登録できる状態にする。
 */
function undoLastCommit_(userId) {
  var last = getLastCommit_(userId);
  if (!last || !last.imageUrl) {
    return 'やり直せる登録がありません。\n\n' +
           '（やり直せるのは、最後に登録した1件だけです。' +
           'それより前のものはスプレッドシートで直接編集してください）';
  }

  var res = deletePostByImageUrl_(last.imageUrl);
  clearLastCommit_(userId);

  if (!res.found) {
    return 'シートに該当の行が見つかりませんでした。\n' +
           'すでに削除されたか、画像URLが書き換えられた可能性があります。\n\n' +
           '対象: ' + last.dateStr;
  }

  // 文章と日付は下書きに戻す。画像を送り直すだけで再登録できる
  saveDraft_(userId, { text: last.text, dateStr: last.dateStr });

  var msg = '🗑 ' + res.dateStr + ' の登録を取り消しました。\n\n' +
            '投稿文は保持しています（' + (last.text || '').length + '文字）。\n' +
            '画像を送り直してください。';

  if (res.maybePosted) {
    msg += '\n\n⚠️ この投稿はすでにSNSへ公開された可能性があります。\n' +
           'シートの行は消しましたが、Instagram・Google・Threadsに出ているものは' +
           '各アプリから手動で削除してください。';
  }
  return msg;
}
