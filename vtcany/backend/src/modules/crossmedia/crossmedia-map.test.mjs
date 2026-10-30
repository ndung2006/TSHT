// Test anh xa chuyen doi cheo — Goi 1C. Chay truc tiep bang node --test,
// khong can build (Node strip type cua file .ts thuan, theo mau
// news-format-data.test.mjs).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  escapeHtml,
  issueTypeLabel,
  mapEpaperToDraft,
  mapTvToDraft,
  normalizeAuthors,
  portalMp4Url,
  relativeCover,
  truncateSapo,
} from './crossmedia-map.ts';

test('TV video da xuat ban -> nhap du tieu de/sapo/body/bia/sourceRef', () => {
  const d = mapTvToDraft(
    { id: 'vi-123', title: 'Phong su A', description: 'Mo ta ngan', thumbnail: '/images/a.jpg', isVisible: true },
    'tv-video',
  );
  assert.equal(d.title, 'Phong su A');
  assert.equal(d.sapo, 'Mo ta ngan');
  assert.match(d.body, /Mo ta ngan/);
  assert.match(d.body, /Truyền hình/);
  assert.equal(d.coverPath, '/images/a.jpg');
  assert.equal(d.contentType, 'text');
  assert.deepEqual(d.sourceRef, { type: 'tv-video', id: 'vi-123', title: 'Phong su A' });
  assert.deepEqual(d.authors, []);
});

test('TV short -> type tv-short, uu tien thumbnail truoc poster', () => {
  const d = mapTvToDraft(
    { id: 'sh-9', title: 'Short B', description: '', thumbnail: '', poster: '/images/p.jpg', isVisible: true },
    'tv-short',
  );
  assert.equal(d.sourceRef.type, 'tv-short');
  assert.equal(d.coverPath, '/images/p.jpg');
  assert.match(d.body, /video ngan/);
});

test('TV chua xuat ban -> throw, khong tao nhap (fail-closed)', () => {
  assert.throws(() => mapTvToDraft({ id: 'vi-1', title: 'X', isVisible: false }, 'tv-video'), /chua xuat ban/);
  assert.throws(() => mapTvToDraft({ id: 'vi-1', title: 'X' }, 'tv-video'), /chua xuat ban/);
});

test('TV thieu tieu de / thieu id -> throw', () => {
  assert.throws(() => mapTvToDraft({ id: 'vi-1', title: '   ', isVisible: true }, 'tv-video'), /tieu de/);
  assert.throws(() => mapTvToDraft({ id: '', title: 'X', isVisible: true }, 'tv-video'), /khong hop le/);
});

test('sapo cat 500 ky tu; HTML duoc escape; bia URL tuyet doi khong ke thua', () => {
  const long = 'x'.repeat(600);
  const d = mapTvToDraft(
    { id: 'vi-2', title: 'A<script>alert(1)</script>', description: long, thumbnail: 'https://cdn.example/x.png', isVisible: true },
    'tv-video',
  );
  assert.equal(d.sapo.length, 500);
  assert.equal(d.coverPath, null);
  assert.doesNotMatch(d.body, /<script>/);
  assert.match(d.body, /&lt;script&gt;/);
});

test('relativeCover: chi nhan duong dan bat dau bang /', () => {
  assert.equal(relativeCover('/images/a.jpg'), '/images/a.jpg');
  assert.equal(relativeCover('  /images/b.png  '), '/images/b.png');
  assert.equal(relativeCover('https://cdn.example/a.png'), null);
  assert.equal(relativeCover('images/a.png'), null);
  assert.equal(relativeCover(null), null);
  assert.equal(relativeCover(undefined), null);
});

test('truncateSapo + issueTypeLabel', () => {
  assert.equal(truncateSapo('  abc  '), 'abc');
  assert.equal(truncateSapo(null), '');
  assert.equal(issueTypeLabel('vung_cao'), 'Vùng cao');
  assert.equal(issueTypeLabel('thuong'), 'Thường');
});

test('So bao da xuat ban -> nhap co tom tat, link /bao-in, sourceRef du so/loai', () => {
  const d = mapEpaperToDraft({
    publicId: '4bbdb72c2fd9115efd05ea10',
    title: 'Bao so 559',
    slug: 'bao-tuyen-quang-so-559-4bbdb72c2fd9115efd05ea10',
    issueNumber: 559,
    issueType: 'thuong',
    publishDate: '2026-10-29',
    coverPath: '/images/cover.jpg',
    status: 'published',
  });
  assert.equal(d.title, 'Bao so 559');
  assert.match(d.sapo, /số 559/);
  assert.match(d.body, /\/bao-in\/bao-tuyen-quang-so-559-4bbdb72c2fd9115efd05ea10/);
  assert.equal(d.coverPath, '/images/cover.jpg');
  assert.deepEqual(d.sourceRef, { type: 'epaper', id: '4bbdb72c2fd9115efd05ea10', title: 'Bao so 559', issueNumber: 559, issueType: 'thuong' });
});

test('So bao vung cao + khong ngay: tom tat dung, khong vo ngay', () => {
  const d = mapEpaperToDraft({
    publicId: 'ab'.repeat(12), title: 'So vung cao', slug: 'bao-tuyen-quang-so-558-abababababababababababab',
    issueNumber: 558, issueType: 'vung_cao', publishDate: null, coverPath: null, status: 'published',
  });
  assert.match(d.sapo, /Vùng cao/);
  assert.doesNotMatch(d.sapo, /ngày/);
});

test('So bao chua xuat ban / thieu tieu de -> throw (fail-closed)', () => {
  const base = {
    publicId: 'ab'.repeat(12), title: 'X', slug: 'bao-tuyen-quang-so-1-abababababababababababab',
    issueNumber: 1, issueType: 'thuong', publishDate: null, coverPath: null,
  };
  assert.throws(() => mapEpaperToDraft({ ...base, status: 'draft' }), /chua xuat ban/);
  assert.throws(() => mapEpaperToDraft({ ...base, status: 'pending_review' }), /chua xuat ban/);
  assert.throws(() => mapEpaperToDraft({ ...base, status: 'published', title: '' }), /tieu de/);
});

test('Goi 1C dot 2: normalizeAuthors trim/bo rong/dedupe/gioi han 10, thieu -> []', () => {
  assert.deepEqual(normalizeAuthors(undefined), []);
  assert.deepEqual(normalizeAuthors(null), []);
  assert.deepEqual(normalizeAuthors([]), []);
  assert.deepEqual(normalizeAuthors(['  Nguyen A  ', '', '   ', 'Nguyen A', 'Tran B']), ['Nguyen A', 'Tran B']);
  assert.equal(normalizeAuthors(Array.from({ length: 15 }, (_, i) => `TG${i}`)).length, 10);
});

test('Goi 1C dot 2: normalizeAuthors sai dang -> throw (service doi thanh 400)', () => {
  assert.throws(() => normalizeAuthors('Nguyen A'), /tac gia/);
  assert.throws(() => normalizeAuthors(['Nguyen A', 42]), /tac gia/);
  assert.throws(() => normalizeAuthors(123), /tac gia/);
});

test('Goi 1C dot 2: mapTvToDraft giu videoFileId vao sourceRef, thieu/rong thi khong co key', () => {
  const d = mapTvToDraft(
    { id: 'vi-9', title: 'V', description: '', thumbnail: null, isVisible: true, videoFileId: '  up-123 ' },
    'tv-video',
  );
  assert.equal(d.sourceRef.videoFileId, 'up-123');
  // DAM Proxy MP4: co videoFileId -> nhap video (khong con text nhu dot 1C).
  assert.equal(d.contentType, 'video');
  const d2 = mapTvToDraft({ id: 'vi-10', title: 'V', isVisible: true }, 'tv-video');
  assert.equal('videoFileId' in d2.sourceRef, false);
  assert.equal(d2.contentType, 'text');
  assert.equal('formatData' in d2, false);
  const d3 = mapTvToDraft({ id: 'vi-11', title: 'V', isVisible: true, videoFileId: '   ' }, 'tv-video');
  assert.equal('videoFileId' in d3.sourceRef, false);
  assert.equal(d3.contentType, 'text');
});

test('DAM Proxy MP4: co videoFileId -> nhap video + videoUrl la URL proxy tuyet doi', () => {
  const prev = process.env.PORTAL_PUBLIC_ORIGIN;
  delete process.env.PORTAL_PUBLIC_ORIGIN;
  try {
    const d = mapTvToDraft(
      { id: 'vi-20', title: 'V', description: '', thumbnail: null, isVisible: true, videoFileId: 'up-abc_1' },
      'tv-video',
    );
    assert.equal(d.contentType, 'video');
    assert.equal(d.formatData.videoUrl, 'https://tsht.vtctech.xyz/api/v2/media/up-abc_1/mp4');
    // URL tuyet doi di qua ca hai noi render nguyen ven (khong bi ghep origin).
    assert.equal(portalMp4Url('up-abc_1'), 'https://tsht.vtctech.xyz/api/v2/media/up-abc_1/mp4');
    process.env.PORTAL_PUBLIC_ORIGIN = 'https://portal.example/';
    assert.equal(portalMp4Url('up-abc_1'), 'https://portal.example/api/v2/media/up-abc_1/mp4');
  } finally {
    if (prev === undefined) delete process.env.PORTAL_PUBLIC_ORIGIN;
    else process.env.PORTAL_PUBLIC_ORIGIN = prev;
  }
});

test('DAM Proxy MP4: relativeCover ghep ten file anh tran thanh /images/<file>', () => {
  assert.equal(relativeCover('thumb-1.jpg'), '/images/thumb-1.jpg');
  assert.equal(relativeCover('  anh.PNG  '), '/images/anh.PNG');
  assert.equal(relativeCover('poster.webp'), '/images/poster.webp');
  // Khong phai anh, co slash, hoac URL tuyet doi thi van loai nhu cu.
  assert.equal(relativeCover('video.mp4'), null);
  assert.equal(relativeCover('images/a.png'), null);
  assert.equal(relativeCover('https://cdn.example/a.png'), null);
  assert.equal(relativeCover('..\\a.jpg'), null);
});

test('DAM Proxy MP4: thumbnail ten file tran duoc ke thua vao nhap video', () => {
  const d = mapTvToDraft(
    { id: 'vi-21', title: 'V', description: '', thumbnail: 'thumb-21.jpg', isVisible: true, videoFileId: 'up-21' },
    'tv-short',
  );
  assert.equal(d.coverPath, '/images/thumb-21.jpg');
  assert.equal(d.contentType, 'video');
});
