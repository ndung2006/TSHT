// Test helper bien the anh E1 (node --test, khong can DB/Nest/sharp).
// Chay: node --test --import=./test-hooks-register.mjs src/modules/uploads/image-variants.test.mjs
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import {
  IMAGE_VARIANT_WIDTHS,
  buildSrcset,
  coverSrcset,
  existingVariantWidths,
  parseLocalImageUrl,
  variantFileName,
} from './image-variants.ts';

describe('variantFileName', () => {
  test('ten theo quy uoc /images/<id>-<w>.<ext>', () => {
    assert.equal(variantFileName('img-abc123', 'jpg', 1920), 'img-abc123-1920.jpg');
    assert.equal(variantFileName('img-abc123', 'png', 400), 'img-abc123-400.png');
  });
});

describe('parseLocalImageUrl', () => {
  test('URL tuong doi /images/...', () => {
    assert.deepEqual(parseLocalImageUrl('/images/img-abc123.jpg'), { id: 'img-abc123', ext: 'jpg' });
    assert.deepEqual(parseLocalImageUrl('/images/img-abc123.PNG'), { id: 'img-abc123', ext: 'png' });
  });
  test('URL tuyet doi -> null (ke ca cung goc API: khong phan biet duoc CDN ngoai)', () => {
    assert.equal(parseLocalImageUrl('https://vtcany-api.vtctech.xyz/images/img-x1.webp'), null);
  });
  test('URL ngoai / data: / protocol-relative -> null (khong sinh srcset)', () => {
    assert.equal(parseLocalImageUrl('https://media-dienbien.baodienbienphu.vn/IMG3237.jpg'), null);
    assert.equal(parseLocalImageUrl('https://example.com/images/img-x.jpg'), null);
    assert.equal(parseLocalImageUrl('data:image/jpeg;base64,/9j/'), null);
    assert.equal(parseLocalImageUrl('//cdn.example.com/images/img-x.jpg'), null);
    assert.equal(parseLocalImageUrl(null), null);
    assert.equal(parseLocalImageUrl('/images/img-x.jpg?v=1'), null);
  });
});

describe('buildSrcset', () => {
  test('3 co, giu dang URL goc', () => {
    assert.equal(
      buildSrcset('/images/img-abc123.jpg', [1920, 800, 400]),
      '/images/img-abc123-1920.jpg 1920w, /images/img-abc123-800.jpg 800w, /images/img-abc123-400.jpg 400w',
    );
    assert.equal(buildSrcset('/images/img-abc123.jpg', [800, 400]), '/images/img-abc123-800.jpg 800w, /images/img-abc123-400.jpg 400w');
  });
  test('khong co co nao / URL ngoai -> null (dung src goc)', () => {
    assert.equal(buildSrcset('/images/img-abc123.jpg', []), null);
    assert.equal(buildSrcset('https://media-dienbien.baodienbienphu.vn/IMG3237.jpg', [1920, 800]), null);
  });
});

describe('existingVariantWidths + coverSrcset (dia tam)', () => {
  test('chi tra co da co file; gif khong co bien the', () => {
    const dir = mkdtempSync(join(tmpdir(), 'imgvar-'));
    try {
      writeFileSync(join(dir, 'img-a-1920.jpg'), '');
      writeFileSync(join(dir, 'img-a-400.jpg'), '');
      assert.deepEqual(existingVariantWidths(dir, '/images/img-a.jpg'), [1920, 400]);
      assert.deepEqual(existingVariantWidths(dir, '/images/img-b.jpg'), []);
      assert.deepEqual(existingVariantWidths(dir, '/images/img-a.gif'), []);
      assert.equal(
        coverSrcset('/images/img-a.jpg', dir),
        '/images/img-a-1920.jpg 1920w, /images/img-a-400.jpg 400w',
      );
      assert.equal(coverSrcset('/images/img-b.jpg', dir), null);
      assert.equal(coverSrcset(null, dir), null);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  test('IMAGE_VARIANT_WIDTHS la 1920/800/400', () => {
    assert.deepEqual([...IMAGE_VARIANT_WIDTHS], [1920, 800, 400]);
  });
});
