// 自己完結HTML（背景を軽量JPGで埋め込み）を家族5人ぶん生成
// 1ファイルで完結＝ダブルクリックでブラウザ表示→⌘PでPDF保存。
// 背景は web/assets/*.png を JPEG 圧縮して data URI 化（1ファイル ~1.5MB に圧縮）。
//   実行: node src/build-standalone.js

const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { buildChart } = require('./generate-chart');
const { render } = require('./build-html');

const ASSETS = path.join(__dirname, '..', 'web', 'assets');
const OUT = path.join(__dirname, '..', 'web', 'standalone');

const FAMILY = [
  { name: '平井真弓', solar: '1983-1-8',   time: 2, gender: '女' },
  { name: '平井伸幸', solar: '1983-3-14',  time: 4, gender: '男' },
  { name: '平井麗波', solar: '2008-8-1',   time: 8, gender: '女' },
  { name: '平井絢葉', solar: '2011-12-12', time: 8, gender: '女' },
  { name: '平井琴芭', solar: '2013-7-28',  time: 9, gender: '女' },
];

// PNG → JPEG(品質)で軽量化し data URI 化
async function jpgURI(file, quality = 0.82) {
  const img = await loadImage(path.join(ASSETS, file));
  const c = createCanvas(img.width, img.height);
  c.getContext('2d').drawImage(img, 0, 0);
  const buf = c.toBuffer('image/jpeg', quality);
  return { uri: 'data:image/jpeg;base64,' + buf.toString('base64'), kb: Math.round(buf.length / 1024) };
}

(async () => {
  const cover = await jpgURI('cover.png');
  const court = await jpgURI('court.png');
  const body = await jpgURI('body.png');
  console.log(`背景JPG: cover ${cover.kb}KB / court ${court.kb}KB / body ${body.kb}KB`);
  const assets = { cover: cover.uri, court: court.uri, body: body.uri };

  fs.mkdirSync(OUT, { recursive: true });
  FAMILY.forEach((m) => {
    const astro = buildChart(m.solar, m.time, m.gender);
    const html = render(astro, { name: m.name, assets });
    const out = path.join(OUT, `帝の書_${m.name}.html`);
    fs.writeFileSync(out, html);
    console.log(`${m.name} → ${path.basename(out)}　${Math.round(Buffer.byteLength(html) / 1024)}KB`);
  });
  console.log('\n各ファイルをダウンロード→ダブルクリックでブラウザ表示→⌘P→PDFに保存（背景オン・余白なし）。');
})();
