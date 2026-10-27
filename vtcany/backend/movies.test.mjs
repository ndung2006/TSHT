import test from 'node:test';
import assert from 'node:assert/strict';
import { MOVIES, buildTabs } from './dist/modules/movies/movies.catalog.js';
import { FEATURED_THAM_TINH_PUBLIC_ID } from './dist/modules/layout/seed-data.js';
import { MoviesService } from './dist/modules/movies/movies.service.js';

const svc = new MoviesService();
const THAM_TINH = FEATURED_THAM_TINH_PUBLIC_ID;

test('Tham Tinh: 22 episodes, tabs 10/tab (contract 3B)', async () => {
  const d = await svc.detail(THAM_TINH);
  assert.equal(d.video_info.title, 'Thâm Tình');
  assert.equal(d.video_info.release_year, 2024);
  assert.equal(d.video_info.total_episodes, '22 / 22 Tập');
  assert.equal(d.episodes.length, 22);
  assert.deepEqual(d.video_info.tabs, ['Tập 1 - Tập 10', 'Tập 11 - Tập 20', 'Tập 21 - Tập cuối']);
  assert.equal(d.video_info.is_favorited, false);
  assert.ok(d.related_videos.length > 0);
  assert.match(d.episodes[0].episode_id, /-e1$/);
});

test('catalog covers all phim rail items (card links resolve)', async () => {
  const ids = new Set(MOVIES.map((m) => m.public_id));
  assert.ok(ids.size >= 15); // 1 hero movie + 16 rail phim items
  for (const m of MOVIES) {
    assert.match(m.public_id, /^[0-9a-f]{24}$/);
    await svc.detail(m.public_id); // must not throw
  }
});

test('invalid public_id -> 400, unknown -> 404', async () => {
  await assert.rejects(() => svc.detail('xyz'), /24 hex/);
  await assert.rejects(() => svc.detail('aaaaaaaaaaaaaaaaaaaaaaaa'), /not found/);
});

test('favorite toggles per user', async () => {
  assert.deepEqual(await svc.toggleFavorite('u1', THAM_TINH), { is_favorited: true });
  assert.equal((await svc.detail(THAM_TINH, 'u1')).video_info.is_favorited, true);
  assert.equal((await svc.detail(THAM_TINH, 'u2')).video_info.is_favorited, false);
  assert.deepEqual(await svc.toggleFavorite('u1', THAM_TINH), { is_favorited: false });
});

test('buildTabs edge cases', () => {
  assert.deepEqual(buildTabs(10), ['Tập 1 - Tập 10']);
  assert.deepEqual(buildTabs(11), ['Tập 1 - Tập 10', 'Tập 11 - Tập cuối']);
});

// ---- DB fallback (phim tao tu CMS) ----
function fakeCatalog() {
  const movie = {
    id: 'mo-test-1', public_id: 'd22942cec9781f112d3d9967', slug: 'su-tro-lai-cua-hoang-de',
    title: 'Sự Trở Lại Của Hoàng Đế', description: 'Mo ta',
    thumbnail: 'https://vod.vtcrd.top/images/t.jpg', poster: 'https://vod.vtcrd.top/images/p.jpg',
    isVisible: true, createdAt: '2026-10-02T10:23:32.522Z',
  };
  const ep = {
    id: 'ep-test-1', movieId: 'mo-test-1', order: 1, title: 'Tap 1',
    description: 'Mo ta tap 1', thumbnail: '', duration: '', isVisible: true, videoFileId: 'upl-1',
  };
  return {
    getPublic: async (entity, publicId) => {
      assert.equal(entity, 'movies');
      if (publicId === movie.public_id) return movie;
      throw new Error('not found');
    },
    listEpisodes: async () => ({ data: [ep] }),
    listPublic: async () => ({ data: [movie] }),
  };
}
const fakeVod = {
  resolvePlay: async (kind, id) => {
    assert.equal(kind, 'episode');
    return { kind, id, hls_path: `https://vod.vtcrd.top/media/${id}/master.m3u8` };
  },
};

test('DB fallback: phim CMS tra ve dung shape FE', async () => {
  const s = new MoviesService(fakeCatalog(), fakeVod);
  const d = await s.detail('d22942cec9781f112d3d9967');
  assert.equal(d.video_info.title, 'Sự Trở Lại Của Hoàng Đế');
  assert.equal(d.video_info.public_id, 'd22942cec9781f112d3d9967');
  assert.equal(d.episodes.length, 1);
  assert.equal(d.episodes[0].episode_id, 'ep-test-1');
  assert.equal(d.episodes[0].title, 'Tap 1');
  assert.equal(d.episodes[0].hls_url, 'https://vod.vtcrd.top/media/ep-test-1/master.m3u8');
  assert.deepEqual(d.video_info.tabs, ['Tập 1 - Tập 1']);
});

test('DB fallback: unknown id -> 404', async () => {
  const s = new MoviesService(fakeCatalog(), fakeVod);
  await assert.rejects(() => s.detail('bbbbbbbbbbbbbbbbbbbbbbbb'), /not found/);
});

test('DB fallback: favorite tren phim CMS', async () => {
  const s = new MoviesService(fakeCatalog(), fakeVod);
  assert.deepEqual(await s.toggleFavorite('u9', 'd22942cec9781f112d3d9967'), { is_favorited: true });
  await assert.rejects(() => s.toggleFavorite('u9', 'cccccccccccccccccccccccc'), /not found/);
});
