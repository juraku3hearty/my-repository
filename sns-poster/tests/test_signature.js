// Cloudinary 署名生成の検証: GAS実装 と Node crypto の SHA-1 が一致するか
const crypto = require('crypto');
const fs = require('fs');
const vm = require('vm');
const path = require('path');

// Utilities.computeDigest の挙動（符号付きバイト配列を返す）を再現
const Utilities = {
  DigestAlgorithm: { SHA_1: 'SHA_1' },
  Charset: { UTF_8: 'UTF_8' },
  computeDigest(algo, text) {
    const buf = crypto.createHash('sha1').update(text, 'utf8').digest();
    // GAS は signed byte (-128..127) を返すのでそれを模す
    return Array.from(buf).map(b => (b > 127 ? b - 256 : b));
  }
};

const ctx = vm.createContext({ Utilities, Object, String, Math, Date, console, PropertiesService: null });
const src = fs.readFileSync(path.join(__dirname, '..', '03_Cloudinary.gs'), 'utf8');
// 署名関数だけ切り出して評価
const fn = src.slice(src.indexOf('function cloudinarySignature_'), src.indexOf('/**\n * 配信URLを組み立てる'));
vm.runInContext(fn, ctx);

let pass = 0, fail = 0;
function eq(label, got, want) {
  if (got === want) { pass++; console.log('  ✓ ' + label); }
  else { fail++; console.log('  ✗ ' + label + '\n      got : ' + got + '\n      want: ' + want); }
}

// Cloudinary 公式ドキュメントの例
// params: public_id=sample, timestamp=1315060510 / secret: abcd
const want1 = crypto.createHash('sha1')
  .update('public_id=sample&timestamp=1315060510abcd', 'utf8').digest('hex');
eq('Node crypto の SHA-1 と一致',
   vm.runInContext("cloudinarySignature_({public_id:'sample', timestamp:'1315060510'}, 'abcd')", ctx),
   want1);
console.log('    (= ' + want1 + ')');
// sha1sum コマンドで独立検証した値（記憶に頼らず実測）
eq('sha1sum の実測値と一致', want1, 'c3470533147774275dd37996cc4d0e68fd03cd4f');

// 実際に使う形: folder + timestamp
const want2 = crypto.createHash('sha1')
  .update('folder=sns-poster&timestamp=1760000000MYSECRET', 'utf8').digest('hex');
eq('folder+timestamp',
   vm.runInContext("cloudinarySignature_({folder:'sns-poster', timestamp:'1760000000'}, 'MYSECRET')", ctx),
   want2);

// キー順がソートされているか（意図的に逆順で渡す）
eq('キー名の昇順でソートされる',
   vm.runInContext("cloudinarySignature_({timestamp:'1760000000', folder:'sns-poster'}, 'MYSECRET')", ctx),
   want2);

// 16進変換で先頭ゼロが落ちないか（40文字固定）
const sig = vm.runInContext("cloudinarySignature_({folder:'x', timestamp:'1'}, 's')", ctx);
eq('常に40文字の16進', sig.length, 40);
eq('16進文字のみ', /^[0-9a-f]{40}$/.test(sig), true);

console.log('\npass: ' + pass + '  fail: ' + fail);
process.exit(fail ? 1 : 0);
