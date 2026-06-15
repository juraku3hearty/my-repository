// 命盤リーダー ― チェックリスト（基準書/読み方チェックリスト_基準書.md）を全部、命盤から自動で読む。
// 検出は鋭く、言葉はやさしく（決めつけず"扉つき"で）。iztro＋本サービスの基準書のみを根拠にする。
// 出力：本文ブロック配列（build-pdf がそのまま組む）。
const D = require('./ziwei-data');
const { findHighlights, sanpou } = require('./kyoku');

const BR = { 廟: 6, 旺: 5, 得: 4, 利: 3, 平: 2, 不: 1, 陷: 0 };
const SIXK = ['左輔', '右弼', '文昌', '文曲', '天魁', '天鉞'];
const SIXS = ['擎羊', '陀羅', '火星', '鈴星', '地空', '地劫'];

function reader(astro) {
  const P = {}; astro.palaces.forEach((p) => { P[p.name] = p; });
  const idx = (n) => astro.palaces.findIndex((p) => p.name === n);
  const opp = (n) => astro.palaces[(idx(n) + 6) % 12];
  // 主星（空宮なら對宮から借りる）
  const majorsOf = (n) => { const p = P[n]; if (p.majorStars.length) return { stars: p.majorStars, borrowed: false }; const o = opp(n); return { stars: o.majorStars, borrowed: true }; };
  const namesOf = (n) => majorsOf(n).stars.map((s) => s.name);
  const allStars = (n) => { const p = P[n]; return [...p.majorStars, ...p.minorStars, ...p.adjectiveStars]; };
  const hasStar = (n, name) => allStars(n).some((s) => s.name === name);
  const brightSum = (n) => majorsOf(n).stars.reduce((a, s) => a + (BR[s.brightness] ?? 2), 0);
  const minorsKichi = (n) => P[n].minorStars.filter((s) => SIXK.includes(s.name)).map((s) => s.name);
  const minorsSatsu = (n) => P[n].minorStars.filter((s) => SIXS.includes(s.name)).map((s) => s.name);
  const uniq = (a) => [...new Set(a)];
  const H = (t) => ({ type: 'h', t });
  const Pp = (t) => ({ type: 'p', t });

  const blocks = [];
  const bodyP = astro.palaces.find((p) => p.isBodyPalace);
  const mei = majorsOf('命宮');
  const meiEmpty = !P['命宮'].majorStars.length;

  // ── 中心（命宮）＋命宮の強弱＋四化＋身宮 ───────────────────────
  blocks.push(H('あなたの中心にあるもの（命宮）'));
  const center = [];
  if (meiEmpty) center.push(`あなたの命宮は主役の星がない「空宮」。自分の旗を一本立てて押し通すより、まわりの力を借り、人や場に合わせてしなやかに動く柔軟さが持ち味です。向かいの宮から「${mei.stars.map((s) => s.name).join('」「')}」を借りて読みます。`);
  center.push(...mei.stars.map((s) => D.PROSE[s.name]).filter(Boolean));
  const cmut = mei.stars.filter((s) => s.mutagen).map((s) => `そしてあなたの場合、「${s.name}」に、${D.MUT[s.mutagen]}。`);
  center.push(...cmut);
  if (!meiEmpty) {
    const strong = mei.stars.some((s) => (BR[s.brightness] ?? 2) >= 5);
    center.push(strong ? '命宮の星が明るく、自分の軸がはっきりしているタイプ。自分の「こうしたい」を大事にするほど、力が出ます。' : '命宮の星はやわらかめで、力みなく、まわりと調和しながら進めるタイプ。気の合う環境を選ぶことが、いちばんの追い風になります。');
  }
  if (bodyP && D.SHIN[bodyP.name]) center.push(`また、人生の重心（身宮）は「${D.SHIN[bodyP.name]}」に置かれやすく、ここがあなたの一生で特に大切なテーマになります。`);
  center.forEach((t) => blocks.push(Pp(t)));

  // ── 主役の力（目玉スキャナー） ───────────────────────────────
  const { top } = findHighlights(astro);
  if (top) { blocks.push(H(`あなたの“主役の力”（${top.label}）`)); blocks.push(Pp(top.why)); }

  // ── 強み（六吉＋主星長所） / クセ（六煞＋主星短所） ─────────────
  const triad = ['命宮', '遷移', '官祿', '財帛'];
  const kichi = uniq(triad.flatMap((n) => minorsKichi(n))).map((nm) => D.KICHI[nm]);
  const satsu = uniq(triad.flatMap((n) => minorsSatsu(n))).map((nm) => D.SATSU[nm]);
  const cho = uniq(mei.stars.flatMap((s) => (D.CHO[s.name] || '').split('・')).concat(kichi)).filter(Boolean);
  const tan = uniq(mei.stars.flatMap((s) => (D.TAN[s.name] || '').split('・')).concat(satsu)).filter(Boolean);
  blocks.push(H('あなたの強み'));
  blocks.push(Pp('あなたが自然にできて、まわりより少し得意なこと。'));
  blocks.push({ type: 'ul', items: cho });
  blocks.push(H('気をつけたいクセ'));
  blocks.push(Pp('欠点ではなく、強みが少し行きすぎたときに出るクセ。知っておくと扱いやすくなります。'));
  blocks.push({ type: 'ul', items: tan });

  // ── つまづき注意（凶格）→ 治め方に変換 ──────────────────────
  const meiSet = new Set(allStars('命宮').map((s) => s.name));
  const meiTriadIdx = sanpou(idx('命宮'));
  const triadHasMutKi = meiTriadIdx.some((i) => astro.palaces[i].majorStars.some((s) => s.mutagen === '忌') || astro.palaces[i].minorStars.some((s) => s.mutagen === '忌'));
  const triadHasYoda = meiTriadIdx.some((i) => astro.palaces[i].minorStars.some((s) => s.name === '擎羊' || s.name === '陀羅'));
  const huoLing = (meiSet.has('火星') || meiSet.has('鈴星')) && !meiSet.has('貪狼');
  const tsumazuki = [];
  if (triadHasMutKi && triadHasYoda) tsumazuki.push('一つのことに思いつめて、同じところを行ったり来たりしやすい配置（化忌＋羊陀）。「もう十分考えた」と思ったら、紙に書き出して一度手放してみて。抱え込みが軽くなります。');
  if (huoLing) tsumazuki.push('カッと火がついて先走りやすい瞬間（火星・鈴星）があります。直そうとしなくて大丈夫。「ひと呼吸おいてから動く」を合言葉にすると、その熱が突破力に変わります。');
  if (tsumazuki.length) { blocks.push(H('つまづきやすいところ（とその扱い方）')); tsumazuki.forEach((t) => blocks.push(Pp(t))); }

  // ── 仕事（官禄）＋自営vs組織 ─────────────────────────────────
  const kan = majorsOf('官祿');
  const kanText = kan.stars.map((s) => D.KAN[s.name]).filter(Boolean).join('／');
  const soloStars = ['七殺', '破軍', '貪狼', '廉貞', '太陽'];
  const orgStars = ['天機', '天同', '天梁', '太陰', '天相', '天府'];
  const meiKanNames = uniq([...namesOf('命宮'), ...namesOf('官祿')]);
  const soloScore = meiKanNames.filter((n) => soloStars.includes(n)).length + (P['官祿'].majorStars.some((s) => s.mutagen === '權') ? 1 : 0);
  const orgScore = meiKanNames.filter((n) => orgStars.includes(n)).length;
  const solo = soloScore > orgScore;
  blocks.push(H('仕事・社会での活かし方'));
  blocks.push(Pp(`あなたが力を発揮しやすいのは、こんな場です ―― ${kanText || '人と関わりながら持ち味を活かせる場'}。${solo ? '自分で切り拓く・任される・独立して動くほど活きるタイプ。指示待ちより、裁量のある場を選ぶと伸びます。' : '組織やチームの中で、役割を持って支え・整える場で活きるタイプ。良い仲間とよい仕組みの中にいると、力がぐっと出ます。'}気負わず、得意なところから動いてみてください。`));

  // ── お金（財帛）＋貯まるvs散財 ───────────────────────────────
  const zai = majorsOf('財帛');
  const zaiText = zai.stars.map((s) => D.ZAI[s.name]).filter(Boolean).join('。');
  const saveStars = ['武曲', '天府', '太陰'], spendStars = ['破軍', '貪狼', '七殺'];
  const zaiNames = namesOf('財帛');
  const hasRokuzon = ['命宮', '財帛', '福德'].some((n) => hasStar(n, '祿存'));
  const saver = zaiNames.some((n) => saveStars.includes(n)) || hasRokuzon;
  const spender = zaiNames.some((n) => spendStars.includes(n)) && P['財帛'].minorStars.some((s) => SIXS.includes(s.name));
  const zaiKi = P['財帛'].majorStars.some((s) => s.mutagen === '忌');
  blocks.push(H('お金との付き合い方'));
  let zp = `お金とは、こんな付き合い方が向いています ―― ${zaiText || '自分のリズムで、無理なく育てるのが合うタイプ'}。`;
  if (saver) zp += 'コツコツ蓄える力があるので、その堅実さを信じて大丈夫。';
  if (spender) zp += '一方で勢いで出ていきやすい面もあるので、「使う分」と「とっておく分」を最初に分けておくと安心です。';
  if (zaiKi) zp += 'お金に強くこだわると視野が狭くなりがち。数字は信頼できる人と共有すると、執着がほどけます。';
  blocks.push(Pp(zp + '自分に合ったお金のリズムを知っておくと、無理なく豊かさを育てていけます。'));

  // ── 恋愛・結婚（夫妻）＋早婚晩婚＋桃花 ───────────────────────
  const fuu = majorsOf('夫妻');
  const fuuText = fuu.stars.map((s) => D.FUU[s.name]).filter(Boolean).join('。');
  const lateStars = ['武曲', '七殺', '破軍', '天梁'];
  const earlyStars = ['太陰', '天同'];
  const fuuNames = namesOf('夫妻');
  const fuuSatsu = P['夫妻'].minorStars.some((s) => SIXS.includes(s.name));
  const late = fuuNames.some((n) => lateStars.includes(n)) || fuuSatsu;
  const early = fuuNames.some((n) => earlyStars.includes(n)) || hasStar('夫妻', '紅鸞') || hasStar('夫妻', '天喜');
  blocks.push(H('恋愛・パートナーシップ'));
  let fp = `人との関わり・パートナーシップでは、こんな傾向 ―― ${fuuText || '気持ちが通うと深くつながるタイプ'}。`;
  if (late && !early) fp += '結婚はゆっくりめ（晩婚傾向）。焦らず、芯で信頼できる相手を選ぶほど長続きします。';
  else if (early && !late) fp += '比較的はやくご縁が動きやすいタイプ。気持ちを素直に出せると、関係が育ちます。';
  if (P['夫妻'].minorStars.some((s) => SIXS.includes(s.name)) || namesOf('夫妻').includes('巨門')) fp += 'ときに衝突やすれ違い（言葉の行き違い）が出やすいので、ためこまず短く言葉にすることが、いちばんの仲直りの作法です。';
  blocks.push(Pp(fp));

  // ── 健康（疾厄） ─────────────────────────────────────────────
  const eki = majorsOf('疾厄');
  blocks.push(H('健康・体質の傾向'));
  blocks.push(Pp(`体質には、こんな傾向が出やすいようです ―― ${eki.stars.map((s) => D.SHITSU[s.name]).filter(Boolean).join('。') || '大きな弱点は出にくいタイプ'}。あくまで傾向で、決めつけではありません。早めに休む・あたためるなど、ちょっとした習慣が調子を支えます。`));

  // ── 人間関係（父母・子女・兄弟・僕役） ─────────────────────────
  const rel = (palace, label, map) => { const m = majorsOf(palace); const txt = m.stars.map((s) => map[s.name]).filter(Boolean).join('。'); const kch = minorsKichi(palace).length, sts = minorsSatsu(palace).length; let tail = ''; if (kch > sts) tail = '助けや恵まれた縁が出やすいところです。'; else if (sts > kch) tail = 'ときに気をつかう面もありますが、こちらから一言かけると和みます。'; return `${label}：${txt || 'おだやかな縁'}。${tail}`; };
  blocks.push(H('まわりとのご縁（親・子・仲間・人脈）'));
  blocks.push(Pp(rel('父母', '親・目上', D.FUBO)));
  blocks.push(Pp(rel('子女', '子ども・後輩', D.SHIJO)));
  blocks.push(Pp(rel('兄弟', '兄弟・親友', D.KYODAI)));
  blocks.push(Pp(rel('僕役', '部下・人脈', D.BOKU)));

  // ── 暮らし・移動（田宅＋遷移） ───────────────────────────────
  const den = majorsOf('田宅'); const sen = majorsOf('遷移');
  const meiBrt = brightSum('命宮'), senBrt = brightSum('遷移');
  const rikyo = meiEmpty || senBrt > meiBrt || sen.stars.some((s) => ['紫微', '天府', '太陽', '七殺', '破軍'].includes(s.name) && (BR[s.brightness] ?? 2) >= 4);
  blocks.push(H('暮らし・場所・移動'));
  blocks.push(Pp(`家・資産：${den.stars.map((s) => D.DENTAKU[s.name]).filter(Boolean).join('。') || '落ち着ける住まいに縁'}。`));
  let sp = `外の世界：${sen.stars.map((s) => D.SEN[s.name]).filter(Boolean).join('。') || '外でも自然体で過ごせるタイプ'}。`;
  if (rikyo) sp += 'とくにあなたは、生まれ育った場所にとどまるより、地元を離れて新しい土地・環境に出るほど、味方が現れ運が開ける「外で伸びる」タイプ。環境を変えることを、怖がらなくて大丈夫です。';
  blocks.push(Pp(sp));

  // ── 心（福徳） ───────────────────────────────────────────────
  const fuk = majorsOf('福德');
  blocks.push(H('心が満たされるとき'));
  blocks.push(Pp(`心がいちばん満たされるのは、こんな時間です ―― ${fuk.stars.map((s) => D.FUK[s.name]).filter(Boolean).join('。') || '穏やかに自分を取り戻せる時間'}。忙しいときほど、この時間を意識して取り戻すと、あなたらしさが戻ってきます。`));

  // ── 今の人生の流れ（大限） ───────────────────────────────────
  const birthY = parseInt(String(astro.solarDate).split(/[-/]/)[0], 10);
  const age = 2026 - birthY;
  const cur = astro.palaces.find((p) => p.decadal && p.decadal.range && age >= p.decadal.range[0] && age <= p.decadal.range[1]);
  if (cur) {
    const theme = { 命宮: '自分自身を見つめ直し、生き方を組み直す', 兄弟: '仲間や対等な人間関係が広がる', 夫妻: 'パートナー・人との縁が主役になる', 子女: '何かを生み育てる・次の世代と関わる', 財帛: 'お金と豊かさが主戦場になる', 疾厄: '体と心を整え直す', 遷移: '外の世界・移動・新しい場が開ける', 僕役: '人脈や仲間・部下との縁が動く', 官祿: '仕事・役割・社会での立場が伸びる', 田宅: '家・資産・土台を築く', 福德: '心の充実・楽しみ・価値観を深める', 父母: '目上・学びに支えられ吸収する' }[cur.name] || '新しいテーマに向き合う';
    blocks.push(H('今の人生の流れ'));
    blocks.push(Pp(`いまのあなた（${age}歳ごろ）は、“${theme}”ことに運の比重がある時期です（大限・${cur.name}宮）。この流れに逆らわず、ここで動いておくと、次の十年がぐっとひらけます。`));
  }

  // ── 細かい星（雑曜・四化のまとめ） ───────────────────────────
  const zatsu = [];
  const findStarPalaces = (name) => astro.palaces.filter((p) => [...p.minorStars, ...p.adjectiveStars].some((s) => s.name === name)).map((p) => p.name);
  if (findStarPalaces('天馬').length) zatsu.push('移動・遠方・転機に縁の星（天馬）を持ち、動くほど運が回ります');
  if (['命宮', '財帛', '田宅', '福德'].some((n) => hasStar(n, '祿存'))) zatsu.push('蓄財の星（祿存）があり、地道にためる力に恵まれています');
  if (findStarPalaces('紅鸞').length || findStarPalaces('天喜').length) zatsu.push('魅力と結婚運の星（紅鸞・天喜）があり、人に好かれご縁に恵まれます');
  const muts = []; astro.palaces.forEach((p) => [...p.majorStars].forEach((s) => { if (s.mutagen) muts.push(`${p.name}の${s.name}に化${s.mutagen}`); }));
  if (zatsu.length) { blocks.push(H('そのほかの星のしるし')); blocks.push(Pp(zatsu.join('。') + '。')); }

  blocks.push(H('あなたへ'));
  blocks.push(Pp('ここに書いたのは、あなたが生まれ持った「傾向」です。当たっているところは活かし、ピンとこないところは横に置いて大丈夫。大切なのは、自分を責めずに、持ち味を活かす方へ少しずつ舵を切ること。あなたは、あなたの人生の主役です。どうか、あなたらしく歩んでいってください。'));
  blocks.push({ type: 'note', t: '※ 本鑑定は紫微斗数の命盤（主星・輔星・煞星・四化・身宮など）にもとづく「持ち味の傾向」をお伝えするものです。未来の断定や優劣の判定ではありません。\n※ 解釈は本サービスの基準書のみを根拠にしています。\n※ 自己理解を目的としたもので、医療・法律・投資などの専門的助言ではありません。命盤計算：iztro。' });

  return blocks;
}

module.exports = { reader };
