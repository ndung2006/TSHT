// Test helper bat buoc chuyen muc khi xuat ban (E2) — node --test, khong can DB/Nest.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PUBLISH_WITHOUT_CATEGORY_MESSAGE, publishCategoryError } from './news-publish-rules.ts';

test('publishCategoryError: null/undefined/"" -> "Chọn chuyên mục"', () => {
  assert.equal(publishCategoryError(null), 'Chọn chuyên mục');
  assert.equal(publishCategoryError(undefined), 'Chọn chuyên mục');
  assert.equal(publishCategoryError(''), 'Chọn chuyên mục');
});

test('publishCategoryError: co categoryId -> null (duoc xuat ban)', () => {
  assert.equal(publishCategoryError('cat-abc123'), null);
});

test('PUBLISH_WITHOUT_CATEGORY_MESSAGE: dung cau bao loi', () => {
  assert.equal(PUBLISH_WITHOUT_CATEGORY_MESSAGE, 'Chọn chuyên mục');
});
