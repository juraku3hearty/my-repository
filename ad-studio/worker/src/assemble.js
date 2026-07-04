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

/** ffmpeg フィルタ用のエスケープ(パス・特殊文字) */
function escFilterPath(p) {
  return p.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'");
}

/** 日本語テロップ用の drawtext を作る。textfile方式でエスケープ地獄を回避 */
async function drawtextFilter(text, { size, y, boxAlpha = 0.5 }) {
  const txtPath = path.join(config.workDir, `txt-${Date.now()}-${Math.floor(Math.random() * 1e6)}.txt`);
  await fs.writeFile(txtPath, text);
  const parts = [
    `fontfile='${escFilterPath(config.fontFile)}'`,
    `textfile='${escFilterPath(txtPath)}'`,
    `fontsize=${size}`,
    'fontcolor=white',
    'box=1', `boxcolor=black@${boxAlpha}`, 'boxborderw=12',
    'x=(w-text_w)/2', `y=${y}`,
  ].join(':');
  return { filter: `drawtext=${parts}`, txtPath };
}

/**
 * クリップを縦型に正規化(拡大クロップ・無音化)。
 * label があれば上部に「施術前」等のテロップを、disclaimer があれば下部に注意書きを焼く。
 */
async function normalizeClip(input, index, label = '', disclaimer = '') {
  const out = path.join(config.workDir, `norm-${Date.now()}-${index}.mp4`);
  const vf = [`scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${FPS},format=yuv420p`];
  const txtFiles = [];
  if (label) {
    const d = await drawtextFilter(label, { size: 72, y: 120, boxAlpha: 0.55 });
    vf.push(d.filter);
    txtFiles.push(d.txtPath);
  }
  if (disclaimer) {
    const d = await drawtextFilter(disclaimer, { size: 30, y: 'h-70', boxAlpha: 0.45 });
    vf.push(d.filter);
    txtFiles.push(d.txtPath);
  }
  await run('ffmpeg', [
    '-y', '-i', input,
    '-vf', vf.join(','),
    '-an',
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '20',
    out,
  ]);
  for (const f of txtFiles) await fs.unlink(f).catch(() => {});
  return out;
}

/**
 * @param {Array<{path:string,label?:string}>} bodyClips - 本体クリップ(表示順)。labelがあれば上部にテロップを焼く
 * @param {string} voicePath - ナレーション音声(mp3)
 * @param {string[]} tailClipPaths - 動画の末尾に順番どおり固定配置するクリップ(店舗外観→LINE CTA 等。事前トリム済み)
 * @param {{path: string, volume: number}|null} bgm - BGM。ナレーションの下に小音量で自動ループ
 * @param {string|null} subtitlePath - 焼き込む字幕(SRT)。nullなら字幕なし
 * @param {string} disclaimer - 全カットの下部に常時表示する注意書き(「効果には個人差があります」等)。空なら無し
 * @returns {Promise<string>} 完成mp4のパス
 */
export async function assemble(bodyClips, voicePath, tailClipPaths = [], bgm = null, subtitlePath = null, disclaimer = '') {
  if (!bodyClips.length && !tailClipPaths.length) throw new Error('合成するクリップが1つもありません');

  const voiceDur = await ffprobeDuration(voicePath);
  if (voiceDur > 150) {
    throw new Error(`ナレーションが${Math.round(voiceDur)}秒あります。このシステムは120秒までの短尺特化です。台本を短くしてください`);
  }

  const tmp = [];

  // 末尾クリップ(店舗外観→LINE CTA 等)は尺を確保して必ず最後に置き、本体はその手前まで
  const tailClips = [];
  let endDur = 0;
  for (let i = 0; i < tailClipPaths.length; i++) {
    const n = await normalizeClip(tailClipPaths[i], `tail${i}`, '', disclaimer);
    tmp.push(n);
    endDur += await ffprobeDuration(n);
    tailClips.push(n);
  }
  endDur = Math.min(endDur, voiceDur);
  const bodyTarget = voiceDur - endDur;

  // 本体: 各クリップを1回ずつ順番に(ループ・繰り返しは広告に致命的なので厳禁)。
  // 「施術前」「施術後」等のラベル付きクリップは"見せ場"なので最低表示秒数を確保し、
  // 一瞬で流れて変化が分からない事故を防ぐ。全体はナレーション尺にピッタリ合わせる。
  let bodyPath = null;
  if (bodyTarget > 0.5) {
    if (!bodyClips.length) throw new Error('本体クリップがありません(素材IDか動画プロンプトが必要)');

    // 各クリップを正規化し、自然な尺を測る
    const norm = [];
    for (let i = 0; i < bodyClips.length; i++) {
      const p = await normalizeClip(bodyClips[i].path, i, bodyClips[i].label || '', disclaimer);
      tmp.push(p);
      norm.push({ path: p, label: bodyClips[i].label || '', nat: await ffprobeDuration(p) });
    }

    // 目標尺: ラベル付き(見せ場=施術前/施術後など)は最低 MIN_KEY_DUR 秒を確保。
    // その合計をナレーション尺に合わせて全クリップ比例調整する。ラベル付きは相対的に長く残り、
    // ビフォー/アフターの違いをしっかり見せられる。
    const MIN_KEY_DUR = 2.6; // "施術後が一瞬"対策。見せ場をこの秒数以上ホールドする下限
    const targets = norm.map((c) => (c.label ? Math.max(c.nat, MIN_KEY_DUR) : c.nat));
    const sum = targets.reduce((a, d) => a + d, 0) || 1;
    const scale = bodyTarget / sum;

    // ナレーションが素材に対して長すぎると全編が不自然なスローになる。ループさせず素材追加を促す
    if (scale > 2.0) {
      throw new Error(
        `映像素材が約${Math.round(bodyTarget - sum)}秒不足しています。` +
        `素材を追加するか台本を短くしてください(繰り返し再生は広告に不向きなので自動ループはしません)`);
    }

    // 各クリップを目標尺へ個別に速度調整(見せ場は自然にスロー→しっかり見える)。
    // factor>1=スロー(伸ばす)/<1=速く(縮める)
    const fitted = [];
    for (let i = 0; i < norm.length; i++) {
      const target = targets[i] * scale;
      const factor = Math.max(0.5, Math.min(3.0, target / norm[i].nat));
      const f = path.join(config.workDir, `fit-${Date.now()}-${i}.mp4`);
      tmp.push(f);
      await run('ffmpeg', [
        '-y', '-i', norm[i].path,
        '-vf', `setpts=${factor.toFixed(4)}*PTS`,
        '-t', String(target.toFixed(2)),
        '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '20',
        f,
      ]);
      fitted.push(f);
    }

    const bodyList = path.join(config.workDir, `concat-body-${Date.now()}.txt`);
    await fs.writeFile(bodyList, fitted.map((p) => `file '${p}'`).join('\n'));
    tmp.push(bodyList);
    bodyPath = path.join(config.workDir, `body-${Date.now()}.mp4`);
    tmp.push(bodyPath);
    await run('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', bodyList, '-c', 'copy', bodyPath]);
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
  // 1080x1920に枠内収めるためPlayResを実解像度に合わせ、フォント・左右マージンを指定
  const subFilter = subtitlePath
    ? `subtitles=${subtitlePath}:force_style='FontName=Noto Sans CJK JP,FontSize=42,PrimaryColour=&HFFFFFF,OutlineColour=&H000000,BorderStyle=1,Outline=3,Shadow=1,MarginV=140,MarginL=60,MarginR=60,Alignment=2,PlayResX=1080,PlayResY=1920'`
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
