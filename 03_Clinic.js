/**
 * 03_Clinic.js
 * 院マスタの登録・取得
 */

/**
 * 院を新規作成する。
 * @param {Object} opt { lineUserId, 院名 }
 * @return {Object} 作成した院
 */
function createClinic_(opt) {
  opt = opt || {};
  var now = new Date();
  var clinic = {
    clinicId: newId_(12),
    publicId: newId_(16),   // 患者向けURLに出るID
    adminToken: newId_(24), // 院長向けURLに出るトークン
    '院名': opt['院名'] || '',
    '院長名': opt['院長名'] || '',
    '電話': opt['電話'] || '',
    '住所': opt['住所'] || '',
    'LINE_userId': opt.lineUserId || '',
    '登録日時': fmtDateTime_(now),
    '更新日時': fmtDateTime_(now)
  };
  appendRow_(SHEETS.CLINIC, CLINIC_COLS, clinic);
  return clinic;
}

/** adminToken から院を引く */
function findClinicByToken_(token) {
  if (!token) return null;
  var rows = readRows_(SHEETS.CLINIC);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].adminToken) === String(token)) return rows[i];
  }
  return null;
}

/** publicId から院を引く */
function findClinicByPublicId_(publicId) {
  if (!publicId) return null;
  var rows = readRows_(SHEETS.CLINIC);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].publicId) === String(publicId)) return rows[i];
  }
  return null;
}

/** LINEのuserIdから院を引く（友だち追加の重複を防ぐ） */
function findClinicByLineUserId_(userId) {
  if (!userId) return null;
  var rows = readRows_(SHEETS.CLINIC);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].LINE_userId) === String(userId)) return rows[i];
  }
  return null;
}

/**
 * 院の情報を更新する。登録画面から呼ばれる（google.script.run）。
 * @param {Object} payload { token, 院名, 院長名, 電話, 住所 }
 * @return {Object} { ok, urls }
 */
function saveClinic(payload) {
  payload = payload || {};
  var clinic = findClinicByToken_(payload.token);
  if (!clinic) return { ok: false, message: 'URLが正しくありません。LINEに届いたリンクから開き直してください。' };

  var fields = ['院名', '院長名', '電話', '住所'];
  fields.forEach(function (f) {
    if (payload[f] !== undefined) {
      updateCell_(SHEETS.CLINIC, clinic._row, f, CLINIC_COLS, String(payload[f]).slice(0, 200));
    }
  });
  updateCell_(SHEETS.CLINIC, clinic._row, '更新日時', CLINIC_COLS, fmtDateTime_(new Date()));

  return { ok: true, urls: clinicUrls_(findClinicByToken_(payload.token)) };
}

/** 院に紐づく各URLを組み立てる */
function clinicUrls_(clinic) {
  var base = getConfig_().WEBAPP_URL;
  return {
    intake: base + '?p=intake&c=' + clinic.publicId,
    print: base + '?p=print&c=' + clinic.publicId,
    admin: base + '?p=admin&t=' + clinic.adminToken
  };
}
