# CLAUDE.md — プロジェクト共通コンテキスト

## オーナー情報

**MAYU（juraku.3hearty@gmail.com）**

- 整骨院スタッフ（経営者の妻）兼独学エンジニア
- 自院でシステム試験運用 → SaaS販売を目指している
- GAS・LINE・スプレッドシートで実現できるかを必ず先に検討する。それで無理な時だけアプリ化する
- LLMはGemini優先。理由: SaaS導入先の会社によっては「Geminiだけ利用OK」の所があるため。他LLMを使う場合もGeminiに切り替えられる作りにする

## 行動指針（MAYU の好み）

- 細かい命名・デフォルト値などで質問しない。こちらで決めて「これで進めます、違えば教えてください」スタイル
- A（最小）vs B（フル）の選択肢が出たら常にフルを選ぶ
- 確認画面を出してから「できました」と言わない。確認した結果だけ報告する
- 決まった方針を勝手に変えない・余計な脱線提案しない
- 動いたコードは指示なしで資産庫（`~/.claude/assets/`）に自動登録する

---

## 100チャレ — AI自動化を100人に無料提供するプロジェクト

MAYUが主催する取り組み。一人ひとりの業務課題をAIで自動化し、note等で発信する。

### 完了案件

#### No.1 献立AIシステム
- **依頼者:** 家族向け（献立担当者のいる家庭）
- **内容:** LINE Bot → GAS → Gemini APIで1ヶ月の夕飯メニューを自動生成、Googleカレンダーに買い物リストを登録
- **技術:** LINE Messaging API, GAS 11ファイル（00_Config〜10_Setup）, Gemini 2.0-flash-lite（無料枠）
- **状態:** コード実装済み。ユーザーのGAS/LINE初期セットアップ待ち
- **コード場所:** `C:\Users\jurak\Desktop\Claudecord\meal-planner\`
- **セットアップ手順:**
  1. LINE Bot 新規作成（Developers Console）
  2. Google AI Studio で GEMINI_API_KEY 取得
  3. GASプロジェクト新規作成 → 11ファイル貼り付け
  4. スクリプトプロパティ設定（LINE_CHANNEL_ACCESS_TOKEN, LINE_CHANNEL_SECRET, GEMINI_API_KEY, SPREADSHEET_ID）
  5. initialize() → generateFirstMonth() 手動実行
  6. GAS Web App デプロイ → WebhookURLをLINEに設定

#### No.2 タイムカードOCR + VBA転記（弁護士未払給料案件）
- **依頼者:** 弁護士（未払給料の裁判案件）
- **内容:** タイムカード画像をGemini OCRで読み取り、裁判所提出用Excel「給与第一Ver0.653」の時間計算書シートに自動転記
- **技術:**
  - OCR: GAS + Gemini 3.5 Flash Vision API（`gemini-3.5-flash`）
  - 転記: VBAマクロ（給与第一.xlsmのModule1）
  - スプレッドシート（確認シートID）: `1aoLD-3WAQ8MoO1DMX_y49CObAKka_pxRcPQ_cOmV2l8`
- **状態:** 完成・テスト済み。弁護士に連携済み
- **GAS確認シート列構成:** A=氏名, B=年, C=月, D=日, E=午前IN, F=午前OUT, G=午後IN, H=午後OUT, I=残業IN, J=残業OUT
- **ファイル名形式:** `2026-04_田中太郎.jpg`（正規表現で年月氏名を抽出）
- **VBA転記ロジック:**
  - 計算規則シートのD3=基準年(2023), F3=基準月(4)を読み込む
  - monthOffset = (選択年 - 基準年) × 12 + (選択月 - 基準月)
  - monthStartRow = 5 + monthOffset × 31
  - dstRow = monthStartRow + 日付 - 1
  - 既存値があるセルはスキップ（上書きしない）

#### No.3 ディオーネバレーボール YouTube自動アップロード
- **依頼者:** ディオーネバレーボールチーム
- **内容:** フォームから動画を受け取りYouTubeに自動アップロード
- **技術:** Flask (Python, VPS), YouTube API, OAuth2 token.pickle
- **フォームURL:** https://dione.famitect.com/
- **VPS構成:** vm-12d689c3-d8（163.44.114.69）、`/root/upload/app.py`
- **状態:** 本番稼働中（OAuthを本番公開済み、2026-05-17）
- **注意:** token.pickleが切れたらWindows側でauth.py実行 → SCP転送が必要

---

## インフラ構成（VPS）

- **VPS:** ConoHa、163.44.114.69、Ubuntu 22.04、2GB
- **稼働中サービス:**
  - Claude Code × Discord連携（tmux: discord）
  - ディオーネYouTube uploader（gunicorn port:5000）
  - SalonBoard自動同期（Xvfb + Puppeteer）
- **重要パス:**
  - 顧客リスト: `/root/scripts/customers.json`
  - 日次レポート: `/root/scripts/daily_report.sh`
  - YouTube uploader: `/root/upload/app.py`
  - OAuth token: `/root/youtube/token.pickle`

## Claudecord サービス（有料 Discord Bot）

- **料金:** 初期6ヶ月 月15,000円 → 継続 月6,600円
- **前提:** 顧客がClaude Max（$100/月）とVPS（2GB推奨）を自己契約
- **VPS管理:** MAYUがSSHで各VPSに入って横展開

---

## 後宮オーケストラ（マルチエージェント体制）

薬屋のひとりごと風エージェント13人。`~/.claude/agents/` に全員配置済み。

| エージェント | 役割 |
|---|---|
| 🌸 玉葉妃 (gyokuyou-planner) | 企画・GAS/LINE優先判定 |
| ♟️ 羅漢 (rakan-architect) | 設計・技術判断 |
| 🔨 高順 (gaoshun-builder) | 実装 |
| 🧪 猫猫 (maomao-critic) | コードレビュー |
| 🌙 壬氏 (jinshi-rescue) | 救援・根本原因分析 |
| 📝 水蓮 (suiren-writer) | note記事執筆 |
| 📖 紅娘 (hongniang-manual) | 説明書作成 |
| 🧮 羅半 (rahan-archivist) | 資産管理 |

**スラッシュコマンド:** `/koukyu`（フルパイプライン）, `/stuck`（行き止まり整理）, `/rahan`（資産検索）, `/maomao`（レビュー）
