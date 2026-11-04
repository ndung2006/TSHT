import test from 'node:test';
import assert from 'node:assert/strict';
import { typeFlags } from './news-content.ts';

test('gallery -> Tin anh, infographic -> Infographic', () => {
  assert.deepEqual(typeFlags('gallery'), { isPhoto: true, isInfographic: false });
  assert.deepEqual(typeFlags('infographic'), { isPhoto: false, isInfographic: true });
});

test('cac loai khac -> ca hai tat', () => {
  for (const t of ['text', 'video', 'audio', 'emagazine', undefined, null, '']) {
    assert.deepEqual(typeFlags(t), { isPhoto: false, isInfographic: false });
  }
});

test('loai la -> throw', () => {
  assert.throws(() => typeFlags('photo'), /content_type khong hop le/);
});
