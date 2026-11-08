// Test logic thuan cho goi "Binh luan dot 1" (thiet ke §6.1) — chay
// truc tiep bang node --test, khong can Prisma/DB:
//   node --test --import ./test-hooks-register.mjs comments-helpers.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  containsBannedWord,
  countCodePoints,
  findBannedWord,
  medianNumbers,
  medianReviewSeconds,
  normalizeForDuplicate,
  parseCleanupMetaRequest,
  sliceCodePoints,
  stripLinks,
} from './src/modules/comments/comments-helpers.ts';

test('countCodePoints: emoji = 1 code point, khong phai 2 nhu .length', () => {
  assert.equal(countCodePoints('a😀b'), 3);
  assert.equal('a😀b'.length, 4);
  assert.equal(countCodePoints(''), 0);
  assert.equal(countCodePoints('Tiếng Việt'), 10);
});

test('sliceCodePoints: khong cat giua surrogate pair', () => {
  assert.equal(sliceCodePoints('a😀b', 2), 'a😀');
  assert.equal(sliceCodePoints('abc', 10), 'abc');
});

test('stripLinks: loai https + www, giu chu con lai, bao linksRemoved', () => {
  const r = stripLinks('Xem thêm https://example.com/x nhé www.foo.vn/bar xong');
  assert.equal(r.linksRemoved, true);
  assert.equal(r.text, 'Xem thêm nhé xong');
  const clean = stripLinks('Bình luận bình thường, không link.');
  assert.equal(clean.linksRemoved, false);
  assert.equal(clean.text, 'Bình luận bình thường, không link.');
});

test('stripLinks: chi co link -> rong (service tra 400 comment_empty)', () => {
  const r = stripLinks('https://example.com/x');
  assert.equal(r.linksRemoved, true);
  assert.equal(r.text, '');
  const r2 = stripLinks('  www.a.vn  ');
  assert.equal(r2.text, '');
});

test('stripLinks: giu xuong dong, gom khoang trang thua', () => {
  const r = stripLinks('Dòng 1 https://x.vn\ndòng   2');
  assert.equal(r.text, 'Dòng 1\ndòng 2');
});

test('normalizeForDuplicate: trim + gop khoang trang + lowercase', () => {
  assert.equal(normalizeForDuplicate('  Hello   WORLD\nnew  line '), 'hello world new line');
  assert.equal(normalizeForDuplicate('TIN  HOT'), 'tin hot');
  assert.equal(normalizeForDuplicate(''), '');
});

test('findBannedWord/containsBannedWord: chuoi con, khong phan biet hoa/thuong', () => {
  const words = ['lừa đảo', 'XYZ'];
  assert.equal(findBannedWord('bài này lừa đảo nhé', words), 'lừa đảo');
  assert.equal(findBannedWord('toàn chữ xyz viết hoa', words), 'xyz');
  assert.equal(findBannedWord('không có gì', words), null);
  assert.equal(containsBannedWord('LỪA ĐẢO', words), true);
  assert.equal(containsBannedWord('lừa', words), false); // chi chuoi con cua TU CAM, khong nguoc lai
  assert.equal(containsBannedWord('bất cứ gì', []), false);
});

test('medianNumbers: le / chan / rong', () => {
  assert.equal(medianNumbers([30, 10, 20]), 20);
  assert.equal(medianNumbers([10, 20, 30, 40]), 25);
  assert.equal(medianNumbers([5]), 5);
  assert.equal(medianNumbers([]), null);
});

test('medianReviewSeconds: trung vi (moderatedAt - createdAt) theo giay', () => {
  const base = new Date('2026-11-08T00:00:00Z');
  const pairs = [
    { createdAt: base, moderatedAt: new Date(base.getTime() + 60_000) },
    { createdAt: base, moderatedAt: new Date(base.getTime() + 120_000) },
    { createdAt: base, moderatedAt: new Date(base.getTime() + 300_000) },
  ];
  assert.equal(medianReviewSeconds(pairs), 120);
  assert.equal(medianReviewSeconds([]), null);
  // Chua duyet (moderatedAt null) bi bo qua.
  assert.equal(medianReviewSeconds([{ createdAt: base, moderatedAt: null }]), null);
  assert.equal(
    medianReviewSeconds([
      { createdAt: base, moderatedAt: new Date(base.getTime() + 10_000) },
      { createdAt: base, moderatedAt: null },
      { createdAt: base, moderatedAt: new Date(base.getTime() + 30_000) },
    ]),
    20,
  );
});

test('parseCleanupMetaRequest: list/clear hop le + cac loi 400', () => {
  const list = parseCleanupMetaRequest({ op: 'list', cutoff: '2025-11-08T00:00:00.000Z' });
  assert.equal(list.op, 'list');
  assert.equal(list.cutoff.toISOString(), '2025-11-08T00:00:00.000Z');
  const clear = parseCleanupMetaRequest({ op: 'clear', ids: ['a', 'b'] });
  assert.equal(clear.op, 'clear');
  assert.deepEqual(clear.ids, ['a', 'b']);
  assert.deepEqual(parseCleanupMetaRequest({ op: 'clear', ids: [] }).ids, []);
  const throws = (body, code) => {
    assert.throws(() => parseCleanupMetaRequest(body), (e) => e.code === code && e.status === 400);
  };
  throws(null, 'bad_request');
  throws({}, 'invalid_op');
  throws({ op: 'x' }, 'invalid_op');
  throws({ op: 'list' }, 'invalid_cutoff');
  throws({ op: 'list', cutoff: 'khong-phai-ngay' }, 'invalid_cutoff');
  throws({ op: 'clear' }, 'invalid_ids');
  throws({ op: 'clear', ids: 'a' }, 'invalid_ids');
  throws({ op: 'clear', ids: ['a', 1] }, 'invalid_ids');
  throws({ op: 'clear', ids: [''] }, 'invalid_ids');
});
