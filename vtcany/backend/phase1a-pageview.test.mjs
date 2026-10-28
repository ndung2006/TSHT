// Test validate bo thu pageview (Dot 1a) — file .ts thuan, node --test truc tiep.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizePageViewInput } from './src/modules/news/pageview-input.ts';

test('chi co articlePublicId -> path mac dinh rong', () => {
  assert.deepEqual(
    normalizePageViewInput({ articlePublicId: 'abc123' }),
    { articlePublicId: 'abc123', path: '' },
  );
});

test('chi co path -> articlePublicId null', () => {
  assert.deepEqual(
    normalizePageViewInput({ path: '/tin-bai/xyz' }),
    { articlePublicId: null, path: '/tin-bai/xyz' },
  );
});

test('ca 2 rong/thieu -> throw (API phai tra 400)', () => {
  assert.throws(() => normalizePageViewInput({}), /articlePublicId hoac path/);
  assert.throws(() => normalizePageViewInput({ articlePublicId: '   ', path: '' }), /articlePublicId hoac path/);
  assert.throws(() => normalizePageViewInput({ articlePublicId: 123 }), /articlePublicId hoac path/);
});

test('trim khoang trang va cat ngan qua 500 ky tu (chong lam dung co ban)', () => {
  const out = normalizePageViewInput({ articlePublicId: '  abc  ', path: `/${'x'.repeat(600)}` });
  assert.equal(out.articlePublicId, 'abc');
  assert.equal(out.path.length, 500);
});

test('khong nhan them truong rieng tu (IP/user-agent/user id bi loai bo)', () => {
  const out = normalizePageViewInput({ articlePublicId: 'a', path: '/p', ip: '1.2.3.4', userAgent: 'bot', userId: 'u1' });
  assert.deepEqual(Object.keys(out).sort(), ['articlePublicId', 'path']);
});
