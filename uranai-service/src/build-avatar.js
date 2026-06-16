// 天使の梯子（薄明光線）アバター／サムネ素材を生成する。
// 雲の切れ間から光の筋が降りる夜明けの空を、帝の書の配色でベクター描画。正方形(アバター)。
//   実行: node src/build-avatar.js
const fs = require('fs');
const path = require('path');
const { createCanvas } = require('@napi-rs/canvas');

const S = 1000; // 正方形

function draw() {
  const c = createCanvas(S, S);
  const x = c.getContext('2d');

  // 1) 空のグラデ（深い紺の夜明け → 紫 → 朝焼け → 足元の暗がり）
  const g = x.createLinearGradient(0, 0, 0, S);
  g.addColorStop(0, '#0a1330'); g.addColorStop(0.32, '#1b2a55'); g.addColorStop(0.55, '#3f3568');
  g.addColorStop(0.74, '#8a4d60'); g.addColorStop(0.88, '#c9703f'); g.addColorStop(1, '#3a2415');
  x.fillStyle = g; x.fillRect(0, 0, S, S);

  // 2) 星（上部に散らす）
  x.save();
  for (let i = 0; i < 160; i++) {
    const sx = Math.random() * S, sy = Math.random() * S * 0.5;
    x.globalAlpha = 0.2 + Math.random() * 0.5; x.fillStyle = Math.random() < 0.2 ? '#ffe6a8' : '#ffffff';
    x.beginPath(); x.arc(sx, sy, 0.6 + Math.random() * 1.4, 0, Math.PI * 2); x.fill();
  }
  x.restore();

  // 光源（雲の切れ間）：少し上・中央やや右
  const sx = S * 0.52, sy = S * 0.2;

  // 3) 天使の梯子（薄明光線）：光源から下へ広がる光の筋。加算合成で柔らかく光らせる。
  x.save();
  x.globalCompositeOperation = 'lighter';
  x.translate(sx, sy);
  const beams = 11;
  for (let i = 0; i < beams; i++) {
    const baseA = Math.PI / 2 + (i - (beams - 1) / 2) * 0.085; // ほぼ真下に扇状
    const spread = 0.012 + Math.random() * 0.01;
    const len = S * (0.95 + Math.random() * 0.25);
    const a1 = baseA - spread, a2 = baseA + spread;
    const grad = x.createLinearGradient(0, 0, Math.cos(baseA) * len, Math.sin(baseA) * len);
    const bright = 0.10 + Math.random() * 0.12;
    grad.addColorStop(0, `rgba(255,243,205,${bright})`);
    grad.addColorStop(0.5, `rgba(255,226,150,${bright * 0.55})`);
    grad.addColorStop(1, 'rgba(255,210,130,0)');
    x.fillStyle = grad;
    x.beginPath(); x.moveTo(0, 0);
    x.lineTo(Math.cos(a1) * len, Math.sin(a1) * len);
    x.lineTo(Math.cos(a2) * len, Math.sin(a2) * len);
    x.closePath(); x.fill();
  }
  x.restore();

  // 4) 光源の輝き（雲の切れ間から漏れる光）。orbは小さめにして"太陽"でなく"隙間の光"に。
  const ring = x.createRadialGradient(sx, sy, 1, sx, sy, S * 0.1);
  ring.addColorStop(0, 'rgba(255,255,250,0.95)'); ring.addColorStop(0.35, 'rgba(255,234,172,0.7)');
  ring.addColorStop(1, 'rgba(232,170,80,0)');
  x.fillStyle = ring; x.beginPath(); x.arc(sx, sy, S * 0.1, 0, Math.PI * 2); x.fill();

  // 5) 雲（光源の左右に置き、その切れ間から光が降りる形に）
  x.save();
  const cloud = (cx, cy, rw, rh, col) => { x.fillStyle = col; x.beginPath(); x.ellipse(cx, cy, rw, rh, 0, 0, Math.PI * 2); x.fill(); };
  cloud(S * 0.20, S * 0.19, S * 0.26, S * 0.05, 'rgba(18,15,28,0.6)');
  cloud(S * 0.84, S * 0.17, S * 0.26, S * 0.05, 'rgba(18,15,28,0.58)');
  cloud(S * 0.30, S * 0.28, S * 0.22, S * 0.038, 'rgba(18,15,28,0.4)');
  cloud(S * 0.74, S * 0.30, S * 0.20, S * 0.034, 'rgba(18,15,28,0.36)');
  x.restore();

  // 6) 地平の光（足元から昇るほのかな光）
  const hor = x.createRadialGradient(S * 0.5, S * 0.98, 2, S * 0.5, S * 0.98, S * 0.35);
  hor.addColorStop(0, 'rgba(255,236,196,0.55)'); hor.addColorStop(1, 'rgba(255,236,196,0)');
  x.fillStyle = hor; x.fillRect(0, S * 0.7, S, S * 0.3);

  // 7) アバター用：円形ヴィネット＋金のリング
  const vig = x.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S * 0.52);
  vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, 'rgba(0,0,0,0.35)');
  x.fillStyle = vig; x.fillRect(0, 0, S, S);
  x.strokeStyle = 'rgba(214,176,106,0.85)'; x.lineWidth = 6;
  x.beginPath(); x.arc(S / 2, S / 2, S / 2 - 14, 0, Math.PI * 2); x.stroke();
  x.strokeStyle = 'rgba(214,176,106,0.4)'; x.lineWidth = 2;
  x.beginPath(); x.arc(S / 2, S / 2, S / 2 - 26, 0, Math.PI * 2); x.stroke();

  return c;
}

const outDir = path.join(__dirname, '..', 'web', 'assets');
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, 'avatar_天使の梯子.png');
fs.writeFileSync(out, draw().toBuffer('image/png'));
console.log('生成:', out);
