/**
 * X(Twitter)投稿アナリティクス自動入力
 *
 * 使い方:
 *   LINE Bot に「投稿アナリティクスのスクショ」を送るだけ。
 *   Gemini Vision が数値（インプ/いいね/リポスト/コメント/ブックマーク）を読み取り、
 *   スプレッドシートに1行追加する。エンゲージ数・各種率は数式で自動計算。
 *
 * 画像と一緒に文章を送ると、その文章を「投稿メモ」に入れる。
 * テキストだけで送った場合（例: 「1200 35 4 2 8」）も数値として取り込む。
 *
 * 必要なスクリプトプロパティ:
 *   GEMINI_API_KEY  … Google AI Studio で取得
 *   SPREADSHEET_ID  … 集計シートのID（未設定ならデフォルトを使用）
 */

var XA = {
  // 集計シート（URLから取得したデフォルト。プロパティで上書き可）
  DEFAULT_SPREADSHEET_ID: '14T02Bnu3P7mcsFiVgk-U7prXstHXomPErBdEGvivNHU',
  SHEET_NAME: '',          // 空ならアクティブ（先頭）シート
  GEMINI_MODEL: 'gemini-3.5-flash',
  HEADER_ROWS: 1           // 1行目はヘッダー
};

function xaProp_(key, fallback) {
  var v = PropertiesService.getScriptProperties().getProperty(key);
  return (v === null || v === undefined || v === '') ? (fallback || '') : v;
}

function xaGetSheet_() {
  var id = xaProp_('SPREADSHEET_ID', XA.DEFAULT_SPREADSHEET_ID);
  var ss = SpreadsheetApp.openById(id);
  return XA.SHEET_NAME ? ss.getSheetByName(XA.SHEET_NAME) : ss.getSheets()[0];
}

/**
 * LINE の画像メッセージを処理してシートに追記する。
 * @param {string} messageId  LINEのmessage.id
 * @param {string} memo        画像に添えられたテキスト（任意）
 * @return {string} 返信用メッセージ
 */
function handleXAnalyticsImage(messageId, memo) {
  var imageBlob = fetchLineImage_(messageId);
  var data = extractXMetricsFromImage_(imageBlob);
  data.memo = memo || data.memo || '';
  return appendXRow_(data);
}

/**
 * 「インプ いいね リポスト コメント ブックマーク」をテキストで受け取って追記する。
 * 区切りはスペース/カンマ/改行どれでもOK。メモは数値の後ろに書いた文字列。
 * @param {string} text
 * @return {string} 返信用メッセージ。アナリティクス入力でなければ null。
 */
function handleXAnalyticsText(text) {
  var nums = (text.match(/[\d,]+/g) || []).map(function (s) {
    return Number(s.replace(/,/g, ''));
  }).filter(function (n) { return !isNaN(n); });

  // 数値が3つ未満なら、これはアナリティクス入力ではないと判断
  if (nums.length < 3) return null;

  var memo = (text.match(/[^\d,\s]+.*$/m) || [''])[0].trim();
  var data = {
    impressions: nums[0] || 0,
    likes: nums[1] || 0,
    reposts: nums[2] || 0,
    comments: nums[3] || 0,
    bookmarks: nums[4] || 0,
    memo: memo,
    date: ''
  };
  return appendXRow_(data);
}

/** LINE Content API から画像Blobを取得 */
function fetchLineImage_(messageId) {
  var token = (typeof CONFIG !== 'undefined' && CONFIG.LINE_CHANNEL_ACCESS_TOKEN)
    ? CONFIG.LINE_CHANNEL_ACCESS_TOKEN
    : xaProp_('LINE_CHANNEL_ACCESS_TOKEN', '');
  var res = UrlFetchApp.fetch(
    'https://api-data.line.me/v2/bot/message/' + messageId + '/content',
    { headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true }
  );
  if (res.getResponseCode() !== 200) {
    throw new Error('LINE画像取得に失敗: ' + res.getResponseCode());
  }
  return res.getBlob();
}

/** Gemini Vision で数値を抽出 */
function extractXMetricsFromImage_(imageBlob) {
  var apiKey = xaProp_('GEMINI_API_KEY', '');
  if (!apiKey) throw new Error('GEMINI_API_KEY が未設定です');

  var prompt =
    'これはX(旧Twitter)の投稿アナリティクス画面のスクリーンショットです。' +
    '次の項目の数値だけを読み取り、JSONで返してください。' +
    '値はカンマや「件」などの単位を除いた整数。読み取れない項目は0。' +
    'インプレッション=impressions, いいね=likes, リポスト(リツイート)=reposts, ' +
    '返信(コメント/リプライ)=comments, ブックマーク=bookmarks, ' +
    '投稿日が見えれば date(YYYY-MM-DD、なければ空文字)。' +
    '出力はJSONのみ。例: {"impressions":1200,"likes":35,"reposts":4,"comments":2,"bookmarks":8,"date":""}';

  var payload = {
    contents: [{
      parts: [
        { text: prompt },
        { inline_data: { mime_type: imageBlob.getContentType() || 'image/jpeg',
                         data: Utilities.base64Encode(imageBlob.getBytes()) } }
      ]
    }],
    generationConfig: { temperature: 0, response_mime_type: 'application/json' }
  };

  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
            XA.GEMINI_MODEL + ':generateContent?key=' + apiKey;
  var res = UrlFetchApp.fetch(url, {
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify(payload), muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) {
    throw new Error('Gemini APIエラー: ' + res.getResponseCode() + ' ' + res.getContentText());
  }

  var json = JSON.parse(res.getContentText());
  var textOut = json.candidates[0].content.parts[0].text;
  var parsed = JSON.parse(textOut.replace(/```json|```/g, '').trim());
  return {
    impressions: Number(parsed.impressions) || 0,
    likes: Number(parsed.likes) || 0,
    reposts: Number(parsed.reposts) || 0,
    comments: Number(parsed.comments) || 0,
    bookmarks: Number(parsed.bookmarks) || 0,
    date: parsed.date || '',
    memo: ''
  };
}

/** シートに1行追記。エンゲージ数・各率は数式で自動計算する。 */
function appendXRow_(data) {
  var sheet = xaGetSheet_();
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var row = Math.max(sheet.getLastRow(), XA.HEADER_ROWS) + 1;
    var tz = Session.getScriptTimeZone() || 'Asia/Tokyo';
    var dateVal = data.date
      ? data.date
      : Utilities.formatDate(new Date(), tz, 'yyyy/MM/dd');

    // A:日付 B:メモ C:インプ D:いいね E:リポスト F:コメント G:ブクマ
    sheet.getRange(row, 1, 1, 7).setValues([[
      dateVal, data.memo || '',
      data.impressions, data.likes, data.reposts, data.comments, data.bookmarks
    ]]);

    // H:エンゲージ数  I〜M:各率（インプ基準）。数式で持たせて後編集にも追随させる
    var f = function (col) { return col + row; };
    sheet.getRange(row, 8).setFormula(
      '=' + f('D') + '+' + f('E') + '+' + f('F') + '+' + f('G'));               // エンゲージ数
    sheet.getRange(row, 9).setFormula('=IFERROR(' + f('H') + '/' + f('C') + ',"")');  // エンゲージ率
    sheet.getRange(row, 10).setFormula('=IFERROR(' + f('D') + '/' + f('C') + ',"")'); // いいね率
    sheet.getRange(row, 11).setFormula('=IFERROR(' + f('E') + '/' + f('C') + ',"")'); // リポスト率
    sheet.getRange(row, 12).setFormula('=IFERROR(' + f('F') + '/' + f('C') + ',"")'); // コメント率
    sheet.getRange(row, 13).setFormula('=IFERROR(' + f('G') + '/' + f('C') + ',"")'); // ブクマ率
    sheet.getRange(row, 9, 1, 5).setNumberFormat('0.00%');
  } finally {
    lock.releaseLock();
  }

  var pct = function (n, d) { return d ? (n / d * 100).toFixed(2) + '%' : '0%'; };
  var eng = data.likes + data.reposts + data.comments + data.bookmarks;
  return '✅ 記録しました\n' +
    'インプ: ' + data.impressions + '\n' +
    'いいね: ' + data.likes + ' / リポスト: ' + data.reposts +
    ' / コメント: ' + data.comments + ' / ブクマ: ' + data.bookmarks + '\n' +
    'エンゲージ率: ' + pct(eng, data.impressions) +
    (data.memo ? '\nメモ: ' + data.memo : '');
}

/** 動作確認用（プロパティ設定後にエディタから実行）。テスト行を1行追記する。 */
function xaTestAppend() {
  Logger.log(appendXRow_({
    impressions: 1200, likes: 35, reposts: 4, comments: 2, bookmarks: 8,
    memo: 'テスト投稿', date: ''
  }));
}
