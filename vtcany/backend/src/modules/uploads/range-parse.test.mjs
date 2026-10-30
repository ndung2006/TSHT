// Test parse Range header cho DAM Proxy MP4. Chay truc tiep bang node --test,
// khong can build (Node strip type cua file .ts thuan).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseRangeHeader } from './range-parse.ts';

const SIZE = 1000;

test('Range co ban: doan dau, doan mo, clamp ve cuoi file', () => {
  assert.deepEqual(parseRangeHeader('bytes=0-99', SIZE), { start: 0, end: 99 });
  assert.deepEqual(parseRangeHeader('bytes=900-', SIZE), { start: 900, end: 999 });
  assert.deepEqual(parseRangeHeader('bytes=0-9999', SIZE), { start: 0, end: 999 });
  assert.deepEqual(parseRangeHeader('bytes=0-999', SIZE), { start: 0, end: 999 });
});

test('Range suffix: N byte cuoi, qua file thi lay toan file', () => {
  assert.deepEqual(parseRangeHeader('bytes=-100', SIZE), { start: 900, end: 999 });
  assert.deepEqual(parseRangeHeader('bytes=-1000', SIZE), { start: 0, end: 999 });
  assert.deepEqual(parseRangeHeader('bytes=-5000', SIZE), { start: 0, end: 999 });
});

test('Range khong thoa man -> null (controller doi thanh 416)', () => {
  assert.equal(parseRangeHeader('bytes=1000-', SIZE), null);
  assert.equal(parseRangeHeader('bytes=1500-2000', SIZE), null);
  assert.equal(parseRangeHeader('bytes=500-100', SIZE), null);
  assert.equal(parseRangeHeader('bytes=-0', SIZE), null);
  assert.equal(parseRangeHeader('bytes=-', SIZE), null);
  assert.equal(parseRangeHeader('bytes=0-99,200-299', SIZE), null);
  assert.equal(parseRangeHeader('items=0-99', SIZE), null);
  assert.equal(parseRangeHeader('bytes=abc-def', SIZE), null);
  assert.equal(parseRangeHeader('', SIZE), null);
  assert.equal(parseRangeHeader(undefined, SIZE), null);
  assert.equal(parseRangeHeader('bytes=0-99', 0), null);
});
