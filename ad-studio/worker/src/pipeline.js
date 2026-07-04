/**
 * パイプライン — 1ジョブを最後まで処理する。
 * full: 台本 → Fish Audioナレーション → (プロンプトがあれば)AI動画生成 → 素材と合成 → Driveへ
 * 各段階のコストを円換算で積算してシートに書き戻す。
 */
import { config } from './config.js';
import { JOB_COL, getScript, getMaterials, getSetting, updateVariantUrl } from './sheets.js';
import { getVoiceProvider } from './providers/voice/index.js';
import { getVideoProvider } from './providers/video/index.js';
import { assemble, trimClip, ffprobeDuration } from './assemble.js';
import { downloadFile, uploadOutput } from './drive.js';

export async function processJob(job) {
  const row = job.row;
  const type = row[JOB_COL.TYPE] || 'full';
  const notes = [];
  let cost = 0;

  // --- 台本 ---
  const script = await getScript(row[JOB_COL.SCRIPT_ID]);
  const narration = [script.hook, script.body, script.cta].filter(Boolean).join('\n');

  // --- 音声(Fish Audio) ---
  const voiceId = row[JOB_COL.VOICE_ID] || (await getSetting('デフォルトボイスID'));
  const voice = await getVoiceProvider().synthesize({ text: narration, voiceId });
  cost += Math.ceil(voice.chars / 1000) * config.cost.voicePer1kChars;
  notes.push(`音声${voice.chars}文字`);

  // --- 字幕(音声OFF視聴対策。台本テキスト+音声尺から生成。設定シート「字幕」= off で無効化) ---
  let subtitlePath = null;
  if ((await getSetting('字幕', 'on')).toLowerCase() !== 'off' && type !== 'voice') {
    try {
      const voiceDur = await ffprobeDuration(voice.filePath);
      const { buildSrtFromText } = await import('./subtitle.js');
      subtitlePath = await buildSrtFromText(narration, voiceDur);
      notes.push(subtitlePath ? '字幕あり' : '字幕スキップ(生成結果なし)');
    } catch (err) {
      // 字幕は失敗しても動画自体は作る(エラーで全体を止めない)
      notes.push(`字幕スキップ(${String(err.message).slice(0, 80)})`);
    }
  }

  if (type === 'voice') {
    const up = await uploadOutput(voice.filePath, `voice-${row[JOB_COL.ID]}.mp3`);
    return { fileId: up.fileId, url: up.url, cost, note: notes.join(' / ') };
  }

  // --- 映像クリップ収集: AI生成(フック=冒頭) + 撮影素材(本体) ---
  const clips = [];

  const videoPrompt = row[JOB_COL.VIDEO_PROMPT];
  if (videoPrompt) {
    const aspect = await getSetting('アスペクト比', '9:16');
    const gen = await getVideoProvider().generate({
      prompt: buildVideoPrompt(videoPrompt),
      durationSec: 5,
      aspectRatio: aspect,
    });
    if (gen.filePath) {
      // 悩み再現などの演技シーンはフックとして必ず冒頭に置く
      clips.push(gen.filePath);
      cost += config.cost.videoPerGeneration;
    }
    if (gen.note) notes.push(gen.note);
  }

  const materials = await getMaterials(row[JOB_COL.MATERIAL_IDS]);
  for (const m of materials) {
    let filePath = await downloadFile(m.driveFileId);
    if (m.startSec || m.endSec) {
      filePath = await trimClip(filePath, m.startSec, m.endSec);
      notes.push(`素材:${m.id}(${m.startSec}-${m.endSec || '末尾'}秒)`);
    } else {
      notes.push(`素材:${m.id}`);
    }
    clips.push(filePath);
  }

  // --- 末尾クリップ: 店舗外観エンドカード → 共通CTA(LINEタップ等)の順で必ず最後に配置 ---
  const tailClipPaths = [];

  const endMaterialId = row[JOB_COL.END_MATERIAL_ID];
  if (endMaterialId) {
    const [endMat] = await getMaterials(endMaterialId);
    let p = await downloadFile(endMat.driveFileId);
    if (endMat.startSec || endMat.endSec) p = await trimClip(p, endMat.startSec, endMat.endSec);
    tailClipPaths.push(p);
    notes.push(`エンド:${endMat.id}`);
  }

  // 共通CTA素材(設定シート「共通CTA素材ID」)。全カテゴリ・全店舗で使い回す最後の行動喚起カット
  const ctaMaterialId = await getSetting('共通CTA素材ID', '');
  if (ctaMaterialId) {
    const [ctaMat] = await getMaterials(ctaMaterialId);
    let p = await downloadFile(ctaMat.driveFileId);
    if (ctaMat.startSec || ctaMat.endSec) p = await trimClip(p, ctaMat.startSec, ctaMat.endSec);
    tailClipPaths.push(p);
    notes.push(`CTA:${ctaMat.id}`);
  }

  if (!clips.length && !tailClipPaths.length) {
    throw new Error('映像素材がありません。素材IDか動画プロンプトのどちらかは必要です');
  }

  // --- BGM(設定シートにDriveファイルIDがあれば全動画に自動で敷く) ---
  let bgm = null;
  const bgmFileId = await getSetting('BGMのDriveファイルID', '');
  if (bgmFileId) {
    bgm = {
      path: await downloadFile(bgmFileId),
      volume: Number(await getSetting('BGM音量', '0.15')) || 0.15,
    };
    notes.push('BGMあり');
  }

  // --- 合成 ---
  const finalPath = await assemble(clips, voice.filePath, tailClipPaths, bgm, subtitlePath);
  const up = await uploadOutput(finalPath, `ad-${row[JOB_COL.ID]}.mp4`);
  await updateVariantUrl(row[JOB_COL.ID], up.url);

  return { fileId: up.fileId, url: up.url, cost, note: notes.join(' / ') };
}

/**
 * 生成プロンプト共通味付け。
 * シーン内容(悩み再現・ライフスタイル等)は台本AIの hook_scene が担うので、
 * ここでは品質・構図の指定だけ足す(院内描写は実写素材の役目なので入れない)。
 */
function buildVideoPrompt(userPrompt) {
  return [
    userPrompt,
    'realistic cinematic footage, natural skin tones, high quality,',
    'vertical 9:16 composition, no text overlays',
  ].join(' ');
}
