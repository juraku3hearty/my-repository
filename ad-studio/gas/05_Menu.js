/** スプレッドシートを開いたときにカスタムメニューを追加 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🎬 広告動画工房')
    .addItem('① 台本を3パターン生成(Gemini)', 'generateScriptsFromMenu')
    .addItem('② 動画ジョブを発行', 'createJobFromMenu')
    .addSeparator()
    .addItem('③ AB結果を入力', 'addResultFromMenu')
    .addItem('④ レポート更新', 'updateReport')
    .addSeparator()
    .addItem('エラージョブを再実行', 'retryErrorJobs')
    .addItem('初期セットアップ', 'initialize')
    .addToUi();
}
