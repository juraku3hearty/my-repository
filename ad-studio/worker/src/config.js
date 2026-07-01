import fs from 'node:fs';
import path from 'node:path';

// .env を読む(dotenv不要の素朴実装)
const envPath = new URL('../.env', import.meta.url).pathname;
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}

function required(key) {
  const v = process.env[key];
  if (!v) throw new Error(`環境変数 ${key} が未設定です(.env を確認)`);
  return v;
}

export const config = {
  spreadsheetId: required('SPREADSHEET_ID'),
  credentialsPath: required('GOOGLE_APPLICATION_CREDENTIALS'),
  driveOutputFolderId: required('DRIVE_OUTPUT_FOLDER_ID'),

  voiceProvider: process.env.VOICE_PROVIDER || 'fishaudio',
  videoProvider: process.env.VIDEO_PROVIDER || 'higgsfield',

  fishAudio: {
    apiKey: process.env.FISH_AUDIO_API_KEY || '',
    apiBase: process.env.FISH_AUDIO_API_BASE || 'https://api.fish.audio',
  },
  higgsfield: {
    apiKey: process.env.HIGGSFIELD_API_KEY || '',
    apiSecret: process.env.HIGGSFIELD_API_SECRET || '',
    apiBase: process.env.HIGGSFIELD_API_BASE || 'https://platform.higgsfield.ai',
  },

  cost: {
    voicePer1kChars: Number(process.env.COST_VOICE_PER_1K_CHARS || 15),
    videoPerGeneration: Number(process.env.COST_VIDEO_PER_GENERATION || 80),
  },

  line: {
    token: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
    userId: process.env.LINE_USER_ID || '',
  },

  pollIntervalSec: Number(process.env.POLL_INTERVAL_SEC || 60),
  workDir: process.env.WORK_DIR || path.join(process.cwd(), 'work'),
};

fs.mkdirSync(config.workDir, { recursive: true });
