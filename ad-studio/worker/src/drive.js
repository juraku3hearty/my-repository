import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { driveApi } from './sheets.js';

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
