import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CatalogService } from './dist/modules/catalog/catalog.service.js';

// Fake Prisma toi thieu cho CatalogService: catalogItem / catalogSeason /
// catalogEpisode / catalogTrailer dang Map trong bo nho.
function fakePrisma() {
  const items = new Map(); // id -> { id, entity, data }
  const seasons = new Map(); // id -> { id, movieId, data }
  const episodes = new Map(); // id -> { id, movieId, seasonId, data }
  const trailers = new Map(); // id -> { id, movieId, seasonId, data }
  const pick = (m, where) =>
    [...m.values()].filter((r) =>
      Object.entries(where || {}).every(([k, v]) => {
        if (v && typeof v === 'object' && 'in' in v) return v.in.includes(r[k]);
        return r[k] === v;
      }),
    );
  return {
    catalogItem: {
      count: async ({ where } = {}) => pick(items, where).length,
      create: async ({ data }) => { items.set(data.id, { id: data.id, entity: data.entity, data: data.data }); },
      findFirst: async ({ where }) => pick(items, where)[0] || null,
      findMany: async ({ where } = {}) => pick(items, where),
      update: async ({ where, data }) => { const r = items.get(where.id); r.data = data.data; },
      delete: async ({ where }) => { items.delete(where.id); },
    },
    catalogSeason: {
      count: async () => seasons.size,
      create: async ({ data }) => { seasons.set(data.id, { id: data.id, movieId: data.movieId, data: data.data }); },
      findMany: async ({ where } = {}) => pick(seasons, where),
      findUnique: async ({ where }) => seasons.get(where.id) || null,
      update: async ({ where, data }) => { const r = seasons.get(where.id); r.data = data.data; },
      delete: async ({ where }) => { seasons.delete(where.id); },
      deleteMany: async ({ where } = {}) => { for (const r of pick(seasons, where)) seasons.delete(r.id); },
    },
    catalogEpisode: {
      count: async () => episodes.size,
      create: async ({ data }) => { episodes.set(data.id, { id: data.id, movieId: data.movieId, seasonId: data.seasonId ?? null, data: data.data }); },
      findMany: async ({ where } = {}) => pick(episodes, where),
      findUnique: async ({ where }) => episodes.get(where.id) || null,
      update: async ({ where, data }) => { const r = episodes.get(where.id); r.data = data.data; if ('seasonId' in data) r.seasonId = data.seasonId; },
      delete: async ({ where }) => { episodes.delete(where.id); },
      deleteMany: async ({ where } = {}) => { for (const r of pick(episodes, where)) episodes.delete(r.id); },
    },
    catalogTrailer: {
      count: async () => trailers.size,
      create: async ({ data }) => { trailers.set(data.id, { id: data.id, movieId: data.movieId ?? null, seasonId: data.seasonId ?? null, data: data.data }); },
      findMany: async ({ where } = {}) => pick(trailers, where),
      findUnique: async ({ where }) => trailers.get(where.id) || null,
      update: async ({ where, data }) => { const r = trailers.get(where.id); r.data = data.data; },
      delete: async ({ where }) => { trailers.delete(where.id); },
      deleteMany: async ({ where } = {}) => { for (const r of pick(trailers, where)) trailers.delete(r.id); },
    },
    catalogSetting: { findMany: async () => [], upsert: async () => ({}) },
  };
}

test('Season CRUD theo phim + xoa mua don tap/trailer cua mua', async () => {
  const svc = new CatalogService(fakePrisma());
  const mv = await svc.create('movies', { title: 'Phim bo test', type: 'series' });
  const s1 = await svc.createSeason(mv.id, { title: 'Phan 1', order: 1 });
  assert.equal(s1.movieId, mv.id);
  const list = await svc.listSeasons(mv.id);
  assert.equal(list.data.length, 1);
  // tap trong mua
  const ep = await svc.createEpisode(mv.id, { title: 'Tap 1', seasonId: s1.id });
  assert.equal(ep.seasonId, s1.id);
  const eps = await svc.listEpisodes(mv.id, 1, 20, s1.id);
  assert.equal(eps.data.length, 1);
  // trailer cua mua
  const tr = await svc.createTrailer({ seasonId: s1.id }, { title: 'Trailer P1' });
  assert.equal(tr.seasonId, s1.id);
  // xoa mua -> tap + trailer cua mua bien mat
  await svc.deleteSeason(s1.id);
  assert.equal((await svc.listSeasons(mv.id)).data.length, 0);
  assert.equal(await svc.episodeCount(), 0);
  assert.equal(await svc.trailerCount(), 0);
});

test('Trailer cap phim (phim le): tao/sua/xuat ban/xoa', async () => {
  const svc = new CatalogService(fakePrisma());
  const mv = await svc.create('movies', { title: 'Phim le test', type: 'single' });
  const tr = await svc.createTrailer({ movieId: mv.id }, { title: 'Trailer chinh' });
  assert.equal(tr.movieId, mv.id);
  assert.equal((await svc.listTrailers({ movieId: mv.id })).data.length, 1);
  const pub = await svc.setTrailerPublished(tr.id, true);
  assert.equal(pub.isVisible, true);
  await svc.deleteTrailer(tr.id);
  assert.equal((await svc.listTrailers({ movieId: mv.id })).data.length, 0);
});

test('Trailer phai gan dung 1 chu (phim hoac mua), sai thi loi', async () => {
  const svc = new CatalogService(fakePrisma());
  const mv = await svc.create('movies', { title: 'M', type: 'single' });
  const s = await svc.createSeason(mv.id, { title: 'P1' });
  await assert.rejects(svc.createTrailer({}, { title: 'x' }), /phai gan/);
  await assert.rejects(svc.createTrailer({ movieId: mv.id, seasonId: s.id }, { title: 'x' }), /phai gan/);
  await assert.rejects(svc.createTrailer({ movieId: 'khong-ton-tai' }, { title: 'x' }), /not found/);
});

test('Xoa phim don sach mua/tap/trailer (ca trailer cua mua)', async () => {
  const svc = new CatalogService(fakePrisma());
  const mv = await svc.create('movies', { title: 'M', type: 'series' });
  const s = await svc.createSeason(mv.id, { title: 'P1' });
  await svc.createEpisode(mv.id, { title: 'Tap 1', seasonId: s.id });
  await svc.createEpisode(mv.id, { title: 'Tap le' });
  await svc.createTrailer({ seasonId: s.id }, { title: 'TR mua' });
  await svc.createTrailer({ movieId: mv.id }, { title: 'TR phim' });
  await svc.remove('movies', mv.id);
  assert.equal(await svc.seasonCount(), 0);
  assert.equal(await svc.episodeCount(), 0);
  assert.equal(await svc.trailerCount(), 0);
});

test('Tao tap voi seasonId khong thuoc phim thi loi', async () => {
  const svc = new CatalogService(fakePrisma());
  const m1 = await svc.create('movies', { title: 'M1' });
  const m2 = await svc.create('movies', { title: 'M2' });
  const s = await svc.createSeason(m2.id, { title: 'P1' });
  await assert.rejects(svc.createEpisode(m1.id, { title: 'Tap', seasonId: s.id }), /khong thuoc phim/);
});
