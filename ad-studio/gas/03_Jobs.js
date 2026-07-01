/**
 * ジョブ発行 — 台本と素材を選んでワーカーに渡すジョブを作る。
 * ワーカー(VPS)が「状態=pending」の行を拾って処理し、結果を書き戻す。
 */
function createJobFromMenu() {
  const ui = SpreadsheetApp.getUi();
  const scriptId = ui.prompt('使う台本IDは?(台本シート参照)').getResponseText();
  if (!scriptId) return;
  const materialIds = ui.prompt('使う素材IDは?(カンマ区切り・空欄でAI動画のみ)').getResponseText();
  const videoPrompt = ui.prompt('AI動画の追加プロンプト(空欄可。例: 明るい院内、施術ベッド、柔らかい光)').getResponseText();
  const jobId = createJob('full', scriptId, materialIds, videoPrompt);
  ui.alert('ジョブ発行: ' + jobId + '\nVPSワーカーが処理すると状態が done になり、出力URLが入ります。');
}

/**
 * @param {string} type - full / voice / video / assemble
 * @param {string} scriptId - 台本ID
 * @param {string} materialIds - 素材ID カンマ区切り
 * @param {string} videoPrompt - AI動画生成用の追加プロンプト
 */
function createJob(type, scriptId, materialIds, videoPrompt) {
  const script = findScript_(scriptId);
  if (!script && type !== 'assemble') throw new Error('台本が見つかりません: ' + scriptId);

  const jobId = newId_('JOB');
  const now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');

  // 声の優先順位: 台本のAI推奨ボイス > カテゴリ別ボイス > デフォルト
  const category = script ? script.category : '';
  let voiceId = getSetting_('デフォルトボイスID', '');
  if (category) {
    try {
      const cat = getCategory_(category);
      if (cat.voiceId) voiceId = cat.voiceId;
    } catch (_) { /* カテゴリ未登録の旧台本はデフォルト声 */ }
  }
  if (script && script.recommendedVoiceId) voiceId = script.recommendedVoiceId;

  ADS.sheet(ADS.SHEETS.JOBS).appendRow([
    jobId, type, 'pending', scriptId, materialIds || '', videoPrompt || '',
    voiceId, '', '', '', '', now, now, '',
  ]);

  // バリアントも同時に起票(結果測定のため必ずジョブと1:1で残す)
  ADS.sheet(ADS.SHEETS.VARIANTS).appendRow([
    newId_('VAR'), jobId, scriptId + ' / ' + (videoPrompt || '素材のみ'), scriptId,
    '', '', '', '未公開', '', category,
  ]);

  return jobId;
}

function findScript_(scriptId) {
  const values = ADS.sheet(ADS.SHEETS.SCRIPTS).getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === scriptId) {
      return {
        hook: values[i][4], body: values[i][5], cta: values[i][6],
        category: values[i][9] || '', recommendedVoiceId: values[i][10] || '',
      };
    }
  }
  return null;
}

/** エラーになったジョブを pending に戻して再実行させる */
function retryErrorJobs() {
  const sheet = ADS.sheet(ADS.SHEETS.JOBS);
  const values = sheet.getDataRange().getValues();
  let count = 0;
  for (let i = 1; i < values.length; i++) {
    if (values[i][2] === 'error') {
      sheet.getRange(i + 1, 3).setValue('pending');
      sheet.getRange(i + 1, 11).setValue(''); // エラー欄クリア
      count++;
    }
  }
  SpreadsheetApp.getUi().alert(count + '件のエラージョブを再投入しました');
}
