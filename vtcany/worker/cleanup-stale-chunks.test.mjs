import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'path';
import { cleanupStaleChunks } from './dist/cleanup-stale-chunks.js';

const HOUR = 60 * 60 * 1000;

function makeChunk(dir, name, size, mtimeMs) {
  const p = join(dir, name);
  writeFileSync(p, 'x'.repeat(size));
  utimesSync(p, new Date(mtimeMs), new Date(mtimeMs));
  return p;
}

test('chi don chunk do dang qua 24h; upload moi va file gop khong bi cham', () => {
  const root = mkdtempSync(join(tmpdir(), 'd3-cleanup-'));
  const now = Date.now();
  try {
    const raw = join(root, 'raw');
    // Upload do dang cu (chunk moi nhat 25h truoc) -> don.
    const oldDir = join(raw, 'upl-old');
    mkdirSync(oldDir, { recursive: true });
    makeChunk(oldDir, 'chunk-0', 100, now - 25 * HOUR);
    makeChunk(oldDir, 'chunk-1', 200, now - 26 * HOUR);
    // Upload do dang moi (chunk 1h truoc) -> giu.
    const newDir = join(raw, 'upl-new');
    mkdirSync(newDir, { recursive: true });
    makeChunk(newDir, 'chunk-0', 300, now - 1 * HOUR);
    // Thu muc rong cu (chunk da gop xong, chi con vo, 25h truoc) -> don vo.
    const emptyDir = join(raw, 'upl-empty');
    mkdirSync(emptyDir, { recursive: true });
    utimesSync(emptyDir, new Date(now - 25 * HOUR), new Date(now - 25 * HOUR));
    // File gop nam NGOAI thu muc raw/<id>/ -> khong bi cham (chi la file
    // le trong raw/, khong phai thu muc).
    writeFileSync(join(raw, 'upl-done-video.mp4'), 'y'.repeat(50));
    const r = cleanupStaleChunks(root, 24 * HOUR, now);
    assert.deepEqual(r, { checked: 3, removed: 2, bytesFreed: 300 });
    assert.equal(existsSync(oldDir), false);
    assert.equal(existsSync(newDir), true);
    assert.equal(existsSync(join(newDir, 'chunk-0')), true);
    assert.equal(existsSync(emptyDir), false);
    assert.equal(existsSync(join(raw, 'upl-done-video.mp4')), true);
    // Chay lai: khong con gi de don.
    assert.deepEqual(cleanupStaleChunks(root, 24 * HOUR, now), { checked: 1, removed: 0, bytesFreed: 0 });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('thu muc raw khong co -> 0/0, khong nem loi', () => {
  const root = mkdtempSync(join(tmpdir(), 'd3-cleanup-'));
  try {
    assert.deepEqual(cleanupStaleChunks(root), { checked: 0, removed: 0, bytesFreed: 0 });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
