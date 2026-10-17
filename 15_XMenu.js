/**
 * 15_XMenu.js
 * スプレッドシートのメニュー
 *
 * このスクリプトを過去ログのスプレッドシートにバインドすると、
 * 開いたときに「X 文体ツール」メニューが出る。
 */

function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('X 文体ツール')
      .addItem('① 設定シートを作る / 更新する', 'xSetup')
      .addItem('　 読み取れるか確認する', 'xPreviewLog')
      .addSeparator()
      .addItem('② 文体を抽出する（完了まで数回押す）', 'xExtractStyle')
      .addItem('　 抽出をやり直す', 'xResetExtract')
      .addSeparator()
      .addItem('③ 今週の投稿案を作る', 'xGeneratePosts')
      .addToUi();
  } catch (e) {
    // バインドされていない環境では何もしない
  }
}
