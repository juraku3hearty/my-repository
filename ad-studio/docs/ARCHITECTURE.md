# アーキテクチャ設計メモ

## 設計原則

1. **GAS/スプレッドシート優先**(MAYU方針)— 管理・台本生成・集計はGAS。VPSは ffmpeg と外部API連携だけ担当
2. **プロバイダ非依存** — 音声・動画生成は必ずアダプタ経由。サービス乗り換えでパイプラインは変更不要
3. **状態は全部シートに残す** — ジョブの成否・コスト・出力・エラーが1行で追える。「動画生成でイライラしない」ための可観測性
4. **90〜120秒の短尺特化** — ナレーション長=動画長の単純なルールにして合成ロジックを安定させる

## アダプタの追加方法(例: Higgsfield → Kling に乗り換え)

1. `worker/src/providers/video/kling.js` を作成:

```js
export async function generate({ prompt, durationSec, aspectRatio }) {
  // Kling API を叩いて mp4 をダウンロード
  return { filePath: '/path/to/downloaded.mp4', note: 'kling job xxx' };
}
```

2. `worker/src/providers/video/index.js` の registry に追加:

```js
import * as kling from './kling.js';
const registry = { higgsfield, manual, kling };
```

3. `.env` を `VIDEO_PROVIDER=kling` に変更して再起動。以上。

音声プロバイダ(`providers/voice/`)も同じ仕組み。
インターフェース契約は各 `index.js` の冒頭コメントが正。

## ジョブのライフサイクル

```
GASメニュー「② 動画ジョブを発行」
  → ジョブシートに 状態=pending で1行追加(バリアント行も同時起票)
  → ワーカーが検知して processing に更新
  → 台本取得 → TTS → (プロンプトあれば)動画生成 → ffmpeg合成 → Driveアップ
  → done + 出力URL + 作成コスト(円) + ワーカーメモ を書き戻し
  → バリアント行にも出力URLを反映、LINE通知(任意)
  失敗時 → error + エラー内容。「エラージョブを再実行」で pending に戻せる
```

## コスト計算

- 音声: `ceil(文字数/1000) × COST_VOICE_PER_1K_CHARS`(既定15円)
- 動画生成: 1生成あたり `COST_VIDEO_PER_GENERATION`(既定80円)
- 単価は概算。実際の請求額に合わせて `.env` で調整する
- ABレポートで `総コスト = 広告費 + 作成コスト`、`CPA = 総コスト ÷ 予約数`

## Higgsfield との接続は2系統

| 系統 | 認証 | 向き | ワーカー設定 |
|---|---|---|---|
| 公式MCP (`https://mcp.higgsfield.ai/mcp`) | Higgsfieldアカウント(OAuth) | Claudeと会話しながらクリップ生成。プランのクレジット消費 | `VIDEO_PROVIDER=manual`(合成のみ) |
| Cloud API (`cloud.higgsfield.ai`) | APIキー/シークレット | ジョブ発行だけの完全自動 | `VIDEO_PROVIDER=higgsfield` |

MCPはエージェント(Claude)用の口なので、常駐ワーカーからは使わずREST(Cloud API)を使う。
まずMCP+manualで運用を始めて、量産が軌道に乗ったらCloud APIで全自動化する、の順がコスト安全。

## 既知の割り切り(v1)

- ワーカーは1プロセス・逐次処理(自院用途では十分。並列化はキュー競合制御が必要になるので保留)
- Higgsfield APIのエンドポイントは変動リスクあり → `manual` プロバイダで運用は継続可能
- AB結果は手入力(広告API連携はv2)
- GAS側とワーカー側でシート列定義を二重管理(`01_Setup.js` と `sheets.js`)。列を変えるときは両方直す
