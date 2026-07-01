/**
 * パイプライン — 1ジョブを最後まで処理する。
 * full: 台本 → Fish Audioナレーション → (プロンプトがあれば)AI動画生成 → 素材と合成 → Driveへ
 * 各段階のコストを円換算で積算してシートに書き戻す。
 */
import { config } from './config.js';
import { JOB_COL, getScript, getMaterials, getSetting, updateVariantUrl } from './sheets.js';
import { getVoiceProvider } from './providers/voice/index.js';
import { getVideoProvider } from './providers/video/index.js';
import { assemble } from './assemble.js';
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

  if (type === 'voice') {
    const up = await uploadOutput(voice.filePath, `voice-${row[JOB_COL.ID]}.mp3`);
    return { fileId: up.fileId, url: up.url, cost, note: notes.join(' / ') };
  }

  // --- 映像クリップ収集: 撮影素材 + AI生成 ---
  const clips = [];

  const materials = await getMaterials(row[JOB_COL.MATERIAL_IDS]);
  for (const m of materials) {
    clips.push(await downloadFile(m.driveFileId));
    notes.push(`素材:${m.id}`);
  }

  const videoPrompt = row[JOB_COL.VIDEO_PROMPT];
  if (videoPrompt) {
    const aspect = await getSetting('アスペクト比', '9:16');
    const gen = await getVideoProvider().generate({
      prompt: buildVideoPrompt(videoPrompt),
      durationSec: 5,
      aspectRatio: aspect,
    });
    if (gen.filePath) {
      clips.push(gen.filePath);
      cost += config.cost.videoPerGeneration;
    }
    if (gen.note) notes.push(gen.note);
  }

  if (!clips.length) {
    throw new Error('映像素材がありません。素材IDか動画プロンプトのどちらかは必要です');
  }

  // --- 合成 ---
  const finalPath = await assemble(clips, voice.filePath);
  const up = await uploadOutput(finalPath, `ad-${row[JOB_COL.ID]}.mp4`);
  await updateVariantUrl(row[JOB_COL.ID], up.url);

  return { fileId: up.fileId, url: up.url, cost, note: notes.join(' / ') };
}

/** 整骨院広告向けの生成プロンプト共通味付け */
function buildVideoPrompt(userPrompt) {
  return [
    userPrompt,
    'Japanese osteopathic clinic (seikotsuin) advertisement footage,',
    'clean bright interior, professional and trustworthy atmosphere,',
    'soft natural lighting, high quality, vertical composition',
  ].join(' ');
}
