import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { transcodeLocal } from './dist/transcode-local.js';

function hasFfmpeg() {
  return new Promise((resolve) => execFile('ffmpeg', ['-version'], (err) => resolve(!err)));
}

function makeMp4(out) {
  return new Promise((resolve, reject) => {
    execFile(
      'ffmpeg',
      ['-y', '-f', 'lavfi', '-i', 'testsrc=duration=2:size=320x240:rate=10', '-pix_fmt', 'yuv420p', out],
      (err) => (err ? reject(err) : resolve()),
    );
  });
}

test('pipeline: mp4 that -> HLS master.m3u8 + segments (ffmpeg that)', async (t) => {
  if (!(await hasFfmpeg())) {
    t.skip('ffmpeg khong co san');
    return;
  }
  const dir = mkdtempSync(join(tmpdir(), 'vtc-pipe-'));
  const src = join(dir, 'in.mp4');
  await makeMp4(src);
  assert.ok(existsSync(src), 'mp4 test duoc tao');

  const hlsDir = join(dir, 'hls');
  const res = await transcodeLocal(src, hlsDir);
  assert.equal(res.simulated, false);
  assert.ok(existsSync(res.playlist), 'master.m3u8 ton tai');

  const m3u8 = readFileSync(res.playlist, 'utf8');
  assert.ok(m3u8.includes('#EXTM3U'), 'playlist hop le');
  const files = readdirSync(hlsDir);
  const segs = files.filter((f) => f.endsWith('.ts'));
  assert.ok(segs.length > 0, `co segment .ts (thay ${segs.length})`);
});

test('pipeline: raw khong ton tai -> throw de worker retry', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vtc-pipe-'));
  await assert.rejects(() => transcodeLocal(join(dir, 'nope.mp4'), join(dir, 'hls')), /raw not found/);
});

test('queue interface giu nguyen (enqueue/status) cho BullMQ/poll', async () => {
  const { JobQueue } = await import('./dist/queue.js');
  const q = new JobQueue();
  const job = q.enqueue('s3://raw/a.mp4', ['p480', 'p720']);
  assert.equal(job.status, 'queued');
  assert.deepEqual(job.presets, ['p480', 'p720']);
  q.mark(job.id, 'processing');
  q.mark(job.id, 'done');
  assert.deepEqual(q.pending(), []);
});

test('pipeline: multibitrate 720p -> master 3 variant (360p/480p/720p)', async (t) => {
  if (!(await hasFfmpeg())) {
    t.skip('ffmpeg khong co san');
    return;
  }
  const dir = mkdtempSync(join(tmpdir(), 'vtc-mb-'));
  const src = join(dir, 'in.mp4');
  await new Promise((resolve, reject) => {
    execFile('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'testsrc=duration=4:size=1280x720:rate=10', '-pix_fmt', 'yuv420p', src],
      (err) => (err ? reject(err) : resolve()));
  });
  const hlsDir = join(dir, 'hls');
  const res = await transcodeLocal(src, hlsDir);
  assert.equal(res.simulated, false);
  assert.deepEqual(res.renditions, ['360p', '480p', '720p']);
  const master = readFileSync(res.playlist, 'utf8');
  const variants = [...master.matchAll(/#EXT-X-STREAM-INF:([^\n]+)\n([^\n]+)/g)];
  assert.equal(variants.length, 3);
  for (const [, info, uri] of variants) {
    assert.match(info, /BANDWIDTH=\d+/);
    const vfile = join(hlsDir, uri.trim());
    assert.ok(existsSync(vfile), `variant playlist ${uri} ton tai`);
    const segs = readdirSync(hlsDir).filter((f) => f.startsWith(uri.trim().replace('.m3u8', '_')) && f.endsWith('.ts'));
    assert.ok(segs.length > 0, `co segment cho ${uri}`);
  }
});

test('pipeline: nguon 480p -> khong upscale len 720p', async (t) => {
  if (!(await hasFfmpeg())) {
    t.skip('ffmpeg khong co san');
    return;
  }
  const dir = mkdtempSync(join(tmpdir(), 'vtc-mb2-'));
  const src = join(dir, 'in.mp4');
  await new Promise((resolve, reject) => {
    execFile('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'testsrc=duration=2:size=854x480:rate=10', '-pix_fmt', 'yuv420p', src],
      (err) => (err ? reject(err) : resolve()));
  });
  const res = await transcodeLocal(src, join(dir, 'hls'));
  assert.deepEqual(res.renditions, ['360p', '480p']);
});
