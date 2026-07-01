/**
 * 手動アダプタ — API連携なしのフォールバック運用。
 * プロンプトをワーカーメモに残すだけで、動画生成はスキップして撮影素材のみで合成する。
 * Higgsfield のUIで手動生成した動画は「素材ライブラリ」に登録してジョブに含めればOK。
 */
export async function generate({ prompt }) {
  return {
    filePath: null,
    note: `【手動生成用プロンプト】${prompt} — HiggsfieldのUIで生成し、素材ライブラリに登録して再ジョブ投入してください`,
  };
}
