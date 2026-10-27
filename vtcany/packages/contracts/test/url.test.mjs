import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildPublicUrl, parseSlugId, isValidSlugId } from '../src/url.ts';

describe('url slug-24hex (Bước 3)', () => {
  it('buildPublicUrl đúng dạng /{type}/{slug}-{24hex}', () => {
    assert.equal(
      buildPublicUrl('phim', 'Thâm Tình', '6925687120dd0e58b0facba3'),
      '/phim/tham-tinh-6925687120dd0e58b0facba3',
    );
    assert.equal(
      buildPublicUrl('danh-muc', 'KICK-OFF THỂ THAO', '696891e96f1d98f16f5f7af2'),
      '/danh-muc/kick-off-the-thao-696891e96f1d98f16f5f7af2',
    );
  });

  it('từ chối public_id sai format', () => {
    assert.throws(() => buildPublicUrl('phim', 'x', 'abc'));
    assert.throws(() => buildPublicUrl('phim', '   ', '6925687120dd0e58b0facba3'));
  });

  it('parseSlugId tách slug + public_id', () => {
    assert.deepEqual(parseSlugId('tham-tinh-6925687120dd0e58b0facba3'), {
      slug: 'tham-tinh',
      publicId: '6925687120dd0e58b0facba3',
    });
    assert.ok(isValidSlugId('/phim/tham-tinh-6925687120dd0e58b0facba3'));
    assert.ok(!isValidSlugId('tham-tinh-xyz'));
    assert.throws(() => parseSlugId('no-id-here'));
  });
});
