/**
 * 字幕生成 — ASRのタイムスタンプからSRTファイルを作る。
 * 長いセグメントは読みやすい長さ(約18文字)で分割し、時間を文字数比で按分する。
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';

const MAX_CHARS = 13; // 1080px幅に収まる1行の目安(はみ出し防止)

function fmtTime(sec) {
  const ms = Math.max(0, Math.round(sec * 1000));
  const h = String(Math.floor(ms / 3600000)).padStart(2, '0');
  const m = String(Math.floor((ms % 3600000) / 60000)).padStart(2, '0');
  const s = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0');
  const mmm = String(ms % 1000).padStart(3, '0');
  return `${h}:${m}:${s},${mmm}`;
}

/** 長いテキストを句読点優先で分割 */
function splitText(text) {
  const parts = [];
  let rest = text;
  while (rest.length > MAX_CHARS) {
    // 句読点で切れる位置を探す(なければ強制分割)
    let cut = -1;
    for (let i = MAX_CHARS; i > 5; i--) {
      if ('、。!?!?…'.includes(rest[i])) { cut = i + 1; break; }
    }
    if (cut === -1) cut = MAX_CHARS;
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  if (rest) parts.push(rest);
  return parts;
}

/**
 * 台本テキスト + 音声の総尺 から字幕を作る(ASR不要・確実)。
 * 全文を読みやすい長さに分割し、各キューの時間を文字数比で按分する。
 * @param {string} text - ナレーション全文
 * @param {number} totalDur - 音声の総尺(秒)
 * @returns {Promise<string|null>} SRTファイルのパス(生成不能ならnull)
 */
export async function buildSrtFromText(text, totalDur) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean || !(totalDur > 0)) return null;
  const chunks = splitText(clean).filter(Boolean);
  if (!chunks.length) return null;
  const totalChars = chunks.reduce((a, c) => a + c.length, 0) || 1;
  const cues = [];
  let t = 0;
  for (const c of chunks) {
    const d = totalDur * (c.length / totalChars);
    cues.push({ start: t, end: t + d, text: c });
    t += d;
  }
  const srt = cues.map((c, i) =>
    `${i + 1}\n${fmtTime(c.start)} --> ${fmtTime(c.end)}\n${c.text}\n`).join('\n');
  const srtPath = path.join(config.workDir, `sub-${Date.now()}.srt`);
  await fs.writeFile(srtPath, srt);
  return srtPath;
}

/**
 * @param {Array<{start:number,end:number,text:string}>} segments
 * @returns {Promise<string>} SRTファイルのパス
 */
export async function buildSrt(segments) {
  const cues = [];
  for (const seg of segments) {
    const parts = splitText(seg.text);
    const dur = seg.end - seg.start;
    const total = parts.reduce((a, p) => a + p.length, 0) || 1;
    let t = seg.start;
    for (const p of parts) {
      const d = dur * (p.length / total);
      cues.push({ start: t, end: t + d, text: p });
      t += d;
    }
  }
  const srt = cues.map((c, i) =>
    `${i + 1}\n${fmtTime(c.start)} --> ${fmtTime(c.end)}\n${c.text}\n`).join('\n');
  const srtPath = path.join(config.workDir, `sub-${Date.now()}.srt`);
  await fs.writeFile(srtPath, srt);
  return srtPath;
}
