// Test dedupe anh bia phia server — chay truc tiep bang node --test,
// khong can build/DB (fetch duoc stub bang buffer tai cho).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  collectImgSrcs,
  isDefaultCoverCandidate,
  resolveCoverAndDedupe,
  stripImgsBySrc,
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

test('strip: khoi anh can giua + caption ngan bi bo ca khoi', () => {
  const body =
    '<p class="ql-align-center"><img src="dup.jpg"><span>Chu thich anh</span></p>' +
    '<p>Noi dung that o day.</p>';
  const out = stripImgsBySrc(body, new Set(['dup.jpg']));
  assert.equal(out.removed, 1);
  assert.equal(out.html, '<p>Noi dung that o day.</p>');
});

test('strip: doan van xuoi dai giu lai chu, chi bo anh', () => {
  const body =
    '<p>Day la mot doan van dai noi ve su kien dien ra trong ngay, co chen ' +
    'anh minh hoa o giua doan <img src="dup.jpg"> va van tiep tuc sau anh.</p>';
  const out = stripImgsBySrc(body, new Set(['dup.jpg']));
  assert.equal(out.removed, 1);
  assert.match(out.html, /Day la mot doan van dai/);
  assert.doesNotMatch(out.html, /dup\.jpg/);
});

test('strip: figure chi con figcaption thi bo ca figure, anh khac giu', () => {
  const body =
    '<figure><img src="dup.jpg"><figcaption>Chu thich</figcaption></figure>' +
    '<p><img src="keep.jpg"></p>';
  const out = stripImgsBySrc(body, new Set(['dup.jpg']));
  assert.equal(out.removed, 1);
  assert.equal(out.html, '<p><img src="keep.jpg"></p>');
});

test('strip: anh ngoai khoi chi bo the img', () => {
  const out = stripImgsBySrc('<img src="dup.jpg">hello', new Set(['dup.jpg']));
  assert.equal(out.html, 'hello');
});

test('resolve: anh body khac URL nhung trung byte voi bia thi bi bo', async () => {
  const fetchBytes = async (url) => {
    if (url === '/images/cover.jpg') return COVER;
    if (url === 'https://goc.example/dup.jpg') return COVER;
    if (url === 'https://goc.example/khac.jpg') return OTHER;
    return null;
  };
  const body =
    '<p><img src="https://goc.example/dup.jpg"></p>' +
    '<p><img src="https://goc.example/khac.jpg"></p>';
  const out = await resolveCoverAndDedupe(body, '/images/cover.jpg', fetchBytes);
  assert.equal(out.removedCount, 1);
  assert.equal(out.defaultedCover, false);
  assert.doesNotMatch(out.body, /dup\.jpg/);
  assert.match(out.body, /khac\.jpg/);
});

test('resolve: chua co bia -> lay anh dau body lam bia, roi bo no khoi body', async () => {
  const fetchBytes = async (url) => (url.includes('sau.jpg') ? OTHER : COVER);
  const body =
    '<p class="ql-align-center"><img src="https://goc.example/dau.jpg"><span>Chu thich</span></p>' +
    '<p><img src="https://goc.example/sau.jpg"></p>';
  const out = await resolveCoverAndDedupe(body, null, fetchBytes);
  assert.equal(out.coverPath, 'https://goc.example/dau.jpg');
  assert.equal(out.defaultedCover, true);
  assert.equal(out.removedCount, 1);
  assert.doesNotMatch(out.body, /dau\.jpg/);
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
  assert.equal(out.removedCount, 0);
  assert.equal(out.coverPath, '/images/cover.jpg');
});

test('resolve: khong co anh body -> khong co bia mac dinh', async () => {
  const fetchBytes = async () => COVER;
  const out = await resolveCoverAndDedupe('<p>Chi co chu.</p>', null, fetchBytes);
  assert.equal(out.coverPath, null);
  assert.equal(out.removedCount, 0);
});
