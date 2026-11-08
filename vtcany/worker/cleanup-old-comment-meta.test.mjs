import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanupOldCommentMeta,
  createHttpCommentMetaStore,
  staleCommentMetaCutoff,
  COMMENT_META_RETENTION_MS,
} from './dist/cleanup-old-comment-meta.js';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-11-08T10:00:00.000Z');

function row(id, ageDays, ip = '1.2.3.4', userAgent = 'Mozilla/5.0') {
  return { id, createdAt: new Date(NOW.getTime() - ageDays * DAY), ip, userAgent };
}

// Store gia: ghi lai ids duoc clear, khong can DB that.
function fakeStore(rows, clearedIds = []) {
  return {
    rows,
    clearedIds,
    findCalls: [],
    async findStale(cutoff) {
      this.findCalls.push(cutoff);
      return this.rows;
    },
    async clearMeta(ids) {
      this.clearedIds.push(...ids);
      return ids.length;
    },
  };
}

test('chi don comment cu hon 12 thang va co ip; comment moi / ip null / dung moc duoc giu', async () => {
  const store = fakeStore([
    row('cu-co-ip', 400), // > 365 ngay, co ip -> don
    row('cu-ip-null', 400, null), // cu nhung ip da null -> khong don
    row('moi-co-ip', 10), // moi -> khong don
    row('dung-moc', 365), // createdAt == cutoff (dieu kien <) -> khong don
    row('sao-moc-1s', 365, '9.9.9.9'), // placeholder, se sua createdAt xuong 1s sau moc
  ]);
  // Dat createdAt cua row cuoi = cutoff + 1s (1s sau moc 12 thang).
  store.rows[4].createdAt = new Date(staleCommentMetaCutoff(NOW).getTime() + 1000);
  const r = await cleanupOldCommentMeta(store, NOW);
  assert.deepEqual(r, { checked: 1, cleared: 1 });
  assert.deepEqual(store.clearedIds, ['cu-co-ip']);
  // Cutoff truyen cho store dung = now - 12 thang.
  assert.equal(store.findCalls.length, 1);
  assert.equal(store.findCalls[0].getTime(), NOW.getTime() - COMMENT_META_RETENTION_MS);
});

test('khong co row cu -> khong goi clearMeta, tra 0/0', async () => {
  const store = fakeStore([row('moi', 30)]);
  let clearCalled = false;
  store.clearMeta = async () => {
    clearCalled = true;
    return 0;
  };
  assert.deepEqual(await cleanupOldCommentMeta(store, NOW), { checked: 0, cleared: 0 });
  assert.equal(clearCalled, false);
});

test('store tra thua row (tuoi hoac ip null) -> pure function loc lai, khong don nham', async () => {
  const store = fakeStore([
    row('that-cu', 500),
    row('thua-tuoi', 5), // store tra thua: moi nhung van co trong list
    row('thua-ip-null', 500, null), // store tra thua: cu nhung ip null
  ]);
  const r = await cleanupOldCommentMeta(store, NOW);
  assert.deepEqual(r, { checked: 1, cleared: 1 });
  assert.deepEqual(store.clearedIds, ['that-cu']);
});

test('userAgent null nhung ip con -> van don (ca 2 ve null o backend)', async () => {
  const store = fakeStore([row('chi-ip', 400, '5.6.7.8', null)]);
  assert.deepEqual(await cleanupOldCommentMeta(store, NOW), { checked: 1, cleared: 1 });
  assert.deepEqual(store.clearedIds, ['chi-ip']);
});

test('createdAt dang chuoi ISO cung xu ly dung', async () => {
  const store = fakeStore([
    { id: 'iso-cu', createdAt: new Date(NOW.getTime() - 400 * DAY).toISOString(), ip: '1.1.1.1', userAgent: null },
  ]);
  assert.deepEqual(await cleanupOldCommentMeta(store, NOW), { checked: 1, cleared: 1 });
});

test('HTTP store: list tra rows day du, clear goi dung ids; loi HTTP nem ra cho caller log', async () => {
  const calls = [];
  const fetchStub = async (url, opts) => {
    calls.push({ url, body: JSON.parse(opts.body), secret: opts.headers['x-webhook-secret'] });
    if (calls.length === 1) {
      return {
        ok: true,
        json: async () => ({
          rows: [{ id: 'a', createdAt: '2025-10-01T00:00:00.000Z', ip: '1.2.3.4', userAgent: 'UA' }],
        }),
      };
    }
    return { ok: true, json: async () => ({ cleared: 1 }) };
  };
  const store = createHttpCommentMetaStore('http://backend:3001/api/v1/', 's3cret', fetchStub);
  const r = await cleanupOldCommentMeta(store, NOW);
  assert.deepEqual(r, { checked: 1, cleared: 1 });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, 'http://backend:3001/api/v1/internal/cleanup-old-comment-meta');
  assert.equal(calls[0].body.op, 'list');
  assert.equal(calls[0].body.cutoff, new Date(NOW.getTime() - COMMENT_META_RETENTION_MS).toISOString());
  assert.equal(calls[0].secret, 's3cret');
  assert.deepEqual(calls[1].body, { op: 'clear', ids: ['a'] });

  // Endpoint chua co (404) -> nem loi, index.ts se log + bo qua chu ky nay.
  const failing = createHttpCommentMetaStore('http://backend:3001/api/v1', '', async () => ({ ok: false, status: 404 }));
  await assert.rejects(() => cleanupOldCommentMeta(failing, NOW), /404/);
});
