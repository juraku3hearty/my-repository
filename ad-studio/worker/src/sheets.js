import { google } from 'googleapis';
import { config } from './config.js';

// GAS側 01_Setup.js と同じシート名・列順(変更時は両方直すこと)
export const SHEET = {
  MATERIALS: '素材ライブラリ',
  SCRIPTS: '台本',
  JOBS: 'ジョブ',
  VARIANTS: 'バリアント',
  SETTINGS: '設定',
};

// ジョブシートの列(0始まり)
export const JOB_COL = {
  ID: 0, TYPE: 1, STATUS: 2, SCRIPT_ID: 3, MATERIAL_IDS: 4, VIDEO_PROMPT: 5,
  VOICE_ID: 6, OUT_DRIVE_ID: 7, OUT_URL: 8, COST: 9, ERROR: 10,
  CREATED: 11, UPDATED: 12, MEMO: 13, END_MATERIAL_ID: 14,
};

export const googleAuth = new google.auth.GoogleAuth({
  keyFile: config.credentialsPath,
  scopes: [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive',
  ],
});

export const sheetsApi = google.sheets({ version: 'v4', auth: googleAuth });

async function readSheet(name) {
  const res = await sheetsApi.spreadsheets.values.get({
    spreadsheetId: config.spreadsheetId,
    range: `'${name}'!A:Z`,
  });
  return res.data.values || [];
}

/** pending のジョブを1件取得(行番号つき) */
export async function fetchPendingJob() {
  const rows = await readSheet(SHEET.JOBS);
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][JOB_COL.STATUS] === 'pending') {
      return { rowIndex: i + 1, row: rows[i] };
    }
  }
  return null;
}

/** ジョブ行の一部の列を更新 */
export async function updateJob(rowIndex, patch) {
  const now = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
  const data = Object.entries({ ...patch, [JOB_COL.UPDATED]: now }).map(([col, value]) => ({
    range: `'${SHEET.JOBS}'!${colLetter(Number(col))}${rowIndex}`,
    values: [[value]],
  }));
  await sheetsApi.spreadsheets.values.batchUpdate({
    spreadsheetId: config.spreadsheetId,
    requestBody: { valueInputOption: 'USER_ENTERED', data },
  });
}

/** 台本IDから {hook, body, cta} を引く */
export async function getScript(scriptId) {
  const rows = await readSheet(SHEET.SCRIPTS);
  const r = rows.find((row, i) => i > 0 && row[0] === scriptId);
  if (!r) throw new Error(`台本が見つかりません: ${scriptId}`);
  return { id: r[0], hook: r[4] || '', body: r[5] || '', cta: r[6] || '', duration: Number(r[7]) || 30 };
}

/** 素材IDリストから DriveファイルID を引く */
export async function getMaterials(materialIds) {
  if (!materialIds) return [];
  const wanted = materialIds.split(',').map((s) => s.trim()).filter(Boolean);
  const rows = await readSheet(SHEET.MATERIALS);
  return wanted.map((id) => {
    const r = rows.find((row, i) => i > 0 && row[0] === id);
    if (!r) throw new Error(`素材が見つかりません: ${id}`);
    return { id: r[0], name: r[1], driveFileId: r[2], kind: r[3] };
  });
}

/** 設定シートから値を読む */
export async function getSetting(key, fallback = '') {
  const rows = await readSheet(SHEET.SETTINGS);
  const r = rows.find((row, i) => i > 0 && row[0] === key && row[1] !== '');
  return r ? String(r[1]) : fallback;
}

/** ジョブIDに紐づくバリアント行に出力URLを反映 */
export async function updateVariantUrl(jobId, url) {
  const rows = await readSheet(SHEET.VARIANTS);
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][1] === jobId) {
      await sheetsApi.spreadsheets.values.update({
        spreadsheetId: config.spreadsheetId,
        range: `'${SHEET.VARIANTS}'!F${i + 1}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[url]] },
      });
      return;
    }
  }
}

function colLetter(n) {
  let s = '';
  n = n + 1;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
