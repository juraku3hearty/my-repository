/**
 * 家族カレンダー 一括共有スクリプト
 * ------------------------------------------------------------------
 * あなたが管理しているカレンダー（自分＋娘3人ぶん）を、家族みんなに
 * 「予定を見られる」状態で一括共有する。旦那さんは入れない。
 *
 * 【使い方（あなたが5分で）】
 *  1. このスクリプトを Apps Script に貼る
 *  2. メニュー「サービス（＋）」→「Calendar API」を追加（詳細サービスを有効化）
 *  3. まず listMyCalendars を実行 → ログに出る「名前 / ID」を見て、
 *     共有したいカレンダー（自分＋娘3人）のIDを下の CAL_IDS に入れる
 *  4. FAMILY_EMAILS に家族のメール（自分＋娘3人。旦那さんは入れない）を入れる
 *  5. shareFamilyCalendars を実行 → 初回は「許可」を押す → 一括共有完了
 */

// ↓ ここを埋める ----------------------------------------------------
// 共有したいカレンダーのID（listMyCalendars で確認して貼る）
const CAL_IDS = [
  // 'xxxxx@group.calendar.google.com',   // 自分
  // 'yyyyy@group.calendar.google.com',   // 長女
  // 'zzzzz@group.calendar.google.com',   // 次女
  // 'wwwww@group.calendar.google.com',   // 三女
];
// 見られるようにする家族のメール（旦那さんは入れない）
const FAMILY_EMAILS = [
  // 'mama@gmail.com',
  // 'musume1@gmail.com',
  // 'musume2@gmail.com',
  // 'musume3@gmail.com',
];
// 権限: 'reader'=詳細を見られる / 'writer'=追加・編集もできる
const SHARE_ROLE = 'reader';
// -------------------------------------------------------------------

/** 自分のカレンダー一覧（名前とID）をログに出す。共有対象のIDを調べる用。 */
function listMyCalendars() {
  const cals = CalendarApp.getAllCalendars();
  cals.forEach(function(c) {
    Logger.log(c.getName() + '  ===>  ' + c.getId());
  });
  Logger.log('--- 上の中から、共有したいカレンダーのIDを CAL_IDS に入れてください ---');
}

/** CAL_IDS の各カレンダーを、FAMILY_EMAILS 全員に一括共有する。 */
function shareFamilyCalendars() {
  if (!CAL_IDS.length || !FAMILY_EMAILS.length) {
    Logger.log('CAL_IDS と FAMILY_EMAILS を埋めてから実行してください。');
    return;
  }
  let count = 0, skipped = 0;
  CAL_IDS.forEach(function(calId) {
    FAMILY_EMAILS.forEach(function(email) {
      try {
        // 既に共有済みかチェック（重複追加を避ける）
        const acl = Calendar.Acl.list(calId);
        const exists = (acl.items || []).some(function(r) {
          return r.scope && r.scope.type === 'user' && r.scope.value === email;
        });
        if (exists) { skipped++; return; }

        Calendar.Acl.insert({
          role: SHARE_ROLE,
          scope: { type: 'user', value: email }
        }, calId);
        count++;
      } catch (e) {
        Logger.log('共有NG: ' + calId + ' → ' + email + ' / ' + e.message);
      }
    });
  });
  Logger.log('一括共有 完了：新規 ' + count + ' 件 / 既存スキップ ' + skipped + ' 件');
}
