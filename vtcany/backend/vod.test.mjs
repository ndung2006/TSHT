import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { UploadsService } from './dist/modules/uploads/uploads.service.js';
import { VodService } from './dist/modules/catalog/vod.service.js';

function fakeCfg(root) {
  return {
    get: (k, d) => {
      if (k === 'STORAGE_DIR') return root;
      if (k === 'VOD_PUBLIC_BASE_URL') return 'https://vod.example.test';
      if (k === 'MEDIA_URL_SECRET') return 'test-secret';
      return d ?? '';
    },
  };
}

function writeHls(root, uploadId) {
  const dir = join(root, 'hls', uploadId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'master.m3u8'), '#EXTM3U\n#EXT-X-VERSION:3\nseg-0.ts\n');
}

test('playByUploadId: chua co HLS -> vod not ready; co HLS -> URL ky tren VOD domain', () => {
  const root = mkdtempSync(join(tmpdir(), 'vod-'));
  const svc = new UploadsService(fakeCfg(root));
  assert.equal(svc.isReady('upl-1'), false);
  assert.throws(() => svc.playByUploadId('upl-1'), /vod not ready/);
  writeHls(root, 'upl-1');
  assert.equal(svc.isReady('upl-1'), true);
  const play = svc.playByUploadId('upl-1');
  assert.match(play.hls_path, /^https:\/\/vod\.example\.test\/api\/v1\/media\/upl-1\/playlist\.m3u8\?exp=\d+&sig=[0-9a-f]+$/);
  assert.throws(() => svc.playByUploadId('../etc'), /vod not ready/);
});

test('VodService: chua xuat ban -> not published; xuat ban + HLS san sang -> phat duoc', async () => {
  const root = mkdtempSync(join(tmpdir(), 'vod-'));
  const uploads = new UploadsService(fakeCfg(root));
  writeHls(root, 'upl-9');
  const items = {
    shorts: { id: 'sh-1', title: 'Short mau', isVisible: false, videoFileId: 'upl-9' },
    videos: { id: 'vi-1', title: 'Video mau', isVisible: true, videoFileId: 'upl-9' },
  };
  const catalog = {
    get: async (entity, id) => {
      const it = items[entity];
      if (!it || it.id !== id) throw new Error('not found');
      return it;
    },
    getEpisode: async () => { throw new Error('not found'); },
  };
  const vod = new VodService(catalog, uploads);
  await assert.rejects(() => vod.resolvePlay('short', 'sh-1'), /not published/);
  const ok = await vod.resolvePlay('video', 'vi-1');
  assert.equal(ok.kind, 'video');
  assert.match(ok.hls_path, /vod\.example\.test/);
  await assert.rejects(() => vod.resolvePlay('episode', 'ep-x'), /not found|not published/);
});

test('signedPlaylist: segment dung base https cong khai, khong ro http tu request (mixed-content)', () => {
  const root = mkdtempSync(join(tmpdir(), 'vod-'));
  const svc = new UploadsService(fakeCfg(root));
  writeHls(root, 'upl-2');
  const body = svc.signedPlaylist('upl-2', 'http://internal:3001');
  assert.match(body, /https:\/\/vod\.example\.test\/media\/upl-2\/seg-0\.ts\?exp=\d+&sig=[0-9a-f]+/);
  assert.doesNotMatch(body, /http:\/\/internal/);
});

test('posterUrlFor: chua co file -> rong; worker da cat poster -> URL cong khai; id la -> rong', () => {
  const root = mkdtempSync(join(tmpdir(), 'vod-'));
  const svc = new UploadsService(fakeCfg(root));
  assert.equal(svc.posterUrlFor('upl-3'), '');
  assert.equal(svc.posterUrlFor('../etc/passwd'), '');
  mkdirSync(join(root, 'images'), { recursive: true });
  writeFileSync(join(root, 'images', 'thumb-upl-3.jpg'), 'jpeg-bytes');
  assert.equal(svc.posterUrlFor('upl-3'), 'https://vod.example.test/images/thumb-upl-3.jpg');
  const play = (() => { writeHls(root, 'upl-3'); return svc.playByUploadId('upl-3'); })();
  assert.equal(play.poster, 'https://vod.example.test/images/thumb-upl-3.jpg');
});
