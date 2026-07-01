/**
 * Higgsfield アダプタ(text-to-video / image-to-video)。
 * 注意: Higgsfield のAPIは発展途上でエンドポイントが変わることがある。
 * ここが動かなくなったら公式ドキュメント(https://docs.higgsfield.ai)を確認して
 * ENDPOINTS だけ直せばよい。全滅時は VIDEO_PROVIDER=manual に切り替えれば運用は止まらない。
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../../config.js';

const ENDPOINTS = {
  create: '/v1/text2video',      // 生成ジョブ作成
  status: (id) => `/v1/jobs/${id}`, // ステータス取得
};

const POLL_INTERVAL_MS = 15000;
const TIMEOUT_MS = 15 * 60 * 1000;

function headers() {
  if (!config.higgsfield.apiKey) throw new Error('HIGGSFIELD_API_KEY が未設定です');
  return {
    'hf-api-key': config.higgsfield.apiKey,
    'hf-secret': config.higgsfield.apiSecret,
    'Content-Type': 'application/json',
  };
}

export async function generate({ prompt, durationSec = 5, aspectRatio = '9:16' }) {
  const createRes = await fetch(config.higgsfield.apiBase + ENDPOINTS.create, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      params: {
        prompt,
        duration: durationSec,
        aspect_ratio: aspectRatio,
        enhance_prompt: true,
      },
    }),
  });
  if (!createRes.ok) {
    const body = await createRes.text();
    throw new Error(`Higgsfield 生成リクエスト失敗 ${createRes.status}: ${body.slice(0, 300)}`);
  }
  const created = await createRes.json();
  const jobId = created.id || created.job_id || created.jobs?.[0]?.id;
  if (!jobId) throw new Error('Higgsfield のレスポンスからジョブIDが取れません: ' + JSON.stringify(created).slice(0, 300));

  // 完了までポーリング
  const deadline = Date.now() + TIMEOUT_MS;
  let videoUrl = null;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const st = await fetch(config.higgsfield.apiBase + ENDPOINTS.status(jobId), { headers: headers() });
    if (!st.ok) continue;
    const data = await st.json();
    const status = data.status || data.state;
    if (status === 'completed' || status === 'succeeded') {
      videoUrl = data.results?.raw?.url || data.result?.url || data.video_url || data.output?.[0];
      break;
    }
    if (status === 'failed' || status === 'error' || status === 'nsfw') {
      throw new Error(`Higgsfield 生成失敗: ${JSON.stringify(data).slice(0, 300)}`);
    }
  }
  if (!videoUrl) throw new Error('Higgsfield 生成がタイムアウトしました(15分)');

  // ダウンロード
  const dl = await fetch(videoUrl);
  if (!dl.ok) throw new Error(`生成動画のダウンロード失敗 ${dl.status}`);
  const filePath = path.join(config.workDir, `higgsfield-${Date.now()}.mp4`);
  await fs.writeFile(filePath, Buffer.from(await dl.arrayBuffer()));
  return { filePath, note: `Higgsfield job ${jobId}` };
}
