// Test validate bo thu pageview (Dot 1a) — file .ts thuan, node --test truc tiep.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isBotUserAgent, normalizePageViewInput } from './src/modules/news/pageview-input.ts';

test('chi co articlePublicId -> path mac dinh rong', () => {
  assert.deepEqual(
    normalizePageViewInput({ articlePublicId: 'abc123' }),
    { articlePublicId: 'abc123', path: '', sessionId: null },
  );
});

test('chi co path -> articlePublicId null', () => {
  assert.deepEqual(
    normalizePageViewInput({ path: '/tin-bai/xyz' }),
    { articlePublicId: null, path: '/tin-bai/xyz', sessionId: null },
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
  assert.deepEqual(Object.keys(out).sort(), ['articlePublicId', 'path', 'sessionId']);
});

test('sessionId duoc nhan, cat o 128 ky tu; thieu thi null', () => {
  const out = normalizePageViewInput({ articlePublicId: 'a', sessionId: `s${'x'.repeat(200)}` });
  assert.equal(out.sessionId.length, 128);
  assert.equal(normalizePageViewInput({ path: '/p' }).sessionId, null);
  assert.equal(normalizePageViewInput({ path: '/p', sessionId: 123 }).sessionId, null);
});

test('loc UA bot/crawler/cong cu quet, khong chan trinh duyet that', () => {
  for (const ua of [
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'facebookexternalhit/1.1',
    'curl/8.0',
    'python-requests/2.31',
    'Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/120.0',
    'SomeRobot/1.0',
  ]) assert.equal(isBotUserAgent(ua), true, ua);
  for (const ua of [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    '',
    null,
    undefined,
    123,
  ]) assert.equal(isBotUserAgent(ua), false, String(ua));
});
