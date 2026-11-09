// Test job don chunk do dang cua transcode-worker live (node --test).
// Dung thu muc tam: khong dong vao storage that, khong can backend that
// (goi backend duoc stub bang fetch gia).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  STALE_CHUNK_MAX_AGE_MS,
  cleanupStaleChunks,
  postStaleChunkFail,
  runStaleChunkCleanup,
  shouldCallChunkCleanup,
} from './transcode-worker.mjs';

const HOUR = 3600000;
const NOW = Date.now();
const OLD = NOW - 25 * HOUR; // qua 24h -> do dang
const FRESH = NOW - 1 * HOUR; // dang chay / moi -> khong cham

function setupRaw() {
  const root = mkdtempSync(join(tmpdir(), 'vtc-chunk-'));
  const raw = join(root, 'raw');
  mkdirSync(raw, { recursive: true });
  return { root, raw };
}

function mkChunkDir(raw, id, files, mtimeMs) {
  const dir = join(raw, id);
  mkdirSync(dir, { recursive: true });
  for (const [name, size] of files) {
    const p = join(dir, name);
    writeFileSync(p, Buffer.alloc(size, 7));
    utimesSync(p, new Date(mtimeMs), new Date(mtimeMs));
  }
  utimesSync(dir, new Date(mtimeMs), new Date(mtimeMs));
  return dir;
}

describe('cleanupStaleChunks', () => {
  it('don thu muc chunk cu >24h, tra du checked/removed/bytesFreed/staleIds', () => {
    const { root, raw } = setupRaw();
    try {
      mkChunkDir(raw, 'upl-old1', [['chunk-0', 100], ['chunk-1', 50]], OLD);
      mkChunkDir(raw, 'upl-old2', [['chunk-0', 200]], OLD);
      const r = cleanupStaleChunks(root, STALE_CHUNK_MAX_AGE_MS, NOW);
      assert.equal(r.checked, 2);
      assert.equal(r.removed, 2);
      assert.equal(r.bytesFreed, 350);
      assert.deepEqual(r.staleIds.sort(), ['upl-old1', 'upl-old2']);
      assert.equal(existsSync(join(raw, 'upl-old1')), false);
      assert.equal(existsSync(join(raw, 'upl-old2')), false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('khong cham upload dang chay (chunk moi <24h)', () => {
    const { root, raw } = setupRaw();
    try {
      const dir = mkChunkDir(raw, 'upl-fresh', [['chunk-0', 100]], FRESH);
      const r = cleanupStaleChunks(root, STALE_CHUNK_MAX_AGE_MS, NOW);
      assert.deepEqual(r, { checked: 1, removed: 0, bytesFreed: 0, staleIds: [] });
      assert.equal(existsSync(join(dir, 'chunk-0')), true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('thu muc rong cu >24h: xoa thu muc, tinh vao staleIds, bytesFreed=0', () => {
    const { root, raw } = setupRaw();
    try {
      const dir = join(raw, 'upl-empty');
      mkdirSync(dir, { recursive: true });
      utimesSync(dir, new Date(OLD), new Date(OLD));
      const r = cleanupStaleChunks(root, STALE_CHUNK_MAX_AGE_MS, NOW);
      assert.equal(r.removed, 1);
      assert.equal(r.bytesFreed, 0);
      assert.deepEqual(r.staleIds, ['upl-empty']);
      assert.equal(existsSync(dir), false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('file gop raw/<id>-<ten> nam NGOAI thu muc nen khong bao gio bi cham', () => {
    const { root, raw } = setupRaw();
    try {
      mkChunkDir(raw, 'upl-old1', [['chunk-0', 100]], OLD);
      const merged = join(raw, 'upl-old1-movie.mp4');
      writeFileSync(merged, Buffer.alloc(500, 7));
      const r = cleanupStaleChunks(root, STALE_CHUNK_MAX_AGE_MS, NOW);
      assert.equal(r.removed, 1);
      assert.equal(existsSync(merged), true);
      assert.equal(r.bytesFreed, 100); // chi tinh chunk, khong tinh file gop
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('thu muc cu co file la (khong phai chunk-*): chi xoa chunk, giu file + thu muc', () => {
    const { root, raw } = setupRaw();
    try {
      const dir = mkChunkDir(raw, 'upl-mixed', [['chunk-0', 100], ['notes.txt', 40]], OLD);
      const r = cleanupStaleChunks(root, STALE_CHUNK_MAX_AGE_MS, NOW);
      assert.equal(r.removed, 1);
      assert.deepEqual(r.staleIds, ['upl-mixed']);
      assert.equal(existsSync(join(dir, 'chunk-0')), false);
      assert.equal(existsSync(join(dir, 'notes.txt')), true);
      assert.equal(existsSync(dir), true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('thu muc ten khong hop le uploadId thi bo qua hoan toan', () => {
    const { root, raw } = setupRaw();
    try {
      const dir = mkChunkDir(raw, 'bad id!', [['chunk-0', 100]], OLD);
      const r = cleanupStaleChunks(root, STALE_CHUNK_MAX_AGE_MS, NOW);
      assert.deepEqual(r, { checked: 0, removed: 0, bytesFreed: 0, staleIds: [] });
      assert.equal(existsSync(join(dir, 'chunk-0')), true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('khong co thu muc raw: tra 0, khong throw', () => {
    const root = mkdtempSync(join(tmpdir(), 'vtc-chunk-'));
    try {
      assert.deepEqual(cleanupStaleChunks(root, STALE_CHUNK_MAX_AGE_MS, NOW), {
        checked: 0, removed: 0, bytesFreed: 0, staleIds: [],
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('shouldCallChunkCleanup', () => {
  it('lan dau (chua goi bao gio) -> goi ngay', () => {
    assert.equal(shouldCallChunkCleanup(0, NOW), true);
  });

  it('trong 1 gio tu lan goi truoc -> khong goi', () => {
    assert.equal(shouldCallChunkCleanup(NOW, NOW + 59 * 60 * 1000), false);
  });

  it('qua 1 gio tu lan goi truoc -> goi lai', () => {
    assert.equal(shouldCallChunkCleanup(NOW, NOW + HOUR), true);
  });

  it('khoang tuy chinh duoc ton trong', () => {
    assert.equal(shouldCallChunkCleanup(NOW, NOW + 10 * 60 * 1000, 10 * 60 * 1000), true);
    assert.equal(shouldCallChunkCleanup(NOW, NOW + 9 * 60 * 1000, 10 * 60 * 1000), false);
  });
});

describe('postStaleChunkFail', () => {
  it('POST dung endpoint/body/header, tra JSON backend', async () => {
    const seen = {};
    const stubFetch = async (url, opts) => {
      seen.url = url;
      seen.opts = opts;
      return { ok: true, text: async () => JSON.stringify({ failed: 1, failedIds: ['upl-old1'], skippedIds: [] }) };
    };
    const out = await postStaleChunkFail(['upl-old1'], stubFetch);
    assert.ok(String(seen.url).endsWith('/internal/cleanup-stale-chunks'));
    assert.equal(seen.opts.method, 'POST');
    assert.equal(seen.opts.headers['x-webhook-secret'], '');
    assert.deepEqual(JSON.parse(seen.opts.body), { op: 'fail', ids: ['upl-old1'] });
    assert.deepEqual(out, { failed: 1, failedIds: ['upl-old1'], skippedIds: [] });
  });

  it('backend tra loi -> throw', async () => {
    const stubFetch = async () => ({ ok: false, status: 403, text: async () => 'forbidden' });
    await assert.rejects(() => postStaleChunkFail(['upl-old1'], stubFetch), /HTTP 403/);
  });
});

describe('runStaleChunkCleanup', () => {
  it('quet + bao backend chi cac id vua don; khong co id cu thi khong goi backend', async () => {
    const { root, raw } = setupRaw();
    try {
      mkChunkDir(raw, 'upl-old1', [['chunk-0', 100]], OLD);
      mkChunkDir(raw, 'upl-fresh', [['chunk-0', 100]], FRESH);
      const calls = [];
      const stubFetch = async (url, opts) => {
        calls.push(JSON.parse(opts.body));
        return { ok: true, text: async () => JSON.stringify({ failed: 1, failedIds: ['upl-old1'], skippedIds: [] }) };
      };
      const r = await runStaleChunkCleanup(root, stubFetch);
      assert.equal(r.checked, 2);
      assert.equal(r.removed, 1);
      assert.equal(r.failed, 1);
      assert.deepEqual(r.failedIds, ['upl-old1']);
      assert.equal(calls.length, 1);
      assert.deepEqual(calls[0], { op: 'fail', ids: ['upl-old1'] });
      assert.equal(readdirSync(raw).sort().join(','), 'upl-fresh');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('khong co chunk cu: khong goi backend, tra failed=0', async () => {
    const { root, raw } = setupRaw();
    try {
      mkChunkDir(raw, 'upl-fresh', [['chunk-0', 100]], FRESH);
      let called = 0;
      const stubFetch = async () => {
        called += 1;
        return { ok: true, text: async () => '{}' };
      };
      const r = await runStaleChunkCleanup(root, stubFetch);
      assert.equal(r.removed, 0);
      assert.equal(r.failed, 0);
      assert.equal(called, 0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
