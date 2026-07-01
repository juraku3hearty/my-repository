/**
 * ワーカー本体 — スプレッドシートの「ジョブ」シートを定期ポーリングし、
 * pending → processing → done/error と状態を進める。
 * 起動: npm start(常駐) / npm run once(1回だけ・動作確認用)
 */
import { config } from './config.js';
import { fetchPendingJob, updateJob, JOB_COL } from './sheets.js';
import { processJob } from './pipeline.js';
import { notifyLine } from './notify.js';

const once = process.argv.includes('--once');

async function tick() {
  const job = await fetchPendingJob();
  if (!job) return false;

  const jobId = job.row[JOB_COL.ID];
  console.log(`[${new Date().toISOString()}] ジョブ開始: ${jobId}`);
  await updateJob(job.rowIndex, { [JOB_COL.STATUS]: 'processing' });

  try {
    const result = await processJob(job);
    await updateJob(job.rowIndex, {
      [JOB_COL.STATUS]: 'done',
      [JOB_COL.OUT_DRIVE_ID]: result.fileId,
      [JOB_COL.OUT_URL]: result.url,
      [JOB_COL.COST]: result.cost,
      [JOB_COL.MEMO]: result.note,
    });
    console.log(`✅ 完了: ${jobId} → ${result.url}(コスト約${result.cost}円)`);
    await notifyLine(`🎬 広告動画が完成しました\nジョブ: ${jobId}\n作成コスト: 約${result.cost}円\n${result.url}`);
  } catch (err) {
    console.error(`❌ 失敗: ${jobId}`, err);
    await updateJob(job.rowIndex, {
      [JOB_COL.STATUS]: 'error',
      [JOB_COL.ERROR]: String(err.message || err).slice(0, 500),
    });
    await notifyLine(`⚠️ 動画ジョブ失敗: ${jobId}\n${String(err.message || err).slice(0, 200)}\nシートの「エラージョブを再実行」で再投入できます`);
  }
  return true;
}

async function main() {
  console.log(`広告動画工房ワーカー起動(voice=${config.voiceProvider}, video=${config.videoProvider})`);
  if (once) {
    const had = await tick();
    console.log(had ? '1件処理しました' : 'pendingジョブなし');
    return;
  }
  // 常駐ループ: 処理があれば連続、なければ間隔を空ける
  for (;;) {
    let had = false;
    try {
      had = await tick();
    } catch (err) {
      console.error('ループエラー(継続):', err);
    }
    if (!had) await new Promise((r) => setTimeout(r, config.pollIntervalSec * 1000));
  }
}

main().catch((err) => {
  console.error('致命的エラー:', err);
  process.exit(1);
});
