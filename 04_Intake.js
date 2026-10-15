/**
 * 04_Intake.js
 * 患者の問診回答の受け取りと保存
 */

/**
 * 患者が記入した問診を保存する。問診画面から google.script.run で呼ばれる。
 * @param {Object} payload フォームの入力内容（publicId を含む）
 * @return {Object} { ok, message }
 */
function saveIntake(payload) {
  payload = payload || {};
  var clinic = findClinicByPublicId_(payload.publicId);
  if (!clinic) return { ok: false, message: 'この問診票のリンクが無効です。院にお問い合わせください。' };

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    return { ok: false, message: '混み合っています。少し待ってからもう一度お試しください。' };
  }

  try {
    var days = daysSince_(payload['事故日時']);

    var rec = {
      recordId: newId_(14),
      clinicId: clinic.clinicId,
      '受付日時': fmtDateTime_(new Date()),
      '患者名': clip_(payload['患者名'], 100),
      '電話': clip_(payload['電話'], 40),
      '住所': clip_(payload['住所'], 200),
      '事故日時': clip_(payload['事故日時'], 40),
      '経過日数': (days === null ? '' : days),
      '病院受診': clip_(payload['病院受診'], 20),
      '最終受診日': clip_(payload['最終受診日'], 40),
      '病院での案内': clip_(payload['病院での案内'], 60),
      '発生場所': clip_(payload['発生場所'], 40),
      '発生場所その他': clip_(payload['発生場所その他'], 200),
      '自分の種別': clip_(payload['自分の種別'], 20),
      '走行状態': clip_(payload['走行状態'], 20),
      '乗車区分': clip_(payload['乗車区分'], 20),
      '相手の種別': clip_(payload['相手の種別'], 20),
      '修理費用': clip_(payload['修理費用'], 20),
      '過失_自分': clip_(payload['過失_自分'], 10),
      '過失_相手': clip_(payload['過失_相手'], 10),
      '痛み部位': Array.isArray(payload['痛み部位']) ? payload['痛み部位'].join('、') : clip_(payload['痛み部位'], 300),
      '車両キズ箇所': clip_(payload['車両キズ箇所'], 200),
      '病院併用意向': clip_(payload['病院併用意向'], 20),
      '自賠責認知': clip_(payload['自賠責認知'], 20),
      '任意保険': clip_(payload['任意保険'], 20),
      '遅延理由': clip_(payload['遅延理由'], 60),
      '遅延理由詳細': clip_(payload['遅延理由詳細'], 500),
      'アラート': '',
      '院内メモ': ''
    };

    var alerts = evaluateAlerts_(rec);
    rec['アラート'] = alerts.map(function (a) { return '[' + a.level + '] ' + a.text; }).join('\n');

    appendRow_(SHEETS.INTAKE, INTAKE_COLS, rec);

    // 院長のLINEへ通知（LINE_userIdが登録されている場合のみ）
    if (clinic.LINE_userId) {
      linePush_(clinic.LINE_userId, alertsToLineText_(clinic['院名'], rec, alerts));
    }

    return { ok: true, message: 'ありがとうございました。受付にお知らせください。' };
  } finally {
    lock.releaseLock();
  }
}

/** 文字列を切り詰める */
function clip_(v, n) {
  if (v === undefined || v === null) return '';
  return String(v).slice(0, n);
}

/**
 * 管理画面用：この院の問診回答を新しい順で返す。
 * @param {string} token adminToken
 * @param {number} limit 最大件数
 */
function listIntakes(token, limit) {
  var clinic = findClinicByToken_(token);
  if (!clinic) return { ok: false, message: 'URLが正しくありません。' };

  var rows = readRows_(SHEETS.INTAKE).filter(function (r) {
    return String(r.clinicId) === String(clinic.clinicId);
  });
  rows.reverse();
  if (limit) rows = rows.slice(0, limit);

  return { ok: true, clinic: { '院名': clinic['院名'] }, rows: rows };
}

/**
 * 管理画面用：院内メモを保存する。
 */
function saveIntakeMemo(token, recordId, memo) {
  var clinic = findClinicByToken_(token);
  if (!clinic) return { ok: false, message: 'URLが正しくありません。' };

  var rows = readRows_(SHEETS.INTAKE);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].recordId) === String(recordId) &&
        String(rows[i].clinicId) === String(clinic.clinicId)) {
      updateCell_(SHEETS.INTAKE, rows[i]._row, '院内メモ', INTAKE_COLS, clip_(memo, 2000));
      return { ok: true };
    }
  }
  return { ok: false, message: '対象の記録が見つかりません。' };
}
