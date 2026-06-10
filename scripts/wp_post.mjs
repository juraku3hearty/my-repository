#!/usr/bin/env node
/**
 * WordPress直接投稿スクリプト(Claude Code環境などから実行)
 *
 * 必要な環境変数:
 *   WP_URL      例: https://example.com (末尾スラッシュなし)
 *   WP_USER     WordPressユーザー名
 *   WP_APP_PASS アプリケーションパスワード
 *
 * 使い方:
 *   node scripts/wp_post.mjs --title "記事タイトル" --file article.html [options]
 *
 * オプション:
 *   --title    記事タイトル(必須)
 *   --file     本文HTMLファイル(または --content "本文")
 *   --status   publish | draft (省略時 draft)
 *   --category カテゴリ名(無ければ自動作成)
 *   --tags     タグ(カンマ区切り)
 *   --type     post | page (省略時 post)
 *   --slug     スラッグ(pageのURL指定などに)
 *   --parent   親ページのID(pageを /chitose/ 配下に置く場合など)
 *   --id       既存投稿/ページのID(指定すると新規作成でなく更新)
 *   --password ページの閲覧パスワード(WP標準の保護ページ機能。デモ用)
 *   --html-block 本文を <!-- wp:html --> で包む。生HTML(LP等)はこれを付けないと
 *               wpautopが<p>/<br>を挿入してCSSとレイアウトが壊れる
 */
import { readFileSync } from 'node:fs';
import { env, wpFetch } from './wp_client.mjs';
const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const key = process.argv[i].replace(/^--/, '');
  if (key === 'html-block') { args.htmlBlock = true; continue; }
  args[key] = process.argv[++i];
}
if (!args.title || (!args.file && !args.content)) {
  console.error('使い方: node scripts/wp_post.mjs --title "タイトル" --file 本文.html [--status draft|publish]');
  process.exit(1);
}

async function api(path, method = 'GET', body) {
  const res = await wpFetch('/wp/v2' + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`WP API ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

async function resolveTerm(type, name) {
  const found = await api(`/${type}?search=${encodeURIComponent(name)}&per_page=20`);
  const hit = found.find((t) => t.name === name);
  if (hit) return hit.id;
  return (await api(`/${type}`, 'POST', { name })).id;
}

let content = args.content ?? readFileSync(args.file, 'utf8');
if (args.htmlBlock) content = `<!-- wp:html -->\n${content}\n<!-- /wp:html -->`;

const payload = {
  title: args.title,
  content,
  status: args.status === 'publish' ? 'publish' : 'draft',
};
if (args.slug) payload.slug = args.slug;
if (args.parent) payload.parent = Number(args.parent);
if (args.password) payload.password = args.password;

const endpoint = args.type === 'page' ? '/pages' : '/posts';
if (args.type !== 'page') {
  if (args.category) payload.categories = [await resolveTerm('categories', args.category)];
  if (args.tags) payload.tags = await Promise.all(
    args.tags.split(/[,、]/).map((t) => t.trim()).filter(Boolean).map((t) => resolveTerm('tags', t))
  );
}

const res = await api(args.id ? `${endpoint}/${args.id}` : endpoint, 'POST', payload);
console.log(`✅ ${args.id ? '更新' : payload.status === 'draft' ? '下書き投稿' : '公開投稿'}しました: ${res.link}`);
console.log(`   ID: ${res.id} / 編集: ${env('WP_URL')}/wp-admin/post.php?post=${res.id}&action=edit`);
