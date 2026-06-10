/**
 * WordPress REST API 共通クライアント
 * XSERVERの「REST APIアクセス制限」で /wp-json が403になる環境向けに、
 * WordPress標準の ?rest_route= 形式へ自動フォールバックする。
 *
 * 必要な環境変数: WP_URL, WP_USER, WP_APP_PASS
 */

export const env = (k) => {
  const v = process.env[k];
  if (!v) { console.error(`環境変数 ${k} が未設定です`); process.exit(1); }
  return v;
};

const SITE = env('WP_URL').replace(/\/+$/, '');
export const AUTH = 'Basic ' + Buffer.from(`${env('WP_USER')}:${env('WP_APP_PASS')}`).toString('base64');

let useRestRoute = null; // null=未判定 / true=?rest_route= / false=/wp-json

// path 例: '/wp/v2/posts?status=publish'(REST ルートからの相対パス。ルートは '/')
const buildUrl = (path) => {
  const p = path === '' ? '/' : path;
  if (useRestRoute) {
    const [route, query] = p.split('?');
    return `${SITE}/?rest_route=${route}${query ? '&' + query : ''}`;
  }
  return `${SITE}/wp-json${p === '/' ? '' : p}`;
};

async function detect() {
  if (useRestRoute !== null) return;
  const res = await fetch(`${SITE}/wp-json/`, { headers: { Authorization: AUTH } });
  useRestRoute = !res.ok;
  if (useRestRoute) console.error('ℹ️ /wp-json が拒否されたため ?rest_route= 形式で接続します');
}

export async function wpFetch(path, init = {}) {
  await detect();
  return fetch(buildUrl(path), {
    ...init,
    headers: { Authorization: AUTH, ...(init.headers ?? {}) },
  });
}
