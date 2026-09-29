# youtube-edit-community（スキル自動認識を使わない入口）

このファイルは、Agent Skills として読み込まれなかったときの入口。中身の指示は `SKILL.md` と同じものを指す。スキルとして認識されている場合はこのファイルを使わない。

1. `SKILL.md` を読む。制作手順・3プラン・画像Bロールの判断はすべてそこにある。
2. `references/workflow.md` を読む。コマンド・設定項目・検品基準はそこにある。
3. `scripts/check_env.sh` を実行し、表示された不足分だけ導入して READY を確認する。
4. 以降は `SKILL.md` の実行順に固定する。

```
check_env.sh → probe → transcribe → sync → keep_segments.json → cut
→ captions（初稿）→ caption-rules.md に従って全文を書き直す → --captions で渡す
→ scenes.json → render → finalize → qc
```

編集の実行は同梱の `scripts/ytedit.py` だけを使う。個人のフォントや別スキルのスクリプトを参照しない。元素材を変更せず、出力先を分ける。字幕は初稿のまま書き出さない。外部への投稿・送信を自動実行しない。実施していない検査は未実施と記す。

macOS Apple Silicon 専用。環境が揃わない場合、完成MP4を作れると約束せず、不足する機能を具体的に示す。
