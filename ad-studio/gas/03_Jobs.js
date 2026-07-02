/**
 * ジョブ発行 — 台本と素材を選んでワーカーに渡すジョブを作る。
 * ワーカー(VPS)が「状態=pending」の行を拾って処理し、結果を書き戻す。
 */
function createJobFromMenu() {
  const ui = SpreadsheetApp.getUi();
  const scriptId = ui.prompt('使う台本IDは?(台本シート参照)').getResponseText();
  if (!scriptId) return;
  const materialIds = ui.prompt('使う素材IDは?(カンマ区切り・空欄でAI動画のみ)').getResponseText();
  const videoPrompt = ui.prompt('AI動画プロンプト(空欄=台本の「推奨AIシーン」を自動使用。使わない場合は none と入力)').getResponseText();
  const stores = ui.prompt('配信する店舗は?(カンマ区切りで複数可・空欄=店舗共通1本。店舗一覧シート参照)').getResponseText();

  const storeList = stores ? stores.split(',').map(function(s) { return s.trim(); }).filter(Boolean) : [''];
  const jobIds = storeList.map(function(store) {
    return createJob('full', scriptId, materialIds, videoPrompt, store);
  });
  ui.alert('ジョブ発行: ' + jobIds.length + '本\n' + jobIds.join('\n') +
    '\nVPSワーカーが処理すると状態が done になり、出力URLが入ります。');
}

/**
 * @param {string} type - full / voice / video / assemble
 * @param {string} scriptId - 台本ID
 * @param {string} materialIds - 素材ID カンマ区切り
 * @param {string} videoPrompt - AI動画生成用の追加プロンプト
 * @param {string} store - 店舗名(空欄=店舗共通。指定すると店舗のエンド素材を末尾に自動合成)
 */
function createJob(type, scriptId, materialIds, videoPrompt, store) {
  const script = findScript_(scriptId);
  if (!script && type !== 'assemble') throw new Error('台本が見つかりません: ' + scriptId);

  // AI動画プロンプト: 空欄なら台本の推奨AIシーン(フック)を自動採用。'none' で明示的に無効化
  if (String(videoPrompt).toLowerCase() === 'none') {
    videoPrompt = '';
  } else if (!videoPrompt && script && script.hookScene) {
    videoPrompt = script.hookScene;
  }

  // 店舗指定があればエンド素材IDを引く
  let endMaterialId = '';
  if (store) {
    const st = findStore_(store);
    if (!st) throw new Error('店舗「' + store + '」が店舗一覧シートにありません');
    endMaterialId = st.endMaterialId;
    if (!endMaterialId) throw new Error('店舗「' + store + '」のエンド素材IDが未登録です(店舗一覧シート)');
  }

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
    voiceId, '', '', '', '', now, now, '', endMaterialId,
  ]);

  // バリアントも同時に起票(結果測定のため必ずジョブと1:1で残す)
  const label = scriptId + ' / ' + (videoPrompt || '素材のみ') + (store ? ' / ' + store : '');
  ADS.sheet(ADS.SHEETS.VARIANTS).appendRow([
    newId_('VAR'), jobId, label, scriptId,
    '', '', '', '未公開', '', category, store || '',
  ]);

  return jobId;
}

/** 店舗一覧シートから1行引く */
function findStore_(name) {
  const values = ADS.sheet(ADS.SHEETS.STORES).getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]).trim() === String(name).trim()) {
      return { name: values[i][0], endMaterialId: String(values[i][1] || '').trim() };
    }
  }
  return null;
}

function findScript_(scriptId) {
  const values = ADS.sheet(ADS.SHEETS.SCRIPTS).getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === scriptId) {
      return {
        hook: values[i][4], body: values[i][5], cta: values[i][6],
        category: values[i][9] || '', recommendedVoiceId: values[i][10] || '',
        hookScene: values[i][12] || '',
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
