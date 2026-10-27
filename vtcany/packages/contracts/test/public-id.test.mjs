import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generatePublicId, isValidPublicId, slugify, buildPublicUrl, parseSlugId } from '../src/public-id.ts';

describe('public_id 24hex (Bước 1)', () => {
  it('sinh đúng 24 ký tự hex', () => {
    const id = generatePublicId();
    assert.match(id, /^[0-9a-f]{24}$/);
  });

  it('1000 lần không trùng', () => {
    const set = new Set();
    for (let i = 0; i < 1000; i++) set.add(generatePublicId());
    assert.equal(set.size, 1000);
  });

  it('validate + slugify tiếng Việt', () => {
    assert.equal(isValidPublicId('6925687120dd0e58b0facba3'), true);
    assert.equal(isValidPublicId('xyz'), false);
    assert.equal(slugify('Thâm Tình'), 'tham-tinh');
    assert.equal(slugify('KICK - OFF Thể thao | 29/09/2026'), 'kick-off-the-thao-29-09-2026');
  });

  it('build/parse URL slug-24hex', () => {
    const url = buildPublicUrl('phim', 'Thâm Tình', '6925687120dd0e58b0facba3');
    assert.equal(url, '/phim/tham-tinh-6925687120dd0e58b0facba3');
    const p = parseSlugId('tham-tinh-6925687120dd0e58b0facba3');
    assert.deepEqual(p, { slug: 'tham-tinh', publicId: '6925687120dd0e58b0facba3' });
  });
});
