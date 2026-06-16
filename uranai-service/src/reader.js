// 命盤リーダー ― チェックリスト（基準書/読み方チェックリスト_基準書.md）を全部、命盤から自動で読む。
// 検出は鋭く、言葉はやさしく（決めつけず"扉つき"で）。iztro＋本サービスの基準書のみを根拠にする。
// 出力：本文ブロック配列（build-pdf がそのまま組む）。
const D = require('./ziwei-data');
const { findHighlights, sanpou } = require('./kyoku');

const BR = { 廟: 6, 旺: 5, 得: 4, 利: 3, 平: 2, 不: 1, 陷: 0 };
// 代表させる1星は「いちばん明るい星」（廟旺…）＝輝き優先。同じ明るさなら先頭。
const brightest = (stars) => stars.slice().sort((a, b) => (BR[b.brightness] ?? 2) - (BR[a.brightness] ?? 2))[0];
// 星の“ひと言エッセンス”（身宮＝にじみ出るもう一つの顔を書くため）
const ESSENCE = { 紫微: 'まとめ役としての風格', 天機: '知恵と機転', 太陽: '人を照らす明るさ', 武曲: 'やり遂げる実行力', 天同: '和ませるやさしさ', 廉貞: '内に秘めた情熱', 天府: '守り育てる安定感', 太陰: '感じとる繊細さ・美的センス', 貪狼: '多才と楽しむ力', 巨門: '見抜く力と言葉', 天相: '支える誠実さ', 天梁: '包容と面倒見', 七殺: '切り拓く度胸', 破軍: '壊して創る開拓力' };
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
  if (bodyP && D.SHIN[bodyP.name]) {
    const bStars = bodyP.majorStars.map((s) => s.name);
    const meiSet = new Set(mei.stars.map((s) => s.name));
    const ess = bStars.map((n) => ESSENCE[n]).filter(Boolean).join('・');
    // 身宮が命宮と違う星を持つなら、その“もう一つの顔”を書いて人物像を差別化する
    if (bStars.length && ess && !bStars.every((n) => meiSet.has(n))) {
      center.push(`そして人生の重心（身宮）は「${D.SHIN[bodyP.name]}」。ここに${bStars.join('・')}があり、「${ess}」が、年々あなたの前面に強まっていきます。命宮の素の自分に、この“もう一つの顔”が重なるのが、あなたらしさです。`);
    } else {
      center.push(`また、人生の重心（身宮）は「${D.SHIN[bodyP.name]}」。ここがあなたの一生で特に大切になるテーマです。`);
    }
  }
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
  // 職種は主役の星1つに絞る（2星ぶん並べると多すぎて迷うため）
  const kanText = kan.stars.length ? D.KAN[brightest(kan.stars).name] : '';
  const soloStars = ['七殺', '破軍', '貪狼', '廉貞', '太陽'];
  const orgStars = ['天機', '天同', '天梁', '太陰', '天相', '天府'];
  const meiKanNames = uniq([...namesOf('命宮'), ...namesOf('官祿')]);
  const soloScore = meiKanNames.filter((n) => soloStars.includes(n)).length + (P['官祿'].majorStars.some((s) => s.mutagen === '權') ? 1 : 0);
  const orgScore = meiKanNames.filter((n) => orgStars.includes(n)).length;
  const solo = soloScore > orgScore;
  const kanKichi = minorsKichi('官祿'); const kanMut = P['官祿'].majorStars.find((s) => s.mutagen && s.mutagen !== '忌');
  blocks.push(H('仕事・社会での活かし方'));
  let wp = `${kanText || '人と関わりながら持ち味を活かせる場'}が、あなたの力のいちばん発揮できる場です。`;
  wp += solo ? '指示を待つより、自分で切り拓いたり任されたりする立場のほうが伸びるタイプ。裁量のある場を選ぶと、持ち味がそのまま成果につながります。' : '組織やチームの中で、はっきりした役割を持って支え・整える働き方が向いています。良い仲間と、よく回る仕組みの中にいるほど、力が自然に出ます。';
  if (kanKichi.length) wp += 'しかも仕事の場では、人の助けや引き立てに恵まれやすい配置。差し出された手は遠慮なく受け取るほど、道がひらけます。';
  const kanM = (P['官祿'].majorStars.find((s) => s.mutagen) || {}).mutagen;
  wp += { 祿: 'しかもこの仕事の場は、努力がご縁や実りに変わりやすい追い風つき。出し惜しまず動くほど返ってきます。', 權: 'この分野で力を持ちやすいぶん、ぜんぶ握ろうとせず人に任せると、もっと大きく回ります。', 科: '名前や評価が立ちやすいので、表に出る場を恐れず、得意を見せていって。', 忌: '深くのめり込みやすいぶん、手を広げず一つに絞ると、それが誰にも真似できない専門になります。' }[kanM] || '';
  blocks.push(Pp(wp));

  // ── お金（財帛）＋貯まるvs散財 ───────────────────────────────
  const zai = majorsOf('財帛');
  const zaiText = zai.stars.map((s) => D.ZAI[s.name]).filter(Boolean).join('。');
  const saveStars = ['武曲', '天府', '太陰'], spendStars = ['破軍', '貪狼', '七殺'];
  const zaiNames = namesOf('財帛');
  const hasRokuzon = ['命宮', '財帛', '福德'].some((n) => hasStar(n, '祿存'));
  // 財帛に七殺・破軍・貪狼があれば「使う型」を優先（祿存があっても蓄財判定で上書きしない）
  const spender = zaiNames.some((n) => spendStars.includes(n));
  const saver = !spender && (zaiNames.some((n) => saveStars.includes(n)) || hasRokuzon);
  const zaiKi = P['財帛'].majorStars.some((s) => s.mutagen === '忌');
  blocks.push(H('お金との付き合い方'));
  let zp = `${zaiText || '自分のリズムで、無理なく育てるのが合うタイプ'}。`;
  if (saver) zp += 'コツコツ蓄える力があるので、その堅実さは信じて大丈夫。守りに入りすぎず、ときどき自分にごほうびを出すくらいで、ちょうどいいバランスです。';
  if (spender) zp += '一方で、入ってきたぶん勢いよく出ていきやすいタイプ。これは悪いことではなく、お金を「生きたこと」に使える人ということ。ただ「使う分」と「先にとっておく分」を最初に分けておくと、波が来ても慌てずに済みます。';
  if (zaiKi) zp += 'お金に強くこだわりすぎると、かえって視野が狭くなりがち。数字は信頼できる人と共有しておくと、執着がふっとほどけます。';
  if (!saver && !spender && !zaiKi) zp += '大きく増やすことより、自分のペースで無理なく回していくほうが性に合います。背伸びした勝負より、地に足のついたやりくりが、結局いちばん効いてきます。';
  const zaiM = (P['財帛'].majorStars.find((s) => s.mutagen) || {}).mutagen;
  zp += { 祿: 'お金の巡りに恵まれる追い風があるので、ケチらず生きたことに使うほど、めぐって返ってきます。', 權: 'お金を動かす力が強いぶん、勢いで大きく張りすぎないのがコツ。', 科: '堅実さがそのまま信頼になり、人からの評価がお金に変わっていくタイプです。' }[zaiM] || '';
  blocks.push(Pp(zp));

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
  let fp = `${fuuText || '気持ちが通うと深くつながるタイプ'}。`;
  if (late && !early) fp += '結婚やご縁はゆっくりめ（晩婚傾向）。焦らなくて大丈夫、むしろ時間をかけて芯から信頼できる相手を選ぶほど、長く続く関係になります。';
  else if (early && !late) fp += '比較的はやくご縁が動きやすいタイプ。気持ちを素直に出せたときほど、関係はやわらかく育っていきます。';
  else fp += 'ご縁の時期は人それぞれ。タイミングを急ぐより、一緒にいて安心できる相手かどうかを、何より大事にして。';
  if (P['夫妻'].minorStars.some((s) => SIXS.includes(s.name)) || namesOf('夫妻').includes('巨門')) fp += 'ときに言葉の行き違いやぶつかりが出やすい配置でもあるので、ためこまず短く伝えるのが、いちばんの仲直りの作法になります。';
  const fuuM = (P['夫妻'].majorStars.find((s) => s.mutagen) || {}).mutagen;
  fp += { 祿: '相手とのご縁に恵まれる追い風つき。心を開いて動くほど、関係は実りやすいです。', 權: '関係をリードしがちなぶん、相手のペースも立てると、ぐっとうまくいきます。', 科: '品のよさや誠実さが好かれるタイプ。背伸びせず、自然体でいるのがいちばんの魅力です。', 忌: '一途で深く愛するぶん、執着に転じやすい面も。相手を縛らない“ほどよい距離”が長続きのコツです。' }[fuuM] || '';
  blocks.push(Pp(fp));

  // ── 健康（疾厄） ─────────────────────────────────────────────
  const eki = majorsOf('疾厄');
  blocks.push(H('健康・体質の傾向'));
  const ekiSatsu = minorsSatsu('疾厄');
  let hp = `${eki.stars.map((s) => D.SHITSU[s.name]).filter(Boolean).join('。') || '大きな弱点は出にくく、わりと丈夫なタイプ'}。`;
  if (ekiSatsu.length) hp += 'もともと無理がきくぶん、気づかないうちに疲れを抱え込みやすいタイプ。限界の前に、こまめに手を抜くくらいがちょうどいいです。';
  else hp += 'ふだんは無理がきくぶん、かえって「頑張りすぎ」に自分で気づきにくい面があります。';
  blocks.push(Pp(hp));
  blocks.push({ type: 'note', t: '※ 体質の傾向で、医療的な診断ではありません。' });

  // ── 人間関係（父母・子女・兄弟・僕役） ─────────────────────────
  // 主役の星1つで代表させる（2星ぶん並べると印象が割れて混乱するため）
  const rel = (palace, label, map) => { const m = majorsOf(palace); const txt = m.stars.length ? map[brightest(m.stars).name] : ''; const kch = minorsKichi(palace).length, sts = minorsSatsu(palace).length; let tail = ''; if (kch > sts) tail = '助けや恵まれた縁が出やすいところです。'; else if (sts > kch) tail = 'ときに気をつかう面もありますが、こちらから一言かけると和みます。'; return `${label}：${txt || 'おだやかな縁'}。${tail}`; };
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
  if (rikyo) sp += 'とくにあなたは、生まれ育った場所にとどまるより、地元を離れて新しい土地や環境に出るほど、味方が現れて運がひらける「外で伸びる」タイプ。引っ越し・遠出・新しい場への挑戦を、怖がらなくて大丈夫です。';
  else sp += '住み慣れた場所や、勝手のわかる環境にいるほど、落ち着いて力を出せるタイプ。無理に遠くへ動くより、地に足のついた範囲をていねいに耕すのが向いています。';
  blocks.push(Pp(sp));

  // ── 心（福徳） ───────────────────────────────────────────────
  const fuk = majorsOf('福德');
  blocks.push(H('心が満たされるとき'));
  let kp = `${fuk.stars.map((s) => D.FUK[s.name]).filter(Boolean).join('。') || '穏やかに自分を取り戻せる時間'}。`;
  if (minorsSatsu('福德').length) kp += 'ただ、考えごとや刺激が多いと心がざわついて休まりにくいので、あえて何もしない時間を予定に入れておくと、ぐっと楽になります。';
  const fukM = (P['福德'].majorStars.find((s) => s.mutagen) || {}).mutagen;
  kp += { 祿: 'もともと心が満たされやすい、福の厚いタイプ。その“ごきげん”が、まわりにも自然と巡っていきます。', 權: '楽しみにも本気で打ち込めるタイプ。のめり込みすぎたら、ふっと力を抜く時間も大事に。', 科: '上品な楽しみや学びに、心が潤うタイプです。', 忌: '考えこんで心がふさぎやすい面も。気持ちは抱え込まず、信頼できる人に少しこぼすと軽くなります。' }[fukM] || '';
  blocks.push(Pp(kp));

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
  if (['命宮', '財帛', '田宅', '福德'].some((n) => hasStar(n, '祿存')) && !spender) zatsu.push('蓄財の星（祿存）があり、地道にためる力に恵まれています');
  if (findStarPalaces('紅鸞').length || findStarPalaces('天喜').length) zatsu.push('魅力と結婚運の星（紅鸞・天喜）があり、人に好かれご縁に恵まれます');
  const muts = []; astro.palaces.forEach((p) => [...p.majorStars].forEach((s) => { if (s.mutagen) muts.push(`${p.name}の${s.name}に化${s.mutagen}`); }));
  if (zatsu.length) { blocks.push(H('そのほかの星のしるし')); blocks.push(Pp(zatsu.join('。') + '。')); }

  blocks.push(H('あなたへ'));
  blocks.push(Pp('最後に、ひとつだけ。ここに書いたのは「運命」ではなく、生まれ持った「傾向」――いわば運勢です。運命は決まっていても、傾向は、知って付き合い方を変えるだけで、いくらでも活かす方へ向けられます。だからこの一冊は、決められた答えではなく、あなたが自分を活かすための「地図」。当たっているところは活かし、ピンとこないところは横に置いて大丈夫。読み終えたら、また自分の足で歩きだしてください。主役は、いつだってあなたです。'));
  blocks.push({ type: 'note', t: '※ 本鑑定は紫微斗数の命盤（主星・輔星・煞星・四化・身宮など）にもとづく「持ち味の傾向」をお伝えするものです。未来の断定や優劣の判定ではありません。\n※ 解釈は本サービスの基準書のみを根拠にしています。\n※ 自己理解を目的としたもので、医療・法律・投資などの専門的助言ではありません。命盤計算：iztro。' });

  return blocks;
}

module.exports = { reader };
