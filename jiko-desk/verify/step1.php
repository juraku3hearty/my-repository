<?php
// ── 検証1：サーバーの設定を見るだけ。何も書き換えません ──
// 終わったらこのフォルダごと削除してください。
header('Content-Type: text/plain; charset=UTF-8');

echo "=== PHPとサーバーの設定 ===\n";
echo "PHPバージョン     : " . PHP_VERSION . "\n";
echo "SAPI              : " . PHP_SAPI . "\n";
echo "   → cgi-fcgi なら .user.ini が使えます（門番PHPを置ける）\n\n";

echo "user_ini.filename : " . (ini_get('user_ini.filename') ?: '(なし)') . "\n";
echo "auto_prepend_file : " . (ini_get('auto_prepend_file') ?: '(未設定)') . "\n";
echo "allow_url_fopen   : " . (ini_get('allow_url_fopen') ? 'on' : 'off') . "\n";
echo "curl              : " . (function_exists('curl_init') ? 'あり' : 'なし') . "\n";
echo "   → curl か allow_url_fopen のどちらかがあればVPSに問い合わせできます\n\n";

echo "=== セッションの設定 ===\n";
echo "session_name      : " . session_name() . "\n";
echo "save_path         : " . (ini_get('session.save_path') ?: '(既定)') . "\n";
echo "cookie_path       : " . (ini_get('session.cookie_path') ?: '/') . "\n";
echo "\n=== 置き場所 ===\n";
echo "このファイル      : " . __FILE__ . "\n";
echo "ドキュメントルート: " . ($_SERVER['DOCUMENT_ROOT'] ?? '(不明)') . "\n";
