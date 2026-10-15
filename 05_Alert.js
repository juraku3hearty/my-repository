/**
 * 05_Alert.js
 * 確認アラートの判定
 *
 * 【重要な設計方針】
 * ここで出すのは「確認が必要な項目」だけであって、判断や法的結論は出さない。
 * 受付スタッフが読んでそのまま患者や保険会社に説明できる文言にしない。
 * 必ず「院長が確認する」で終わる形にすること。
 */

/**
 * 問診回答からアラート配列を作る。
 * @param {Object} rec 問診回答（INTAKE_COLS のキーを持つ）
 * @return {Array<{level:string, code:string, text:string}>}
 */
function evaluateAlerts_(rec) {
  var alerts = [];
  var days = rec['経過日数'];

  // --- 最優先: 病院で整骨院通院を止められているケース ---
  // 初回の電話で病院を先に勧めると、医師に止められて患者が二度と戻らない。
  // 実際に起きているパターンなので、最も強いアラートにする。
  if (rec['病院での案内'] === '整骨院には行かないように言われた') {
    alerts.push({
      level: 'high',
      code: 'DOCTOR_STOP',
      text: '病院で整骨院への通院を止められています。院長が直接ご説明ください。受付で対応しないでください。'
    });
  }

  // --- 経過日数 ---
  if (days !== '' && days !== null && days !== undefined && !isNaN(days)) {
    if (Number(days) <= DAYS_THRESHOLD) {
      alerts.push({
        level: 'info',
        code: 'WITHIN_THRESHOLD',
        text: '事故から' + days + '日です（' + DAYS_THRESHOLD + '日以内）。初回説明の対象です。'
      });
    } else {
      alerts.push({
        level: 'high',
        code: 'OVER_THRESHOLD',
        text: '事故から' + days + '日が経過しています。遅れた理由の確認と記録が必要です。'
      });
    }
  } else {
    alerts.push({ level: 'warn', code: 'NO_DATE', text: '事故日が未入力です。確認してください。' });
  }

  // --- 病院の受診状況 ---
  if (rec['病院受診'] === 'いいえ') {
    alerts.push({
      level: 'warn', code: 'NO_HOSPITAL',
      text: '病院を受診していません。受診状況の確認が必要です。'
    });
  }

  // --- 併用の意向（打ち切りの説明対象） ---
  if (rec['病院併用意向'] === 'はい') {
    alerts.push({
      level: 'warn', code: 'BOTH_CLINICS',
      text: '病院との併用予定です。院長から説明が必要な項目です。'
    });
  }

  // --- 知識の確認 ---
  if (rec['自賠責認知'] === 'いいえ') {
    alerts.push({
      level: 'info', code: 'NO_JIBAISEKI_KNOWLEDGE',
      text: '自賠責の慰謝料算定をご存じありません。説明の対象です。'
    });
  }
  if (rec['任意保険'] === 'いいえ' || rec['任意保険'] === 'わからない') {
    alerts.push({
      level: 'info', code: 'NO_OWN_INSURANCE',
      text: 'ご自身の任意保険の加入状況が未確認です。'
    });
  }

  // --- 遅れた理由が未記入 ---
  if (days !== '' && !isNaN(days) && Number(days) > DAYS_THRESHOLD && !rec['遅延理由']) {
    alerts.push({
      level: 'high', code: 'NO_DELAY_REASON',
      text: '通院開始が遅れた理由が未記入です。来院時に必ず聞き取って記録してください。'
    });
  }

  return alerts;
}

/** アラート配列を、院長へのLINE通知用テキストにする */
function alertsToLineText_(clinicName, rec, alerts) {
  var lines = [];
  lines.push('【交通事故 問診が届きました】');
  lines.push(clinicName);
  lines.push('');
  lines.push('患者名: ' + (rec['患者名'] || '(未記入)'));
  lines.push('事故日: ' + (rec['事故日時'] || '(未記入)'));
  if (rec['経過日数'] !== '' && rec['経過日数'] !== null) {
    lines.push('経過日数: ' + rec['経過日数'] + '日');
  }
  lines.push('');

  var high = alerts.filter(function (a) { return a.level === 'high'; });
  var warn = alerts.filter(function (a) { return a.level === 'warn'; });

  if (high.length) {
    lines.push('■ 院長の確認が必要');
    high.forEach(function (a) { lines.push('・' + a.text); });
    lines.push('');
  }
  if (warn.length) {
    lines.push('■ 確認項目');
    warn.forEach(function (a) { lines.push('・' + a.text); });
    lines.push('');
  }
  lines.push('※これは確認項目であり、判断ではありません。');
  return lines.join('\n');
}
