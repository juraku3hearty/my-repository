// 12タイプ診断シート（出生時間がわからない方むけ）
// 生年月日＋性別から時刻index 0..11 の命盤を12本つくり、各命宮の「欠点ベースのあるある」を1枚に並べる。
// ・並び順は時間順ではなくランダム（生年月日でシード＝同じ人なら毎回同じ並び）。客は中身で選ぶ。
// ・命宮主星が被ったスロットは、仕事(官祿)の持ち味で一言差別化して“選べる12個”にする。
// ・羊皮紙背景に載せて商品の世界観で仕上げる（build-pdf の描画を再利用）。
//   実行: node src/build-types.js <陽暦YYYY-M-D> <性別 男|女>
//   出力: web/types/12タイプ_<陽暦>_<性別>.png ＋ 対応表 .txt（カード番号→時刻index）

const fs = require('fs');
const path = require('path');
const { buildChart } = require('./generate-chart');
const D = require('./ziwei-data');
const { renderBodies } = require('./build-pdf');

const BR = { 廟: 6, 旺: 5, 得: 4, 利: 3, 平: 2, 不: 1, 陷: 0 };

// 命宮主星ごとの「ついやっちゃうクセ＝あるある」（欠点ベース・寄り添いトーン）。D.TANを文章化したもの。
const FLAW = {
  紫微: 'しっかり者と言われがち。人に頼るのが苦手で、つい一人で抱え込み、弱音を吐けない',
  天機: '頭がよく回るぶん考えすぎて動けないことがある。心配性で、気持ちもわりとコロコロ変わる',
  太陽: '放っておけなくて、つい人の世話を焼きすぎる。頑張りすぎて、自分のことは後回しになりがち',
  武曲: '不器用で、感情より理屈が先。言い方がきつくなったり、頑固で折れられないことがある',
  天同: '争いごとが苦手で、つい流されたり後回しにしがち。「まあいっか」で動き出しが遅くなる',
  廉貞: '好き嫌いがはっきりしていて、気持ちの起伏が大きめ。ハマると一気、冷めるのも一気',
  天府: '安定第一で、冒険や変化はちょっと苦手。慎重なぶん、決めるのに時間がかかる',
  太陰: '内にためこむタイプ。気分の波があって、つい一人であれこれ思い悩んでしまう',
  貪狼: '好奇心旺盛だけど飽きっぽい。あれもこれもで、一つに絞れず移り気になりがち',
  巨門: '思ったことをつい言ってしまって、もめ事や誤解を招くことがある。疑り深い一面も',
  天相: '人がよくて、頼まれると断れない。まわりに合わせすぎて、自分の希望が言えなくなりがち',
  天梁: '面倒見がいいぶん、つい説教っぽくなったりお節介が過ぎる。上から目線に見られることも',
  七殺: '一人で突っ走りがち。短気で、人に頼らず抱え込む。ゼロかイチかで極端になりやすい',
  破軍: '思い立ったら即行動だけど続かない。勢いで使いすぎたり、安定より刺激を選んでしまう',
};

// 宮の主星（空宮なら對宮から借りる）から、いちばん明るい1星を代表に選ぶ
function primaryStar(astro, palaceName) {
  const i = astro.palaces.findIndex((p) => p.name === palaceName);
  let stars = astro.palaces[i].majorStars;
  if (!stars.length) stars = astro.palaces[(i + 6) % 12].majorStars; // 借星
  if (!stars.length) return null;
  return [...stars].sort((a, b) => (BR[b.brightness] ?? 2) - (BR[a.brightness] ?? 2))[0].name;
}
// 官祿(仕事)の持ち味を一言（被ったタイプの差別化用）
function officeFlavor(astro) {
  const s = primaryStar(astro, '官祿');
  return s && D.CHO[s] ? D.CHO[s].split('・')[0] : null;
}

// 生年月日＋性別から決まる安定シード（線形合同法）。同じ人なら毎回同じランダム並び。
function seededRng(seed) { let s = seed % 0x7fffffff || 1; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; }
function shuffle(arr, rnd) { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

function buildTypes(solar, gender) {
  const items = [];
  for (let t = 0; t < 12; t++) {
    const a = buildChart(solar, t, gender);
    const star = primaryStar(a, '命宮');
    items.push({ t, star, flaw: FLAW[star] || '（タイプ未定義）', office: officeFlavor(a) });
  }
  // 命宮主星が被ったスロットは、仕事の持ち味を添えて選べるように差別化
  const counts = {};
  items.forEach((it) => { counts[it.flaw] = (counts[it.flaw] || 0) + 1; });
  items.forEach((it) => { if (counts[it.flaw] > 1 && it.office) it.flaw += `（仕事では${it.office}タイプ）`; });
  const seed = [...(String(solar) + gender)].reduce((a, c) => a + c.charCodeAt(0), 0);
  return shuffle(items, seededRng(seed)); // ランダム順（時間順ではない）
}

const LABELS = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩', '⑪', '⑫'];

async function buildTypesSheet(solar, gender, outDir) {
  const order = buildTypes(solar, gender);
  const blocks = [
    { type: 'p', t: '生まれた時間がわからない方へ。下の12個を読んで、いちばん「あ、これ自分かも」と感じるものを1つだけ選び、番号を教えてください。当たっているか考えなくて大丈夫。ピンとくる感覚で選んでくださいね。' },
    { type: 'ul', items: order.map((it, i) => `${LABELS[i]} ${it.flaw}`) },
  ];
  const header = { kicker: '出生時間が分からない方へ', title: '12タイプ診断', sub: 'いちばん自分っぽいものを1つ' };
  const pages = await renderBodies(buildChart(solar, 0, gender), '', blocks, false, header);
  fs.mkdirSync(outDir, { recursive: true });
  const base = `12タイプ_${solar}_${gender}`;
  pages.forEach((c, i) => {
    const name = pages.length > 1 ? `${base}_${i + 1}.png` : `${base}.png`;
    fs.writeFileSync(path.join(outDir, name), c.toBuffer('image/png'));
  });
  // 鑑定者用の対応表（カード番号 → 時刻index）。客には渡さない。
  const map = order.map((it, i) => `${LABELS[i]} → 時刻index ${it.t}（命宮:${it.star}）`).join('\n');
  fs.writeFileSync(path.join(outDir, `${base}_対応表.txt`), `【内部用】${solar} ${gender}\n${map}\n`);
  console.log(`シート: ${base}.png（${pages.length}ページ）`);
  console.log(map);
  return order;
}

if (require.main === module) {
  const [solar, gender] = process.argv.slice(2);
  if (!solar || !gender) { console.error('使い方: node src/build-types.js <陽暦YYYY-M-D> <性別 男|女>'); process.exit(1); }
  buildTypesSheet(solar, gender, path.join(__dirname, '..', 'web', 'types'));
}

module.exports = { buildTypes, buildTypesSheet };
