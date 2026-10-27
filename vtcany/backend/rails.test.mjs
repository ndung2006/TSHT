// Test khoi giao dien (rails) — seed mac dinh + public API /catalog/rails + /catalog/categories/:id.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CatalogService } from './dist/modules/catalog/catalog.service.js';
import { PublicCatalogController } from './dist/modules/catalog/public-catalog.controller.js';

const CATS = [
  { id: 'cat-1', publicId: 'a'.repeat(24), name: 'Phim Bộ', slug: 'phim-bo', isVisible: true, appliesTo: ['phim'] },
  { id: 'cat-2', publicId: 'b'.repeat(24), name: 'KICK - OFF Thể thao', slug: 'kick-off-the-thao', isVisible: true, appliesTo: ['video'] },
  { id: 'cat-3', publicId: 'c'.repeat(24), name: 'Ẩn', slug: 'an-cat', isVisible: false, appliesTo: ['phim'] },
];

function fakePrismaForSeed() {
  const items = [];
  const prisma = {
    catalogItem: {
      count: async ({ where } = {}) => items.filter((i) => !where?.entity || i.entity === where.entity).length,
      findMany: async ({ where } = {}) => items.filter((i) => !where?.entity || i.entity === where.entity),
      create: async ({ data }) => { items.push(data); return data; },
    },
    category: {
      findUnique: async ({ where }) => CATS.find((c) => c.slug === where.slug) || null,
    },
    _items: items,
  };
  return prisma;
}

test('CatalogService seed 26 khoi giao dien mac dinh theo tung muc', async () => {
  const prisma = fakePrismaForSeed();
  const svc = new CatalogService(prisma);
  await svc.onModuleInit();
  const rails = prisma._items.filter((i) => i.entity === 'rails').map((i) => i.data);
  assert.equal(rails.length, 26);
  const bySection = (s) => rails.filter((r) => r.section === s).map((r) => r.title);
  assert.deepEqual(bySection('home'), [
    'Kênh truyền hình', 'KICK-OFF THỂ THAO', 'World Cup 2026 - Chào buổi sáng', 'Check in Việt Nam',
    'Phim bộ', 'Short videos', 'Phim chiếu rạp', 'Ca nhạc',
  ]);
  assert.deepEqual(bySection('movies'), ['Phim Bộ', 'Phim hoạt hình', 'Phim SCTV9', 'Gameshow', 'Phim lẻ']);
  assert.deepEqual(bySection('video'), ['KICK - OFF Thể thao', 'Check in Việt Nam', 'Tin thể thao trong nước', 'Ca nhạc', 'Tin thể thao Quốc tế']);
  assert.deepEqual(bySection('short'), ['Check in Việt Nam', 'Phim ngắn', 'Ẩm thực', 'Kỹ năng số', 'Động vật']);
  assert.deepEqual(bySection('entertainment'), ['KICK - OFF Thể thao', 'Ca nhạc', 'Gameshow']);
  // categoryId duoc resolve tu slug khi danh muc ton tai
  const pb = rails.find((r) => r.section === 'movies' && r.title === 'Phim Bộ');
  assert.equal(pb.categoryId, 'cat-1');
  assert.equal(pb.categorySlug, 'phim-bo');
  // rail tro den slug khong ton tai -> khong co categoryId nhung giu categorySlug
  const unknown = rails.find((r) => r.title === 'Phim hoạt hình');
  assert.equal(unknown.categoryId, undefined);
  assert.equal(unknown.categorySlug, 'phim-hoat-hinh');
  // seed lan 2 khong tao trung
  await svc.onModuleInit();
  assert.equal(prisma._items.filter((i) => i.entity === 'rails').length, 26);
});

test('CatalogService backfill: section da co rail thi khong seed them', async () => {
  const prisma = fakePrismaForSeed();
  // Gia lap: da co 1 rail o section home (nhu du lieu test tren production)
  prisma._items.push({
    id: 'rl-old', entity: 'rails',
    data: { id: 'rl-old', title: 'Test cu', section: 'home', contentType: 'tv', sortOrder: 1, isVisible: true, createdAt: new Date().toISOString() },
  });
  const svc = new CatalogService(prisma);
  await svc.onModuleInit();
  const rails = prisma._items.filter((i) => i.entity === 'rails').map((i) => i.data);
  // Idempotent theo tung (section, title): home giu 1 rail cu + seed bu 8 rail
  // con thieu; 4 section con lai duoc seed (5+5+5+3=18) -> tong 27.
  assert.equal(rails.length, 27);
  assert.equal(rails.filter((r) => r.section === 'home').length, 9);
  assert.equal(rails.filter((r) => r.section === 'movies').length, 5);
  assert.equal(rails.filter((r) => r.section === 'video').length, 5);
  assert.equal(rails.filter((r) => r.section === 'short').length, 5);
  assert.equal(rails.filter((r) => r.section === 'entertainment').length, 3);
});

function fakeCatalog(rails, itemsByCat) {
  return {
    list: async (name) => (name === 'rails' ? { data: rails } : { data: [] }),
    listPublic: async (entity, opts = {}) => ({
      data: (itemsByCat[opts.categoryId] || []).filter(() => entity !== 'events'),
      meta: {},
    }),
  };
}
function fakeCategories() {
  return {
    list: async () => CATS,
    get: async (id) => { const c = CATS.find((x) => x.id === id); if (!c) throw new Error('not found'); return c; },
    getByPublicId: async (pid) => { const c = CATS.find((x) => x.publicId === pid); if (!c) throw new Error('not found'); return c; },
  };
}
const RAILS = [
  { id: 'rl-1', title: 'Phim Bộ', section: 'movies', platform: 'web', contentType: 'movie', categoryId: 'cat-1', sortOrder: 2, isVisible: true },
  { id: 'rl-2', title: 'Kênh truyền hình', section: 'home', platform: 'web', contentType: 'tv', sortOrder: 1, isVisible: true },
  { id: 'rl-3', title: 'Ẩn', section: 'movies', platform: 'web', contentType: 'movie', categoryId: 'cat-1', sortOrder: 1, isVisible: false },
  { id: 'rl-4', title: 'Het han', section: 'movies', platform: 'web', contentType: 'movie', categoryId: 'cat-1', sortOrder: 3, isVisible: true, visibleTo: new Date(Date.now() - 1000).toISOString() },
  { id: 'rl-5', title: 'Mobile only', section: 'movies', platform: 'mobile', contentType: 'movie', categoryId: 'cat-1', sortOrder: 4, isVisible: true },
  { id: 'rl-6', title: 'Danh muc an', section: 'movies', platform: 'web', contentType: 'movie', categoryId: 'cat-3', sortOrder: 5, isVisible: true },
];
const ITEMS = { 'cat-1': [{ public_id: 'd'.repeat(24), slug: 'phim-a', title: 'Phim A' }] };

test('GET /catalog/rails: loc section/platform/hien thi/khung gio, sap xep, resolve items', async () => {
  const ctl = new PublicCatalogController(fakeCatalog(RAILS, ITEMS), fakeCategories());
  const res = await ctl.listRails('movies', 'web');
  const titles = res.data.map((r) => r.title);
  // rl-3 (an), rl-4 (het han), rl-5 (mobile) bi loai; rl-6 con nhung danh muc an -> khong items
  assert.deepEqual(titles, ['Phim Bộ', 'Danh muc an']);
  const pb = res.data[0];
  assert.equal(pb.category.public_id, 'a'.repeat(24));
  assert.equal(pb.items.length, 1);
  assert.equal(pb.items[0].title, 'Phim A');
  const hiddenCat = res.data[1];
  assert.equal(hiddenCat.category, null);
  assert.deepEqual(hiddenCat.items, []);
});

test('GET /catalog/rails: rail tv khong co items (FE tu lay /channels)', async () => {
  const ctl = new PublicCatalogController(fakeCatalog(RAILS, ITEMS), fakeCategories());
  const res = await ctl.listRails('home', 'web');
  assert.equal(res.data.length, 1);
  assert.equal(res.data[0].contentType, 'tv');
  assert.deepEqual(res.data[0].items, []);
});

test('GET /catalog/categories/:id: theo id va publicId; 404 khi an/khong ton tai', async () => {
  const ctl = new PublicCatalogController(fakeCatalog(RAILS, ITEMS), fakeCategories());
  const byId = await ctl.getCategory('cat-1', '1', '24');
  assert.equal(byId.data.name, 'Phim Bộ');
  assert.equal(byId.data.type, 'phim');
  assert.equal(byId.data.items.length, 1);
  const byPub = await ctl.getCategory('a'.repeat(24), '1', '24');
  assert.equal(byPub.data.id, 'cat-1');
  for (const bad of ['cat-3', 'nope']) {
    try {
      await ctl.getCategory(bad, '1', '24');
      assert.fail(`expected 404 for ${bad}`);
    } catch (e) {
      assert.equal(e.getResponse().error.code, 'not_found');
      assert.equal(e.getStatus(), 404);
    }
  }
});

test('seedSampleContent: 3 danh muc + 9 item mau + gan rail (idempotent)', async () => {
  const cats = [];
  const items = [];
  const prisma = {
    catalogItem: {
      count: async () => 1, // bo qua seed plans
      findMany: async ({ where } = {}) => items.filter((i) => !where?.entity || i.entity === where.entity),
      create: async ({ data }) => { items.push(data); return data; },
      findFirst: async ({ where }) => items.find((i) => i.id === where.id && i.entity === where.entity) || null,
      update: async ({ where, data }) => {
        const it = items.find((i) => i.id === where.id);
        it.data = data.data;
        return it;
      },
    },
    category: {
      findUnique: async ({ where }) => cats.find((c) => c.slug === where.slug) || null,
      create: async ({ data }) => { cats.push(data); return data; },
    },
  };
  // Gia lap rails da seed san (can gan categoryId)
  const railSeeds = [
    ['home', 'KICK-OFF THỂ THAO', 'video'], ['movies', 'Phim Bộ', 'movie'],
    ['video', 'KICK - OFF Thể thao', 'video'], ['short', 'Check in Việt Nam', 'short'],
    ['entertainment', 'KICK - OFF Thể thao', 'video'],
  ];
  for (const [section, title, contentType] of railSeeds) {
    items.push({ id: `rl-${section}`, entity: 'rails',
      data: { id: `rl-${section}`, title, section, contentType, sortOrder: 1, isVisible: true } });
  }
  const { CatalogService: CS } = await import('./dist/modules/catalog/catalog.service.js');
  const svc = new CS(prisma);
  await svc.onModuleInit();
  assert.equal(cats.length, 3);
  assert.deepEqual(cats.map((c) => c.slug).sort(),
    ['mau-kickoff-the-thao', 'mau-phim-bo', 'mau-short']);
  assert.ok(cats.every((c) => c.isVisible === true));
  const sampleItems = items.filter((i) => ['videos', 'movies', 'shorts'].includes(i.entity));
  assert.equal(sampleItems.length, 9);
  assert.ok(sampleItems.every((i) => i.data.isVisible !== false && (i.data.categoryIds || []).length === 1));
  // public_id on dinh theo id co dinh
  const { samplePublicId } = await import('./dist/modules/layout/seed-data.js');
  const v1 = sampleItems.find((i) => i.id === 'vi-mau-kickoff-1');
  assert.match(samplePublicId('vi-mau-kickoff-1'), /^[0-9a-f]{24}$/);
  assert.ok(v1.data.thumbnail.startsWith('https://any.vtcrd.top/samples/'));
  // rail da duoc gan categoryId
  for (const [section] of railSeeds) {
    const r = items.find((i) => i.id === `rl-${section}`).data;
    assert.ok(r.categoryId, `rail ${section} co categoryId`);
  }
  // idempotent: chay lai khong tao trung
  const nItems = items.length, nCats = cats.length;
  await svc.onModuleInit();
  assert.equal(items.length, nItems);
  assert.equal(cats.length, nCats);
});

test('listPublic: moi nhat len dau theo publishedAt, khong theo thu tu tao ban ghi (batch import)', async () => {
  // Mo phong batch import KICK-OFF: ban ghi tao theo thu tu nguoc ngay phat —
  // tap cu nhat (06/10) co createdAt MOI nhat. Truoc day list() chi theo
  // createdAt nen tap cu dung dau ca CMS lan FE.
  const rows = [
    { id: 'vi-old', entity: 'videos', createdAt: new Date('2026-10-21T08:01:00Z'), data: { id: 'vi-old', title: 'Tap 06/10', isVisible: true, createdAt: '2026-10-21T08:01:00.000Z', publishedAt: '2026-10-05T17:00:00.000Z', categoryIds: ['cat-2'] } },
    { id: 'vi-new', entity: 'videos', createdAt: new Date('2026-10-21T07:59:00Z'), data: { id: 'vi-new', title: 'Tap 21/10', isVisible: true, createdAt: '2026-10-21T07:59:00.000Z', publishedAt: '2026-10-20T17:00:00.000Z', categoryIds: ['cat-2'] } },
    { id: 'vi-nopub', entity: 'videos', createdAt: new Date('2026-10-21T09:00:00Z'), data: { id: 'vi-nopub', title: 'Vua tai len', isVisible: true, createdAt: '2026-10-21T09:00:00.000Z', categoryIds: ['cat-2'] } },
  ];
  const prisma = {
    catalogItem: {
      // Prisma that: orderBy createdAt desc.
      findMany: async () => [...rows].sort((a, b) => b.createdAt - a.createdAt),
    },
  };
  const svc = new CatalogService(prisma);
  const res = await svc.listPublic('videos', { page: 1, limit: 24, categoryId: 'cat-2' });
  assert.deepEqual(res.data.map((v) => v.title), ['Vua tai len', 'Tap 21/10', 'Tap 06/10']);
});
