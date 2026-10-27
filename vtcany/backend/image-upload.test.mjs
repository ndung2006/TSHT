import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'stream';
import { mkdtempSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { IMAGE_TYPES, MAX_IMAGE_BYTES, planImage } from './dist/modules/uploads/upload.plan.js';
import { UploadsService } from './dist/modules/uploads/uploads.service.js';

test('planImage: chap nhan jpeg/png/webp/gif/avif, tra id img- va dung ext', () => {
  for (const [ct, ext] of Object.entries(IMAGE_TYPES)) {
    const p = planImage('poster dep.PNG', ct);
    assert.match(p.id, /^img-[a-z0-9]+-[a-z0-9]+$/);
    assert.equal(p.ext, ext);
  }
  assert.equal(planImage('a.jpg', 'IMAGE/JPEG').ext, 'jpg'); // khong phan biet hoa thuong
});

test('planImage: tu choi svg/video/rong va thieu filename', () => {
  assert.throws(() => planImage('x.svg', 'image/svg+xml'), /unsupported image type/);
  assert.throws(() => planImage('x.mp4', 'video/mp4'), /unsupported image type/);
  assert.throws(() => planImage('x.png', ''), /unsupported image type/);
  assert.throws(() => planImage('', 'image/png'), /filename required/);
});

test('saveImage: ghi file xuong storage/images, tra url cong khai, list thay duoc', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vtc-img-'));
  const config = { get: (k, d) => (k === 'STORAGE_DIR' ? dir : d || '') };
  const svc = new UploadsService(config);
  const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
  const out = await svc.saveImage(Readable.from([bytes]), 'anh dep.png', 'image/png');
  assert.match(out.id, /^img-/);
  assert.equal(out.fileUrl, `/images/${out.id}.png`);
  assert.match(out.url, /\/images\/img-.*\.png$/);
  assert.equal(out.sizeBytes, bytes.length);
  const saved = join(dir, 'images', `${out.id}.png`);
  assert.ok(existsSync(saved));
  assert.deepEqual(readFileSync(saved), bytes);
  const list = svc.listImages();
  assert.equal(list.length, 1);
  assert.equal(list[0].url, out.url);
});

test('saveImage: vuot 10MB bi tu choi va khong de lai file rac', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vtc-img-'));
  const config = { get: (k, d) => (k === 'STORAGE_DIR' ? dir : d || '') };
  const svc = new UploadsService(config);
  const big = Buffer.alloc(MAX_IMAGE_BYTES + 1, 7);
  await assert.rejects(() => svc.saveImage(Readable.from([big]), 'to.png', 'image/png'), /too large/);
  assert.equal(svc.listImages().length, 0);
});
