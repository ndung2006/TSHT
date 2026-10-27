import test from 'node:test';
import assert from 'node:assert/strict';
import { transcode } from './dist/ffmpeg.adapter.js';

test('no FFMPEG_API_URL -> simulated job, no network', async () => {
  delete process.env.FFMPEG_API_URL;
  const r = await transcode('s3://raw/a.mp4', ['p480', 'p720']);
  assert.equal(r.simulated, true);
  assert.match(r.externalJobId, /^sim-/);
});
