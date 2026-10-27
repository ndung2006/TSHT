import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { writeFileSync } from 'fs';
import { execFile } from 'child_process';
import { transcodeLocal } from './dist/transcode-local.js';

// Nhánh SIMULATED chỉ xảy ra khi không có ffmpeg (VD: môi trường test nhẹ).
// Có ffmpeg thật thì pipeline.test.mjs đã cover nhánh transcode thật.
test('local transcode outputs a playlist without ffmpeg', async (t) => {
  const hasFfmpeg = await new Promise((resolve) =>
    execFile('ffmpeg', ['-version'], (err) => resolve(!err)),
  );
  if (hasFfmpeg) {
    t.skip('ffmpeg có sẵn — nhánh simulated không áp dụng, xem pipeline.test.mjs');
    return;
  }
  const dir = mkdtempSync(join(tmpdir(), 'vtc-'));
  const raw = join(dir, 'a.mp4');
  writeFileSync(raw, Buffer.from('fake-video-bytes'));
  const r = await transcodeLocal(raw, join(dir, 'hls'));
  assert.equal(existsSync(r.playlist), true);
});
