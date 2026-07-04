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

export async function ffprobeDuration(file) {
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
 * @param {string[]} tailClipPaths - 動画の末尾に順番どおり固定配置するクリップ(店舗外観→LINE CTA 等。事前トリム済み)
 * @param {{path: string, volume: number}|null} bgm - BGM。ナレーションの下に小音量で自動ループ
 * @param {string|null} subtitlePath - 焼き込む字幕(SRT)。nullなら字幕なし
 * @returns {Promise<string>} 完成mp4のパス
 */
export async function assemble(clipPaths, voicePath, tailClipPaths = [], bgm = null, subtitlePath = null) {
  if (!clipPaths.length && !tailClipPaths.length) throw new Error('合成するクリップが1つもありません');

  const voiceDur = await ffprobeDuration(voicePath);
  if (voiceDur > 150) {
    throw new Error(`ナレーションが${Math.round(voiceDur)}秒あります。このシステムは120秒までの短尺特化です。台本を短くしてください`);
  }

  const tmp = [];

  // 末尾クリップ(店舗外観→LINE CTA 等)は尺を確保して必ず最後に置き、本体はその手前まで
  const tailClips = [];
  let endDur = 0;
  for (let i = 0; i < tailClipPaths.length; i++) {
    const n = await normalizeClip(tailClipPaths[i], `tail${i}`);
    tmp.push(n);
    endDur += await ffprobeDuration(n);
    tailClips.push(n);
  }
  endDur = Math.min(endDur, voiceDur);
  const bodyTarget = voiceDur - endDur;

  // 本体: 各クリップを1回ずつ順番に(ループ・繰り返しは広告に致命的なので厳禁)。
  // ナレーション尺との差はクリップの再生速度の微調整で埋める。同じ映像は二度と出さない。
  let bodyPath = null;
  if (bodyTarget > 0.5) {
    if (!clipPaths.length) throw new Error('本体クリップがありません(素材IDか動画プロンプトが必要)');
    const normalized = [];
    for (let i = 0; i < clipPaths.length; i++) {
      normalized.push(await normalizeClip(clipPaths[i], i));
    }
    tmp.push(...normalized);

    // 全クリップを1回ずつ連結して実尺を測る
    const bodyList = path.join(config.workDir, `concat-body-${Date.now()}.txt`);
    await fs.writeFile(bodyList, normalized.map((p) => `file '${p}'`).join('\n'));
    tmp.push(bodyList);
    const rawBody = path.join(config.workDir, `rawbody-${Date.now()}.mp4`);
    tmp.push(rawBody);
    await run('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', bodyList, '-c', 'copy', rawBody]);
    const rawDur = await ffprobeDuration(rawBody);

    // 速度で尺合わせ。factor>1=ゆっくり(伸ばす)/<1=速く(縮める)
    let factor = bodyTarget / rawDur;
    if (factor > 1.6) {
      // ここまで足りないと不自然なスローになる。ループさせず、素材追加を促して止める
      throw new Error(
        `映像素材が約${Math.round(bodyTarget - rawDur)}秒不足しています。` +
        `素材を追加するか台本を短くしてください(繰り返し再生は広告に不向きなので自動ループはしません)`);
    }
    factor = Math.max(0.6, Math.min(1.6, factor));

    bodyPath = path.join(config.workDir, `body-${Date.now()}.mp4`);
    tmp.push(bodyPath);
    await run('ffmpeg', [
      '-y', '-i', rawBody,
      '-vf', `setpts=${factor.toFixed(4)}*PTS`,
      '-t', String(bodyTarget.toFixed(2)),
      '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '20',
      bodyPath,
    ]);
  }

  // 本体 + 末尾クリップ(店舗外観→LINE CTA)を連結し、ナレーションを重ねる
  const finalList = path.join(config.workDir, `concat-final-${Date.now()}.txt`);
  const parts = [bodyPath, ...tailClips].filter(Boolean);
  await fs.writeFile(finalList, parts.map((p) => `file '${p}'`).join('\n'));
  tmp.push(finalList);

  const out = path.join(config.workDir, `ad-${Date.now()}.mp4`);
  const args = [
    '-y',
    '-f', 'concat', '-safe', '0', '-i', finalList,
    '-i', voicePath,
  ];

  // 字幕焼き込み(SNSは音声OFF視聴が多いため)。日本語フォントはVPSに要インストール(fonts-noto-cjk)
  const subFilter = subtitlePath
    ? `subtitles=${subtitlePath}:force_style='FontName=Noto Sans CJK JP,FontSize=14,PrimaryColour=&HFFFFFF,OutlineColour=&H000000,Outline=2,MarginV=60,Alignment=2'`
    : null;

  if (bgm) {
    // BGMは自動ループでナレーションの下に敷く(duration=firstでナレーション長に揃う)
    // 注: ffmpeg4系のamixは出力を入力数で割る(半減する)ため、先に2倍して相殺する
    args.push('-stream_loop', '-1', '-i', bgm.path);
    const vChain = subFilter ? `[0:v]${subFilter}[vout];` : '';
    args.push('-filter_complex',
      `${vChain}[1:a]volume=2.0[vo];[2:a]volume=${bgm.volume * 2}[bg];[vo][bg]amix=inputs=2:duration=first:dropout_transition=0[aout]`);
    args.push('-map', subFilter ? '[vout]' : '0:v', '-map', '[aout]');
  } else if (subFilter) {
    args.push('-filter_complex', `[0:v]${subFilter}[vout]`);
    args.push('-map', '[vout]', '-map', '1:a');
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
