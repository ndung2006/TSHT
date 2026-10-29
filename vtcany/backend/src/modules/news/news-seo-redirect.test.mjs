// Goi 1D — test hoi quy chuyen huong 301 slug cu (theo mau
// news-create-formatdata.test.mjs: khang dinh bang source, vi VM khong co
// Prisma client/DB that de chay service that).
// LUU Y: cac assertion ve server.mjs dung chuoi don (single-quote) va
// includes/indexOf, KHONG dung regex chua backtick, de tranh van de
// truyen ky tu backtick khi viet file test.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const schema = read('vtcany/backend/prisma/schema.prisma');
const service = read('vtcany/backend/src/modules/news/news.service.ts');
const controller = read('vtcany/backend/src/modules/news/news.controller.ts');
const migration = read('vtcany/backend/prisma/migrations/20261029210000_seo_slug_redirects/migration.sql');
const server = read('server.mjs');

test('schema: model NewsSlugRedirect + quan he nguoc, oldSlug unique, cascade', () => {
  assert.match(schema, /model NewsSlugRedirect \{/);
  assert.match(schema, /oldSlug\s+String\s+@unique/);
  assert.match(schema, /article\s+NewsArticle @relation\(fields: \[articleId\], references: \[id\], onDelete: Cascade\)/);
  assert.match(schema, /@@map\("news_slug_redirects"\)/);
  assert.match(schema, /slugRedirects NewsSlugRedirect\[\]/);
});

test('service patch(): ghi redirect khi doi slug cua bai tung xuat ban', () => {
  assert.match(service, /newsSlugRedirect\.upsert\(\{/);
  assert.match(service, /where: \{ oldSlug: row\.slug \}/);
  assert.match(service, /row\.status === 'published' \|\| row\.status === 'unpublished'/);
  assert.match(service, /data\.slug !== row\.slug/);
});

test('service resolveSlugRedirect: chi tra ve khi bai dang xuat ban', () => {
  assert.match(service, /async resolveSlugRedirect\(oldSlug: string\)/);
  assert.match(service, /findUnique\(\{ where: \{ oldSlug \} \}\)/);
  assert.match(service, /row\.status !== 'published' \|\| !row\.publishAt \|\| row\.publishAt > new Date\(\)/);
});

test('controller: route slug-redirects 2 doan (khong dung :slug)', () => {
  assert.match(controller, /@Get\('slug-redirects\/:slug'\)/);
  assert.match(controller, /resolveSlugRedirect\(slug\)/);
});

test('migration: tao bang + unique index + FK cascade, khong DATETIME', () => {
  assert.match(migration, /CREATE TABLE "news_slug_redirects"/);
  assert.match(migration, /CREATE UNIQUE INDEX "news_slug_redirects_old_slug_key"/);
  assert.match(migration, /ON DELETE CASCADE/);
  assert.match(migration, /TIMESTAMP\(3\)/);
  // Chi kiem tra phan DDL (bo dong comment --, vi comment co nhac tu
  // DATETIME nhu loi canh bao); DDL thuc te chi dung TIMESTAMP(3).
  const ddl = migration.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  assert.doesNotMatch(ddl, /DATETIME/);
});

test('server.mjs: /tin/ lay detail truoc, 404 moi tra redirect 301; co sitemap + robots', () => {
  const tin = server.slice(server.indexOf('Goi 1D: trang bai viet'));
  // Goi detail dang fetchVtcanyEpaperJson(`/news/${slug}`) va redirect dang
  // fetchVtcanyEpaperJson(`/news/slug-redirects/${slug}`); so sanh bang
  // chuoi con khong backtick (ky tu $ { } trong chuoi don la chu cai).
  assert.ok(tin.includes('/news/${slug}'));
  assert.ok(tin.includes('/news/slug-redirects/${slug}'));
  assert.ok(tin.indexOf('/news/${slug}') < tin.indexOf('/news/slug-redirects/${slug}'));
  assert.ok(tin.includes('send(res, 301'));
  assert.ok(tin.includes('/tin/${redir.data.slug}'));
  assert.ok(tin.includes('buildArticleMeta('));
  assert.match(server, /u\.pathname === "\/sitemap\.xml"/);
  assert.match(server, /u\.pathname === "\/robots\.txt"/);
  assert.match(server, /buildSitemapXml\(urls\)/);
  assert.match(server, /buildRobotsTxt\(origin\)/);
});

// Mo phong quyet dinh giai slug (giong luong server.mjs): slug song thang
// truoc redirect; redirect chi co hieu luc khi bai dang xuat ban.
function resolveSlug({ live, redirect, article }) {
  if (live) return { kind: 'live', slug: live };
  if (!redirect) return { kind: 'not-found' };
  if (!article || article.status !== 'published' || !article.publishAt || article.publishAt > new Date()) {
    return { kind: 'not-found' };
  }
  return { kind: 'redirect-301', slug: article.slug };
}

test('luong giai slug: song thang, go bai mat redirect, slug tai su dung khong bi chen', () => {
  assert.deepEqual(resolveSlug({ live: 'bai-moi', redirect: true, article: { status: 'published', publishAt: new Date('2026-01-01'), slug: 'bai-cu' } }), { kind: 'live', slug: 'bai-moi' });
  assert.deepEqual(resolveSlug({ live: null, redirect: true, article: { status: 'unpublished', publishAt: new Date('2026-01-01'), slug: 'bai-cu' } }), { kind: 'not-found' });
  assert.deepEqual(resolveSlug({ live: null, redirect: true, article: { status: 'published', publishAt: new Date('2099-01-01'), slug: 'bai-cu' } }), { kind: 'not-found' });
  assert.deepEqual(resolveSlug({ live: null, redirect: true, article: { status: 'published', publishAt: new Date('2026-01-01'), slug: 'bai-hien-tai' } }), { kind: 'redirect-301', slug: 'bai-hien-tai' });
  assert.deepEqual(resolveSlug({ live: null, redirect: false, article: null }), { kind: 'not-found' });
});
