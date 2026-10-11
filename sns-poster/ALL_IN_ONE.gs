/**
 * ALL_IN_ONE.gs — 00_Config 〜 07_Setup を1ファイルに連結した自動生成ファイル
 *
 * GASへの貼り付けを1回で済ませるための版。
 * このファイルを直接編集しないこと。編集は 00〜07 の各ファイルで行い、
 * ./build_all_in_one.sh を実行して再生成する。
 *
 * 生成元: 00_Config.gs 01_Webhook.gs 02_LineApi.gs 03_Cloudinary.gs 04_Draft.gs 05_Sheet.gs 06_Commands.gs 07_Setup.gs 
 */

// ═══════════════════════════════════════════════════════════
// 00_Config.gs
// ═══════════════════════════════════════════════════════════

/**
 * 00_Config.gs — 設定とスクリプトプロパティ
 *
 * 機密値はコードに書かない。すべてスクリプトプロパティに保存する。
 * プロジェクトの設定 > スクリプト プロパティ から登録するか、
 * 07_Setup.gs の setupProperties() を編集して一度実行する。
 */

/** 固定設定（機密ではないもの） */
var CONFIG = {
  // 投稿カレンダーのシート名
  SHEET_NAME: 'シート1',

  // 列番号（1始まり）
  COL_DATE: 1,   // A: 投稿日
  COL_TEXT: 2,   // B: テキスト
  COL_IMAGE: 3,  // C: 画像URL
  COL_DONE: 4,   // D: 投稿済み

  // ヘッダー行数
  HEADER_ROWS: 1,

  // 日付指定がないときの自動割り当て間隔（シート最終日 + N日）
  DEFAULT_INTERVAL_DAYS: 3,

  // 下書きの保持時間（時間）。これを超えた下書きは破棄する
  DRAFT_TTL_HOURS: 24,

  // Instagram が受け付けるアスペクト比（幅 / 高さ）の範囲
  IG_MIN_RATIO: 0.8,   // 4:5
  IG_MAX_RATIO: 1.91,  // 1.91:1

  // Cloudinary 配信時の基本変換（Instagram は JPEG のみ対応）
  CLOUDINARY_BASE_TX: 'f_jpg,q_auto:good,w_1080,c_limit',

  TIMEZONE: 'Asia/Tokyo'
};

/** スクリプトプロパティから値を取得する（必須） */
function prop_(key) {
  var v = PropertiesService.getScriptProperties().getProperty(key);
  if (!v) {
    throw new Error('スクリプトプロパティ ' + key + ' が未設定です。07_Setup.gs を参照してください。');
  }
  return v;
}

/** スクリプトプロパティから値を取得する（任意） */
function propOpt_(key, fallback) {
  var v = PropertiesService.getScriptProperties().getProperty(key);
  return v ? v : (fallback || '');
}

function lineToken_()        { return prop_('LINE_CHANNEL_ACCESS_TOKEN'); }
function spreadsheetId_()    { return prop_('SPREADSHEET_ID'); }
function cloudinaryCloud_()  { return prop_('CLOUDINARY_CLOUD_NAME'); }
function cloudinaryPreset_() { return prop_('CLOUDINARY_UPLOAD_PRESET'); }

/**
 * 投稿を許可する LINE userId の一覧。
 * 未設定なら全員許可（テスト時のみ想定。本番では必ず設定する）
 */
function allowedUserIds_() {
  var raw = propOpt_('ALLOWED_USER_IDS', '');
  if (!raw) return null;
  return raw.split(',').map(function (s) { return s.trim(); }).filter(String);
}

function isAllowedUser_(userId) {
  var list = allowedUserIds_();
  if (!list) return true; // 未設定＝制限なし
  return list.indexOf(userId) !== -1;
}

// ═══════════════════════════════════════════════════════════
// 01_Webhook.gs
// ═══════════════════════════════════════════════════════════

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
  var result = appendPost_(draft.dateStr, draft.text, draft.imageUrl);
  clearDraft_(userId);

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
  return msg;
}

// ═══════════════════════════════════════════════════════════
// 02_LineApi.gs
// ═══════════════════════════════════════════════════════════

/**
 * 02_LineApi.gs — LINE Messaging API の呼び出し
 */

/** 返信メッセージを送る（replyToken は1回のみ有効・有効期限は約1分） */
function replyText_(replyToken, text) {
  if (!replyToken) return;
  var res = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + lineToken_() },
    payload: JSON.stringify({
      replyToken: replyToken,
      messages: [{ type: 'text', text: truncate_(text, 4900) }]
    }),
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) {
    Logger.log('LINE reply failed ' + res.getResponseCode() + ': ' + res.getContentText());
  }
}

/**
 * 画像メッセージの実体を取得する。
 * 通常の api.line.me ではなく api-data.line.me を使う点に注意。
 */
function fetchLineMessageContent_(messageId) {
  var res = UrlFetchApp.fetch(
    'https://api-data.line.me/v2/bot/message/' + encodeURIComponent(messageId) + '/content',
    {
      method: 'get',
      headers: { Authorization: 'Bearer ' + lineToken_() },
      muteHttpExceptions: true
    }
  );
  var code = res.getResponseCode();
  if (code !== 200) {
    throw new Error('LINE画像の取得に失敗しました (HTTP ' + code + ')\n' + res.getContentText());
  }
  return res.getBlob();
}

function truncate_(s, max) {
  s = String(s);
  return s.length <= max ? s : s.slice(0, max - 3) + '...';
}

// ═══════════════════════════════════════════════════════════
// 03_Cloudinary.gs
// ═══════════════════════════════════════════════════════════

/**
 * 03_Cloudinary.gs — Cloudinary へのアップロードと配信URL生成
 *
 * 2つのモードに対応する。
 *  - 署名付き（推奨）: CLOUDINARY_API_KEY と CLOUDINARY_API_SECRET を設定する。
 *  - unsigned      : CLOUDINARY_UPLOAD_PRESET のみを設定する。手軽だが、
 *                    cloud名とpreset名が漏れると第三者もアップロードできる。
 * 両方設定されている場合は署名付きを使う。
 */

var CLOUDINARY_FOLDER = 'sns-poster';

/**
 * 画像を Cloudinary にアップロードし、Instagram 投稿に使える配信URLを返す。
 * @return {{url:string, width:number, height:number, warning:string}}
 */
function uploadToCloudinary_(blob) {
  var cloud = cloudinaryCloud_();
  var payload = buildCloudinaryPayload_(blob);

  var res = UrlFetchApp.fetch('https://api.cloudinary.com/v1_1/' + cloud + '/image/upload', {
    method: 'post',
    payload: payload,
    muteHttpExceptions: true
  });

  var code = res.getResponseCode();
  var body = res.getContentText();
  if (code !== 200) {
    throw new Error('Cloudinaryのアップロードに失敗しました (HTTP ' + code + ')\n' + truncate_(body, 500));
  }

  var json = JSON.parse(body);
  if (!json.public_id) {
    throw new Error('Cloudinaryの応答に public_id がありません\n' + truncate_(body, 500));
  }

  var ratio = json.width / json.height;
  var tx = CONFIG.CLOUDINARY_BASE_TX;
  var warning = '';

  // Instagram の許容比率から外れる画像は、切り取らず白で余白を足して収める
  if (ratio < CONFIG.IG_MIN_RATIO) {
    tx = 'ar_4:5,c_pad,b_white,' + tx;
    warning = 'ℹ️ 縦長すぎるため、上下に白余白を足して4:5に調整しました。';
  } else if (ratio > CONFIG.IG_MAX_RATIO) {
    tx = 'ar_1.91:1,c_pad,b_white,' + tx;
    warning = 'ℹ️ 横長すぎるため、左右に白余白を足して1.91:1に調整しました。';
  }

  return {
    url: buildCloudinaryUrl_(cloud, tx, json.version, json.public_id),
    width: json.width,
    height: json.height,
    warning: warning
  };
}

/** 署名付き / unsigned を判定してリクエストボディを組む */
function buildCloudinaryPayload_(blob) {
  var apiKey = propOpt_('CLOUDINARY_API_KEY', '');
  var apiSecret = propOpt_('CLOUDINARY_API_SECRET', '');

  // Blob を含めると Apps Script が multipart/form-data を組み立てる
  var file = blob.setName('line_upload');

  if (apiKey && apiSecret) {
    var signed = {
      folder: CLOUDINARY_FOLDER,
      timestamp: String(Math.floor(Date.now() / 1000))
    };
    return {
      file: file,
      api_key: apiKey,
      folder: signed.folder,
      timestamp: signed.timestamp,
      signature: cloudinarySignature_(signed, apiSecret)
    };
  }

  // フォルダは preset 側で指定する（unsigned では folder を送れない設定が多い）
  return {
    file: file,
    upload_preset: cloudinaryPreset_()
  };
}

/**
 * Cloudinary の署名を作る。
 * 仕様: パラメータをキー名の昇順で key=value& 連結し、末尾に API Secret を足して SHA-1。
 * file / api_key / resource_type は署名対象に含めない。
 */
function cloudinarySignature_(params, apiSecret) {
  var toSign = Object.keys(params).sort().map(function (k) {
    return k + '=' + params[k];
  }).join('&') + apiSecret;

  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_1, toSign, Utilities.Charset.UTF_8);

  return bytes.map(function (b) {
    return ('0' + (b & 0xFF).toString(16)).slice(-2);
  }).join('');
}

/**
 * 配信URLを組み立てる。
 * secure_url を文字列加工するのではなく public_id から組むことで、
 * 変換パラメータの挿入位置を間違えない。
 */
function buildCloudinaryUrl_(cloud, tx, version, publicId) {
  return 'https://res.cloudinary.com/' + cloud + '/image/upload/' +
         tx + '/v' + version + '/' + publicId + '.jpg';
}

// ═══════════════════════════════════════════════════════════
// 04_Draft.gs
// ═══════════════════════════════════════════════════════════

/**
 * 04_Draft.gs — 下書き状態の保持
 *
 * LINE は画像とテキストを別メッセージで送ってくるため、
 * 揃うまでユーザー単位で保持する必要がある。
 */

function draftKey_(userId) {
  return 'draft_' + userId;
}

/** 下書きを取得する。期限切れなら空の下書きを返す */
function getDraft_(userId) {
  var raw = PropertiesService.getScriptProperties().getProperty(draftKey_(userId));
  if (!raw) return {};

  var draft;
  try {
    draft = JSON.parse(raw);
  } catch (_) {
    return {};
  }

  var ageMs = Date.now() - (draft.updatedAt || 0);
  if (ageMs > CONFIG.DRAFT_TTL_HOURS * 3600 * 1000) {
    clearDraft_(userId);
    return {};
  }
  return draft;
}

function saveDraft_(userId, draft) {
  draft.updatedAt = Date.now();
  PropertiesService.getScriptProperties()
    .setProperty(draftKey_(userId), JSON.stringify(draft));
}

function clearDraft_(userId) {
  PropertiesService.getScriptProperties().deleteProperty(draftKey_(userId));
}

/** 下書きの中身を人が読める形にする */
function describeDraft_(draft) {
  if (!draft || (!draft.text && !draft.imageUrl && !draft.dateStr)) {
    return '下書きはありません。';
  }
  var lines = ['📋 現在の下書き', ''];
  lines.push('投稿日: ' + (draft.dateStr || '（未指定・自動割り当て）'));
  lines.push('画像: ' + (draft.imageUrl ? 'あり（' + (draft.imageInfo || '') + '）' : 'なし'));
  lines.push('投稿文: ' + (draft.text ? draft.text.length + '文字' : 'なし'));
  if (draft.text) {
    lines.push('');
    lines.push('--- 本文 ---');
    lines.push(truncate_(draft.text, 600));
  }
  if (draft.imageUrl) {
    lines.push('');
    lines.push(draft.imageUrl);
  }
  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════
// 05_Sheet.gs
// ═══════════════════════════════════════════════════════════

/**
 * 05_Sheet.gs — スプレッドシートへの読み書きと投稿日の決定
 *
 * 行は投稿日の昇順を保つように挿入する。Make 側は「投稿日 == 今日 かつ
 * 投稿済みが空」で拾うため並び順自体は必須ではないが、人が読めなくなるのを防ぐ。
 */

var WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

function getSheet_() {
  var ss = SpreadsheetApp.openById(spreadsheetId_());
  var sh = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sh) {
    throw new Error('シート「' + CONFIG.SHEET_NAME + '」が見つかりません。');
  }
  return sh;
}

/** A列の最終データ行を返す（末尾の空行を無視する） */
function lastDataRow_(sh) {
  var last = sh.getLastRow();
  if (last <= CONFIG.HEADER_ROWS) return CONFIG.HEADER_ROWS;
  var values = sh.getRange(CONFIG.HEADER_ROWS + 1, CONFIG.COL_DATE,
                           last - CONFIG.HEADER_ROWS, 1).getValues();
  for (var i = values.length - 1; i >= 0; i--) {
    if (values[i][0] !== '' && values[i][0] !== null) {
      return CONFIG.HEADER_ROWS + i + 1;
    }
  }
  return CONFIG.HEADER_ROWS;
}

/** 既存の投稿日を [{row, date}] で返す（昇順前提だが実データ順のまま） */
function readSchedule_(sh) {
  var last = lastDataRow_(sh);
  if (last <= CONFIG.HEADER_ROWS) return [];
  var values = sh.getRange(CONFIG.HEADER_ROWS + 1, CONFIG.COL_DATE,
                           last - CONFIG.HEADER_ROWS, 1).getValues();
  var out = [];
  for (var i = 0; i < values.length; i++) {
    var d = toDate_(values[i][0]);
    if (d) out.push({ row: CONFIG.HEADER_ROWS + i + 1, date: d });
  }
  return out;
}

/**
 * 投稿を追加する。
 * @param {string} dateStr 'yyyy/MM/dd' もしくは空文字（空なら自動割り当て）
 * @return {{row:number, dateStr:string, weekday:string}}
 */
function appendPost_(dateStr, text, imageUrl) {
  var sh = getSheet_();
  var schedule = readSchedule_(sh);

  var target = dateStr ? parseDateStr_(dateStr) : nextAutoDate_(schedule);
  if (!target) throw new Error('投稿日を解釈できませんでした: ' + dateStr);

  // 同じ日付の行があればその後ろ、なければ日付順の位置に挿入する
  var insertAt = null;
  for (var i = 0; i < schedule.length; i++) {
    if (schedule[i].date.getTime() > target.getTime()) {
      insertAt = schedule[i].row;
      break;
    }
  }

  var row;
  if (insertAt === null) {
    row = lastDataRow_(sh) + 1;
  } else {
    sh.insertRowBefore(insertAt);
    row = insertAt;
  }

  sh.getRange(row, CONFIG.COL_DATE).setValue(target).setNumberFormat('yyyy/mm/dd');
  sh.getRange(row, CONFIG.COL_TEXT).setValue(text);
  sh.getRange(row, CONFIG.COL_IMAGE).setValue(imageUrl);
  sh.getRange(row, CONFIG.COL_DONE).setValue(''); // Make が投稿後に埋める
  SpreadsheetApp.flush();

  return {
    row: row,
    dateStr: fmtDate_(target),
    weekday: WEEKDAYS[target.getDay()]
  };
}

/** 日付未指定時の投稿日: 既存の最終日 + N日。ただし必ず明日以降にする */
function nextAutoDate_(schedule) {
  var base = null;
  for (var i = 0; i < schedule.length; i++) {
    if (!base || schedule[i].date.getTime() > base.getTime()) base = schedule[i].date;
  }

  var tomorrow = todayJst_();
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (!base) return tomorrow;

  var candidate = new Date(base.getTime());
  candidate.setDate(candidate.getDate() + CONFIG.DEFAULT_INTERVAL_DAYS);
  return candidate.getTime() < tomorrow.getTime() ? tomorrow : candidate;
}

/** 直近の予約投稿を一覧表示用に整形する */
function describeUpcoming_(limit) {
  var sh = getSheet_();
  var last = lastDataRow_(sh);
  if (last <= CONFIG.HEADER_ROWS) return '登録された投稿はありません。';

  var values = sh.getRange(CONFIG.HEADER_ROWS + 1, 1, last - CONFIG.HEADER_ROWS, 4).getValues();
  var today = todayJst_().getTime();
  var rows = [];

  for (var i = 0; i < values.length; i++) {
    var d = toDate_(values[i][CONFIG.COL_DATE - 1]);
    if (!d || d.getTime() < today) continue;
    rows.push({
      date: d,
      row: CONFIG.HEADER_ROWS + i + 1,
      text: String(values[i][CONFIG.COL_TEXT - 1] || ''),
      hasImage: !!values[i][CONFIG.COL_IMAGE - 1],
      done: !!values[i][CONFIG.COL_DONE - 1]
    });
  }

  if (!rows.length) return '今日以降の予約投稿はありません。';

  rows.sort(function (a, b) { return a.date - b.date; });
  rows = rows.slice(0, limit || 10);

  var lines = ['📅 今日以降の予約投稿', ''];
  rows.forEach(function (r) {
    var head = r.text.split('\n')[0];
    lines.push(
      fmtDate_(r.date) + '(' + WEEKDAYS[r.date.getDay()] + ') ' +
      (r.done ? '✅' : '🕒') + (r.hasImage ? '' : ' ⚠️画像なし')
    );
    lines.push('　' + truncate_(head, 40));
  });
  return lines.join('\n');
}

/* ---------- 日付ユーティリティ ---------- */

function todayJst_() {
  var s = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy/MM/dd');
  var p = s.split('/');
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
}

function fmtDate_(d) {
  return Utilities.formatDate(d, CONFIG.TIMEZONE, 'yyyy/MM/dd');
}

function toDate_(v) {
  if (v instanceof Date) {
    return new Date(v.getFullYear(), v.getMonth(), v.getDate());
  }
  if (typeof v === 'string' && v.trim()) {
    return parseDateStr_(v.trim());
  }
  return null;
}

/**
 * '2026/10/15' '10/15' '10月15日' を Date に変換する。
 * 年が省略された場合は「今日以降になる最も近い年」を採用する。
 */
function parseDateStr_(s) {
  s = String(s).trim();

  var m = s.match(/^(\d{4})[\/\-年](\d{1,2})[\/\-月](\d{1,2})日?$/);
  if (m) {
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }

  m = s.match(/^(\d{1,2})[\/\-月](\d{1,2})日?$/);
  if (m) {
    var today = todayJst_();
    var d = new Date(today.getFullYear(), Number(m[1]) - 1, Number(m[2]));
    if (d.getTime() < today.getTime()) {
      d = new Date(today.getFullYear() + 1, Number(m[1]) - 1, Number(m[2]));
    }
    return d;
  }
  return null;
}

/**
 * 本文の先頭行が日付だけの行なら、日付と残りの本文に切り分ける。
 * 例: "10/15\n今日は…" → {dateStr:'2026/10/15', rest:'今日は…'}
 */
function extractLeadingDate_(text) {
  var lines = String(text).split('\n');
  var first = lines[0].trim();
  var d = parseDateStr_(first);
  if (d) {
    return { dateStr: fmtDate_(d), rest: lines.slice(1).join('\n').replace(/^\n+/, '') };
  }
  return { dateStr: '', rest: text };
}

// ═══════════════════════════════════════════════════════════
// 06_Commands.gs
// ═══════════════════════════════════════════════════════════

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
  '確認 … 今の下書きを表示',
  '取消 … 下書きを破棄',
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

// ═══════════════════════════════════════════════════════════
// 07_Setup.gs
// ═══════════════════════════════════════════════════════════

/**
 * 07_Setup.gs — 初期設定と動作確認
 *
 * 手順:
 *   1. setupProperties() の値を埋めて一度だけ実行する
 *   2. checkConfig() で設定を確認する
 *   3. testSheetWrite() でシート書き込みを確認する
 *   4. ウェブアプリとしてデプロイし、WebhookURL を LINE に設定する
 *   5. LINE から「ID」と送って自分の userId を取得し、
 *      ALLOWED_USER_IDS に登録する
 */

/** ★この関数の値を自分の環境に書き換えて一度だけ実行する */
function setupProperties() {
  PropertiesService.getScriptProperties().setProperties({
    LINE_CHANNEL_ACCESS_TOKEN: 'ここにスタッフ用LINE Botのチャネルアクセストークン',
    SPREADSHEET_ID: '144VrJLm2dMBDwtB9uOHnYQBrnlaCuOB8mtZctQ_E3Dw',
    CLOUDINARY_CLOUD_NAME: 'dcbfytmzv',

    // --- Cloudinary 認証: 下の2つ（署名付き・推奨）を使う ---
    CLOUDINARY_API_KEY: 'ここにCloudinaryのAPI Key',
    CLOUDINARY_API_SECRET: 'ここにCloudinaryのAPI Secret',

    // --- もしくは unsigned preset だけで済ませる場合はこちら ---
    // 上の API_KEY/SECRET を空にして、こちらを設定する
    CLOUDINARY_UPLOAD_PRESET: '',
    // 最初は空のまま。あとで LINE から「ID」と送って取得したIDを入れる
    ALLOWED_USER_IDS: ''
  }, true);
  Logger.log('スクリプトプロパティを設定しました。checkConfig() を実行して確認してください。');
}

/** 設定の抜けを確認する */
function checkConfig() {
  var props = PropertiesService.getScriptProperties();
  var missing = [];
  var isSet = function (k) {
    var v = props.getProperty(k);
    return !!v && v.indexOf('ここに') !== 0;
  };

  ['LINE_CHANNEL_ACCESS_TOKEN', 'SPREADSHEET_ID', 'CLOUDINARY_CLOUD_NAME'].forEach(function (k) {
    if (!isSet(k)) missing.push(k);
  });

  // Cloudinary は「署名付き」か「unsigned preset」のどちらかが揃っていればよい
  var signed = isSet('CLOUDINARY_API_KEY') && isSet('CLOUDINARY_API_SECRET');
  var unsigned = isSet('CLOUDINARY_UPLOAD_PRESET');
  if (!signed && !unsigned) {
    missing.push('CLOUDINARY_API_KEY + CLOUDINARY_API_SECRET（または CLOUDINARY_UPLOAD_PRESET）');
  }

  if (missing.length) {
    Logger.log('❌ 未設定: ' + missing.join(', '));
    return;
  }
  Logger.log('✅ 必須プロパティはすべて設定済み');
  Logger.log('   Cloudinaryモード: ' + (signed ? '署名付き（推奨）' : 'unsigned preset'));
  if (!signed) {
    Logger.log('⚠️ unsignedモードです。cloud名とpreset名が漏れると第三者もアップロード可能になります。');
  }

  var allow = allowedUserIds_();
  if (!allow) {
    Logger.log('⚠️ ALLOWED_USER_IDS が未設定です。誰でも投稿を登録できる状態です。');
  } else {
    Logger.log('✅ 許可ユーザー: ' + allow.length + '人');
  }

  try {
    var sh = getSheet_();
    Logger.log('✅ シート接続OK: ' + sh.getName() + ' / 最終データ行 ' + lastDataRow_(sh));
    Logger.log('次の自動割り当て日: ' + fmtDate_(nextAutoDate_(readSchedule_(sh))));
  } catch (e) {
    Logger.log('❌ シート接続エラー: ' + e.message);
  }
}

/** シートへの書き込みと行挿入位置を確認する（テスト行を作って消す） */
function testSheetWrite() {
  var r = appendPost_('', '【テスト】この行は自動で削除されます', 'https://example.com/test.jpg');
  Logger.log('書き込み: ' + r.row + '行目 / ' + r.dateStr + '(' + r.weekday + ')');

  var sh = getSheet_();
  sh.deleteRow(r.row);
  Logger.log('✅ テスト行を削除しました。書き込みは正常です。');
}

/** 日付パースの確認 */
function testDateParse() {
  ['10/15', '2026/10/15', '10月15日', '1/3', 'あいうえお'].forEach(function (s) {
    var d = parseDateStr_(s);
    Logger.log(s + ' → ' + (d ? fmtDate_(d) : '解釈不可'));
  });
}

/** 予約一覧をログに出す */
function testUpcoming() {
  Logger.log(describeUpcoming_(10));
}

/** 期限切れの下書きをまとめて掃除する（任意: 日次トリガーに設定可） */
function cleanupDrafts() {
  var props = PropertiesService.getScriptProperties();
  var all = props.getProperties();
  var removed = 0;
  Object.keys(all).forEach(function (k) {
    if (k.indexOf('draft_') !== 0) return;
    try {
      var d = JSON.parse(all[k]);
      if (Date.now() - (d.updatedAt || 0) > CONFIG.DRAFT_TTL_HOURS * 3600 * 1000) {
        props.deleteProperty(k);
        removed++;
      }
    } catch (_) {
      props.deleteProperty(k);
      removed++;
    }
  });
  Logger.log('期限切れ下書きを ' + removed + ' 件削除しました。');
}
