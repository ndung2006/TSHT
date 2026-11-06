// Test helper tim kiem tin bai (node --test, khong can DB/Nest).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_KEYWORD_LEN,
  buildSearchQuery,
  escapeLike,
  escapeRegExp,
  hasSearchInput,
  parseSearchQuery,
  phraseRegexPattern,
  splitWords,
  stripAccents,
  wordRegexPattern,
} from './news-search-rules.ts';

test('stripAccents: bo dau tieng Viet, đ→d', () => {
  assert.equal(stripAccents('Y tế'), 'Y te');
  assert.equal(stripAccents('Đà Nẵng'), 'Da Nang');
  assert.equal(stripAccents('Mường Nhé'), 'Muong Nhe');
  assert.equal(stripAccents('abc'), 'abc');
});

test('splitWords: tach theo khoang trang, bo khoang thua', () => {
  assert.deepEqual(splitWords('  y   te '), ['y', 'te']);
  assert.deepEqual(splitWords('y tế'), ['y', 'tế']);
  assert.deepEqual(splitWords(''), []);
});

test('escapeLike: escape \\, %, _', () => {
  assert.equal(escapeLike('100%_a\\b'), '100\\%\\_a\\\\b');
  assert.equal(escapeLike('y te'), 'y te');
});

test('escapeRegExp: escape ky tu dac biet cua regex Postgres', () => {
  assert.equal(escapeRegExp('c++'), 'c\\+\\+');
  assert.equal(escapeRegExp('a.b (x)'), 'a\\.b \\(x\\)');
  assert.equal(escapeRegExp('y te'), 'y te');
});

test('wordRegexPattern: tu thuong nguyen tu, tu cuoi tien to', () => {
  assert.equal(wordRegexPattern('y', false), '\\yy\\y');
  assert.equal(wordRegexPattern('te', true), '\\mte');
  assert.equal(wordRegexPattern('nghi', true), '\\mnghi');
  assert.equal(wordRegexPattern('c++', true), '\\mc\\+\\+');
});

test('phraseRegexPattern: cum lien nhau, tu noi bang \\s+', () => {
  assert.equal(phraseRegexPattern(['y', 'te']), '\\yy\\s+te\\y');
  assert.equal(phraseRegexPattern(['nghi', 'quyet']), '\\ynghi\\s+quyet\\y');
  assert.equal(phraseRegexPattern(['te']), '\\yte\\y');
});

test('parseSearchQuery: mac dinh khi khong co gi', () => {
  const p = parseSearchQuery({});
  assert.equal(p.scope, 'title-sapo');
  assert.equal(p.exact, false);
  assert.equal(p.sort, 'newest'); // Q4: khong tu khoa -> Mới nhất
  assert.equal(p.page, 1);
  assert.equal(p.limit, 20);
  assert.equal(p.q, undefined);
  assert.equal(hasSearchInput(p), false);
});

test('parseSearchQuery: co tu khoa -> sort mac dinh relevance', () => {
  const p = parseSearchQuery({ q: 'y te' });
  assert.equal(p.sort, 'relevance');
  assert.equal(hasSearchInput(p), true);
});

test('parseSearchQuery: tu khoa dai qua 200 ky tu -> throw', () => {
  const long = 'a'.repeat(MAX_KEYWORD_LEN + 1);
  assert.throws(() => parseSearchQuery({ q: long }), /toi da 200 ky tu/);
  assert.throws(() => parseSearchQuery({ q2: long }), /toi da 200 ky tu/);
  assert.equal(parseSearchQuery({ q: 'a'.repeat(MAX_KEYWORD_LEN) }).q?.length, MAX_KEYWORD_LEN);
});

test('parseSearchQuery: enum la -> throw', () => {
  assert.throws(() => parseSearchQuery({ scope: 'body' }), /scope khong hop le/);
  assert.throws(() => parseSearchQuery({ contentType: 'epaper' }), /content_type khong hop le/);
  assert.throws(() => parseSearchQuery({ sort: 'oldest' }), /sort khong hop le/);
  assert.throws(() => parseSearchQuery({ exact: '2' }), /exact khong hop le/);
  assert.equal(parseSearchQuery({ contentType: 'all' }).contentType, undefined);
  assert.equal(parseSearchQuery({ contentType: 'video' }).contentType, 'video');
  assert.equal(parseSearchQuery({ exact: '1' }).exact, true);
});

test('parseSearchQuery: ngay sai dinh dang / from > to -> throw', () => {
  assert.throws(() => parseSearchQuery({ from: '05/11/2026' }), /tu ngay khong hop le/);
  assert.throws(() => parseSearchQuery({ to: '2026-13-01' }), /den ngay khong hop le/);
  assert.throws(() => parseSearchQuery({ from: '2026-11-05', to: '2026-11-01' }), /tu ngay phai <= den ngay/);
  const p = parseSearchQuery({ from: '2026-11-01', to: '2026-11-05' });
  assert.equal(p.from, '2026-11-01');
  assert.equal(p.to, '2026-11-05');
});

test('parseSearchQuery: page/limit kep (limit toi da 20)', () => {
  assert.equal(parseSearchQuery({ page: '0' }).page, 1);
  assert.equal(parseSearchQuery({ limit: '99' }).limit, 20);
  assert.equal(parseSearchQuery({ limit: 'abc' }).limit, 20);
  assert.equal(parseSearchQuery({ page: '3', limit: '5' }).page, 3);
});

test('buildSearchQuery fuzzy: "y te" -> tu nguyen + tu cuoi tien to, khop khong dau', () => {
  const p = parseSearchQuery({ q: 'y te' });
  const { whereSql, orderSql, scoreSql, values } = buildSearchQuery(p, null);
  // 2 tu x 2 truong (title, sapo) = 4 dieu kien ~* (khong con LIKE); moi tu mot dieu kien AND.
  assert.equal((whereSql.match(/~\*/g) || []).length, 4);
  assert.doesNotMatch(whereSql, /LIKE/);
  assert.match(whereSql, /immutable_unaccent\(lower\(a\."title"\)\)/);
  assert.match(whereSql, /status = 'published'/);
  assert.match(whereSql, /a\."publish_at" <= now\(\)/);
  // Tu "y" khong phai tu cuoi -> nguyen tu '\yy\y'; tu "te" la tu cuoi -> tien to '\mte'.
  assert.deepEqual(values.slice(0, 4), ['\\yy\\y', '\\yy\\y', '\\mte', '\\mte']);
  // Diem relevance: similarity co trong so title > sapo > body + diem uu tien cum lien nhau.
  assert.match(scoreSql, /3 \* similarity/);
  assert.match(scoreSql, /1\.5 \* similarity/);
  assert.match(scoreSql, /0\.5 \* similarity/);
  assert.match(scoreSql, /CASE WHEN .* ~\* .* THEN 10 ELSE 0 END/);
  assert.match(scoreSql, /CASE WHEN .* ~\* .* THEN 5 ELSE 0 END/);
  assert.match(scoreSql, /CASE WHEN .* ~\* .* THEN 2 ELSE 0 END/);
  // 3 gia tri pattern cum lien nhau (duoc sinh truoc) + 3 gia tri similarity (qNorm).
  assert.deepEqual(values.slice(4, 7), ['\\yy\\s+te\\y', '\\yy\\s+te\\y', '\\yy\\s+te\\y']);
  assert.deepEqual(values.slice(7), ['y te', 'y te', 'y te']);
  assert.match(orderSql, /ORDER BY score DESC, a\."publish_at" DESC/);
});

test('buildSearchQuery fuzzy: tu duy nhat cung la tu cuoi -> khop tien to', () => {
  const p = parseSearchQuery({ q: 'nghi' });
  const { whereSql, values } = buildSearchQuery(p, null);
  assert.equal((whereSql.match(/~\*/g) || []).length, 2);
  assert.deepEqual(values.slice(0, 2), ['\\mnghi', '\\mnghi']);
});

test('buildSearchQuery fuzzy: tu khoa co ky tu regex -> pattern duoc escape', () => {
  const p = parseSearchQuery({ q: 'c++' });
  const { values } = buildSearchQuery(p, null);
  assert.deepEqual(values.slice(0, 2), ['\\mc\\+\\+', '\\mc\\+\\+']);
});

test('buildSearchQuery exact: "y te" giu dau, dung cum tu', () => {
  const p = parseSearchQuery({ q: 'y te', exact: '1' });
  const { whereSql, values } = buildSearchQuery(p, null);
  assert.doesNotMatch(whereSql, /immutable_unaccent/);
  assert.match(whereSql, /lower\(a\."title"\) LIKE/);
  assert.deepEqual(values.slice(0, 2), ['%y te%', '%y te%']);
});

test('buildSearchQuery: q2 AND voi q; scope all tim ca body', () => {
  const p = parseSearchQuery({ q: 'y te', q2: 'ha noi', scope: 'all' });
  const { whereSql, values } = buildSearchQuery(p, null);
  assert.match(whereSql, /regexp_replace\(a\."body"/);
  // 4 tu x 3 truong = 12 dieu kien ~*.
  assert.equal((whereSql.match(/~\*/g) || []).length, 12);
  assert.ok(values.includes('\\yha\\y') && values.includes('\\mnoi'));
});

test('buildSearchQuery: khong tu khoa + loc chuyen muc -> newest, diem 0', () => {
  const p = parseSearchQuery({ category: 'chinh-tri' });
  const { whereSql, orderSql, scoreSql, values } = buildSearchQuery(p, ['cat-1', 'cat-2']);
  assert.match(whereSql, /a\."category_id" IN \(\$1, \$2\)/);
  assert.deepEqual(values.slice(0, 2), ['cat-1', 'cat-2']);
  assert.equal(scoreSql, '0');
  assert.match(orderSql, /ORDER BY a\."publish_at" DESC/);
  assert.equal(hasSearchInput(p), true);
});

test('buildSearchQuery: loc ngay dung vnDayRange (gio VN, khong phai UTC)', () => {
  const p = parseSearchQuery({ from: '2026-11-05', to: '2026-11-05' });
  const { whereSql, values } = buildSearchQuery(p, null);
  assert.match(whereSql, /a\."publish_at" >= \$\d+/);
  assert.match(whereSql, /a\."publish_at" < \$\d+/);
  // Ngay VN 05/11 = 04/11 17:00 UTC -> 05/11 17:00 UTC.
  assert.equal(values[0].toISOString(), '2026-11-04T17:00:00.000Z');
  assert.equal(values[1].toISOString(), '2026-11-05T17:00:00.000Z');
});

test('buildSearchQuery: loc contentType + sort newest khi chi dinh', () => {
  const p = parseSearchQuery({ q: 'y te', contentType: 'video', sort: 'newest' });
  const { whereSql, orderSql, scoreSql } = buildSearchQuery(p, null);
  assert.match(whereSql, /a\."content_type" = \$/);
  assert.match(orderSql, /ORDER BY a\."publish_at" DESC/);
  assert.equal(scoreSql, '0');
});
