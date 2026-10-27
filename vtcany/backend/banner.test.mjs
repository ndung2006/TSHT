// Test GET /banners (banner CMS cho FE hero) + seed banner mau.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PublicCatalogController } from './dist/modules/catalog/public-catalog.controller.js';
import { BANNER_SEEDS } from './dist/modules/layout/seed-data.js';

const PID = 'a'.repeat(24);
const BANNERS = [
  { id: 'bn-1', title: 'A', section: 'home', platforms: ['web'], sortOrder: 2, isVisible: true,
    imageWeb: 'https://x/a-web.jpg', imageMobile: 'https://x/a-mob.jpg', linkType: 'external', linkTarget: 'https://ngoai.vn/x' },
  { id: 'bn-2', title: 'B', section: 'home', platforms: ['web', 'mobile'], sortOrder: 1, isVisible: true,
    imageWeb: 'https://x/b-web.jpg', linkType: 'movie', linkTarget: `tham-tinh-${PID}` },
  { id: 'bn-3', title: 'An', section: 'home', platforms: ['web'], sortOrder: 3, isVisible: false,
    imageWeb: 'https://x/c.jpg' },
  { id: 'bn-4', title: 'Het han', section: 'home', platforms: ['web'], sortOrder: 4, isVisible: true,
    imageWeb: 'https://x/d.jpg', visibleTo: new Date(Date.now() - 1000).toISOString() },
  { id: 'bn-5', title: 'Chua toi', section: 'home', platforms: ['web'], sortOrder: 5, isVisible: true,
    imageWeb: 'https://x/e.jpg', visibleFrom: new Date(Date.now() + 3600_000).toISOString() },
  { id: 'bn-6', title: 'Mobile', section: 'home', platforms: ['mobile'], sortOrder: 6, isVisible: true,
    imageWeb: 'https://x/f-web.jpg', imageMobile: 'https://x/f-mob.jpg' },
  { id: 'bn-7', title: 'Cu (platform string)', section: 'home', platform: 'web', sortOrder: 7, isVisible: true,
    imageWeb: 'https://x/g.jpg', linkType: 'category', linkTarget: PID },
  { id: 'bn-8', title: 'Phim page', section: 'movies', platforms: ['web'], sortOrder: 1, isVisible: true,
    imageWeb: 'https://x/h.jpg', linkType: 'video', linkTarget: '/video/san-co' },
];

function fakeCatalog() {
  return {
    list: async (name) => (name === 'banners' ? { data: BANNERS } : { data: [] }),
    getPublic: async (entity, publicId) => {
      if (publicId === PID) return { slug: entity === 'movies' ? 'tham-tinh' : 'muc-a' };
      throw new Error('not found');
    },
  };
}
function fakeCategories() {
  return {
    getByPublicId: async (publicId) => {
      if (publicId === PID) return { slug: 'phim-bo' };
      throw new Error('not found');
    },
  };
}

test('GET /banners: loc page/platform/hien thi/khung gio, sap xep, map hero', async () => {
  const ctl = new PublicCatalogController(fakeCatalog(), fakeCategories());
  const res = await ctl.listBanners('home', 'web');
  // bn-3 (an), bn-4 (het han), bn-5 (chua toi), bn-6 (mobile) bi loai
  assert.deepEqual(res.data.map((b) => b.title), ['B', 'A', 'Cu (platform string)']);
  const [b, a, g] = res.data;
  assert.equal(b.image_url, 'https://x/b-web.jpg');
  assert.equal(b.target_url, `/phim/tham-tinh-${PID}`); // movie + slug-id -> resolve slug
  assert.equal(a.target_url, 'https://ngoai.vn/x'); // external giu nguyen
  assert.equal(g.target_url, `/danh-muc/phim-bo-${PID}`); // category + public_id
  assert.equal(a.action, 'OPEN_URL');
});

test('GET /banners: platform mobile uu tien anh mobile', async () => {
  const ctl = new PublicCatalogController(fakeCatalog(), fakeCategories());
  const res = await ctl.listBanners('home', 'mobile');
  const titles = res.data.map((b) => b.title);
  assert.ok(titles.includes('B') && titles.includes('Mobile'));
  const mob = res.data.find((b) => b.title === 'Mobile');
  assert.equal(mob.image_url, 'https://x/f-mob.jpg');
  const bb = res.data.find((b) => b.title === 'B');
  assert.equal(bb.image_url, 'https://x/b-web.jpg'); // fallback anh web
});

test('GET /banners: linkTarget duong dan /... giu nguyen; noi dung xoa -> rong', async () => {
  const ctl = new PublicCatalogController(fakeCatalog(), fakeCategories());
  const res = await ctl.listBanners('movies', 'web');
  assert.equal(res.data.length, 1);
  assert.equal(res.data[0].target_url, '/video/san-co');
  // public_id khong ton tai -> target_url rong (khong vo)
  const ctl2 = new PublicCatalogController({
    list: async () => ({ data: [{ id: 'x', title: 'X', section: 'home', isVisible: true, imageWeb: 'u', linkType: 'movie', linkTarget: 'b'.repeat(24) }] }),
    getPublic: async () => { throw new Error('not found'); },
  }, fakeCategories());
  const r2 = await ctl2.listBanners('home', 'web');
  assert.equal(r2.data[0].target_url, '');
});

test('BANNER_SEEDS: 11 banner mau, du 5 section, co link hop le', () => {
  assert.equal(BANNER_SEEDS.length, 11);
  const bySection = {};
  for (const b of BANNER_SEEDS) {
    (bySection[b.section] = bySection[b.section] || []).push(b);
    assert.ok(b.title && b.imageWeb.startsWith('https://'));
    assert.ok(['movie', 'video', 'short'].includes(b.linkType));
    assert.ok(b.linkTarget.startsWith('/'));
  }
  assert.deepEqual(Object.keys(bySection).sort(), ['entertainment', 'home', 'movies', 'short', 'video']);
  assert.equal(bySection.home.length, 3);
});
