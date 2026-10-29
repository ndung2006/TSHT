// Test media dinh dang bai viet — Goi 1B. Chay truc tiep bang
// node --test, khong can build (Node strip type cua file .ts thuan,
// theo mau zone-rules.test.mjs).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MAX_GALLERY_IMAGES,
  mediaKindFor,
  normalizeFormatData,
} from './news-format-data.ts';

test('rong -> null (bai cu / bai khong co media rieng)', () => {
  assert.equal(normalizeFormatData(undefined), null);
  assert.equal(normalizeFormatData(null), null);
  assert.equal(normalizeFormatData(''), null);
  assert.equal(normalizeFormatData({}), null);
  assert.equal(normalizeFormatData({ videoUrl: '  ', images: [] }), null);
});

test('chi giu key media hop le, trim va bo chuoi rong', () => {
  assert.deepEqual(
    normalizeFormatData({ videoUrl: '  /videos/a.mp4 ', audioUrl: '', foo: 'bar', id: '123' }),
    { videoUrl: '/videos/a.mp4' },
  );
  assert.deepEqual(
    normalizeFormatData({ imageUrl: 'https://cdn.example/x.png', images: ['/images/1.jpg'] }),
    { imageUrl: 'https://cdn.example/x.png', images: ['/images/1.jpg'] },
  );
});

test('chum anh: loc gia tri khong phai chuoi, khu trung, cap 30 anh', () => {
  const many = Array.from({ length: 40 }, (_, i) => `/images/${i}.jpg`);
  const out = normalizeFormatData({ images: ['/images/a.jpg', '', null, '/images/a.jpg', ...many] });
  assert.equal(out?.images?.length, MAX_GALLERY_IMAGES);
  assert.equal(out?.images?.[0], '/images/a.jpg');
  assert.equal(new Set(out?.images).size, out?.images?.length);
});

test('scheme nguy hiem -> throw (khong cho javascript:/data: vao JSON)', () => {
  assert.throws(() => normalizeFormatData({ videoUrl: 'javascript:alert(1)' }), /khong hop le/);
  assert.throws(() => normalizeFormatData({ audioUrl: 'data:audio/mp3;base64,xxxx' }), /khong hop le/);
  assert.throws(() => normalizeFormatData({ images: ['/images/ok.jpg', 'data:image/png;base64,xx'] }), /khong hop le/);
});

test('dang sai -> throw', () => {
  assert.throws(() => normalizeFormatData('video'), /phai la object/);
  assert.throws(() => normalizeFormatData(['/images/a.jpg']), /phai la object/);
  assert.throws(() => normalizeFormatData(42), /phai la object/);
});

test('mediaKindFor map dung dinh dang -> loai media chinh', () => {
  assert.equal(mediaKindFor('video'), 'video');
  assert.equal(mediaKindFor('audio'), 'audio');
  assert.equal(mediaKindFor('gallery'), 'gallery');
  assert.equal(mediaKindFor('infographic'), 'image');
  assert.equal(mediaKindFor('emagazine'), 'none');
  assert.equal(mediaKindFor('text'), 'none');
  assert.equal(mediaKindFor(null), 'none');
  assert.equal(mediaKindFor(undefined), 'none');
});
