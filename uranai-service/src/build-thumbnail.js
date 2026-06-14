// ココナラ サムネイル画像ビルダー（自分のトリセツ）
// 役割：出品1枚目（クリック率を決める画像）を PNG で生成する。
// PDF と配色を統一（クリーム＋金、朱は一筋）。@napi-rs/canvas（プレビルド）で日本語描画。
//
// 使い方:  node src/build-thumbnail.js  → samples/サムネ_自分のトリセツ.png

const fs = require('fs');
const path = require('path');
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');

GlobalFonts.registerFromPath('/usr/share/fonts/truetype/fonts-japanese-gothic.ttf', 'jp');

// ココナラ表示は 4:3。1200×900 で作る。
const W = 1200;
const H = 900;

const C = {
  creamTop: '#faf5ec',
  creamBottom: '#f1e8d6',
  ink: '#3a3330',
  throneInk: '#7a4f1e',
  gold: '#c79a4e',
  goldSoft: 'rgba(199,154,78,0.35)',
  vermilion: '#a14a3a',
  sub: '#8a7f76',
  throneBg: '#f8edd7',
  pillBg: '#efe7d8',
};

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// 太字風に見せる（同じ字を微小オフセットで重ね描き）
function boldText(ctx, text, x, y, weight = 1.1) {
  for (let dx = -weight; dx <= weight; dx += weight) {
    for (let dy = -weight; dy <= weight; dy += weight) {
      ctx.fillText(text, x + dx, y + dy);
    }
  }
}

function build() {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // 背景（クリームの縦グラデ）
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, C.creamTop);
  g.addColorStop(1, C.creamBottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // 上下の金帯
  ctx.fillStyle = C.gold;
  ctx.fillRect(0, 0, W, 14);
  ctx.fillRect(0, H - 14, W, 14);
  // 内側の細い罫（額縁感）
  ctx.strokeStyle = C.goldSoft;
  ctx.lineWidth = 2;
  roundRect(ctx, 34, 34, W - 68, H - 68, 18);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // 上ラベル
  ctx.fillStyle = C.gold;
  ctx.font = '40px jp';
  ctx.fillText('紫 微 斗 数  ×  帝 王 学', W / 2, 92);

  // ヒーロータイトル
  ctx.save();
  ctx.shadowColor = 'rgba(122,79,30,0.18)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle = C.throneInk;
  ctx.font = '132px jp';
  boldText(ctx, '自分のトリセツ', W / 2, 220, 1.2);
  ctx.restore();

  // 朱の一筋＋◆
  ctx.strokeStyle = C.vermilion;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 70, 300);
  ctx.lineTo(W / 2 + 70, 300);
  ctx.stroke();
  ctx.fillStyle = C.vermilion;
  ctx.font = '22px jp';
  ctx.fillText('◆', W / 2, 300);

  // フック（差別化＝倫理）
  ctx.fillStyle = C.ink;
  ctx.font = '48px jp';
  ctx.fillText('「こうしなさい」とは、言いません。', W / 2, 372);
  ctx.fillStyle = C.throneInk;
  ctx.font = '44px jp';
  ctx.fillText('あなたを、そのまま言葉にする鑑定。', W / 2, 436);

  // ミニ朝廷図の印章（帝＋臣下の点）
  const ex = W / 2;
  const ey = 632;
  const ringR = 150;
  // スポーク＋臣下の点
  ctx.save();
  for (let i = 0; i < 8; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 4;
    const dx = ex + Math.cos(a) * ringR;
    const dy = ey + Math.sin(a) * ringR;
    ctx.strokeStyle = C.goldSoft;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(dx, dy);
    ctx.stroke();
    ctx.fillStyle = C.gold;
    ctx.beginPath();
    ctx.arc(dx, dy, 11, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  // 中央の玉座（円）
  ctx.fillStyle = C.throneBg;
  ctx.beginPath();
  ctx.arc(ex, ey, 78, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = C.gold;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(ex, ey, 78, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = C.throneInk;
  ctx.font = '72px jp';
  ctx.fillText('帝', ex, ey + 4);
  ctx.fillStyle = C.sub;
  ctx.font = '24px jp';
  ctx.fillText('＝あなた', ex, ey + 112);

  // 下部ピル（2つ）
  const pills = ['自己理解の鑑定', 'PDFでお届け'];
  ctx.font = '30px jp';
  const pad = 28;
  const gap = 26;
  const widths = pills.map((t) => ctx.measureText(t).width + pad * 2);
  const totalW = widths.reduce((a, b) => a + b, 0) + gap;
  let px = W / 2 - totalW / 2;
  const py = 812;
  const ph = 56;
  pills.forEach((t, i) => {
    ctx.fillStyle = C.pillBg;
    roundRect(ctx, px, py, widths[i], ph, ph / 2);
    ctx.fill();
    ctx.strokeStyle = C.goldSoft;
    ctx.lineWidth = 1.5;
    roundRect(ctx, px, py, widths[i], ph, ph / 2);
    ctx.stroke();
    ctx.fillStyle = C.throneInk;
    ctx.fillText(t, px + widths[i] / 2, py + ph / 2 + 1);
    px += widths[i] + gap;
  });

  const out = path.join(__dirname, '..', 'samples', 'サムネ_自分のトリセツ.png');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, canvas.toBuffer('image/png'));
  console.log('サムネを出力しました: ' + out);
  return out;
}

if (require.main === module) build();
module.exports = { build };
