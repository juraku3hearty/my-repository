# 最初の依頼文

素材のパスと出力先を実際のものに書き換えて、エージェント（Claude Code または Codex）へ渡してください。

```text
youtube-edit-communityを使って、YouTubeの横動画を編集してください。
SKILL.mdとreferences/workflow.mdを読み、最初にscripts/check_env.shを実行してください。

人物動画: /absolute/input/camera.mp4
画面収録: /absolute/input/screen.mov
別録り音声: /absolute/input/mic.m4a
主音声: 別録り音声
出力先: /absolute/output/preview

プランBで、まず主音声の60〜100秒を音付きの試作にしてください。
白い字幕、左上の見出し、右下の標準サイズの丸ワイプを使ってください。
細かい文字を読むところは丸ワイプを外してください。
素材は変更せず、同期・字幕・切り替えを検品してください。
実施していない確認は未実施と書いてください。
今回は試作までです。
```

本編へ進む場合:

```text
この試作のsettings.jsonを使って、全文を読んで本編を作ってください。
保持区間と字幕を見直し、10〜15分を目安にしてください。
試作とは別の出力フォルダへ保存してください。
```

次回の依頼:

```text
前回のsettings.jsonと新しい素材を渡します。
前回と同じ設定で、まず40秒の音付き試作を作ってください。
```
