/**
 * 暴言リマインダー — 05_Webhook
 * 登録・完了・一覧・キャラ変更は全部reply（無料・無制限）
 */
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    (body.events || []).forEach(handleLineEvent_);
  } catch (err) {
    console.error('doPost失敗: ' + err);
  }
  return ContentService.createTextOutput(JSON.stringify({ status: 'ok' }));
}

function handleLineEvent_(ev) {
  if (ev.source && ev.source.userId) {
    PROPS.setProperty('USER_ID', ev.source.userId); // 最初の1通でPush先を自動登録
  }
  if (ev.type !== 'message' || !ev.message || ev.message.type !== 'text') return;
  const text = ev.message.text.trim();
  const reply = handleCommand_(text);
  replyText(ev.replyToken, reply !== null ? reply : buildChatReply(text));
}

function handleCommand_(text) {
  let m;

  // 完了報告 → 催促ストップ（褒めない。一言だけ）
  if (/^(やった|やったよ|やったで|完了|done|できた)/.test(text)) {
    const done = completeFired();
    if (done.length === 0) return 'ん？いま催促してるもんは無いで。「リスト」で確認しよか。';
    return buildDoneReply();
  }

  // 一覧
  if (text === 'リスト') {
    const pending = listPending();
    if (pending.length === 0) return 'いま登録されてるリマインドは無いわ。平和やねえ。';
    return '登録中のリマインドやで。\n' + pending.map((r, i) =>
      (i + 1) + '. ' + Utilities.formatDate(r.date, 'Asia/Tokyo', 'M/d HH:mm') + ' ' + r.task +
      (r.status === 'fired' ? '（催促中！）' : '')
    ).join('\n') + '\n消したいときは「削除 番号」な。';
  }

  // 削除
  if ((m = text.match(/^削除\s*(\d+)/))) {
    const deleted = deleteByIndex(Number(m[1]));
    return deleted
      ? '「' + deleted.task + '」消しといたで。逃げたんとちゃうやろな？'
      : 'その番号は無いで。「リスト」で確認しよか。';
  }

  // キャラ変更
  if ((m = text.match(/^キャラ\s*(.*)$/))) {
    const name = m[1].trim();
    if (!name) {
      return '選べるキャラはこれや。「キャラ 名前」で変更してな。\n・' +
        characterList().join('\n・') + '\n（いまは「' + getCharacter() + '」）';
    }
    if (characterList().indexOf(name) === -1) {
      return 'そんなキャラおらんわ。おるのは ' + characterList().join('、') + ' や。';
    }
    PROPS.setProperty('CHARACTER', name);
    return buildChatReply('今日からあなたが担当になりました。挨拶をどうぞ。');
  }

  if (text === 'ヘルプ') {
    return '使い方やで。\n' +
      '・リマインド 明日15時 銀行行く（日時は自然な言葉でOK）\n' +
      '・やった（完了報告。褒めたるわ）\n' +
      '・リスト / 削除 番号\n' +
      '・キャラ（' + characterList().join('・') + 'から選べる）\n' +
      'それ以外は雑談として付き合うたるわ。';
  }

  // 登録: 「リマインド …」またはそれっぽい文（日時らしきものを含む）
  if (/^リマインド\s*/.test(text) || /(今日|明日|明後日|\d+分後|\d+時間後|\d{1,2}[\/月]\d{1,2}|\d{1,2}[:時]\d{0,2})/.test(text)) {
    const body = text.replace(/^リマインド\s*/, '');
    const parsed = parseReminderText(body, new Date());
    if (!parsed) return 'すまん、頭が回っとらんわ。（Gemini呼び出し失敗。GEMINI_API_KEYを確認してください）';
    if (parsed.error || !parsed.datetime || !parsed.task) {
      return 'いつ、何をやるんか分からんかったわ。「リマインド 明日15時 銀行行く」みたいに送ってみ？';
    }
    const date = new Date(parsed.datetime.replace(' ', 'T') + ':00+09:00');
    if (isNaN(date.getTime())) return '日時がよう分からんかったわ。もう一回頼むで。';
    addReminder(date, parsed.task);
    return buildRegisteredReply(
      Utilities.formatDate(date, 'Asia/Tokyo', 'M月d日 HH:mm'), parsed.task);
  }

  return null; // コマンドではない → 雑談へ
}
