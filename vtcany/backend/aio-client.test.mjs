import test from 'node:test';
import assert from 'node:assert/strict';
import { clampTtlMinutes, fullUrl, mintToken, toMasterUrl } from './dist/modules/playback/aio-client.js';

function mockFetch(handler) {
  globalThis.fetch = handler;
}

test('master url moves to /api/hls keeping query', () => {
  assert.equal(
    toMasterUrl('/hls/PHUTHO/index.m3u8?token=abc&exp=123'),
    '/api/hls/PHUTHO/master.m3u8?token=abc&exp=123',
  );
});

test('ttl clamps 5..1440, default 240', () => {
  assert.equal(clampTtlMinutes(1), 5);
  assert.equal(clampTtlMinutes(240), 240);
  assert.equal(clampTtlMinutes(9999), 1440);
  assert.equal(clampTtlMinutes(NaN), 240);
});

test('mint posts channel+ttl and builds full master url', async () => {
  let seen = null;
  mockFetch(async (url, init) => {
    seen = { url, body: JSON.parse(init.body), auth: init.headers.Authorization };
    return { ok: true, status: 200, json: async () => ({ token: 't', exp: 9, url: '/hls/PHUTHO/index.m3u8?token=t&exp=9' }) };
  });
  const t = await mintToken({ baseUrl: 'https://luuchieu1.vtcplay.vn', partnerKey: 'k' }, 'phutho', 240);
  assert.equal(seen.body.channel, 'PHUTHO');
  assert.equal(seen.body.ttlMinutes, 240);
  assert.equal(seen.auth, 'Bearer k');
  assert.equal(fullUrl('https://luuchieu1.vtcplay.vn', toMasterUrl(t.url)), 'https://luuchieu1.vtcplay.vn/api/hls/PHUTHO/master.m3u8?token=t&exp=9');
});

test('401 maps to invalid partner key', async () => {
  mockFetch(async () => ({ ok: false, status: 401, json: async () => ({}) }));
  await assert.rejects(mintToken({ baseUrl: 'https://x', partnerKey: 'bad' }, 'PHUTHO', 240), /invalid partner key/);
});

test('transient 502 retried once then succeeds', async () => {
  let calls = 0;
  mockFetch(async () => {
    calls++;
    if (calls === 1) return { ok: false, status: 502, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ({ token: 't', exp: 9, url: '/hls/PHUTHO/index.m3u8?token=t&exp=9' }) };
  });
  const t = await mintToken({ baseUrl: 'https://x', partnerKey: 'k' }, 'PHUTHO', 240);
  assert.equal(t.token, 't');
  assert.equal(calls, 2);
});

test('403 is not retried', async () => {
  let calls = 0;
  mockFetch(async () => { calls++; return { ok: false, status: 403, json: async () => ({}) }; });
  await assert.rejects(mintToken({ baseUrl: 'https://x', partnerKey: 'k' }, 'NOPE', 240), /403/);
  assert.equal(calls, 1);
});

test('missing key fails before network', async () => {
  let called = false;
  mockFetch(async () => { called = true; return { ok: true, status: 200, json: async () => ({}) }; });
  await assert.rejects(mintToken({ baseUrl: 'https://x', partnerKey: '' }, 'PHUTHO', 240), /not configured/);
  assert.equal(called, false);
});

test('audio-only detection from presets', async () => {
  const { isAudioOnly } = await import('./dist/modules/playback/aio-client.js');
  assert.equal(isAudioOnly({ name: 'VOV1', status: 'RUNNING', live: true, hlsTranscode: [{ preset: 'audio' }] }), true);
  assert.equal(isAudioOnly({ name: 'PHUTHO', status: 'RUNNING', live: true, hlsTranscode: [{ preset: 'p720' }, { preset: 'p480' }] }), false);
  assert.equal(isAudioOnly({ name: 'X', status: 'RUNNING', live: true }), false);
});

test('epg schedule maps LIVE/UPCOMING/REPLAY', async () => {
  const { mapEpgSchedule } = await import('./dist/modules/playback/aio-client.js');
  const now = new Date('2026-09-29T12:00:00Z').getTime();
  const items = mapEpgSchedule(
    { programs: [
      { title: 'Da het', startTime: '2026-09-29T10:00:00Z', endTime: '2026-09-29T11:00:00Z' },
      { title: 'Dang phat', startTime: '2026-09-29T11:30:00Z', endTime: '2026-09-29T12:30:00Z' },
      { title: 'Sap toi', startTime: '2026-09-29T13:00:00Z', endTime: '2026-09-29T14:00:00Z' },
      { title: 'Thieu gio', endTime: '2026-09-29T14:00:00Z' },
    ] },
    now,
  );
  assert.equal(items.length, 3);
  assert.equal(items[0].status, 'REPLAY');
  assert.equal(items[1].status, 'LIVE');
  assert.equal(items[2].status, 'UPCOMING');
  assert.match(items[0].time, /^\d{2}:\d{2}$/);
});

test('epg schedule passes through unknown shapes as empty', async () => {
  const { mapEpgSchedule } = await import('./dist/modules/playback/aio-client.js');
  assert.deepEqual(mapEpgSchedule({ foo: 1 }), []);
  assert.deepEqual(mapEpgSchedule(null), []);
});

test('epg time hien thi theo gio Viet Nam (+07), khong phu thuoc TZ server', async () => {
  const { mapEpgSchedule } = await import('./dist/modules/playback/aio-client.js');
  const now = new Date('2026-09-29T12:00:00Z').getTime();
  const items = mapEpgSchedule(
    { programs: [{ title: 'X', startTime: '2026-09-29T10:00:00Z', endTime: '2026-09-29T11:00:00Z' }] },
    now,
  );
  assert.equal(items.length, 1);
  assert.equal(items[0].time, '17:00'); // 10:00 UTC = 17:00 gio VN
  assert.equal(items[0].startIso, '2026-09-29T10:00:00.000Z');
});

test('isAudioOnly: nhan dien qua hlsTranscodeRotating (scan moi)', async () => {
  const { isAudioOnly } = await import('./dist/modules/playback/aio-client.js');
  assert.equal(isAudioOnly({ name: 'VOV1', hlsTranscodeRotating: [{ preset: 'paudio', hls: 'x' }] }), true);
  assert.equal(isAudioOnly({ name: 'VOV1', hlsTranscodeRotating: [{ preset: 'tc-paudio', hls: 'x' }] }), true);
  assert.equal(isAudioOnly({ name: 'LAICHAU', hlsTranscodeRotating: [{ preset: 'p720', hls: 'x' }] }), false);
  assert.equal(isAudioOnly({ name: 'LAICHAU', hlsTranscode: [{ preset: 'p720', hls: 'x' }] }), false);
  assert.equal(isAudioOnly({ name: 'X', hlsTranscodeRotating: [] }), false);
});

test('stitch timeshift: TARGETDURATION dung truoc segment, giu DISCONTINUITY, URI tuyet doi', async () => {
  const { stitchTimeshiftPlaylists } = await import('./dist/modules/playback/aio-client.js');
  const aio = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-PLAYLIST-TYPE:VOD
#EXT-X-TARGETDURATION:11
#EXT-X-MEDIA-SEQUENCE:100
#EXTINF:10.0,
/api/timeshift/chunks?ch=ANGIANG1&ts=001&token=abc&exp=999
#EXT-X-DISCONTINUITY
#EXTINF:9.8,
/api/timeshift/chunks?ch=ANGIANG1&ts=002&token=abc&exp=999
#EXT-X-ENDLIST
`;
  const out = stitchTimeshiftPlaylists([{ playlist: aio, baseUrl: 'https://luuchieu1.vtcplay.vn' }]);
  const lines = out.split('\n');
  const tdIdx = lines.findIndex((l) => l.startsWith('#EXT-X-TARGETDURATION:'));
  const firstInf = lines.findIndex((l) => l.startsWith('#EXTINF:'));
  assert.ok(tdIdx !== -1 && tdIdx < firstInf, 'TARGETDURATION phai dung truoc segment');
  assert.ok(lines.includes('#EXT-X-DISCONTINUITY'), 'giu DISCONTINUITY trong chunk');
  assert.ok(lines.includes('https://luuchieu1.vtcplay.vn/api/timeshift/chunks?ch=ANGIANG1&ts=001&token=abc&exp=999'));
  assert.ok(out.endsWith('#EXT-X-ENDLIST\n'));
});

test('stitch timeshift: playlist rong -> throw 404', async () => {
  const { stitchTimeshiftPlaylists } = await import('./dist/modules/playback/aio-client.js');
  assert.throws(
    () => stitchTimeshiftPlaylists([{ playlist: '#EXTM3U\n#EXT-X-ENDLIST\n', baseUrl: 'https://x' }]),
    (e) => e.status === 404,
  );
});
