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
