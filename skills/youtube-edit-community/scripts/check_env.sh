#!/bin/bash
# Run with the Apple-provided Python, independent of shell aliases.
set -u
PKG_DIR="$(cd "$(dirname "$0")/.." && pwd)"
echo "youtube-edit-community package version: $(cat "$PKG_DIR/VERSION" 2>/dev/null || echo unknown)"
BAD=0
NEED_FFMPEG=0
NEED_NODE=0
NEED_REMOTION=0
NEED_BROWSER=0
if [ "$(uname -s)" != Darwin ] || [ "$(uname -m)" != arm64 ]; then
  echo 'FAIL: macOS Apple Silicon が必要です。'; BAD=1
fi
for EXE in ffmpeg ffprobe; do
  if command -v "$EXE" >/dev/null 2>&1; then
    EXE_VERSION="$("$EXE" -version | head -1)"; echo "$EXE_VERSION"
    case "$EXE_VERSION" in *'version 8.'*) ;; *) NEED_FFMPEG=1 ;; esac
  else echo "MISSING: $EXE"; NEED_FFMPEG=1; fi
done
if [ -x /usr/bin/python3 ]; then
/usr/bin/python3 - "$PKG_DIR" <<'PY'
import sys, importlib, importlib.metadata as metadata
from pathlib import Path
print('python3', sys.version.split()[0], sys.executable)
ok = sys.version_info >= (3, 9)
if not ok:
    print('必要: Python 3.9以上を含むmacOS Command Line Tools (xcode-select --install)')
missing = []
for module, package in [('pip', 'pip'), ('numpy', 'numpy'), ('scipy', 'scipy'), ('PIL', 'Pillow'), ('mlx_whisper', 'mlx-whisper')]:
    try:
        importlib.import_module(module)
        print(package, metadata.version(package))
    except Exception as error:
        print('MISSING:', package, str(error))
        missing.append(package)
if 'pip' in missing:
    print('/usr/bin/python3 -m ensurepip --user')
packages = [p for p in missing if p != 'pip']
if packages:
    print('/usr/bin/python3 -m pip install --user ' + ' '.join(packages))
for name in ['NotoSansJP-ExtraBold.ttf', 'NotoSansJP-Black.ttf', 'OFL.txt']:
    exists = (Path(sys.argv[1]) / 'fonts' / name).is_file()
    print('font', name, 'OK' if exists else 'MISSING: 配布パッケージから復元してください')
    ok &= exists
sys.exit(0 if ok and not missing else 1)
PY
[ "$?" = 0 ] || BAD=1
else
  echo 'MISSING: /usr/bin/python3'; echo 'xcode-select --install'; BAD=1
fi
if command -v node >/dev/null 2>&1; then
  node --version
  node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 20 ? 0 : 1)' || NEED_NODE=1
else echo 'MISSING: node'; NEED_NODE=1; fi
if command -v npm >/dev/null 2>&1; then npm --version; else echo 'MISSING: npm'; NEED_NODE=1; fi
if command -v node >/dev/null 2>&1; then
  node - "$PKG_DIR/remotion" <<'JS'
const {createRequire}=require('node:module'); const r=createRequire(process.argv[2]+'/package.json');
try { for(const p of ['remotion','@remotion/renderer','@remotion/bundler','react']) console.log(p,r(p+'/package.json').version); }
catch(e) {console.log('MISSING: Remotion dependencies');process.exit(1);}
JS
  [ "$?" = 0 ] || NEED_REMOTION=1
elif [ ! -d "$PKG_DIR/remotion/node_modules/remotion" ]; then
  NEED_REMOTION=1
fi
BROWSER="$PKG_DIR/remotion/node_modules/.remotion/chrome-headless-shell/mac-arm64/chrome-headless-shell-mac-arm64/chrome-headless-shell"
if [ -x "$BROWSER" ]; then echo 'Chromium: installed'; else echo 'MISSING: Chromium'; NEED_BROWSER=1; fi
if [ "$NEED_FFMPEG" = 1 ]; then echo 'brew install ffmpeg'; BAD=1; fi
if [ "$NEED_NODE" = 1 ]; then echo 'brew install node'; BAD=1; fi
if [ "$NEED_REMOTION" = 1 ]; then printf 'cd "%s/remotion" && npm ci\n' "$PKG_DIR"; BAD=1; fi
if [ "$NEED_BROWSER" = 1 ]; then printf 'cd "%s/remotion" && npm run setup\n' "$PKG_DIR"; BAD=1; fi
if [ "$BAD" = 0 ]; then echo READY; else exit 1; fi
