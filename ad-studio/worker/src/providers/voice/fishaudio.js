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

/**
 * ASR(文字起こし)— 字幕生成用にナレーションのタイムスタンプを取得する。
 * Fish Audio の transcribe API を使用($0.36/音声1時間 ≒ 広告1本0.1円未満)。
 * 戻り値: [{ start, end, text }, ...](秒)
 * レスポンス形式が変わっていたら https://docs.fish.audio/ のASRリファレンスを確認。
 */
export async function transcribe({ filePath }) {
  if (!config.fishAudio.apiKey) throw new Error('FISH_AUDIO_API_KEY が未設定です');
  const audio = await fs.readFile(filePath);
  const form = new FormData();
  form.append('audio', new Blob([audio], { type: 'audio/mpeg' }), 'voice.mp3');
  form.append('language', 'ja');

  const res = await fetch(`${config.fishAudio.apiBase}/v1/asr`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.fishAudio.apiKey}` },
    body: form,
  });
  if (!res.ok) {
    throw new Error(`Fish Audio ASRエラー ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const data = await res.json();
  const segments = data.segments || data.results || [];
  return segments.map((s) => ({
    start: Number(s.start ?? s.begin ?? 0),
    end: Number(s.end ?? s.finish ?? 0),
    text: String(s.text || '').trim(),
  })).filter((s) => s.text);
}
