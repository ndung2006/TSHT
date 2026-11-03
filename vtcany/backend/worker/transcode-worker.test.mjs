// Test helper thuan cua transcode-worker (node --test, khong can ffmpeg that).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidUploadId,
  safeFilename,
  sourcePath,
  hlsDir,
  masterPath,
  posterPath,
  parseFfmpegTime,
  progressPct,
  shouldPostProgress,
  posterSeekSec,
  shortError,
} from './transcode-worker.mjs';

describe('upload id + paths (phai khop backend)', () => {
  it('accepts backend upload ids, rejects traversal', () => {
    assert.equal(isValidUploadId('upl-1793689824933'), true);
    assert.equal(isValidUploadId('abc_123-XYZ'), true);
    assert.equal(isValidUploadId('../etc/passwd'), false);
    assert.equal(isValidUploadId('a/b'), false);
    assert.equal(isValidUploadId(''), false);
    assert.equal(isValidUploadId('x'.repeat(65)), false);
  });

  it('sanitizes filenames exactly like backend finalPath', () => {
    assert.equal(
      safeFilename('Thời sự trưa 2-11-2026 - Báo.mp4'),
      'Th_i_s__tr_a_2-11-2026_-_B_o.mp4',
    );
    assert.equal(safeFilename('plain-name_1.mp4'), 'plain-name_1.mp4');
  });

  it('builds storage paths the backend looks up', () => {
    const root = '/app/storage';
    assert.equal(
      sourcePath(root, 'upl-1', 'a b.mp4'),
      '/app/storage/raw/upl-1-a_b.mp4',
    );
    assert.equal(hlsDir(root, 'upl-1'), '/app/storage/hls/upl-1');
    assert.equal(masterPath(root, 'upl-1'), '/app/storage/hls/upl-1/master.m3u8');
    assert.equal(posterPath(root, 'upl-1'), '/app/storage/images/thumb-upl-1.jpg');
  });
});

describe('ffmpeg progress parsing', () => {
  it('parses time= lines', () => {
    assert.equal(parseFfmpegTime('frame=  100 fps=25 time=00:01:30.50 bitrate= 100k'), 90.5);
    assert.equal(parseFfmpegTime('frame=   10 time=00:00:05.00'), 5);
    assert.equal(parseFfmpegTime('frame=   10 time=N/A'), null);
    assert.equal(parseFfmpegTime('nothing here'), null);
  });

  it('computes whole percents, capped at 99 until done', () => {
    assert.equal(progressPct(30, 120), 25);
    assert.equal(progressPct(119, 120), 99);
    assert.equal(progressPct(200, 120), 99);
    assert.equal(progressPct(0, 120), 0);
    assert.equal(progressPct(30, null), null);
    assert.equal(progressPct(30, 0), null);
  });

  it('posts only on whole-percent change', () => {
    assert.equal(shouldPostProgress(-1, 0), true);
    assert.equal(shouldPostProgress(25, 25), false);
    assert.equal(shouldPostProgress(25, 26), true);
    assert.equal(shouldPostProgress(25, null), false);
  });
});

describe('poster seek + error shortening', () => {
  it('picks 10% of duration clamped to [1, 30]', () => {
    assert.equal(posterSeekSec(600), 30);
    assert.equal(posterSeekSec(100), 10);
    assert.equal(posterSeekSec(5), 1);
    assert.equal(posterSeekSec(null), 1);
  });

  it('keeps only the last non-empty line, truncated', () => {
    assert.equal(shortError('line1\nline2  \n'), 'line2');
    assert.equal(shortError(''), 'ffmpeg failed');
    assert.equal(shortError('x'.repeat(300)).length, 200);
  });
});
