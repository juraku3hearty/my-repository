/**
 * ffmpeg 合成 — 90〜120秒の縦型広告(1080x1920)に特化。
 * ルール: ナレーション音声の長さ = 完成動画の長さ。
 * 映像トラックは クリップ(撮影素材 + AI生成) を順番に並べ、
 * 足りなければ先頭からループ、余れば末尾をカットして音声にピッタリ合わせる。
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';

const run = promisify(execFile);

const W = 1080;
const H = 1920;
const FPS = 30;

async function ffprobeDuration(file) {
  const { stdout } = await run('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file,
  ]);
  return parseFloat(stdout.trim());
}

/** クリップを縦型に正規化(拡大クロップ・無音化) */
async function normalizeClip(input, index) {
  const out = path.join(config.workDir, `norm-${Date.now()}-${index}.mp4`);
  await run('ffmpeg', [
    '-y', '-i', input,
    '-vf', `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${FPS},format=yuv420p`,
    '-an',
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '20',
    out,
  ]);
  return out;
}

/**
 * @param {string[]} clipPaths - 撮影素材・AI生成クリップのローカルパス(表示順)
 * @param {string} voicePath - ナレーション音声(mp3)
 * @returns {Promise<string>} 完成mp4のパス
 */
export async function assemble(clipPaths, voicePath) {
  if (!clipPaths.length) throw new Error('合成するクリップが1つもありません');

  const voiceDur = await ffprobeDuration(voicePath);
  if (voiceDur > 150) {
    throw new Error(`ナレーションが${Math.round(voiceDur)}秒あります。このシステムは120秒までの短尺特化です。台本を短くしてください`);
  }

  // 正規化
  const normalized = [];
  for (let i = 0; i < clipPaths.length; i++) {
    normalized.push(await normalizeClip(clipPaths[i], i));
  }

  // ナレーション長を満たすまでクリップ列をループで積む
  const playlist = [];
  let total = 0;
  let i = 0;
  while (total < voiceDur + 1) {
    const clip = normalized[i % normalized.length];
    playlist.push(clip);
    total += await ffprobeDuration(clip);
    i++;
    if (i > 200) throw new Error('クリップが短すぎます(ループ上限)');
  }

  // concat リスト
  const listPath = path.join(config.workDir, `concat-${Date.now()}.txt`);
  await fs.writeFile(listPath, playlist.map((p) => `file '${p}'`).join('\n'));

  const out = path.join(config.workDir, `ad-${Date.now()}.mp4`);
  await run('ffmpeg', [
    '-y',
    '-f', 'concat', '-safe', '0', '-i', listPath,
    '-i', voicePath,
    '-map', '0:v', '-map', '1:a',
    '-t', String(voiceDur.toFixed(2)), // 音声の長さでスパッと終える
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '20',
    '-c:a', 'aac', '-b:a', '192k',
    '-movflags', '+faststart',
    out,
  ]);

  // 中間ファイル掃除
  for (const f of [...normalized, listPath]) {
    await fs.unlink(f).catch(() => {});
  }
  return out;
}
