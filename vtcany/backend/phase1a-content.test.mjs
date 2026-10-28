// Test chuan hoa content_type (Dot 1a) — chay truc tiep bang node --test,
// khong can build (file .ts thuan, giong news-workflow.test.mjs).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CONTENT_TYPES, CONTENT_TYPE_LABELS, isContentType, normalizeContentType,
} from './src/modules/news/news-content.ts';

test('co dung 6 dinh dang: text, video, audio, gallery, infographic, emagazine', () => {
  assert.deepEqual([...CONTENT_TYPES], ['text', 'video', 'audio', 'gallery', 'infographic', 'emagazine']);
  for (const t of CONTENT_TYPES) assert.ok(CONTENT_TYPE_LABELS[t], `thieu label cho ${t}`);
});

test('thieu content_type -> mac dinh text (tuong thich nguoc bai cu)', () => {
  assert.equal(normalizeContentType(undefined), 'text');
  assert.equal(normalizeContentType(null), 'text');
  assert.equal(normalizeContentType(''), 'text');
  assert.equal(normalizeContentType('video'), 'video');
  assert.equal(normalizeContentType('emagazine'), 'emagazine');
});

test('content_type la bi reject (API phai tra 400, khong am tham ep ve text)', () => {
  assert.equal(isContentType('podcast'), false);
  assert.equal(isContentType('TEXT'), false);
  assert.throws(() => normalizeContentType('podcast'), /content_type khong hop le/);
  assert.throws(() => normalizeContentType(123), /content_type khong hop le/);
});
