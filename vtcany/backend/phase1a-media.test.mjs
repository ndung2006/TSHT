// Test Thu vien media thong nhat (Dot 1a): map/filter/merge/phân trang.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  mapDbRow, mapMemoryImage, mapMemoryVideo, mergeAndPage, normalizeMediaQuery,
} from './src/modules/uploads/media-library-map.ts';

const BASE = 'https://api.example.com';

test('query: kind la bi reject, limit cap 50, page mac dinh 1', () => {
  assert.deepEqual(normalizeMediaQuery({}), { kind: null, q: '', page: 1, limit: 20 });
  assert.deepEqual(normalizeMediaQuery({ kind: 'image', page: 2, limit: 500 }), { kind: 'image', q: '', page: 2, limit: 50 });
  assert.throws(() => normalizeMediaQuery({ kind: 'subtitle' }), /kind khong hop le/);
  assert.throws(() => normalizeMediaQuery({ kind: 'document' }), /kind khong hop le/);
});

test('map dong DB: anh/audio co url, video url rong + poster rieng, subtitle bi loai', () => {
  const img = mapDbRow({ id: '1', filename: 'a.jpg', fileType: 'image', contentType: 'image/jpeg', sizeBytes: 100n, fileUrl: '/images/a.jpg', status: 'done', createdAt: new Date('2026-01-01') }, BASE);
  assert.equal(img.url, `${BASE}/images/a.jpg`);
  assert.equal(img.kind, 'image');
  const vid = mapDbRow({ id: '2', filename: 'v.mp4', fileType: 'video', contentType: 'video/mp4', sizeBytes: 200n, fileUrl: null, status: 'done', createdAt: new Date('2026-01-02') }, BASE, `${BASE}/images/thumb-2.jpg`);
  assert.equal(vid.url, '');
  assert.equal(vid.posterUrl, `${BASE}/images/thumb-2.jpg`);
  assert.equal(mapDbRow({ id: '3', filename: 's.vtt', fileType: 'subtitle', createdAt: new Date() }, BASE), null);
});

test('map in-memory: anh lay url san co, video lay posterUrl/transcode', () => {
  const img = mapMemoryImage({ id: 'img-1', filename: 'b.jpg', contentType: 'image/jpeg', sizeBytes: 10, url: `${BASE}/images/b.jpg`, createdAt: 1000 });
  assert.equal(img.url, `${BASE}/images/b.jpg`);
  assert.equal(img.status, 'done');
  const vid = mapMemoryVideo({ id: 'upl-1', filename: 'c.mp4', contentType: 'video/mp4', sizeBytes: 20, transcode: 'processing', posterUrl: '', createdAt: 2000 });
  assert.equal(vid.kind, 'video');
  assert.equal(vid.status, 'processing');
});

test('merge: trung id thi giu ban in-memory (bo sung poster), loc kind/q, sap xep moi nhat truoc, phan trang', () => {
  const db = [
    { id: '1', filename: 'Anh A.jpg', kind: 'image', contentType: '', sizeBytes: 1, url: `${BASE}/images/a.jpg`, posterUrl: '', status: 'done', createdAt: 100 },
    { id: '2', filename: 'Video B.mp4', kind: 'video', contentType: '', sizeBytes: 2, url: '', posterUrl: '', status: 'done', createdAt: 300 },
  ];
  const mem = [
    { id: '2', filename: 'Video B.mp4', kind: 'video', contentType: '', sizeBytes: 2, url: '', posterUrl: `${BASE}/images/thumb-2.jpg`, status: 'done', createdAt: 300 },
    { id: '3', filename: 'anh C.png', kind: 'image', contentType: '', sizeBytes: 3, url: `${BASE}/images/c.png`, posterUrl: '', status: 'done', createdAt: 200 },
  ];
  const all = mergeAndPage(db, mem, { kind: null, q: '', page: 1, limit: 10 });
  assert.equal(all.total, 3);
  assert.deepEqual(all.data.map((d) => d.id), ['2', '3', '1']); // moi nhat truoc
  assert.equal(all.data[0].posterUrl, `${BASE}/images/thumb-2.jpg`); // in-memory bo sung poster
  const imgs = mergeAndPage(db, mem, { kind: 'image', q: '', page: 1, limit: 10 });
  assert.deepEqual(imgs.data.map((d) => d.id), ['3', '1']);
  const search = mergeAndPage(db, mem, { kind: null, q: 'ANH', page: 1, limit: 10 });
  assert.deepEqual(search.data.map((d) => d.id), ['3', '1']); // tim khong phan biet hoa thuong
  const page2 = mergeAndPage(db, mem, { kind: null, q: '', page: 2, limit: 2 });
  assert.deepEqual(page2.data.map((d) => d.id), ['1']);
  assert.equal(page2.total, 3);
});
