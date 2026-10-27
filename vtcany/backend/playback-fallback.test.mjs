// Test PlaybackService.stream (scan-only, phuong an A):
// - Khong POST /api/hls-tokens nua (endpoint goc 1080i+MP2, khong cho web).
// - Uu tien hlsMasterRotating (master multibitrate, ABR) tu catalog,
//   roi moi xuong tung rendition (p720) / link don.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PlaybackService } from './dist/modules/playback/playback.service.js';
import { urlExpMs } from './dist/modules/playback/aio-client.js';

const MASTER = 'https://luuchieu1.vtcplay.vn/api/hls/LAICHAU/master.m3u8?token=abc&exp=1791308791486';
const P720 = 'https://luuchieu1.vtcplay.vn/hls/LAICHAU/tc-p720/index.m3u8?token=abc&exp=1791308791486';

function stubScan(channels) {
  global.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/api/public/channels')) {
      return {
        ok: true, status: 200,
        json: async () => ({ baseUrl: 'https://luuchieu1.vtcplay.vn', channels }),
      };
    }
    throw new Error('unexpected fetch ' + u);
  };
}

function svc() {
  const fakeConfig = { get: (k, d) => (k === 'PLAYBACK_TTL_MINUTES' ? 240 : d) };
  const fakeSources = { getActiveConfig: async () => ({ baseUrl: 'https://luuchieu1.vtcplay.vn', partnerKey: 'k' }) };
  return new PlaybackService(fakeConfig, fakeSources);
}

test('stream: uu tien hlsMasterRotating (master ABR), exp doc tu URL', async () => {
  stubScan([{
    name: 'LAICHAU', status: 'RUNNING', live: true,
    hlsMasterRotating: MASTER,
    hlsTranscodeRotating: [{ preset: 'p720', hls: P720 }],
  }]);
  const r = await svc().stream('LAICHAU');
  assert.equal(r.hls_url, MASTER);
  assert.equal(r.exp, 1791308791486);
  assert.equal(r.ttl_seconds, 240 * 60);
});

test('stream: khong co master -> xuong p720 don', async () => {
  stubScan([{
    name: 'LAICHAU', status: 'RUNNING', live: true,
    hlsTranscodeRotating: [{ preset: 'p480', hls: 'https://x/p480.m3u8' }, { preset: 'p720', hls: P720 }],
  }]);
  const r = await svc().stream('LAICHAU');
  assert.equal(r.hls_url, P720);
});

test('stream: radio lay master audio', async () => {
  const am = 'https://luuchieu1.vtcplay.vn/api/hls/VOV1/master.m3u8?token=abc&exp=1791308791486';
  stubScan([{
    name: 'VOV1', status: 'RUNNING', live: true,
    hlsMasterRotating: am,
    hlsTranscodeRotating: [{ preset: 'paudio', hls: 'https://x/paudio.m3u8' }],
  }]);
  const r = await svc().stream('VOV1');
  assert.equal(r.hls_url, am);
});

test('stream: khong phan biet hoa thuong ten kenh', async () => {
  stubScan([{ name: 'LAICHAU', status: 'RUNNING', live: true, hlsMasterRotating: MASTER }]);
  const r = await svc().stream('laichau');
  assert.equal(r.hls_url, MASTER);
});

test('stream: catalog khong co link -> throw', async () => {
  stubScan([{ name: 'VOV1', status: 'RUNNING', live: true }]);
  await assert.rejects(svc().stream('VOV1'), /khong co link xoay/);
});

test('stream: khong goi /api/hls-tokens', async () => {
  const seen = [];
  global.fetch = async (url) => {
    const u = String(url);
    seen.push(u);
    if (u.includes('/api/public/channels')) {
      return {
        ok: true, status: 200,
        json: async () => ({
          baseUrl: 'https://luuchieu1.vtcplay.vn',
          channels: [{ name: 'LAICHAU', status: 'RUNNING', live: true, hlsMasterRotating: MASTER }],
        }),
      };
    }
    throw new Error('unexpected fetch ' + u);
  };
  await svc().stream('LAICHAU');
  assert.ok(!seen.some((u) => u.includes('/api/hls-tokens')), 'khong duoc goi mint endpoint');
});

test('urlExpMs: doc han that tu query param exp (ms)', () => {
  assert.equal(urlExpMs('https://x/api/hls/A/master.m3u8?token=t&exp=1791297224343'), 1791297224343);
});

test('urlExpMs: exp dang giay -> doi sang ms', () => {
  assert.equal(urlExpMs('https://x/api/hls/A/master.m3u8?exp=1791297224'), 1791297224000);
});

test('urlExpMs: khong co exp -> null', () => {
  assert.equal(urlExpMs('https://x/api/hls/A/master.m3u8?token=t'), null);
  assert.equal(urlExpMs('https://x/api/hls/A/master.m3u8'), null);
});
