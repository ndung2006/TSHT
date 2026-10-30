// Test anh bia luc luu — chay truc tiep bang node --test, khong can
// build/DB (fetch duoc stub bang buffer tai cho). Quy tac: vi tri anh
// trong body duoc uu tien — server chi chuan hoa URL anh trung byte ve
// URL bia, khong xoa anh khoi body.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  collectImgSrcs,
  isDefaultCoverCandidate,
  replaceImgSrcs,
  resolveCoverAndDedupe,
} from './cover-dedupe.ts';

const COVER = Buffer.from('cover-bytes-123');
const OTHER = Buffer.from('other-bytes-456');

test('collectImgSrcs: theo thu tu, bo trung, bo rong', () => {
  assert.deepEqual(
    collectImgSrcs('<p><img src="a.jpg"><img src="b.jpg"><img src="a.jpg"><img src=""></p>'),
    ['a.jpg', 'b.jpg'],
  );
});

test('isDefaultCoverCandidate: data: khong lam bia', () => {
  assert.equal(isDefaultCoverCandidate('data:image/png;base64,xxx'), false);
  assert.equal(isDefaultCoverCandidate('https://cdn.example/x.jpg'), true);
  assert.equal(isDefaultCoverCandidate('/images/x.jpg'), true);
});

test('replaceImgSrcs: chi doi src khop, giu nguyen caption va anh khac', () => {
  const body =
    '<p class="ql-align-center"><img src="goc.jpg" width="100%"><span>Chu thich anh</span></p>' +
    '<p><img src="keep.jpg"></p>';
  const out = replaceImgSrcs(body, new Set(['goc.jpg']), '/images/bia.jpg');
  assert.equal(out.replaced, 1);
  assert.match(out.html, /<img src="\/images\/bia.jpg" width="100%">/);
  assert.match(out.html, /Chu thich anh/);
  assert.match(out.html, /keep\.jpg/);
});

test('replaceImgSrcs: nhay don giu nguyen loai nhay', () => {
  const out = replaceImgSrcs("<p><img src='goc.jpg'></p>", new Set(['goc.jpg']), '/images/bia.jpg');
  assert.equal(out.html, "<p><img src='/images/bia.jpg'></p>");
});

test('resolve: anh body khac URL nhung trung byte voi bia thi doi src ve URL bia, giu vi tri', async () => {
  const fetchBytes = async (url) => {
    if (url === '/images/cover.jpg') return COVER;
    if (url === 'https://goc.example/dup.jpg') return COVER;
    if (url === 'https://goc.example/khac.jpg') return OTHER;
    return null;
  };
  const body =
    '<p>Doan mo dau.</p>' +
    '<p class="ql-align-center"><img src="https://goc.example/dup.jpg"><span>Chu thich</span></p>' +
    '<p><img src="https://goc.example/khac.jpg"></p>';
  const out = await resolveCoverAndDedupe(body, '/images/cover.jpg', fetchBytes);
  assert.equal(out.replacedCount, 1);
  assert.equal(out.defaultedCover, false);
  // Anh trung byte gio mang URL bia (client nhan ra de an hero), anh khac
  // va caption giu nguyen, thu tu khoi khong doi.
  assert.match(out.body, /<img src="\/images\/cover.jpg">/);
  assert.match(out.body, /Chu thich/);
  assert.match(out.body, /khac\.jpg/);
  assert.ok(out.body.indexOf('Doan mo dau') < out.body.indexOf('/images/cover.jpg'));
});

test('resolve: chua co bia -> lay anh dau body lam bia, khong can doi src', async () => {
  const fetchBytes = async (url) => (url.includes('sau.jpg') ? OTHER : COVER);
  const body =
    '<p class="ql-align-center"><img src="https://goc.example/dau.jpg"><span>Chu thich</span></p>' +
    '<p><img src="https://goc.example/sau.jpg"></p>';
  const out = await resolveCoverAndDedupe(body, null, fetchBytes);
  assert.equal(out.coverPath, 'https://goc.example/dau.jpg');
  assert.equal(out.defaultedCover, true);
  assert.equal(out.replacedCount, 0);
  assert.match(out.body, /dau\.jpg/);
});

test('resolve: bia mac dinh bo qua anh data: dau tien', async () => {
  const fetchBytes = async (url) => (url.startsWith('data:') ? OTHER : COVER);
  const body =
    '<p><img src="data:image/png;base64,AAA"></p>' +
    '<p><img src="/images/thu2.jpg"></p>';
  const out = await resolveCoverAndDedupe(body, '', fetchBytes);
  assert.equal(out.coverPath, '/images/thu2.jpg');
});

test('resolve: fetch bia loi -> fail-open, giu nguyen body', async () => {
  const fetchBytes = async () => null;
  const body = '<p><img src="https://goc.example/dup.jpg"></p>';
  const out = await resolveCoverAndDedupe(body, '/images/cover.jpg', fetchBytes);
  assert.equal(out.body, body);
  assert.equal(out.replacedCount, 0);
  assert.equal(out.coverPath, '/images/cover.jpg');
});

test('resolve: khong co anh body -> khong co bia mac dinh', async () => {
  const fetchBytes = async () => COVER;
  const out = await resolveCoverAndDedupe('<p>Chi co chu.</p>', null, fetchBytes);
  assert.equal(out.coverPath, null);
  assert.equal(out.replacedCount, 0);
});
