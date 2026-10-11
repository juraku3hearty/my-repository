# 交通事故実務デスク — 動画ナレッジ化システム

整骨院向け「交通事故実務講座」のVimeo動画（約40本）を、会員が実務中に引ける
**Q&A索引 + 解説PDF** に変換する。

```
Vimeo動画 ──① 一覧取得 ──② 字幕取得 ──③ Gemini で話題分割 ──④ 要確認の振り分け
                                                                    │
                     ┌──────────────────────────────────────────────┤
                     ↓                        ↓                     ↓
           解説PDF（確認済み版）    確認待ち別冊PDF        Q&A索引 CSV / JSON
             会員が読む冊子          専門家がレビュー      検索用（PDFページ番号つき）
```

会員の動線は「**Q&Aで検索 → 該当ページの解説PDFを読む → 元動画の該当時刻へ飛ぶ**」。
Q&A索引の各行は解説PDFの何ページかを持っているので、検索結果からそのままページを開ける。

---

## 1. セットアップ

### VPS（ConoHa / Ubuntu 22.04）

```bash
git clone <このリポジトリ> && cd my-repository/jiko-desk
./scripts/install_vps.sh      # システム依存 + venv + pip
vi .env                       # VIMEO_ACCESS_TOKEN と GEMINI_API_KEY を記入
```

### ローカル（Windows / Mac）

```bash
python3 -m venv .venv && . .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
```

WeasyPrint はPDF描画にシステムライブラリを使う。Windowsは
[公式手順](https://doc.courtbouillon.org/weasyprint/stable/first_steps.html#windows)
のGTKランタイムが必要。VPSで回すなら `install_vps.sh` が入れる。

### 必要なもの

| 項目 | 取得先 | 備考 |
|---|---|---|
| `VIMEO_ACCESS_TOKEN` | Vimeo Developer → My Apps → Generate token | スコープ **public private**（音声DLまでやるなら video_files も） |
| `GEMINI_API_KEY` | Google AI Studio | 無料枠は分あたりのレート制限あり |
| `VIMEO_SOURCE` | — | `me` / `folder:1234567` / `showcase:1234567` / `user:1234567` |

---

## 2. 実行手順

```bash
python3 cli.py check          # 接続確認（Vimeo / Gemini / フォント）
python3 cli.py list-videos    # ① 動画一覧をDBに取り込む
python3 cli.py test-one       # ★ 最初の1本だけで字幕取得〜生成を検証
python3 cli.py fetch-captions # ② 全本の字幕を取得
python3 cli.py build          # ③④ ナレッジ生成と要確認の振り分け（自動品質チェックまで実行）
python3 cli.py qc             # 公開前の自動品質チェックだけ再実行
python3 cli.py render         # PDF と Q&A索引を出力
python3 cli.py status         # 進捗確認
```

**`test-one` が通ってから一括実行すること。** 字幕APIは権限・プラン・認証の条件があり、
1本目で落ちる場合は40本すべて落ちる。

### 出力

| ファイル | 内容 |
|---|---|
| `out/交通事故実務デスク_解説書.pdf` | 会員配布用。確認済み・確認不要の項目のみ |
| `out/交通事故実務デスク_解説書_ドラフト.pdf` | 内部確認用。確認待ちも含む（`render --draft`） |
| `out/交通事故実務デスク_確認待ち_専門家レビュー用.pdf` | 専門家に渡す別冊。確認依頼事項と記入欄つき |
| `out/QA索引.csv` | 検索用。スプレッドシートにそのまま貼れる（UTF-8 BOM付） |
| `out/品質要目視リスト.csv` | 自動品質チェックに引っかかった項目（院内で目視する分） |
| `out/knowledge.json` | 将来のWeb UI用 |

Q&A索引の1行が持つもの：質問／回答／関連キーワード／**根拠テキスト（文字起こしの逐語引用）**／
元動画URL（`#t=90s` 付き）／該当時刻／解説PDFのページ番号／確認ステータス／品質チェック結果。

---

## 3. 字幕が無い動画

Vimeoの字幕API（texttracks）は**すでにアップロードされている字幕を返すだけ**で、
字幕を自動生成する機能ではない。字幕が無い動画は次のいずれかで文字起こしを用意する。

**a) Vimeo側で用意する**（Plus以上の自動字幕生成、または手動アップロード）
→ `python3 cli.py fetch-captions --force` で再取得

**b) Whisperで自前文字起こしする**

```bash
python3 scripts/fetch_audio.py 900000001            # Pro以上 + video_files スコープが必要
python3 scripts/transcribe_whisper.py data/audio/900000001.mp4
python3 cli.py import-manual                        # data/captions_manual/ を取り込む
```

音声のダウンロードはVimeoのプランとスコープ次第で**できない場合がある**。
その場合は講座の元動画ファイルを直接受け取り、`data/audio/{動画ID}.m4a` として置く。

---

## 4. 要確認の振り分け（④）

AIの自己申告だけでは取りこぼすため、**AIの判定とキーワード辞書のOR**で確認待ちに回す。

- **strong語**（`過失割合` `示談` `打ち切り` `後遺障害` `受領委任` 等）：出た時点で確認待ち
- **weak語**（`保険会社` `自賠責` `医師` 等）：同じ文に2語以上、または判断表現
  （`〜できる` `〜すべき` `義務` 等）と同居したときだけ確認待ち

weakを文単位にしているのは、「保険会社から連絡が来ているか確認する」のような
**単なる手順説明まで確認待ちに入れると専門家側が回らない**ため。辞書は `config.py` で調整する。

制度変更の影響を受けやすい語（`改正` `令和` `通達` 等）を含む項目には「更新確認要」が付く。

### 公開前の自動品質チェック（専門家確認とは別）

「確認不要」と自動判定した項目も、そのまま公開はしない。`quality.py` が機械的に検査する。

| 検査 | 内容 |
|---|---|
| 根拠照合 | AIが出した逐語引用が、実際に文字起こしに存在するか（一致率0.8以上） |
| 数値照合 | 回答・解説の数値（金額・日数など）が文字起こしに出ているか |
| 時刻検証 | 開始<終了、動画の長さの範囲内か |
| 分量検証 | 回答20字未満・解説80字未満は要目視 |
| 重複検出 | 同じ質問が複数項目に分かれていないか |

**本編PDFに載るのは「確認済」または「確認不要かつ品質OK」の項目だけ。**
要目視になった項目は `out/品質要目視リスト.csv` に出る。

### 専門家の確認結果を戻す

```bash
# 1件ずつ
python3 cli.py review --item KB-900000001-002 --judge 確認済 --reviewer "〇〇先生"

# CSVでまとめて（列: ナレッジID, 判定, 確認者, コメント）
python3 cli.py import-review 確認結果.csv

python3 cli.py render   # 確認済みが本編PDFに入る
```

---

## 5. 新着動画の自動処理（⑤）

```bash
python3 cli.py sync-new   # 一覧 → 字幕 → 生成 → 出力 まで一気に
```

cronに入れる場合は `scripts/crontab.example` を参照。

---

## 6. 構成

| ファイル | 役割 |
|---|---|
| `config.py` | 設定、カテゴリー14種、専門家キーワード辞書 |
| `db.py` | SQLite（videos / transcripts / items / review_log） |
| `vimeo_client.py` | Vimeo API（一覧・字幕トラック・字幕DL） |
| `transcript.py` | VTT/SRT解析、時刻付きチャンク分割 |
| `gemini.py` | 構造化出力（responseSchema固定）での呼び出し |
| `knowledge.py` | パイプライン本体、AI出力の検証、要確認の振り分け |
| `render.py` | PDF組版、Q&A索引の出力、PDFページ番号の紐付け |
| `templates/` | 冊子のHTMLテンプレートとCSS |
| `prompts/knowledge_prompt.md` | AIへの指示文（ここを直せば出力の質が変わる） |
| `tests/make_sample.py` | ダミーデータで出力部分を検証する（API不要） |

### 処理量の目安（推定）

1本60分の講座で文字起こし約18,000〜20,000字。`CHUNK_CHAR_LIMIT=4000` なら
1本あたり5〜6回のGemini呼び出し。**40本で200〜250回**、直列で30〜70分程度。
無料枠のレート制限に当たる場合は `.env` の `GEMINI_SLEEP_SEC` を増やす。

### ダミーデータでの確認（APIキー不要）

```bash
python3 tests/make_sample.py   # tests/sample_out/ にPDFとCSVが出る
```
