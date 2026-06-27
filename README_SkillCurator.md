# AI Skill Curator（LINE版）

PUENTE「AI Skill Curator」のSlack依存をやめ、**LINE + GAS + スプレッドシート + Gemini**で
同じ「知識の複利ループ（蓄積→活用→分析→改善）」を回す自作版です。
お客様が普段使っているLINEに知見を送るだけで、Claude用Skillが自動生成され、削減時間・費用が見える化されます。

## できること

| ステップ | 操作 | 結果 |
|---|---|---|
| ① 蓄積 | LINEに知見テキストを送る | Geminiが構造化し、ナレッジDBに保存 |
| ① 蓄積 | （同上） | Claude公式Skill（SKILL.md）を自動生成して保存 |
| ② 活用 | `使った <Skill名> <分> <円> [メモ]` | 活用ログに記録 |
| ③ 分析 | `集計` | 削減時間・費用・貢献トップSkillをLINEで見える化 |
| ③ 分析 | 毎月1日 自動 | 前月の月次レポートを自動プッシュ |
| 検索 | `検索 <キーワード>` / `一覧` | 過去ナレッジを引き出す |

## ファイル構成（GAS）

| ファイル | 役割 |
|---|---|
| `gas_main.js` | Webhookルーター（doPost） |
| `00_Config.gs` | 設定・スクリプトプロパティ |
| `02_Line.gs` | LINE返信/プッシュAPI |
| `03_KnowledgeDB.gs` | スプレッドシートCRUD |
| `04_SkillGenerator.gs` | Gemini構造化 + SKILL.md生成 |
| `06_Analytics.gs` | 見える化（集計） |
| `07_Report.gs` | 月次レポート |
| `08_Commands.gs` | LINE受信本体・コマンド解釈 |
| `09_Setup.gs` | 初期化・トリガー登録 |

## セットアップ手順

1. **スプレッドシート**を新規作成し、URLの `/d/～/edit` の「～」がID。
2. **Google AI Studio** で `GEMINI_API_KEY` を取得（無料枠）。
3. **LINE Developers** で Messaging API チャネルを作り、チャネルアクセストークンを取得。
4. **GASプロジェクト**に本リポジトリのファイルを配置（clasp push でも可）。
5. GASエディタ → プロジェクトの設定 → **スクリプトプロパティ**に登録：
   - `LINE_CHANNEL_ACCESS_TOKEN`
   - `GEMINI_API_KEY`
   - `SPREADSHEET_ID`
6. GASエディタで `initialize()` を実行（シート作成）。
7. `setupMonthlyTrigger()` を実行（月次レポート自動化）。
8. **ウェブアプリとしてデプロイ**（アクセス: 全員）→ 発行URLをLINEのWebhook URLに設定し、Webhookを「オン」。
9. 動作確認：`debugIngest()`（要GEMINI_API_KEY）→ `debugDashboard()`。

## 設計メモ

- 秘密情報はコード直書きせず、すべてスクリプトプロパティ管理。
- `CONFIG.FREE_PLAN_LIMIT` を 0 以外にすると、PUENTE同様のフリープラン上限（件数制限）を再現可能。
- Skillは Claude 公式形式（YAMLフロントマター `name` / `description` + 本文）で `Skill` シートのC列に保存。
  そのまま `SKILL.md` としてコピーすればClaude Codeで使える。
