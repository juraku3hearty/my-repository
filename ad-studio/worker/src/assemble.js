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

/** 長い動画から指定区間だけ切り出す(開始秒/終了秒。endSec=0なら末尾まで) */
export async function trimClip(input, startSec, endSec) {
  const out = path.join(config.workDir, `trim-${Date.now()}-${Math.floor(startSec)}.mp4`);
  const args = ['-y', '-ss', String(startSec), '-i', input];
  if (endSec > startSec) args.push('-t', String(endSec - startSec));
  args.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-an', out);
  await run('ffmpeg', args);
  return out;
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
 * @param {string|null} endClipPath - 店舗別エンドカード。指定時は必ず動画の最後に配置される
 * @param {{path: string, volume: number}|null} bgm - BGM。ナレーションの下に小音量で自動ループ
 * @returns {Promise<string>} 完成mp4のパス
 */
export async function assemble(clipPaths, voicePath, endClipPath = null, bgm = null) {
  if (!clipPaths.length && !endClipPath) throw new Error('合成するクリップが1つもありません');

  const voiceDur = await ffprobeDuration(voicePath);
  if (voiceDur > 150) {
    throw new Error(`ナレーションが${Math.round(voiceDur)}秒あります。このシステムは120秒までの短尺特化です。台本を短くしてください`);
  }

  const tmp = [];

  // エンドカード(店舗情報)は尺を固定で最後に確保し、本体はその手前まで
  // 長い素材(外観の長回し等)を登録してもいいように、先頭6秒だけ使う
  const END_MAX_SEC = 6;
  let endClip = null;
  let endDur = 0;
  if (endClipPath) {
    endClip = await normalizeClip(endClipPath, 'end');
    tmp.push(endClip);
    endDur = Math.min(await ffprobeDuration(endClip), END_MAX_SEC, voiceDur);
  }
  const bodyTarget = voiceDur - endDur;

  // 本体: 正規化してナレーション残り時間をループで埋め、ピッタリにトリム
  let bodyPath = null;
  if (bodyTarget > 0.5) {
    if (!clipPaths.length) throw new Error('本体クリップがありません(素材IDか動画プロンプトが必要)');
    const normalized = [];
    for (let i = 0; i < clipPaths.length; i++) {
      normalized.push(await normalizeClip(clipPaths[i], i));
    }
    tmp.push(...normalized);

    const playlist = [];
    let total = 0;
    let i = 0;
    while (total < bodyTarget + 1) {
      const clip = normalized[i % normalized.length];
      playlist.push(clip);
      total += await ffprobeDuration(clip);
      i++;
      if (i > 200) throw new Error('クリップが短すぎます(ループ上限)');
    }

    const bodyList = path.join(config.workDir, `concat-body-${Date.now()}.txt`);
    await fs.writeFile(bodyList, playlist.map((p) => `file '${p}'`).join('\n'));
    tmp.push(bodyList);

    bodyPath = path.join(config.workDir, `body-${Date.now()}.mp4`);
    tmp.push(bodyPath);
    await run('ffmpeg', [
      '-y', '-f', 'concat', '-safe', '0', '-i', bodyList,
      '-t', String(bodyTarget.toFixed(2)),
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-an',
      bodyPath,
    ]);
  }

  // 本体 + エンドカード を連結し、ナレーションを重ねる
  const finalList = path.join(config.workDir, `concat-final-${Date.now()}.txt`);
  const parts = [bodyPath, endClip].filter(Boolean);
  await fs.writeFile(finalList, parts.map((p) => `file '${p}'`).join('\n'));
  tmp.push(finalList);

  const out = path.join(config.workDir, `ad-${Date.now()}.mp4`);
  const args = [
    '-y',
    '-f', 'concat', '-safe', '0', '-i', finalList,
    '-i', voicePath,
  ];
  if (bgm) {
    // BGMは自動ループでナレーションの下に敷く(duration=firstでナレーション長に揃う)
    args.push('-stream_loop', '-1', '-i', bgm.path);
    args.push('-filter_complex',
      `[2:a]volume=${bgm.volume}[bg];[1:a][bg]amix=inputs=2:duration=first:dropout_transition=0[aout]`);
    args.push('-map', '0:v', '-map', '[aout]');
  } else {
    args.push('-map', '0:v', '-map', '1:a');
  }
  args.push(
    '-t', String(voiceDur.toFixed(2)), // 音声の長さでスパッと終える
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '20',
    '-c:a', 'aac', '-b:a', '192k',
    '-movflags', '+faststart',
    out,
  );
  await run('ffmpeg', args);

  // 中間ファイル掃除
  for (const f of tmp) {
    await fs.unlink(f).catch(() => {});
  }
  return out;
}
