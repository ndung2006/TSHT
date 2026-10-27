// Test cache "last-good" EPG AIO (chong AIO chap chon lam mat nut "Xem lai").
// Chay sau `npm run build`: node --test epg-cache.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  TvService,
  epgCacheKey,
  refreshEpgStatus,
  pruneEpgCache,
  __epgCacheStore,
} from './dist/modules/tv/tv.service.js';
import { channelPublicId } from './dist/modules/tv/tv.catalog.js';

const todayVN = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Ho_Chi_Minh',
}).format(new Date());

const PUBLIC_ID = channelPublicId('LAMDONG1');

function prog(title, startMs, endMs) {
  return {
    title,
    startTime: new Date(startMs).toISOString(),
    endTime: new Date(endMs).toISOString(),
  };
}

function makePlayback(schedule, coverage = null) {
  return {
    listChannels: async () => ({ channels: [{ name: 'LAMDONG1' }] }),
    stream: async () => ({ hls_url: 'https://x/master.m3u8', exp: Date.now() + 3600e3 }),
    channelSchedule: async () => schedule,
    timeshiftCoverage: async () => coverage,
  };
}
const epgLocal = { get: () => [] };
const COV = { coverage: [{ channel: 'LAMDONG1', oldestAvailable: new Date(Date.now() - 864e5).toISOString(), retentionDays: 1, kinds: ['raw'] }] };

test('epgCacheKey: dinh dang kenh|||ngay', () => {
  assert.equal(epgCacheKey('LAMDONG1', '2026-10-15'), 'LAMDONG1|||2026-10-15');
});

test('refreshEpgStatus: tinh lai theo gio hien tai', () => {
  const now = Date.now();
  const out = refreshEpgStatus([
    { time: '01:00', title: 'Cu', status: 'LIVE', startIso: new Date(now - 7200e3).toISOString(), endIso: new Date(now - 3600e3).toISOString() },
    { time: '03:00', title: 'Moi', status: 'REPLAY', startIso: new Date(now + 3600e3).toISOString(), endIso: new Date(now + 7200e3).toISOString() },
    { time: '04:00', title: 'Khong gio', status: 'LIVE' },
  ], now);
  assert.equal(out[0].status, 'REPLAY');
  assert.equal(out[1].status, 'UPCOMING');
  assert.equal(out[2].status, 'LIVE'); // khong co startIso -> giu nguyen
});

test('pruneEpgCache: xoa muc khac ngay, giu muc hom nay', () => {
  const store = __epgCacheStore();
  store.clear();
  store.set('A|||2026-01-01', { day: '2026-01-01', timeline: [] });
  store.set(`B|||${todayVN}`, { day: todayVN, timeline: [] });
  pruneEpgCache(todayVN);
  assert.equal(store.has('A|||2026-01-01'), false);
  assert.equal(store.has(`B|||${todayVN}`), true);
  store.clear();
});

test('epg(): AIO co lich -> epg_source=aio va luu cache', async () => {
  __epgCacheStore().clear();
  const now = Date.now();
  const svc = new TvService(makePlayback([prog('Da phat', now - 7200e3, now - 3600e3), prog('Sap phat', now + 3600e3, now + 7200e3)]), epgLocal);
  const res = await svc.epg(PUBLIC_ID, todayVN);
  assert.equal(res.epg_source, 'aio');
  assert.equal(res.timeline.length, 2);
  assert.equal(res.timeline[0].status, 'REPLAY');
  const cached = __epgCacheStore().get(epgCacheKey('LAMDONG1', todayVN));
  assert.ok(cached && cached.timeline.length === 2, 'phai luu cache sau lan fetch tot');
});

test('epg(): AIO tra rong -> dung cache cung ngay, epg_source=aio-stale', async () => {
  // cache da co tu test truoc (cung module)
  const svc = new TvService(makePlayback([]), epgLocal);
  const res = await svc.epg(PUBLIC_ID, todayVN);
  assert.equal(res.epg_source, 'aio-stale');
  assert.equal(res.timeline.length, 2);
  assert.equal(res.timeline[0].title, 'Da phat');
});

test('epg(): ngay khac khong dung cache -> roi ve local', async () => {
  const svc = new TvService(makePlayback([]), epgLocal);
  const res = await svc.epg(PUBLIC_ID, '2020-01-01');
  assert.equal(res.epg_source, 'local');
  assert.equal(res.timeline.length, 0);
});

test('epg(): timeline stale van gan replay_url khi co coverage', async () => {
  const svc = new TvService(makePlayback([], COV), epgLocal);
  const res = await svc.epg(PUBLIC_ID, todayVN);
  assert.equal(res.epg_source, 'aio-stale');
  const replay = res.timeline.find((t) => t.status === 'REPLAY');
  assert.ok(replay && replay.replay_url && replay.replay_url.includes('/timeshift.m3u8'), 'REPLAY phai co replay_url');
});
