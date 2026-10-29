// Goi 1D — test ham thuan lib/seo.mjs (meta, sitemap, robots, cay chuyen muc).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  escapeXml, truncateDescription, publicOrigin, buildArticleMeta,
  buildSitemapXml, buildRobotsTxt, flattenCategorySlugs,
} from './seo.mjs';

test('escapeXml thoat & < > " va dau nhay don', () => {
  assert.equal(escapeXml('<a href="x">&\'y\'</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;y&#39;&lt;/a&gt;');
  assert.equal(escapeXml(null), '');
});

test('truncateDescription: duoi 160 giu nguyen, tren 160 cat o khoang trang', () => {
  const short = '  Tin   ngan  ';
  assert.equal(truncateDescription(short), 'Tin ngan');
  const long = 'a '.repeat(100).trim(); // 199 ky tu
  const out = truncateDescription(long);
  assert.ok(out.length <= 160);
  assert.ok(!out.endsWith(' '));
  assert.ok(out.length > 150);
  const oneWord = 'x'.repeat(200);
  assert.equal(truncateDescription(oneWord).length, 160);
});

test('publicOrigin: env thang, roi Host header, roi mac dinh', () => {
  assert.equal(publicOrigin({ host: 'example.com' }, 'https://cdn.example.com/'), 'https://cdn.example.com');
  assert.equal(publicOrigin({ host: 'tsht.vtctech.xyz' }, ''), 'https://tsht.vtctech.xyz');
  assert.equal(publicOrigin({}, ''), 'https://tsht.vtctech.xyz');
});

test('buildArticleMeta: du the, thoat ky tu, bo og:image khi khong co bia', () => {
  const meta = buildArticleMeta({
    title: 'Bai "test" <&>',
    sapo: 'Sapo co <tag> & ky tu dac biet.',
    coverUrl: '',
    categoryName: 'Chinh tri',
    publishAt: '2026-10-29T10:00:00.000Z',
    canonicalUrl: 'https://tsht.vtctech.xyz/tin/bai-test',
  });
  assert.match(meta, /<meta name="description" content="Sapo co &lt;tag&gt; &amp; ky tu dac biet\.">/);
  assert.match(meta, /<link rel="canonical" href="https:\/\/tsht\.vtctech\.xyz\/tin\/bai-test">/);
  assert.match(meta, /<meta property="og:type" content="article">/);
  assert.match(meta, /<meta property="og:title" content="Bai &quot;test&quot; &lt;&amp;&gt;">/);
  assert.match(meta, /<meta property="article:section" content="Chinh tri">/);
  assert.match(meta, /<meta property="article:published_time" content="2026-10-29T10:00:00\.000Z">/);
  assert.doesNotMatch(meta, /og:image/);
  const withCover = buildArticleMeta({
    title: 'T', sapo: 'S', coverUrl: 'https://api.example.com/images/a.jpg',
    categoryName: '', publishAt: '', canonicalUrl: 'https://tsht.vtctech.xyz/tin/t',
  });
  assert.match(withCover, /<meta property="og:image" content="https:\/\/api\.example\.com\/images\/a\.jpg">/);
});

test('buildSitemapXml: lastmod cat ngay, bo URL rac, khu trung', () => {
  const xml = buildSitemapXml([
    { loc: 'https://tsht.vtctech.xyz/' },
    { loc: 'https://tsht.vtctech.xyz/tin/a&b', lastmod: '2026-10-29T10:00:00.000Z' },
    { loc: 'https://tsht.vtctech.xyz/tin/a&b', lastmod: '2026-10-29T10:00:00.000Z' },
    { loc: '/tin/relative-khong-hop-le' },
    { loc: '' },
    { loc: 'https://tsht.vtctech.xyz/chuyen-muc/x' },
  ]);
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(xml, /<loc>https:\/\/tsht\.vtctech\.xyz\/<\/loc>/);
  assert.match(xml, /<loc>https:\/\/tsht\.vtctech\.xyz\/tin\/a&amp;b<\/loc>\n    <lastmod>2026-10-29<\/lastmod>/);
  assert.doesNotMatch(xml, /relative-khong-hop-le/);
  assert.equal((xml.match(/a&amp;b/g) || []).length, 1);
});

test('buildRobotsTxt: cho phep tat ca va chi ve sitemap', () => {
  assert.equal(
    buildRobotsTxt('https://tsht.vtctech.xyz'),
    'User-agent: *\nAllow: /\nSitemap: https://tsht.vtctech.xyz/sitemap.xml\n',
  );
});

test('flattenCategorySlugs: cha truoc con sau, giu thu tu', () => {
  const tree = [
    { slug: 'chinh-tri', children: [{ slug: 'doi-ngoai', children: [] }, { slug: 'xay-dung-dang', children: [{ slug: 'dai-hoi', children: [] }] }] },
    { slug: 'kinh-te', children: [] },
  ];
  assert.deepEqual(flattenCategorySlugs(tree), ['chinh-tri', 'doi-ngoai', 'xay-dung-dang', 'dai-hoi', 'kinh-te']);
  assert.deepEqual(flattenCategorySlugs(null), []);
});
