/**
 * 06_LineFollow.js
 * LINEの友だち追加を受けて、院を発行しURLを返す
 *
 * gas_main.js の handleLineWebhook から routeLineEvent_() が呼ばれる。
 */

/**
 * LINEの1イベントを処理する。
 * @param {Object} event
 */
function routeLineEvent_(event) {
  if (!event) return;

  if (event.type === 'follow') {
    handleFollow_(event);
    return;
  }

  if (event.type === 'message' && event.message && event.message.type === 'text') {
    handleTextMessage_(event);
    return;
  }
}

/** 友だち追加されたとき */
function handleFollow_(event) {
  var userId = event.source && event.source.userId;
  if (!userId) return;

  var clinic = findClinicByLineUserId_(userId);
  if (!clinic) {
    clinic = createClinic_({ lineUserId: userId });
  }

  var base = getConfig_().WEBAPP_URL;
  if (!base) {
    lineReply_(event.replyToken, '準備中です。少し時間をおいてから「問診票」と送ってください。');
    return;
  }

  var msg = [
    'ご登録ありがとうございます。',
    '',
    'あなたの院名が入った交通事故カウンセリングシートを作ります。',
    'まず、下のリンクから院名をご登録ください（30秒で終わります）。',
    '',
    base + '?p=reg&t=' + clinic.adminToken,
    '',
    '※このリンクはあなた専用です。他の方には共有しないでください。',
    '',
    '登録が終わると、',
    '・患者さんに見せるWeb問診票のURL',
    '・院名入りの印刷用シート',
    'の2つが使えるようになります。'
  ].join('\n');

  lineReply_(event.replyToken, msg);
}

/** テキストメッセージへの応答 */
function handleTextMessage_(event) {
  var userId = event.source && event.source.userId;
  var text = (event.message.text || '').trim();
  var base = getConfig_().WEBAPP_URL;

  var clinic = findClinicByLineUserId_(userId);
  if (!clinic) {
    clinic = createClinic_({ lineUserId: userId });
  }

  if (/問診|シート|URL|url|リンク/.test(text)) {
    var urls = clinicUrls_(clinic);
    lineReply_(event.replyToken, [
      '【あなたの院の問診票】',
      '',
      '■ 患者さんに見せるURL',
      urls.intake,
      '',
      '■ 印刷用（院名入り）',
      urls.print,
      '',
      '■ 届いた問診を見る',
      urls.admin
    ].join('\n'));
    return;
  }

  lineReply_(event.replyToken, [
    'ご連絡ありがとうございます。',
    '',
    '「問診票」と送っていただくと、あなたの院のURLをお送りします。',
    base ? ('設定はこちら: ' + base + '?p=reg&t=' + clinic.adminToken) : ''
  ].filter(String).join('\n'));
}
