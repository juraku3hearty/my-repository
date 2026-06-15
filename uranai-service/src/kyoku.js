// 格局（かくきょく）検出 ― 命盤"まるごと"を読み、その人だけの強い配置を拾う。
// 根拠：公共知識（iztro流派準拠）。主星の並びが同じでも、ここで差がハッキリ出る。
// 出力は「主役級の格」を強い順に並べたリスト。各 demo はこの一番強い格を鑑定の主役に据える。

// 三方四正のindex（本宮・對宮・三合2宮）
function sanpou(i) { return [i, (i + 4) % 12, (i + 8) % 12, (i + 6) % 12]; }

function majorsAt(a, i) { return a.palaces[i].majorStars; }
function allStarsAt(a, i) {
  const p = a.palaces[i];
  return [...p.majorStars, ...p.minorStars, ...p.adjectiveStars];
}
function nameSetIn(a, idxs) {
  const s = new Set();
  idxs.forEach((i) => allStarsAt(a, i).forEach((st) => s.add(st.name)));
  return s;
}
function mutagensIn(a, idxs) {
  const m = new Set();
  idxs.forEach((i) => allStarsAt(a, i).forEach((st) => { if (st.mutagen) m.add(st.mutagen); }));
  return m;
}
function palaceIndexByName(a, name) { return a.palaces.findIndex((p) => p.name === name); }
function brightOf(a, i, starName) {
  const st = majorsAt(a, i).find((s) => s.name === starName);
  return st ? st.brightness : '';
}
const BRIGHT_RANK = { 廟: 6, 旺: 5, 得: 4, 利: 3, 平: 2, 不: 1, 陷: 0 };
function isBright(b) { return (BRIGHT_RANK[b] ?? 2) >= 4; } // 得以上を「明るい」

// 命宮を含む宮を探す（同宮判定用に全宮走査）
function detectKyoku(a) {
  const found = [];
  const meiIdx = palaceIndexByName(a, '命宮');
  const meiSanpou = sanpou(meiIdx);

  // 各宮を走査して「同宮」系の格を拾う
  a.palaces.forEach((p, i) => {
    const majors = p.majorStars.map((s) => s.name);
    const minors = p.minorStars.map((s) => s.name);
    const has = (n) => majors.includes(n) || minors.includes(n);
    const inMeiSanpou = meiSanpou.includes(i);

    // 武貪格（武曲＋貪狼 同宮）＝財の格・中年から伸びる
    if (majors.includes('武曲') && majors.includes('貪狼')) {
      const bw = brightOf(a, i, '武曲'), bt = brightOf(a, i, '貪狼');
      const strong = isBright(bw) && isBright(bt);
      found.push({
        key: '武貪格', palace: p.name, palaceIdx: i,
        stars: ['武曲', '貪狼'], rank: strong ? 95 : 80,
        bright: strong, inMeiSanpou,
        label: '財（豊かさ）の格',
        why: `${p.name}に武曲と貪狼がそろう「武貪格」。お金・現実を動かす力（武曲）と、人を惹きつけ欲しいものを掴む力（貪狼）が同じ部屋に同居する、晩成の“富の配置”。${strong ? '二つとも明るい（廟旺）ので、力はかなり強い。' : ''}`,
      });
    }
    // 火貪格／鈴貪格（火星 or 鈴星 ＋ 貪狼 同宮）＝突発の幸運・横財
    if (majors.includes('貪狼') && (has('火星') || has('鈴星'))) {
      const which = has('火星') ? '火星' : '鈴星';
      const kname = which === '火星' ? '火貪格' : '鈴貪格';
      found.push({
        key: kname, palace: p.name, palaceIdx: i,
        stars: ['貪狼', which], rank: 78, inMeiSanpou,
        label: '突発の幸運の格',
        why: `${p.name}で貪狼に${which}が重なる「${kname}」。ふだんは静かでも、ここぞで一気に運がはじける“スパーク型”の幸運。`,
      });
    }
    // 昌曲同宮（文昌＋文曲 同宮）＝才学・表現
    if (has('文昌') && has('文曲')) {
      found.push({
        key: '昌曲同宮', palace: p.name, palaceIdx: i,
        stars: ['文昌', '文曲'], rank: 60, inMeiSanpou,
        label: '才と表現の格',
        why: `${p.name}に文昌と文曲がそろう配置。学び・言葉・表現の才に恵まれる。`,
      });
    }
    // 君臣慶會（紫微 ＋ 左輔右弼/天府）
    if (majors.includes('紫微') && (has('左輔') || has('右弼'))) {
      found.push({
        key: '君臣慶會', palace: p.name, palaceIdx: i,
        stars: ['紫微'], rank: 70, inMeiSanpou,
        label: '人に恵まれ立つ格',
        why: `${p.name}の紫微に左輔・右弼の助けがつく「君臣慶會」。良い協力者・部下に恵まれ、人の上に立てる配置。`,
      });
    }
  });

  // 三奇嘉會（命宮三方四正に 化祿・化權・化科 が揃う）＝最上級の吉
  const muts = mutagensIn(a, meiSanpou);
  if (muts.has('祿') && muts.has('權') && muts.has('科')) {
    found.push({
      key: '三奇嘉會', palace: '命宮(三方四正)', palaceIdx: meiIdx,
      stars: [], rank: 98, inMeiSanpou: true,
      label: '三つの幸運がそろう格',
      why: '命宮の三方四正に、化祿（実り）・化權（力）・化科（名声）の三つがそろう「三奇嘉會」。才能が世に認められやすい、紫微斗数でも最上級の吉配置。',
    });
  }

  // 雙祿（命宮三方四正に 禄存 と 化祿 両方）＝財運の厚み
  const namesMS = nameSetIn(a, meiSanpou);
  if (namesMS.has('祿存') && muts.has('祿')) {
    found.push({
      key: '雙祿朝垣', palace: '命宮(三方四正)', palaceIdx: meiIdx,
      stars: ['祿存'], rank: 75, inMeiSanpou: true,
      label: '二重の財運の格',
      why: '命宮の三方四正に、禄存（蓄えの財）と化祿（巡る財）の二つの財星がそろう「雙祿朝垣」。お金の巡りに厚みがある配置。',
    });
  }

  // 命格タイプ（背景の軸。主役ではないが土台として書ける）
  // 命宮が空宮なら對宮（真向かい）の主星を借りて軸を決める（借星安宮）。
  let axisStars = majorsAt(a, meiIdx).map((s) => s.name);
  if (!axisStars.length) axisStars = majorsAt(a, (meiIdx + 6) % 12).map((s) => s.name);
  const meiNames = new Set(axisStars);
  let typeAxis = null;
  if (['七殺', '破軍', '貪狼'].some((n) => meiNames.has(n))) typeAxis = { key: '殺破狼', label: '変化・開拓の軸', why: '命の軸が七殺・破軍・貪狼の系（殺破狼）。現状維持より、動いて切り拓くことで活きる。' };
  else if (['天機', '太陰', '天同', '天梁'].some((n) => meiNames.has(n))) typeAxis = { key: '機月同梁', label: '知恵・支える軸', why: '命の軸が天機・太陰・天同・天梁の系（機月同梁）。考え・支え・整えることで活きる、組織や専門に向く穏やかな軸。' };
  else if (['紫微', '天府', '天相'].some((n) => meiNames.has(n))) typeAxis = { key: '紫府', label: '安定・まとめる軸', why: '命の軸が紫微・天府・天相の系。安定を守り、人や場をまとめることで活きる。' };

  found.sort((x, y) => y.rank - x.rank);
  return { kyoku: found, typeAxis, meiIdx };
}

// ── 目玉スキャナー ───────────────────────────────────────────────
// 名前のついた格局だけでなく「桃花の集中・廟旺で際立つ星・吉星の密集」も点数化し、
// その人の一番の“目玉”を自動で拾う。言われなくてもシステムが拾うように。
const TOKA_MAIN = ['貪狼', '廉貞'];                          // 桃花の主星
const TOKA_SUB = ['紅鸞', '天喜', '咸池', '天姚', '沐浴'];    // 華やぎ・色気
const APPEARANCE = ['龍池', '鳳閣'];                         // 容姿端麗・気品
const SIXKICHI = ['左輔', '右弼', '文昌', '文曲', '天魁', '天鉞']; // 六吉（助け）
const SELF_PALACES = ['命宮', '遷移', '福德', '夫妻'];        // 自分・人目に出る宮（身宮も加える）

function findHighlights(astro) {
  const { kyoku, typeAxis, meiIdx } = detectKyoku(astro);
  const items = kyoku.map((k) => ({ ...k, score: k.rank }));
  const bodyP = astro.palaces.find((p) => p.isBodyPalace);
  const selfNames = new Set(SELF_PALACES.concat(bodyP ? [bodyP.name] : []));
  const meiSanpou = sanpou(meiIdx);
  const pmap = {}; astro.palaces.forEach((p) => { pmap[p.name] = p; });

  // ① 美貌・人気の華（数より中身で判定：桃花主星が命/身、龍池鳳閣の同宮＝容姿端麗、命宮の愛嬌星）
  // ※桃花の補助星は誰でも5〜8個持つので、数では差がつかない。配置の“質”で拾う。
  const meiPalace = astro.palaces[meiIdx];
  const hasName = (pal, names) => pal && [...pal.majorStars, ...pal.minorStars, ...pal.adjectiveStars].some((s) => names.includes(s.name));
  let beauty = 0; const bStars = new Set(); const bWhy = [];
  TOKA_MAIN.forEach((nm) => {
    if (meiPalace.majorStars.some((s) => s.name === nm)) { beauty += 28; bStars.add(nm); bWhy.push(`魅力の主星「${nm}」が命宮にあり`); }
    else if (bodyP && bodyP !== meiPalace && bodyP.majorStars.some((s) => s.name === nm)) { beauty += 25; bStars.add(nm); bWhy.push(`魅力の主星「${nm}」が人生の重心（身宮）にあり`); }
    else if (['遷移', '福德', '夫妻'].some((pn) => pmap[pn] && pmap[pn].majorStars.some((s) => s.name === nm))) { beauty += 8; bStars.add(nm); }
  });
  if (hasName(meiPalace, ['紅鸞', '天姚'])) { beauty += 14; ['紅鸞', '天姚'].forEach((n) => { if (hasName(meiPalace, [n])) bStars.add(n); }); bWhy.push('愛嬌の星が命宮にあり'); }
  astro.palaces.forEach((p) => { const ns = [...p.minorStars, ...p.adjectiveStars].map((s) => s.name); if (ns.includes('龍池') && ns.includes('鳳閣')) { beauty += 14; bStars.add('龍池'); bStars.add('鳳閣'); bWhy.push('容姿端麗の星（龍池・鳳閣）が同じ宮にそろい'); } });
  ['遷移', '福德', '夫妻'].forEach((pn) => { if (hasName(pmap[pn], TOKA_SUB)) beauty += 4; });
  if (meiPalace !== bodyP && bodyP && hasName(bodyP, APPEARANCE)) beauty += 6;
  if (beauty >= 30) {
    items.push({
      key: '桃花集中', label: '美貌・人気の華', palace: '命宮・身宮ほか', score: Math.min(97, 45 + beauty),
      inMeiSanpou: true, stars: [...bStars],
      why: `${bWhy.join('、')}、人を惹きつける“華”がはっきり出ています。これは「美貌・人気の目玉」。顔立ちというより、その場をぱっと明るくする雰囲気と愛嬌で、自然と人目を引くタイプ。整えるほど（身だしなみ）運も開きます。`,
    });
  }

  // ② 廟旺で際立つ星（明るい主星＋吉の四化＝その人の看板の力）
  const meiPal = astro.palaces[meiIdx];
  const meiPalForStar = (meiPal.majorStars.length ? meiPal : astro.palaces[(meiIdx + 6) % 12]);
  meiPalForStar.majorStars.forEach((s) => {
    const bright = (BRIGHT_RANK[s.brightness] ?? 2) >= 5; // 旺以上
    const goodMut = ['祿', '權', '科'].includes(s.mutagen);
    if (bright && goodMut) {
      items.push({
        key: '廟旺の主星', label: `際立つ「${s.name}」の力`, palace: '命宮', score: 64,
        inMeiSanpou: true, stars: [s.name],
        why: `あなたの中心の星「${s.name}」が、最も力を発揮できる明るい状態（${s.brightness}）で、しかも良い四化（化${s.mutagen}）を帯びています。生まれ持った看板の力で、ここがいちばん前に出る強みです。`,
      });
    }
  });

  // ③ 助けの厚さ（命宮三方四正に六吉が3つ以上＝人に恵まれる目玉）
  const kichiInSanpou = new Set();
  meiSanpou.forEach((i) => astro.palaces[i].minorStars.forEach((s) => { if (SIXKICHI.includes(s.name)) kichiInSanpou.add(s.name); }));
  if (kichiInSanpou.size >= 3) {
    items.push({
      key: '吉星集中', label: '人に恵まれる星まわり', palace: '命宮(三方四正)', score: 56 + kichiInSanpou.size * 2,
      inMeiSanpou: true, stars: [...kichiInSanpou],
      why: `命宮まわりに、助けや引き立ての星（${[...kichiInSanpou].join('・')}）が${kichiInSanpou.size}つ集まっています。困ったときに人の手が自然と差し伸べられる、“人に恵まれる”目玉です。`,
    });
  }

  items.sort((a, b) => b.score - a.score);
  return { highlights: items, top: items[0] || null, typeAxis, meiIdx };
}

module.exports = { detectKyoku, findHighlights, sanpou };
