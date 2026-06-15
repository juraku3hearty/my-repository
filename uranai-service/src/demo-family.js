// 家族5人ぶんのデモを一括生成（見比べ用）
// 各誕生日から iztro で新規計算 → web/out/ に HTML を出力。
// 背景3枚(web/assets/)が入っていれば、そのまま絵が乗る。
//   実行: node src/demo-family.js

const fs = require('fs');
const path = require('path');
const { buildChart } = require('./generate-chart');
const { render } = require('./build-html');

// 時刻 → 時辰index: 0=23-01,1=01-03,2=03-05,3=05-07,4=07-09,5=09-11,
//                    6=11-13,7=13-15,8=15-17,9=17-19,10=19-21,11=21-23,12=23-01
const FAMILY = [
  { label: '本人', solar: '1983-1-8',   time: 2, gender: '女', note: '4:13 滋賀' },
  { label: '旦那', solar: '1983-3-14',  time: 4, gender: '男', note: '8:45 京都' },
  { label: '長女', solar: '2008-8-1',   time: 8, gender: '女', note: '15:51 京都' },
  { label: '次女', solar: '2011-12-12', time: 8, gender: '女', note: '16:24 京都' },
  { label: '三女', solar: '2013-7-28',  time: 9, gender: '女', note: '17:43 京都' },
];

const outDir = path.join(__dirname, '..', 'web', 'out');
fs.mkdirSync(outDir, { recursive: true });

FAMILY.forEach((m) => {
  const astro = buildChart(m.solar, m.time, m.gender);
  const html = render(astro);
  const out = path.join(outDir, `帝の書_${m.label}_${m.solar}.html`);
  fs.writeFileSync(out, html);
  // 命宮の主星（空宮なら借星）を軽くログ
  const mei = astro.palaces.find((p) => p.name === '命宮');
  const stars = (mei.majorStars.length ? mei.majorStars : (astro.palaces.find((p) => p.name === '遷移').majorStars))
    .map((s) => s.name).join('・');
  console.log(`${m.label}（${m.note}）→ ${path.basename(out)}　命宮:${mei.majorStars.length ? '' : '空宮→借'}${stars}`);
});
console.log('\n5人ぶん生成しました。背景を入れたら Chrome で開く → ⌘P → PDF保存（余白なし・背景オン）。');
