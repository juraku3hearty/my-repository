#!/usr/bin/env node
/**
 * WordPress健康診断・棚卸しスクリプト
 * 既存サイトの中身を一覧化して docs/WP棚卸し_結果.md に書き出す。
 * (残す/消すの判断材料にする。削除はしない=読み取り専用)
 *
 * 必要な環境変数: WP_URL, WP_USER, WP_APP_PASS
 * 使い方: node scripts/wp_inventory.mjs
 */
import { writeFileSync } from 'node:fs';
import { env, wpFetch } from './wp_client.mjs';

async function api(path) {
  const res = await wpFetch(path);
  if (!res.ok) return { __error: `${res.status} ${(await res.text()).slice(0, 120)}` };
  return res.json();
}
async function all(path) {
  let page = 1, out = [];
  while (true) {
    const r = await api(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
    if (r.__error || !Array.isArray(r) || r.length === 0) break;
    out = out.concat(r);
    if (r.length < 100) break;
    page++;
  }
  return out;
}
const d = (s) => (s ? String(s).slice(0, 10) : '-');
const t = (o) => (o?.rendered ?? o ?? '').toString().replace(/<[^>]+>/g, '').slice(0, 60);

const root = await api('');
const posts = await all('/wp/v2/posts?status=publish,draft,private,pending');
const pages = await all('/wp/v2/pages?status=publish,draft,private');
const cats = await all('/wp/v2/categories');
const media = await all('/wp/v2/media');
const themes = await api('/wp/v2/themes');
const plugins = await api('/wp/v2/plugins');

let md = `# WordPress棚卸し結果(${new Date().toISOString().slice(0, 10)})\n\n`;
md += `- サイト名: ${root.name ?? '?'} / 説明: ${root.description ?? ''}\n`;
md += `- URL: ${root.url ?? env('WP_URL')}\n\n`;

md += `## テーマ\n`;
if (Array.isArray(themes)) {
  themes.forEach((th) => { md += `- ${th.stylesheet}${th.status === 'active' ? ' **(有効)**' : ''} v${th.version ?? '?'}\n`; });
} else md += `- 取得不可: ${themes.__error}\n`;

md += `\n## プラグイン\n`;
if (Array.isArray(plugins)) {
  plugins.forEach((p) => { md += `- ${p.name} v${p.version} — ${p.status === 'active' ? '**有効**' : '停止中'}\n`; });
} else md += `- 取得不可: ${plugins.__error}\n`;

md += `\n## 固定ページ(${pages.length}件)\n\n| タイトル | 状態 | 更新日 | URL | 残す/消す |\n|---|---|---|---|---|\n`;
pages.forEach((p) => { md += `| ${t(p.title) || '(無題)'} | ${p.status} | ${d(p.modified)} | ${p.link} | |\n`; });

md += `\n## 投稿(${posts.length}件)\n\n| タイトル | 状態 | 日付 | カテゴリID | 残す/消す |\n|---|---|---|---|---|\n`;
posts.forEach((p) => { md += `| ${t(p.title) || '(無題)'} | ${p.status} | ${d(p.date)} | ${(p.categories || []).join(',')} | |\n`; });

md += `\n## カテゴリ\n`;
cats.forEach((c) => { md += `- ${c.name}(slug: ${c.slug} / 記事${c.count}件)\n`; });

md += `\n## メディア: ${media.length}件\n`;

writeFileSync('docs/WP棚卸し_結果.md', md);
console.log(`✅ docs/WP棚卸し_結果.md に書き出しました(固定ページ${pages.length} / 投稿${posts.length} / カテゴリ${cats.length}件)`);
