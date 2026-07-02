import fs from 'node:fs';
import path from 'node:path';
import { google } from 'googleapis';
import { config } from './config.js';
import { googleAuth } from './sheets.js';

/**
 * Driveの読み書きはユーザーOAuthを優先。
 * サービスアカウントは保存容量ゼロで「マイドライブ」へのアップロードが弾かれる
 * (Service Accounts do not have storage quota)ため、GOOGLE_OAUTH_* の設定が実質必須。
 * リフレッシュトークンの取得は worker/get-oauth-token.js を参照。
 */
function buildDriveAuth() {
  const { clientId, clientSecret, refreshToken } = config.googleOAuth;
  if (clientId && clientSecret && refreshToken) {
    const oauth = new google.auth.OAuth2(clientId, clientSecret);
    oauth.setCredentials({ refresh_token: refreshToken });
    return oauth;
  }
  return googleAuth; // 未設定時はサービスアカウント(読み取りは可能)
}

const driveApi = google.drive({ version: 'v3', auth: buildDriveAuth() });

/** Driveから素材動画をダウンロードしてローカルパスを返す */
export async function downloadFile(fileId) {
  const dest = path.join(config.workDir, `mat-${fileId}.mp4`);
  if (fs.existsSync(dest)) return dest; // 素材はキャッシュ再利用
  const res = await driveApi.files.get(
    { fileId, alt: 'media' },
    { responseType: 'stream' },
  );
  await new Promise((resolve, reject) => {
    const ws = fs.createWriteStream(dest);
    res.data.on('error', reject).pipe(ws).on('finish', resolve).on('error', reject);
  });
  return dest;
}

/** 完成動画をDriveの出力フォルダにアップロードし {fileId, url} を返す */
export async function uploadOutput(filePath, name) {
  const res = await driveApi.files.create({
    requestBody: {
      name,
      parents: [config.driveOutputFolderId],
    },
    media: {
      mimeType: 'video/mp4',
      body: fs.createReadStream(filePath),
    },
    fields: 'id, webViewLink',
  });
  return { fileId: res.data.id, url: res.data.webViewLink };
}
