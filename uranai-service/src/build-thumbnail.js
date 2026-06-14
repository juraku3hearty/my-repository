// ココナラ サムネイル画像ビルダー（自分のトリセツ）
// 役割：出品1枚目（クリック率を決める画像）を PNG で生成する。
// 2案を出力：
//   v1 クリーム（上品・落ち着き）   → samples/サムネ_自分のトリセツ_クリーム.png
//   v2 夜空×金（目を引く・神秘）     → samples/サムネ_自分のトリセツ.png（本命）
// @napi-rs/canvas（プレビルド）で日本語描画。

const fs = require('fs');
const path = require('path');
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');

GlobalFonts.registerFromPath('/usr/share/fonts/truetype/fonts-japanese-gothic.ttf', 'jp');

const W = 1200; // ココナラ 4:3
const H = 900;

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function boldText(ctx, text, x, y, weight) {
  for (let dx = -weight; dx <= weight; dx += weight) {
    for (let dy = -weight; dy <= weight; dy += weight) {
      ctx.fillText(text, x + dx, y + dy);
    }
  }
}

// 簡易擬似乱数（星の配置を毎回同じに）
function lcg(seed) {
  let s = seed;
  return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
}

function writeOut(canvas, name) {
  const out = path.join(__dirname, '..', 'samples', name);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, canvas.toBuffer('image/png'));
  console.log('サムネを出力しました: ' + out);
  return out;
}

// ── v2：夜空×金（本命）
function buildNight() {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  const COL = {
    plumTop: '#2a2050',
    plumBottom: '#140e2b',
    gold: '#e3b75e',
    goldBright: '#f6dca0',
    cream: '#f6edd8',
    sub: '#c9bfae',
    deep: '#241a3d',
    vermilion: '#d9694f',
  };

  // 背景グラデ（夜空）
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, COL.plumTop);
  g.addColorStop(1, COL.plumBottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // 星
  const rnd = lcg(7);
  for (let i = 0; i < 90; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    const r = rnd() * 1.8 + 0.4;
    ctx.fillStyle = `rgba(255,250,235,${0.15 + rnd() * 0.55})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // 中央の金の光（発光）
  const ex = W / 2;
  const ey = 612;
  const glow = ctx.createRadialGradient(ex, ey, 10, ex, ey, 300);
  glow.addColorStop(0, 'rgba(227,183,94,0.30)');
  glow.addColorStop(1, 'rgba(227,183,94,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 280, W, 560);

  // 金の二重額縁
  ctx.strokeStyle = COL.gold;
  ctx.lineWidth = 4;
  roundRect(ctx, 26, 26, W - 52, H - 52, 20);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(227,183,94,0.45)';
  ctx.lineWidth = 1.5;
  roundRect(ctx, 38, 38, W - 76, H - 76, 15);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // 上ラベル
  ctx.fillStyle = COL.gold;
  ctx.font = '38px jp';
  ctx.fillText('紫 微 斗 数  ×  帝 王 学', W / 2, 96);

  // ヒーロータイトル（発光＋太字風）
  ctx.save();
  ctx.shadowColor = 'rgba(246,220,160,0.55)';
  ctx.shadowBlur = 28;
  ctx.fillStyle = COL.goldBright;
  ctx.font = '140px jp';
  boldText(ctx, '自分のトリセツ', W / 2, 226, 1.5);
  ctx.restore();

  // 朱の一筋＋◆
  ctx.strokeStyle = COL.vermilion;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 78, 312);
  ctx.lineTo(W / 2 + 78, 312);
  ctx.stroke();
  ctx.fillStyle = COL.vermilion;
  ctx.font = '24px jp';
  ctx.fillText('◆', W / 2, 312);

  // フック
  ctx.fillStyle = COL.cream;
  ctx.font = '48px jp';
  boldText(ctx, '生まれ持った “強み” と “クセ” を、', W / 2, 386, 0.4);
  ctx.fillStyle = COL.goldBright;
  ctx.font = '46px jp';
  ctx.fillText('やさしく、そのまま言葉にする鑑定。', W / 2, 450);

  // 帝の金印（放射する光線＝サンバースト）
  ctx.save();
  for (let i = 0; i < 24; i++) {
    const a = (i * Math.PI) / 12;
    const long = i % 2 === 0;
    const r2 = long ? 168 : 132;
    const wdt = long ? 0.045 : 0.03;
    ctx.fillStyle = long ? 'rgba(227,183,94,0.55)' : 'rgba(227,183,94,0.30)';
    ctx.beginPath();
    ctx.moveTo(ex + Math.cos(a - wdt) * 86, ey + Math.sin(a - wdt) * 86);
    ctx.lineTo(ex + Math.cos(a) * r2, ey + Math.sin(a) * r2);
    ctx.lineTo(ex + Math.cos(a + wdt) * 86, ey + Math.sin(a + wdt) * 86);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // 中央の金ディスク
  const disc = ctx.createRadialGradient(ex - 18, ey - 18, 8, ex, ey, 84);
  disc.addColorStop(0, COL.goldBright);
  disc.addColorStop(1, COL.gold);
  ctx.fillStyle = disc;
  ctx.beginPath();
  ctx.arc(ex, ey, 84, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#f6dca0';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(ex, ey, 84, 0, Math.PI * 2);
  ctx.stroke();
  // 帝
  ctx.fillStyle = COL.deep;
  ctx.font = '82px jp';
  boldText(ctx, '帝', ex, ey + 4, 0.6);
  ctx.fillStyle = COL.cream;
  ctx.font = '26px jp';
  ctx.fillText('＝ あなた', ex, ey + 124);

  // 下部ピル
  const pills = ['自己理解の鑑定', 'PDFでお届け'];
  ctx.font = '30px jp';
  const pad = 30;
  const gap = 28;
  const widths = pills.map((t) => ctx.measureText(t).width + pad * 2);
  const totalW = widths.reduce((a, b) => a + b, 0) + gap;
  let px = W / 2 - totalW / 2;
  const py = 802;
  const ph = 58;
  pills.forEach((t, i) => {
    ctx.fillStyle = 'rgba(246,220,160,0.10)';
    roundRect(ctx, px, py, widths[i], ph, ph / 2);
    ctx.fill();
    ctx.strokeStyle = COL.gold;
    ctx.lineWidth = 1.5;
    roundRect(ctx, px, py, widths[i], ph, ph / 2);
    ctx.stroke();
    ctx.fillStyle = COL.goldBright;
    ctx.fillText(t, px + widths[i] / 2, py + ph / 2 + 1);
    px += widths[i] + gap;
  });

  return writeOut(canvas, 'サムネ_自分のトリセツ.png');
}

// ── v1：クリーム（上品・落ち着き）
function buildCream() {
  const C = {
    creamTop: '#faf5ec', creamBottom: '#f1e8d6', ink: '#3a3330', throneInk: '#7a4f1e',
    gold: '#c79a4e', goldSoft: 'rgba(199,154,78,0.35)', vermilion: '#a14a3a',
    sub: '#8a7f76', throneBg: '#f8edd7', pillBg: '#efe7d8',
  };
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, C.creamTop); g.addColorStop(1, C.creamBottom);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = C.gold; ctx.fillRect(0, 0, W, 14); ctx.fillRect(0, H - 14, W, 14);
  ctx.strokeStyle = C.goldSoft; ctx.lineWidth = 2; roundRect(ctx, 34, 34, W - 68, H - 68, 18); ctx.stroke();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = C.gold; ctx.font = '40px jp'; ctx.fillText('紫 微 斗 数  ×  帝 王 学', W / 2, 92);
  ctx.save(); ctx.shadowColor = 'rgba(122,79,30,0.18)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 3;
  ctx.fillStyle = C.throneInk; ctx.font = '132px jp'; boldText(ctx, '自分のトリセツ', W / 2, 220, 1.2); ctx.restore();
  ctx.strokeStyle = C.vermilion; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(W / 2 - 70, 300); ctx.lineTo(W / 2 + 70, 300); ctx.stroke();
  ctx.fillStyle = C.vermilion; ctx.font = '22px jp'; ctx.fillText('◆', W / 2, 300);
  ctx.fillStyle = C.ink; ctx.font = '46px jp'; ctx.fillText('生まれ持った “強み” と “クセ” を、', W / 2, 372);
  ctx.fillStyle = C.throneInk; ctx.font = '44px jp'; ctx.fillText('やさしく、そのまま言葉にする鑑定。', W / 2, 436);
  const ex = W / 2, ey = 632, ringR = 150;
  for (let i = 0; i < 8; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 4;
    const dx = ex + Math.cos(a) * ringR, dy = ey + Math.sin(a) * ringR;
    ctx.strokeStyle = C.goldSoft; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(dx, dy); ctx.stroke();
    ctx.fillStyle = C.gold; ctx.beginPath(); ctx.arc(dx, dy, 11, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = C.throneBg; ctx.beginPath(); ctx.arc(ex, ey, 78, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = C.gold; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(ex, ey, 78, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = C.throneInk; ctx.font = '72px jp'; ctx.fillText('帝', ex, ey + 4);
  ctx.fillStyle = C.sub; ctx.font = '24px jp'; ctx.fillText('＝あなた', ex, ey + 112);
  const pills = ['自己理解の鑑定', 'PDFでお届け']; ctx.font = '30px jp';
  const pad = 28, gap = 26; const widths = pills.map((t) => ctx.measureText(t).width + pad * 2);
  const totalW = widths.reduce((a, b) => a + b, 0) + gap; let px = W / 2 - totalW / 2; const py = 812, ph = 56;
  pills.forEach((t, i) => {
    ctx.fillStyle = C.pillBg; roundRect(ctx, px, py, widths[i], ph, ph / 2); ctx.fill();
    ctx.strokeStyle = C.goldSoft; ctx.lineWidth = 1.5; roundRect(ctx, px, py, widths[i], ph, ph / 2); ctx.stroke();
    ctx.fillStyle = C.throneInk; ctx.fillText(t, px + widths[i] / 2, py + ph / 2 + 1); px += widths[i] + gap;
  });
  return writeOut(canvas, 'サムネ_自分のトリセツ_クリーム.png');
}

if (require.main === module) {
  buildNight();
  buildCream();
}
module.exports = { buildNight, buildCream };
