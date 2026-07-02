/**
 * Drive書き込み用のユーザーOAuthリフレッシュトークンを取得する(初回のみ・2段階)。
 *
 * 手順1: 認可URLを表示
 *   node get-oauth-token.js url <CLIENT_ID> <CLIENT_SECRET>
 *   → 表示されたURLをブラウザで開き、Googleアカウントで許可する。
 *     「localhost に接続できません」のエラーページに飛ぶのが正常。
 *     そのページのアドレスバーのURL全体をコピーする。
 *
 * 手順2: リダイレクトURLからトークン取得
 *   node get-oauth-token.js token <CLIENT_ID> <CLIENT_SECRET> "<リダイレクトURL全体>"
 *   → 表示された3行を .env に追記する。
 */
import { argv, exit } from 'node:process';
import { google } from 'googleapis';

const [mode, clientId, clientSecret, redirectUrl] = argv.slice(2);
if (!mode || !clientId || !clientSecret) {
  console.error('使い方: node get-oauth-token.js url <ID> <SECRET> | token <ID> <SECRET> "<リダイレクトURL>"');
  exit(1);
}

const oauth = new google.auth.OAuth2(clientId, clientSecret, 'http://localhost');

if (mode === 'url') {
  const url = oauth.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/drive'],
  });
  console.log('\nこのURLをブラウザで開いて許可してください:\n\n' + url + '\n');
} else if (mode === 'token') {
  if (!redirectUrl) {
    console.error('リダイレクトURLを引数に渡してください(引用符で囲む)');
    exit(1);
  }
  const code = new URL(redirectUrl.trim()).searchParams.get('code');
  if (!code) {
    console.error('URLから認可コード(code=...)が見つかりませんでした');
    exit(1);
  }
  const { tokens } = await oauth.getToken(code);
  if (!tokens.refresh_token) {
    console.error('refresh_tokenが返りませんでした。手順1からやり直してください(prompt=consentで再同意)');
    exit(1);
  }
  console.log('\n✅ 取得成功。以下の3行を .env に追記:\n');
  console.log(`GOOGLE_OAUTH_CLIENT_ID=${clientId}`);
  console.log(`GOOGLE_OAUTH_CLIENT_SECRET=${clientSecret}`);
  console.log(`GOOGLE_OAUTH_REFRESH_TOKEN=${tokens.refresh_token}`);
} else {
  console.error('modeは url か token を指定してください');
  exit(1);
}
