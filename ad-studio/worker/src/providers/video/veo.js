/**
 * Veo(Gemini API)アダプタ — サブスク不要・従量課金のAI演技シーン生成。
 * 必要なもの:
 *   - GEMINI_API_KEY(GAS側と同じキーでOK。.envに追加)
 *   - キーの属するGoogleプロジェクトで課金(有料枠)が有効なこと。Veoは無料枠対象外
 * エンドポイントやモデル名が変わったら https://ai.google.dev/gemini-api/docs/video を確認して
 * VEO_MODEL / VEO_API_BASE を .env で上書きすればよい。
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../../config.js';

const POLL_INTERVAL_MS = 10000;
const TIMEOUT_MS = 10 * 60 * 1000;

export async function generate({ prompt, durationSec = 6, aspectRatio = '9:16' }) {
  const { apiKey, apiBase, model } = config.veo;
  if (!apiKey) throw new Error('GEMINI_API_KEY が .env に未設定です(Veoアダプタに必要)');

  // Veoは4/6/8秒のみ受け付ける(実測)。一番近い値に丸める
  const duration = [4, 6, 8].reduce((a, b) =>
    Math.abs(b - durationSec) < Math.abs(a - durationSec) ? b : a);

  // 生成ジョブ作成(長時間実行オペレーション)
  const res = await fetch(`${apiBase}/v1beta/models/${model}:predictLongRunning?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instances: [{ prompt }],
      parameters: {
        aspectRatio,
        durationSeconds: duration,
        sampleCount: 1,
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`Veo 生成リクエスト失敗 ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const op = await res.json();
  if (!op.name) {
    throw new Error('VeoレスポンスにオペレーションIDがありません: ' + JSON.stringify(op).slice(0, 300));
  }

  // 完了までポーリング
  const deadline = Date.now() + TIMEOUT_MS;
  let videoUri = null;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const st = await fetch(`${apiBase}/v1beta/${op.name}?key=${apiKey}`);
    if (!st.ok) continue;
    const data = await st.json();
    if (data.error) throw new Error('Veo 生成失敗: ' + JSON.stringify(data.error).slice(0, 300));
    if (data.done) {
      const r = data.response || {};
      videoUri =
        r.generateVideoResponse?.generatedSamples?.[0]?.video?.uri ||
        r.generatedVideos?.[0]?.video?.uri ||
        r.predictions?.[0]?.videoUri || null;
      if (!videoUri) {
        throw new Error('Veo 完了レスポンスに動画URIが見つかりません: ' + JSON.stringify(r).slice(0, 400));
      }
      break;
    }
  }
  if (!videoUri) throw new Error('Veo 生成がタイムアウトしました(10分)');

  // ダウンロード(URIにAPIキーを付与)
  const dlUrl = videoUri.includes('key=')
    ? videoUri
    : `${videoUri}${videoUri.includes('?') ? '&' : '?'}key=${apiKey}`;
  const dl = await fetch(dlUrl);
  if (!dl.ok) throw new Error(`Veo 動画ダウンロード失敗 ${dl.status}`);
  const filePath = path.join(config.workDir, `veo-${Date.now()}.mp4`);
  await fs.writeFile(filePath, Buffer.from(await dl.arrayBuffer()));
  return { filePath, note: `Veo ${model}` };
}
