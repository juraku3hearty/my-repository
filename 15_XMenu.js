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
      .addItem('　 過去ログを読めるか確認する', 'xPreviewLog')
      .addItem('　 戦略シートを読めるか確認する', 'xPreviewStrategy')
      .addItem('　 A列のラベルを数える', 'xPreviewLabels')
      .addSeparator()
      .addItem('② 質問リストを取り込む', 'xImportQuestionSheet')
      .addItem('② メインシートの回答を取り込む', 'xImportMainAnswers')
      .addItem('③ 文体を抽出する（完了まで数回押す）', 'xExtractStyle')
      .addItem('③ 構成の型を取り出す', 'xExtractPatterns')
      .addSeparator()
      .addItem('今週の傾向シートを作る（紫微斗数）', 'xSetupWeekPlan')
      .addItem('反応ログのシートを作る', 'xSetupReactionLog')
      .addItem('　 抽出をやり直す', 'xResetExtract')
      .addSeparator()
      .addItem('④ 今週の投稿案を作る', 'xGeneratePosts')
      .addSeparator()
      .addItem('質問に1つ答える（一次情報を足す）', 'xAskQuestion')
      .addSeparator()
      .addItem('使わなかった雛形を一覧にする', 'xListUnusedTemplates')
      .addToUi();
  } catch (e) {
    // バインドされていない環境では何もしない
  }
}
