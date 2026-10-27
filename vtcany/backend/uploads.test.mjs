import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { chunkCount, planUpload } from './dist/modules/uploads/upload.plan.js';
import { UploadsService } from './dist/modules/uploads/uploads.service.js';
import { Readable } from 'stream';

function svcWithTmp() {
  const dir = mkdtempSync(join(tmpdir(), 'vtc-upl-'));
  const cfg = { get: (k, d) => (k === 'STORAGE_DIR' ? dir : d) };
  return new UploadsService(cfg);
}

test('5GiB file splits into 1024 chunks of 5MiB', () => {
  assert.equal(chunkCount(5 * 1024 * 1024 * 1024), 1024);
});

test('oversize file rejected before touching storage', () => {
  assert.throws(() => planUpload('a.mp4', 11 * 1024 * 1024 * 1024, 'video/mp4'), /too large/);
});

test('plan keeps video link for later publish', () => {
  const rec = planUpload('show.mp4', 100 * 1024 * 1024, 'video/mp4', 'vid-1');
  assert.equal(rec.status, 'pending');
  assert.equal(rec.chunks, 20);
  assert.equal(rec.videoId, 'vid-1');
});

test('chunk upload -> complete -> webhook done maps video to hls path', async () => {
  const svc = svcWithTmp();
  const rec = await svc.init('demo.mp4', 3, 'video/mp4', 'vid-9');
  await svc.putChunk(rec.id, 0, Readable.from([Buffer.from('ABC')]));
  const done = svc.complete(rec.id);
  assert.equal(done.status, 'processing');
  svc.markDone(rec.id);
  const mapped = svc.setVideoReady(rec.id);
  assert.equal(mapped.hlsPath, `/media/${rec.id}/master.m3u8`);
  // videoPlay gio tra URL playlist KY HMAC (khong lo path static tran)
  const play = svc.videoPlay('vid-9');
  assert.match(play.hls_path, new RegExp(`^/api/v1/media/${rec.id}/playlist\\.m3u8\\?exp=\\d+&sig=[0-9a-f]{64}$`));
});

test('setProgress clamps 0-100 and only applies while processing', async () => {
  const svc = svcWithTmp();
  const rec = await svc.init('demo.mp4', 3, 'video/mp4');
  // chua processing -> khong gan progress
  assert.equal(svc.setProgress(rec.id, 40).progress, undefined);
  await svc.putChunk(rec.id, 0, Readable.from([Buffer.from('ABC')]));
  svc.complete(rec.id); // -> processing
  assert.equal(svc.setProgress(rec.id, 42.4).progress, 42);
  assert.equal(svc.setProgress(rec.id, 250).progress, 100);
  assert.equal(svc.setProgress(rec.id, -5).progress, 0);
  assert.equal(svc.get(rec.id).progress, 0);
});

test('video without finished vod has no play link', () => {
  const svc = svcWithTmp();
  assert.throws(() => svc.videoPlay('vid-missing'), /vod not ready/);
});

test('transcode queue lists only processing jobs with localPath', async () => {
  const svc = svcWithTmp();
  const a = await svc.init('a.mp4', 3, 'video/mp4');
  await svc.putChunk(a.id, 0, Readable.from([Buffer.from('A')]));
  svc.complete(a.id);
  const b = await svc.init('b.mp4', 3, 'video/mp4');
  const q = svc.pendingTranscode();
  assert.equal(q.length, 1);
  assert.equal(q[0].id, a.id);
  assert.match(q[0].localPath, /a\.mp4$/);
  void b;
});

test('bullmq enqueue fallback: khong co REDIS_URL -> false, complete van ok', async () => {
  const { enqueueTranscode } = await import('./dist/modules/uploads/transcode-queue.js');
  delete process.env.REDIS_URL;
  assert.equal(await enqueueTranscode({ uploadId: 'u1', localPath: '/tmp/a.mp4', filename: 'a.mp4' }), false);
});

test('media-sign: ky/verify roundtrip, tu choi sig sai - het han - traversal', async () => {
  const { signMedia, verifyMedia, isValidUploadId } = await import('./dist/modules/uploads/media-sign.js');
  const exp = Math.floor(Date.now() / 1000) + 600;
  const sig = signMedia('upl-123', exp);
  assert.equal(verifyMedia('upl-123', String(exp), sig), true);
  assert.equal(verifyMedia('upl-123', String(exp), sig.slice(0, -1) + '0'), false); // sig sai
  assert.equal(verifyMedia('upl-999', String(exp), sig), false); // doi uploadId
  assert.equal(verifyMedia('upl-123', String(Math.floor(Date.now() / 1000) - 1), signMedia('upl-123', Math.floor(Date.now() / 1000) - 1)), false); // het han
  assert.equal(verifyMedia('../secret', String(exp), sig), false); // traversal
  assert.equal(verifyMedia('upl-123', String(exp), undefined), false); // thieu sig
  assert.equal(isValidUploadId('upl-1700000000000'), true);
  assert.equal(isValidUploadId('../../etc'), false);
});

test('videoPlay tra URL playlist ky HMAC (khong con /media tran)', async () => {
  const svc = svcWithTmp();
  const r = await svc.init('s.mp4', 3, 'video/mp4', 'vid-sign');
  await svc.putChunk(r.id, 0, Readable.from([Buffer.from('S')]));
  svc.complete(r.id);
  const ready = svc.setVideoReady(r.id);
  assert.match(ready.hlsPath, /\/media\//);
  const play = svc.videoPlay('vid-sign');
  assert.match(play.hls_path, /\/api\/v1\/media\/.+\/playlist\.m3u8\?exp=\d+&sig=[0-9a-f]{64}/);
  assert.ok(!play.hls_path.includes('master.m3u8'), 'khong lo duong dan static tran');
});

test('signedPlaylist viet lai segment thanh URL ky tuyet doi', async () => {
  const { writeFileSync, mkdirSync } = await import('fs');
  const svc = svcWithTmp();
  const root = svc.storageRoot();
  const uid = 'upl-seg1';
  mkdirSync(join(root, 'hls', uid), { recursive: true });
  writeFileSync(join(root, 'hls', uid, 'master.m3u8'),
    '#EXTM3U\n#EXT-X-VERSION:3\n#EXTINF:6.0,\nseg0.ts\n#EXTINF:6.0,\nseg1.ts\n#EXT-X-ENDLIST\n');
  const body = svc.signedPlaylist(uid, 'https://api.example.com');
  assert.ok(body.includes('#EXTM3U'));
  const segLines = body.split('\n').filter((l) => l.includes('/media/'));
  assert.equal(segLines.length, 2);
  for (const l of segLines) {
    assert.match(l, new RegExp(`^https://api\\.example\\.com/media/${uid}/seg\\d\\.ts\\?exp=\\d+&sig=[0-9a-f]{64}$`));
  }
  assert.throws(() => svc.signedPlaylist('../x', 'https://api.example.com'), /invalid upload id/);
  assert.throws(() => svc.signedPlaylist('upl-missing', 'https://api.example.com'), /playlist not found/);
});

test('videoPlay dung VOD_PUBLIC_BASE_URL khi co dat', async () => {
  const { mkdtempSync } = await import('fs');
  const { tmpdir } = await import('os');
  const { join } = await import('path');
  const dir = mkdtempSync(join(tmpdir(), 'vtc-upl-'));
  const cfg = { get: (k, d) => (k === 'STORAGE_DIR' ? dir : k === 'VOD_PUBLIC_BASE_URL' ? 'https://vod.vtcrd.top' : d) };
  const svc = new UploadsService(cfg);
  const r = await svc.init('v.mp4', 3, 'video/mp4', 'vid-vod');
  await svc.putChunk(r.id, 0, Readable.from([Buffer.from('V')]));
  svc.complete(r.id);
  svc.setVideoReady(r.id);
  const play = svc.videoPlay('vid-vod');
  assert.match(play.hls_path, /^https:\/\/vod\.vtcrd\.top\/api\/v1\/media\/.+\/playlist\.m3u8\?exp=\d+&sig=[0-9a-f]{64}$/);
});

test('signedPlaylist multibitrate: variant -> /v/ endpoint, segment -> /media/', async () => {
  const { writeFileSync, mkdirSync } = await import('fs');
  const svc = svcWithTmp();
  const root = svc.storageRoot();
  const uid = 'upl-mb1';
  mkdirSync(join(root, 'hls', uid), { recursive: true });
  writeFileSync(join(root, 'hls', uid, 'master.m3u8'),
    '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=950000,RESOLUTION=640x360\n360p.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=1600000,RESOLUTION=854x480\n480p.m3u8\n');
  const body = svc.signedPlaylist(uid, 'https://api.example.com');
  const varLines = body.split('\n').filter((l) => l.includes('/v/'));
  assert.equal(varLines.length, 2);
  for (const l of varLines) {
    assert.match(l, new RegExp(`^https://api\\.example\\.com/api/v1/media/${uid}/v/(360p|480p)\\.m3u8\\?exp=\\d+&sig=[0-9a-f]{64}$`));
  }
});

test('signedVariantPlaylist viet lai segment trong variant', async () => {
  const { writeFileSync, mkdirSync } = await import('fs');
  const svc = svcWithTmp();
  const root = svc.storageRoot();
  const uid = 'upl-mb2';
  mkdirSync(join(root, 'hls', uid), { recursive: true });
  writeFileSync(join(root, 'hls', uid, '360p.m3u8'),
    '#EXTM3U\n#EXT-X-VERSION:3\n#EXTINF:6.0,\n360p_000.ts\n#EXTINF:6.0,\n360p_001.ts\n#EXT-X-ENDLIST\n');
  const body = svc.signedVariantPlaylist(uid, '360p.m3u8', 'https://api.example.com');
  const segLines = body.split('\n').filter((l) => l.includes('/media/'));
  assert.equal(segLines.length, 2);
  for (const l of segLines) {
    assert.match(l, new RegExp(`^https://api\\.example\\.com/media/${uid}/360p_00\\d\\.ts\\?exp=\\d+&sig=[0-9a-f]{64}$`));
  }
  assert.throws(() => svc.signedVariantPlaylist(uid, '../x.m3u8', 'https://api.example.com'), /invalid variant/);
  assert.throws(() => svc.signedVariantPlaylist(uid, 'nope.m3u8', 'https://api.example.com'), /playlist not found/);
});
