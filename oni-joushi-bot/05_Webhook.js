/**
 * 鬼上司Bot — 05_Webhook
 * LINEからの設定コマンドと雑談（reply=全部無料）
 */
const DAY_CHARS = ['日', '月', '火', '水', '木', '金', '土'];

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
  const reply = handleCommand_(text) || buildChatReply(text);
  replyText(ev.replyToken, reply);
}

/** コマンドなら応答文字列、コマンドでなければ null（→雑談へ） */
function handleCommand_(text) {
  let m;

  if ((m = text.match(/^勤務時間\s*(\d{1,2})\s*[-〜~ー時]+\s*(\d{1,2})/))) {
    const s = Number(m[1]);
    const en = Number(m[2]);
    if (s >= en || en > 24) return '開始と終了が逆だぞ。「勤務時間 9-18」のように書け。';
    setSetting('WORK_START', s);
    setSetting('WORK_END', en);
    return 'よし、勤務時間は' + s + '時から' + en + '時だな。その間の空白は全部俺が見ているからな。';
  }

  if ((m = text.match(/^休み\s*(.+)/))) {
    if (m[1].indexOf('なし') !== -1) {
      setSetting('REST_DAYS', '');
      return '休みなしだと？…お前、それはそれで面談だ。';
    }
    const days = [];
    for (let i = 0; i < DAY_CHARS.length; i++) {
      if (m[1].indexOf(DAY_CHARS[i]) !== -1) days.push(i);
    }
    if (days.length === 0) return '「休み 土日」のように曜日で書け。';
    setSetting('REST_DAYS', days.join(','));
    return '休みは' + days.map(d => DAY_CHARS[d]).join('・') + 'か。いいだろう。その日は…見逃してやる。';
  }

  if ((m = text.match(/^休日モード\s*(オン|オフ)/))) {
    setSetting('HOLIDAY_MODE', m[1] === 'オン' ? 'ON' : 'OFF');
    return m[1] === 'オン'
      ? '休日おせっかいモード、オンだ。休みの日に予定が無かったら…わかってるな？'
      : '休日は放っておいてやる。…寂しいがな。';
  }

  if ((m = text.match(/^メール攻撃\s*(オン|オフ)/))) {
    setSetting('EMAIL_NAG', m[1] === 'オン' ? 'ON' : 'OFF');
    return m[1] === 'オン' ? 'メールも送るぞ。1時間おきにな。' : 'メールはやめてやる。LINEは送るがな。';
  }

  if ((m = text.match(/^カレンダー侵入\s*(オン|オフ)/))) {
    setSetting('CALENDAR_INVADE', m[1] === 'オン' ? 'ON' : 'OFF');
    return m[1] === 'オン'
      ? '予定が無いなら俺が入れてやる。それだけだ。'
      : 'カレンダーには手を出さん。約束だ。';
  }

  if (text === '設定') {
    const win = getWorkWindow();
    const rest = getRestDays().map(d => DAY_CHARS[d]).join('・') || 'なし';
    return '現在の監視体制だ。\n' +
      '・勤務時間: ' + win.start + '時〜' + win.end + '時\n' +
      '・休み: ' + rest + '\n' +
      '・休日モード: ' + getSetting('HOLIDAY_MODE') + '\n' +
      '・メール攻撃: ' + getSetting('EMAIL_NAG') + '\n' +
      '・カレンダー侵入: ' + getSetting('CALENDAR_INVADE') + '\n' +
      '・現在の説教レベル: ' + getSetting('ESCALATION_LEVEL');
  }

  if (text === 'ヘルプ') {
    return '俺への指示はこれだけ受け付けてやる。\n' +
      '・勤務時間 9-18\n' +
      '・休み 土日\n' +
      '・休日モード オン/オフ\n' +
      '・メール攻撃 オン/オフ\n' +
      '・カレンダー侵入 オン/オフ\n' +
      '・設定\n' +
      'それ以外は雑談として付き合ってやる。';
  }

  return null;
}
