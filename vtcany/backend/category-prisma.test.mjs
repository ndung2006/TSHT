import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CategoryService } from './dist/modules/admin/category.service.js';

// Fake Prisma cho model Category.
function fakePrisma() {
  const rows = new Map();
  return {
    category: {
      count: async ({ where } = {}) =>
        [...rows.values()].filter((r) => !where || Object.entries(where).every(([k, v]) => r[k] === v)).length,
      findMany: async ({ where, orderBy } = {}) => {
        let all = [...rows.values()];
        if (where) all = all.filter((r) => Object.entries(where).every(([k, v]) => r[k] === v));
        return all;
      },
      findUnique: async ({ where }) =>
        [...rows.values()].find((r) => Object.entries(where).every(([k, v]) => r[k] === v)) || null,
      create: async ({ data }) => { rows.set(data.id, { ...data }); return rows.get(data.id); },
      update: async ({ where, data }) => { const r = rows.get(where.id); Object.assign(r, data); return r; },
      delete: async ({ where }) => { rows.delete(where.id); },
    },
  };
}

test('CategoryService seed du 37 danh muc VTCPlay khi bang trong', async () => {
  const svc = new CategoryService(fakePrisma());
  await svc.onModuleInit();
  const all = await svc.list();
  assert.equal(all.length, 37);
  const byType = (t) => all.filter((c) => c.appliesTo.includes(t)).map((c) => c.name);
  assert.deepEqual(byType('phim'), ['Phim THVL', 'Phim chiếu rạp', 'Phim mới', 'Gameshow', 'Phim hoạt hình', 'Phim SCTV', 'Phim lẻ', 'Phim Bộ']);
  assert.deepEqual(byType('video'), [
    'World Cup 2026 - Chào buổi sáng', 'KICK - OFF Thể thao', 'Tin thể thao trong nước', 'Check in Việt Nam',
    'Thuốc Nam cho người Việt', 'Bản tin dự báo thời tiết', 'Tin tức ANTV', 'Hoạt hình',
    'Gameshow', 'Ca nhạc', 'Tin thể thao Quốc tế', 'Trailer phim', 'Truyền hình số vệ tinh VTC',
    'Thời trang', 'Khám phá thiên nhiên', 'Tỉnh thành',
  ]);
  assert.deepEqual(byType('short'), [
    'Phim Ngắn', 'Check in Việt Nam', 'Short videos', 'Thời trang', 'Lịch sử', 'Tin tức',
    'Kỹ năng số', 'Động vật', 'Quê hương bình yên', 'Ẩm thực', 'Hài hước',
  ]);
  assert.deepEqual(byType('truyen-hinh'), ['Tin tức', 'Thể thao']);
  // slug khong trung giua cac loai co ten giong nhau
  const slugs = all.map((c) => c.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  // 2 danh muc Short mac dinh An
  const hidden = all.filter((c) => !c.isVisible).map((c) => c.name).sort();
  assert.deepEqual(hidden, ['Hài hước', 'Thời trang']);
  // Seed lan 2 khong tao trung
  await svc.onModuleInit();
  assert.equal((await svc.list()).length, 37);
});

test('listVisible(type) chi tra danh muc hien thi dung loai', async () => {
  const svc = new CategoryService(fakePrisma());
  await svc.onModuleInit();
  const phim = await svc.listVisible('phim');
  assert.equal(phim.length, 8);
  assert.ok(phim.every((c) => c.isVisible));
  const one = phim[0];
  await svc.update(one.id, { isVisible: false });
  assert.equal((await svc.listVisible('phim')).length, 7);
  // khong truyen type -> tra het tru 2 danh muc an
  assert.equal((await svc.listVisible()).length, 34);
  // getByPublicId
  const byPub = await svc.getByPublicId(one.publicId);
  assert.equal(byPub.id, one.id);
});

test('Category CRUD: tao mac dinh An + field moi VTCPlay', async () => {
  const svc = new CategoryService(fakePrisma());
  const c = await svc.create({
    name: 'Test Cat', appliesTo: ['phim'], code: 'TEST',
    seoThumbnail: 'https://x/y.jpg', platforms: ['Android Mobile', 'IOS'], contentSort: 'manual',
  });
  assert.equal(c.slug, 'test-cat');
  assert.equal(c.isVisible, false); // VTCPlay: mac dinh An khi them
  assert.equal(c.code, 'TEST');
  assert.equal(c.seoThumbnail, 'https://x/y.jpg');
  assert.deepEqual(c.platforms, ['Android Mobile', 'IOS']);
  assert.equal(c.contentSort, 'manual');
  await assert.rejects(svc.create({ name: 'Test Cat', appliesTo: ['phim'] }), /slug already exists/);
  const u = await svc.update(c.id, { name: 'Doi ten', isVisible: true, contentSort: 'created' });
  assert.equal(u.name, 'Doi ten');
  assert.equal(u.isVisible, true);
  assert.equal(u.contentSort, 'created');
});
