/**
 * 字幕生成 — ASRのタイムスタンプからSRTファイルを作る。
 * 長いセグメントは読みやすい長さ(約18文字)で分割し、時間を文字数比で按分する。
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';

const MAX_CHARS = 14; // 縦動画字幕の1行目安(大きめフォントでも1080px幅に収まる長さ)

// この文字の"直後"なら改行してよい(句読点・閉じ括弧)。単語の途中で切らないため
const BREAK_AFTER = '、。！？!?…」』）】〉》';
// 文節の切れ目になりやすい助詞(次点の改行位置。単語の途中よりはるかにマシ)
const PARTICLE = 'はがをにへでともものやかねよねぞぜわさ';

function fmtTime(sec) {
  const ms = Math.max(0, Math.round(sec * 1000));
  const h = String(Math.floor(ms / 3600000)).padStart(2, '0');
  const m = String(Math.floor((ms % 3600000) / 60000)).padStart(2, '0');
  const s = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0');
  const mmm = String(ms % 1000).padStart(3, '0');
  return `${h}:${m}:${s},${mmm}`;
}

/**
 * 長いテキストを"言葉をぶった切らない"よう分割する。
 * 優先度: ①句読点・閉じ括弧の直後 → ②助詞の直後(文節の切れ目) → ③どうしても無ければ長さで
 */
function splitText(text) {
  const parts = [];
  let rest = text;
  while (rest.length > MAX_CHARS) {
    const hi = Math.min(MAX_CHARS, rest.length - 1);
    let cut = -1;
    // ① 句読点・閉じ括弧の直後で切る(最優先=一番自然)
    for (let i = hi; i > 4; i--) {
      if (BREAK_AFTER.includes(rest[i])) { cut = i + 1; break; }
    }
    // ② 無ければ助詞の直後で切る。ただし直後が句読点なら孤立させない
    if (cut === -1) {
      for (let i = hi; i > 4; i--) {
        if (PARTICLE.includes(rest[i]) && !BREAK_AFTER.includes(rest[i + 1] || '')) { cut = i + 1; break; }
      }
    }
    // ③ 最後の手段(ここまで来ることは稀)
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
