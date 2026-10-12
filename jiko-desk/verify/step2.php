<?php
// ── 検証2：サイフォンズのログイン状態を読めるか。読むだけです ──
//
//  ※ 必ず「サイフォンズに検証用アカウントでログインしたのと同じブラウザ」で開いてください。
//  ※ 会員情報が画面に出ます。終わったらこのフォルダごと必ず削除してください。
//
//  step1.php の session_name が PHPSESSID 以外だった場合は、
//  次の行の // を外して、その名前を入れてください。
//  session_name('ここに入れる');

session_start();
header('Content-Type: text/plain; charset=UTF-8');

echo "=== セッション ===\n";
echo "session_id : " . (session_id() ?: '(取得できず)') . "\n\n";

echo "=== \$_SESSION に入っているもの（キーと型だけ。値は出しません）===\n";
if (empty($_SESSION)) {
    echo "(空です → 検証4 へ進んでください)\n";
} else {
    foreach ($_SESSION as $k => $v) {
        printf("  %-28s : %s\n", $k,
            is_scalar($v) ? gettype($v) . '(' . mb_strlen((string)$v) . '文字)'
                          : gettype($v) . '(' . count((array)$v) . '件)');
    }
}

echo "\n=== Cookie の名前（値は出しません）===\n";
foreach (array_keys($_COOKIE) as $name) { echo "  " . $name . "\n"; }

echo "\n----------------------------------------\n";
echo "判定：\n";
echo "  会員ID・メールアドレスらしいキーがある → 成功。署名付きリンクと門番PHPが使えます\n";
echo "  \$_SESSION が空                        → 検証4（DBのセッションテーブル確認）へ\n";
echo "  Cookie も見えない                      → 検証4 へ\n";
