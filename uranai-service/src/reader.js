// 命盤リーダー ― チェックリスト（基準書/読み方チェックリスト_基準書.md）を全部、命盤から自動で読む。
// 検出は鋭く、言葉はやさしく（決めつけず"扉つき"で）。iztro＋本サービスの基準書のみを根拠にする。
// 出力：本文ブロック配列（build-pdf がそのまま組む）。
const D = require('./ziwei-data');
const { findHighlights, detectKyoku, sanpou } = require('./kyoku');

const BR = { 廟: 6, 旺: 5, 得: 4, 利: 3, 平: 2, 不: 1, 陷: 0 };
// 代表させる1星は「いちばん明るい星」（廟旺…）＝輝き優先。同じ明るさなら先頭。
const brightest = (stars) => stars.slice().sort((a, b) => (BR[b.brightness] ?? 2) - (BR[a.brightness] ?? 2))[0];
// 星の“ひと言エッセンス”（身宮＝にじみ出るもう一つの顔を書くため）
const ESSENCE = { 紫微: 'まとめ役としての風格', 天機: '知恵と機転', 太陽: '人を照らす明るさ', 武曲: 'やり遂げる実行力', 天同: '和ませるやさしさ', 廉貞: '内に秘めた情熱', 天府: '守り育てる安定感', 太陰: '感じとる繊細さ・美的センス', 貪狼: '多才と楽しむ力', 巨門: '見抜く力と言葉', 天相: '支える誠実さ', 天梁: '包容と面倒見', 七殺: '切り拓く度胸', 破軍: '壊して創る開拓力' };
// お金の「決め方・使い方のクセ」＝財帛の主星から。ここがいちばん"その人だ"と当たる枝葉。
const KIME = {
  七殺: 'お金は、高い安いより「これだ」という直感で即決するタイプ。損得勘定で動くより、ピンときたかどうかで決めます。',
  破軍: 'その場の「楽しい・欲しい」で勢いよく使うタイプ。あとで「あれ、もう？」となりがちなので、先に“とっておく分”を抜いておくと安心です。',
  貪狼: '好きなもの・楽しいことには惜しまず使うタイプ。欲しい気持ちに素直なぶん、“楽しむ予算”を決めておくとちょうどいいです。',
  廉貞: 'こだわりが強く、気に入ったものには思い切って出すタイプ。ピンとこないものには出さない、メリハリ型です。',
  武曲: '損得をしっかり計算して、納得してから出すタイプ。無駄遣いは少なく、堅実です。',
  天府: '計画的に、無理のない範囲で使うタイプ。衝動買いはほとんどしません。',
  太陰: 'じっくり考えてから決めるタイプ。慎重なぶん、悩んで買いそびれることも。気に入れば長く大事に使います。',
  天同: '気負わずマイペース。心地よさや「好き」で、のんびり選ぶタイプです。',
  天機: 'あれこれ比較・分析してから決める頭脳派。考えすぎて、かえって迷うこともあります。',
  太陽: '自分のためより、人のため・付き合いに気前よく出すタイプです。',
  巨門: '納得いくまで調べて、理屈で選ぶタイプ。説明できない買い物はしません。',
  天相: 'バランスよく、無理のない範囲で堅実に選ぶタイプです。',
  天梁: '必要なものには堅実に。見栄やムダな出費は少なめです。',
  紫微: '質や格を重んじて選ぶタイプ。安かろうより、納得できる良いものを選びます。',
};
// 恋愛の「恋の仕方・距離感」＝夫妻の主星から（FUU=相手のタイプとは別の、あなた自身の恋の動き方）
const KOI = {
  七殺: 'あなた自身は、一途だけど“べったり”は苦手。情熱はあっても、自分の時間と距離は守りたいタイプです。',
  破軍: 'あなた自身は、刺激を求めて一気に飛び込むタイプ。マンネリには弱く、変化や新鮮さを欲しがります。',
  貪狼: 'あなた自身は、惚れっぽくモテるタイプ。恋を楽しむのが上手で、駆け引きも自然にできます。',
  廉貞: 'あなた自身は、好きになると一気に燃え上がるタイプ。好き嫌いがはっきりしていて、刺激を求めます。',
  太陰: 'あなた自身は、奥手でじっくり距離を縮めるタイプ。ロマンチストで、好きな人にはとことん尽くします。',
  天同: 'あなた自身は、友達のように自然に仲よくなって育てる恋。優しく、もめごとを避けます。',
  天機: 'あなた自身は、頭で考えてから動く慎重派。気持ちが揺れやすく、相手を分析しがちです。',
  太陽: 'あなた自身は、好きになると一気に尽くすタイプ。明るく面倒見がいいぶん、自分が後回しになりがち。',
  武曲: 'あなた自身は、言葉より行動で示す不器用なタイプ。クールに見えて実は一途、晩婚ぎみです。',
  天府: 'あなた自身は、安定志向。慎重に、堅実な関係を一歩ずつ育てていくタイプです。',
  巨門: 'あなた自身は、言葉で深まりたいタイプ。語り合えると安心、でも誤解やすれ違いも生みやすい面が。',
  天相: 'あなた自身は、相手に合わせる誠実なタイプ。尽くしすぎて、自分を後回しにしがちです。',
  紫微: 'あなた自身は、相手を立てつつ内心は引っ張りたいタイプ。プライドゆえ弱音を見せにくい面も。',
  天梁: 'あなた自身は、年の差や“守り守られる”落ち着いた関係に縁があり、安心できる相手を求めます。',
};
// 心がへこむポイント＝命宮の主星から（立ち直り方は"満たされる時間"＝FUKで補う）
const HEKOMI = {
  紫微: 'プライドを傷つけられたり、軽く扱われたと感じたとき', 天機: '考えすぎて先回りに不安になったり、先が読めないとき',
  太陽: '尽くしたのに報われない・認めてもらえないと感じたとき', 武曲: '頑張りを言葉で認めてもらえないときや、思い通りに進まないとき',
  天同: '争いごとやプレッシャーにさらされたとき', 廉貞: '情熱を否定されたり、退屈な状況が続いたとき',
  天府: '安定が脅かされたり、先が見えない不安に襲われたとき', 太陰: '夜にひとり、気持ちを言えずにためこんでしまったとき',
  貪狼: '自由を縛られたり、楽しみのない毎日が続いたとき', 巨門: '誤解されたり、言葉で行き違ってしまったとき',
  天相: '板挟みになったり、自分を後回しにしすぎたとき', 天梁: '頼られすぎて抱えこんだときや、筋の通らないことを見たとき',
  七殺: 'ぜんぶ一人で抱えこんで、気づかぬうちに消耗したとき', 破軍: '同じ毎日が続いて、停滞していると感じたとき',
};
// 仕事の「働き方・動き方のクセ」＝官祿の主星から
const HATARAKI = {
  紫微: 'トップや責任ある立場に立つほど燃えるタイプ。任されると力が出ます。', 天機: '企画・段取り・改善が得意。同じことの繰り返しより、変化のある仕事で生きます。',
  太陽: '表に立って引っ張る・対外的な役割で輝くタイプです。', 武曲: '黙々とやり遂げる実務型。結果がはっきり出る仕事で力を発揮します。',
  天同: 'ギスギスより和やかな環境で力が出るタイプ。人を和ませる役が合います。', 廉貞: '企画・交渉・ここ一番の勝負強さで動くタイプです。',
  天府: '管理・調整・安定運営が得意。土台を守り育てる役で頼られます。', 太陰: '裏方・サポート・細やかな仕事を、コツコツ積み上げるタイプです。',
  貪狼: '人付き合いや企画で、あちこちに手を伸ばしながら動くタイプ。', 巨門: '専門・分析・教える/伝えるで生きるタイプ。口と頭が武器です。',
  天相: '補佐・調整役（No.2）として人を支え、間を取り持つほど力が出ます。', 天梁: '指導・面倒見・専門職で、年長者のように頼られるタイプです。',
  七殺: '現場で自分で動き、決断するほど生きるタイプ。指示されるのは苦手。', 破軍: 'ゼロから立ち上げ・開拓が得意。ルーティンより変化と挑戦で動きます。',
};
// 人との距離感＝命宮の主星から
const KYORI = {
  紫微: 'まとめ役・中心として、人の間でバランスを取るタイプ。', 天機: '広げるより、気の合う少数と深くつき合うタイプ。人を見て距離を測ります。',
  太陽: '誰にでも分け隔てなくフラットに接するタイプ。上下関係をつくらず、距離が近いと言われることもあるけれど、その公平さが信頼を生みます。', 武曲: '狭く深く、信頼できる人とだけ硬く結びつくタイプ。',
  天同: 'やわらかく誰とでも仲よくなれる、和ませ役のタイプ。', 廉貞: '好き嫌いはっきり。気が合う人とは濃く、合わない人とは線を引くタイプ。',
  天府: '人の間でバランスを取り、安定した関係を築くタイプ。', 太陰: '心を許した少数と、静かに深くつき合うタイプ。',
  貪狼: '社交的で交友が広く、いろんな人と楽しくつき合えるタイプ。', 巨門: '広げるより、本音で語り合える人と深くつながるタイプ。',
  天相: '間を取り持つ調整役。人と人をつなぐのが上手なタイプ。', 天梁: '世話好きで面倒見がよく、年下や後輩に慕われるタイプ。',
  七殺: '基本は一匹狼。狭く深く、本当に信頼できる人とだけ濃くつき合うタイプ。', 破軍: '広く浅く動きつつ、出会いと別れもにぎやかなタイプ。',
};
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
    // 「軸がはっきり」は、いちばん明るい星が廟旺で、かつ暗い星に足を引っ張られていない（最暗も得以上）ときだけ。混在輝度は“やわらかめ”に。
    const brs = mei.stars.map((s) => (BR[s.brightness] ?? 2));
    const strong = brs.length && Math.max(...brs) >= 5 && Math.min(...brs) >= 4;
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

  // ── 才能スキャナー（際立つ得意だけを拾う：廟旺 or 化科 or 同宮の時のみ）───────
  // ※太陰・貪狼などは誰でも持つので「際立つ配置」に限定し、全員に出ないようにする
  const PROM = ['命宮', '福德', '官祿', '田宅'].concat(bodyP ? [bodyP.name] : []); // 才能が際立つ宮
  const hasKa = (name) => astro.palaces.some((p) => p.majorStars.some((s) => s.name === name && s.mutagen === '科')); // 化科=認められる才（どの宮でも）
  const hasKi = (name) => astro.palaces.some((p) => p.majorStars.some((s) => s.name === name && s.mutagen === '忌')); // 化忌=その星は「才能」でなく「詰まり」。才能としては拾わない
  const promStar = (name) => !hasKi(name) && (hasKa(name) || PROM.some((pn) => (P[pn] || { majorStars: [] }).majorStars.some((s) => s.name === name && (BR[s.brightness] ?? 2) >= 5)));
  const samePalace = (a2, b2) => astro.palaces.some((p) => { const ns = [...p.minorStars, ...p.adjectiveStars].map((s) => s.name); return ns.includes(a2) && ns.includes(b2); });
  const wenIn = (name) => PROM.some((pn) => (P[pn] ? [...P[pn].minorStars, ...P[pn].adjectiveStars] : []).some((s) => s.name === name));
  // 命宮が七殺・破軍（殺破狼＝行動/開拓型）の人は、文・府相系の「精緻で静的な才」とは逆向き。
  // そういう命には精緻系才能を出さない（命宮・官祿に在る星だけは中核なので例外で残す）。
  const isAction = mei.stars.some((s) => ['七殺', '破軍'].includes(s.name));
  const REFINED = new Set(['文昌', '文曲', '太陰', '武曲', '天府', '巨門', '天機']); // 精緻・静的な才（貪狼=芸は行動型でも出す）
  const coreOfficeNames = new Set(['命宮', '官祿'].flatMap((n) => allStars(n).map((s) => s.name)));
  const talentsRaw = [];
  const addT = (star, t) => talentsRaw.push({ star, t });
  if (samePalace('文昌', '文曲') || (wenIn('文昌') && wenIn('文曲'))) addT('文昌', '読む・書く・伝える――言葉と学問・表現の才（文昌・文曲）');
  else if (wenIn('文曲')) addT('文曲', '話術や表現・芸ごとのセンス（文曲）');
  else if (wenIn('文昌')) addT('文昌', '筋道立った思考と、文章・学びの才（文昌）');
  if (promStar('太陰') || samePalace('龍池', '鳳閣')) addT('太陰', '色や形・美しいものを見抜く、美術やデザインの感性。古いものや和の美に惹かれることも（太陰／龍池・鳳閣）');
  if (promStar('貪狼')) addT('貪狼', '多趣味で、芸ごとや、人を楽しませることの才（貪狼）');
  if (promStar('巨門')) addT('巨門', '語り・教える・専門を究める、言葉の力（巨門）');
  if (promStar('天機')) addT('天機', '企画・分析・アイデアを生む、頭の回転（天機）');
  if (promStar('武曲')) addT('武曲', '手に職をつける技術力と、数字やお金・実務をきっちり回す正確さ（武曲）');
  if (promStar('天府')) addT('天府', '人やお金・場の段取りをまとめ、堅実に回していく管理・運営の才（天府）');
  const talents = talentsRaw.filter((x) => !isAction || !REFINED.has(x.star) || coreOfficeNames.has(x.star)).map((x) => x.t);
  if (talents.length) {
    blocks.push(H('あなたの才能（際立つ得意）'));
    blocks.push(Pp('命盤の中でも、とくに際立つ得意です。眠らせず、のびのび使うほど人生がひらけます。'));
    blocks.push({ type: 'ul', items: talents });
  }

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
  const hataraki = kan.stars.length ? HATARAKI[brightest(kan.stars).name] : '';
  let wp = `${kanText || '人と関わりながら持ち味を活かせる場'}が、あなたの力のいちばん発揮できる場です。${hataraki || ''}`;
  wp += solo ? '指示を待つより、自分で切り拓いたり任される立場のほうが伸びます。裁量のある場を選んで。' : '組織やチームの中で、はっきりした役割を持つと活きます。良い仲間とよい仕組みの中ほど力が出ます。';
  if (kanKichi.length) wp += 'しかも仕事の場では、人の助けや引き立てに恵まれやすい配置。差し出された手は遠慮なく受け取るほど、道がひらけます。';
  const kanM = (P['官祿'].majorStars.find((s) => s.mutagen) || {}).mutagen;
  wp += { 祿: 'しかもこの仕事の場は、努力がご縁や実りに変わりやすい追い風つき。出し惜しまず動くほど返ってきます。', 權: 'この分野で力を持ちやすいぶん、ぜんぶ握ろうとせず人に任せると、もっと大きく回ります。', 科: '名前や評価が立ちやすいので、表に出る場を恐れず、得意を見せていって。', 忌: '深くのめり込みやすいぶん、手を広げず一つに絞ると、それが誰にも真似できない専門になります。' }[kanM] || '';
  blocks.push(Pp(wp));

  // ── お金（財帛）：貯める星×使う星の同居は「輝き優先」で1つの読みに統合（基準書 読み方ルール§5／格局§1 武貪格）──
  const zai = majorsOf('財帛');
  const saveStars = ['武曲', '天府', '太陰'], spendStars = ['破軍', '貪狼', '七殺'];
  const hasRokuzon = ['命宮', '財帛', '福德'].some((n) => hasStar(n, '祿存'));
  const saveZ = zai.stars.filter((s) => saveStars.includes(s.name));
  const spendZ = zai.stars.filter((s) => spendStars.includes(s.name));
  const brMax = (arr) => (arr.length ? Math.max(...arr.map((s) => BR[s.brightness] ?? 2)) : -1);
  // 貯める/使うの判定は財帛で一番明るい星の系統で決める。同居かつ同輝度なら統合読み（武貪格＝出入り大）。
  let moneyType;
  if (saveZ.length && spendZ.length) moneyType = brMax(saveZ) > brMax(spendZ) ? 'save' : (brMax(spendZ) > brMax(saveZ) ? 'spend' : 'mixed');
  else if (spendZ.length) moneyType = 'spend';
  else if (saveZ.length || hasRokuzon) moneyType = 'save';
  else moneyType = 'neutral';
  const spender = moneyType === 'spend' || moneyType === 'mixed'; // 身宮財帛の振れ幅文で使用
  const zaiKi = P['財帛'].majorStars.some((s) => s.mutagen === '忌');
  blocks.push(H('お金との付き合い方'));
  const baseZai = zai.stars.length ? brightest(zai.stars).name : '';
  const kime = baseZai ? KIME[baseZai] : '';
  const meiSet2 = new Set(mei.stars.map((s) => s.name));
  const slowMei = ['天同', '太陰', '天機', '天府', '天相'].some((n) => meiSet2.has(n)) && !['破軍', '七殺', '貪狼', '廉貞'].some((n) => meiSet2.has(n));
  const finSlow = ['太陰', '天同', '天機', '天府', '天相'].includes(baseZai);
  const tempo = (slowMei && !finSlow && moneyType === 'save') ? 'そしてもともと慎重で迷いやすいタイプなので、ほしい気持ちはあっても、決めるまでにじっくり時間をかける（ときに悩んで買いそびれる）面もあります。' : '';
  // 優先順位 格局 ＞ 輝き優先 ＞ 同輝度統合（基準書 読み方ルール§5・格局§1）。財帛に格局が立っていれば、それを統合の答えにする。
  const zaiKyoku = detectKyoku(astro).kyoku.find((k) => k.palace === '財帛' && ['武貪格', '火貪格', '鈴貪格'].includes(k.key));
  let zp;
  if (zaiKyoku) {
    zp = `${zaiKyoku.why}${spender ? '入ってくる勢いも、出ていく勢いも大きいので、入った時点で「使う分」と「先にとっておく分」を分けておくと安心です。' : 'この力は中年以降にじわじわ効いてくる晩成型。焦らず腰を据えて育てていって大丈夫です。'}`;
  } else if (moneyType === 'mixed') {
    zp = `稼ぐ力（${saveZ.map((s) => s.name).join('・')}）も、動かして使う力（${spendZ.map((s) => s.name).join('・')}）も両方しっかり持っていて、お金の出入りが大きいタイプ。${D.ZAI[baseZai] || ''}。貯め込むより、入ってきたぶんを楽しみや経験に変えながら回していくほうが性に合います。ただ出ていく勢いも強いので、入った時点で「使う分」と「先にとっておく分」を分けておくと、ぐっと慌てずに済みます。`;
  } else if (moneyType === 'spend') {
    zp = `${D.ZAI[baseZai] || '自分のリズムで回していくタイプ'}。${kime || ''}入ってきたぶん勢いよく出ていくタイプで、楽しいことや「今ほしい！」に使った結果、「気づいたら手元にお金がない…」なんてことも。これは悪いことじゃなく、お金を“生きたこと”に変えられる人だからこそ。入った時点で「使う分」と「先にとっておく分」を分けておくと安心です。`;
  } else if (moneyType === 'save') {
    zp = `${D.ZAI[baseZai] || 'コツコツ育てていくタイプ'}。${kime || ''}${tempo}コツコツ蓄える力があるので、その堅実さは信じて大丈夫。守りに入りすぎず、ときどき自分にごほうびを出すくらいで、ちょうどいいバランスです。`;
  } else {
    zp = `${D.ZAI[baseZai] || '自分のリズムで、無理なく育てるのが合うタイプ'}。${kime || ''}${tempo}大きく増やすことより、自分のペースで無理なく回していくほうが性に合います。背伸びした勝負より、地に足のついたやりくりが、結局いちばん効いてきます。`;
  }
  if (zaiKi) zp += 'お金に強くこだわりすぎると、かえって視野が狭くなりがち。数字は信頼できる人と共有しておくと、執着がふっとほどけます。';
  const zaiM = (P['財帛'].majorStars.find((s) => s.mutagen) || {}).mutagen;
  zp += { 祿: 'お金の巡りに恵まれる追い風があるので、ケチらず生きたことに使うほど、めぐって返ってきます。', 權: 'お金を動かす力が強いぶん、勢いで大きく張りすぎないのがコツ。', 科: '堅実さがそのまま信頼になり、人からの評価がお金に変わっていくタイプです。' }[zaiM] || '';
  if (bodyP && bodyP.name === '財帛') zp += spender
    ? 'そして、あなたは「身宮」がこのお金の場所に重なる人。人生の中で“豊かさ”が大きな主戦場になり、お金を動かす額も、稼ぐ・使うの振れ幅も、人より大きくなりやすいタイプです。'
    : 'そして、あなたは「身宮」がこのお金の場所に重なる人。お金や豊かさが人生の大事なテーマになりやすく、丁寧に向き合うほど、着実に育てていけるタイプです。';
  // 財帛の輔星（助け・表現）も差し色に
  const zaiK = minorsKichi('財帛'); if (zaiK.length) zp += `お金まわりでは、${zaiK.map((n) => D.KICHI[n]).join('・')}も働き、人の助けや得意が収入につながりやすい後押しがあります。`;
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
  const koi = fuu.stars.length ? KOI[brightest(fuu.stars).name] : '';
  let fp = `${fuuText || '気持ちが通うと深くつながるタイプ'}。${koi || ''}`;
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
  // 距離感は命宮＋身宮の星から（身宮の太陽=フラット 等を拾うため）。明るい星を優先。
  const relStars = [...mei.stars, ...(bodyP ? bodyP.majorStars : [])];
  const kyori = relStars.length ? KYORI[brightest(relStars).name] : '';
  if (kyori) blocks.push(Pp(`まず人との距離感から。あなたは${kyori}`));
  blocks.push(Pp(rel('父母', '親・目上', D.FUBO)));
  blocks.push(Pp(rel('子女', '子ども・後輩', D.SHIJO)));
  blocks.push(Pp(rel('兄弟', '兄弟・親友', D.KYODAI)));
  blocks.push(Pp(rel('僕役', '部下・人脈', D.BOKU)));

  // ── 暮らし・移動（田宅＋遷移） ───────────────────────────────
  const den = majorsOf('田宅'); const sen = majorsOf('遷移');
  const meiBrt = brightSum('命宮'), senBrt = brightSum('遷移');
  // 基準書: 離郷の発火条件。「生まれた場所を離れろ」は本物の離郷マーカー＝天馬が命宮or遷移宮にある人だけ。
  const horseIn = (n) => [...P[n].minorStars, ...P[n].adjectiveStars].some((s) => s.name === '天馬');
  const rikyo = horseIn('命宮') || horseIn('遷移');
  // 外向き/落ち着きの結論は遷移の「一番明るい主星」の性質で決める＝外の世界の文と必ず一致させる（矛盾させない＝基準書§5 輝き優先）。
  const senLead = sen.stars.length ? brightest(sen.stars).name : '';
  const senActive = sen.stars.some((s) => s.mutagen === '祿' || s.mutagen === '權'); // 遷移が化禄/化権で活性＝外で動く後押し
  const movingStars = ['七殺', '破軍', '貪狼', '天機', '太陽', '廉貞'];
  const outward = !rikyo && (movingStars.includes(senLead) || senActive); // 遷移の主役が動の星 or 活性なら外向き
  blocks.push(H('暮らし・場所・移動'));
  blocks.push(Pp(`家・資産：${den.stars.map((s) => D.DENTAKU[s.name]).filter(Boolean).join('。') || '落ち着ける住まいに縁'}。`));
  let sp = `外の世界：${sen.stars.map((s) => D.SEN[s.name]).filter(Boolean).join('。') || '外でも自然体で過ごせるタイプ'}。`;
  if (rikyo) sp += 'とくにあなたは、生まれ育った場所にとどまるより、地元を離れて新しい土地や環境に出るほど、味方が現れて運がひらく「離郷で伸びる」タイプ。引っ越し・遠出・移住を、怖がらなくて大丈夫です。';
  else if (outward) sp += 'どちらかといえば、家にこもるより外に出て人と交わるほど引き立てられ、力が伸びるタイプ。地元を離れる必要まではありませんが、出不精にならず外との接点を持つほど運が回ります。';
  else sp += '住み慣れた場所や、勝手のわかる環境にいるほど、落ち着いて力を出せるタイプ。無理に遠くへ動くより、地に足のついた範囲をていねいに耕すのが向いています。';
  blocks.push(Pp(sp));

  // ── 心（福徳） ───────────────────────────────────────────────
  const fuk = majorsOf('福德');
  blocks.push(H('心が満たされるとき'));
  let kp = `${fuk.stars.map((s) => D.FUK[s.name]).filter(Boolean).join('。') || '穏やかに自分を取り戻せる時間'}。`;
  // へこむポイント＝命宮の性格から。立ち直り方は"満たされる時間"を取り戻すこと。
  const hekomi = mei.stars.map((s) => HEKOMI[s.name]).filter(Boolean)[0];
  if (hekomi) kp += `逆に心がへこみやすいのは、${hekomi}。そんなときは無理に元気を出そうとせず、さっきの“満たされる時間”を意識して取り戻すのが、いちばんの立ち直り方です。`;
  if (minorsSatsu('福德').length) kp += 'もともと考えごとや刺激で心がざわつきやすいので、あえて何もしない時間を予定に入れておくと、ぐっと楽になります。';
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
