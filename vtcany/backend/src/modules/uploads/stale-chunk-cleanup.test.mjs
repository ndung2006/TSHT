// Test helper endpoint don chunk do dang (node --test, chay truc tiep file
// .ts nho Node 24 type-stripping — giong phase1a-media.test.mjs).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  STALE_CHUNK_FAIL_MESSAGE,
  STALE_CHUNK_FAIL_MAX_IDS,
  parseStaleChunkFailRequest,
} from './stale-chunk-cleanup.ts';

describe('parseStaleChunkFailRequest', () => {
  it('nhan { op: fail, ids } hop le', () => {
    assert.deepEqual(parseStaleChunkFailRequest({ op: 'fail', ids: ['upl-1', 'upl-2'] }), {
      op: 'fail',
      ids: ['upl-1', 'upl-2'],
    });
  });

  it('nhan mang rong (worker khong co id cu van goi duoc, backend tra failed=0)', () => {
    assert.deepEqual(parseStaleChunkFailRequest({ op: 'fail', ids: [] }), { op: 'fail', ids: [] });
  });

  it('body khong phai object -> 400', () => {
    assert.throws(() => parseStaleChunkFailRequest(null), (e) => e.status === 400 && e.code === 'bad_request');
    assert.throws(() => parseStaleChunkFailRequest('fail'), (e) => e.status === 400);
  });

  it("op khac 'fail' -> 400 (khong co op 'list': worker da loc xong o dia)", () => {
    assert.throws(() => parseStaleChunkFailRequest({ op: 'list', ids: [] }), (e) => e.status === 400 && e.code === 'invalid_op');
    assert.throws(() => parseStaleChunkFailRequest({ ids: [] }), (e) => e.status === 400);
  });

  it('ids khong phai mang / co phan tu khong phai chuoi / qua gioi han -> 400', () => {
    assert.throws(() => parseStaleChunkFailRequest({ op: 'fail', ids: 'upl-1' }), (e) => e.code === 'invalid_ids');
    assert.throws(() => parseStaleChunkFailRequest({ op: 'fail', ids: ['upl-1', 42] }), (e) => e.code === 'invalid_ids');
    assert.throws(() => parseStaleChunkFailRequest({ op: 'fail', ids: [''] }), (e) => e.code === 'invalid_ids');
    const tooMany = Array.from({ length: STALE_CHUNK_FAIL_MAX_IDS + 1 }, (_, i) => `upl-${i}`);
    assert.throws(() => parseStaleChunkFailRequest({ op: 'fail', ids: tooMany }), (e) => e.code === 'invalid_ids');
  });
});

describe('STALE_CHUNK_FAIL_MESSAGE', () => {
  it('dung cau da dung khi xu ly tay ban ghi upl-1793694716358 ngay 09/11', () => {
    assert.equal(STALE_CHUNK_FAIL_MESSAGE, 'Tải lên dở dang quá 24 giờ, đã hủy');
  });
});
