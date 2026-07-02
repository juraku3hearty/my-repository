/**
 * Fish Audio TTS アダプタ。
 * スタッフの声をクローンした voice model の reference_id を voiceId として渡す。
 * https://docs.fish.audio/ の TTS API を使用。
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../../config.js';

export async function synthesize({ text, voiceId }) {
  if (!config.fishAudio.apiKey) throw new Error('FISH_AUDIO_API_KEY が未設定です');
  if (!voiceId) throw new Error('ボイスID(Fish Audioのreference_id)が未設定です。設定シートの「デフォルトボイスID」を入れてください');

  const headers = {
    Authorization: `Bearer ${config.fishAudio.apiKey}`,
    'Content-Type': 'application/json',
  };
  if (config.fishAudio.model) headers.model = config.fishAudio.model;

  const res = await fetch(`${config.fishAudio.apiBase}/v1/tts`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      text,
      reference_id: voiceId,
      format: 'mp3',
      // 広告ナレーション向け: はっきりめ・正規化オン
      normalize: true,
      latency: 'normal',
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Fish Audio APIエラー ${res.status}: ${body.slice(0, 300)}`);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  const filePath = path.join(config.workDir, `voice-${Date.now()}.mp3`);
  await fs.writeFile(filePath, buf);
  return { filePath, chars: text.length };
}
