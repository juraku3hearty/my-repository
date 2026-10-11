#!/usr/bin/env bash
# ConoHa VPS (Ubuntu 22.04) への配置用。リポジトリを置いたディレクトリで実行する。
set -euo pipefail

echo "== システム依存（WeasyPrintのPDF描画に必要） =="
sudo apt-get update
sudo apt-get install -y \
  python3-venv python3-pip \
  libpango-1.0-0 libpangoft2-1.0-0 libharfbuzz0b libffi-dev \
  fonts-noto-cjk

echo "== Python環境 =="
cd "$(dirname "$0")/.."
python3 -m venv .venv
. .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

echo "== 設定ファイル =="
if [ ! -f .env ]; then
  cp .env.example .env
  echo ".env を作成しました。VIMEO_ACCESS_TOKEN と GEMINI_API_KEY を記入してください。"
fi
mkdir -p data/captions data/captions_manual data/audio out

echo
echo "完了。次の順に実行してください。"
echo "  . .venv/bin/activate"
echo "  python3 cli.py check        # 接続確認"
echo "  python3 cli.py list-videos  # ① 動画一覧"
echo "  python3 cli.py test-one     # 最初の1本で検証"
