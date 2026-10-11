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
