// Test logic thuan retry/backoff/dead-letter + duration (duong poll).
// Chay truc tiep bang node --test, khong can build (Node strip type file
// .ts thuan), theo mau cac test workflow. Chi test module thuan
// retry-policy.ts — service method (uploads.service.ts) can Nest/Prisma nen
// khong chay duoc o day, giong 26 test dist hien tai (loi moi truong).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_TRANSCODE_ATTEMPTS,
  RETRY_BASE_DELAY_SEC,
  RETRY_MAX_DELAY_SEC,
  retryDelaySec,
  shouldDeadLetter,
  deadLetterReason,
  formatDurationHms,
  isQueueEligible,
  applyClaim,
  applyRetry,
  shouldFillCatalogDuration,
} from './src/modules/uploads/retry-policy.ts';

describe('backoff + dead-letter constants', () => {
  it('MAX 5, base 30s, cap 1h', () => {
    assert.equal(MAX_TRANSCODE_ATTEMPTS, 5);
    assert.equal(RETRY_BASE_DELAY_SEC, 30);
    assert.equal(RETRY_MAX_DELAY_SEC, 3600);
  });

  it('delay mu 30, 60, 120, 240, tran 3600', () => {
    assert.equal(retryDelaySec(1), 30);
    assert.equal(retryDelaySec(2), 60);
    assert.equal(retryDelaySec(3), 120);
    assert.equal(retryDelaySec(4), 240);
    assert.equal(retryDelaySec(5), 480);
    assert.equal(retryDelaySec(8), 3600);
    assert.equal(retryDelaySec(100), 3600);
  });

  it('dead-letter dung tai MAX', () => {
    assert.equal(shouldDeadLetter(4), false);
    assert.equal(shouldDeadLetter(5), true);
    assert.equal(shouldDeadLetter(6), true);
  });

  it('ly do dead-letter co so lan thu + chi tiet (cat 200 ky tu)', () => {
    assert.match(deadLetterReason(5), /dead-letter: 5 lan thu that bai \(toi da 5\)/);
    assert.match(deadLetterReason(5, 'ffmpeg boom'), /ffmpeg boom/);
    assert.equal(deadLetterReason(5).includes('undefined'), false);
  });
});

describe('format duration h:mm:ss', () => {
  it('vi du brief + bien', () => {
    assert.equal(formatDurationHms(3661), '1:01:01');
    assert.equal(formatDurationHms(90), '0:01:30');
    assert.equal(formatDurationHms(0), '0:00:00');
    assert.equal(formatDurationHms(59), '0:00:59');
    assert.equal(formatDurationHms(3600), '1:00:00');
  });

  it('khong hop le -> null', () => {
    assert.equal(formatDurationHms(-1), null);
    assert.equal(formatDurationHms(NaN), null);
    assert.equal(formatDurationHms(null), null);
  });
});

describe('queue filter theo nextRetryAt', () => {
  const now = 1_000_000;
  it('processing/uploaded khong hen -> vao queue', () => {
    assert.equal(isQueueEligible({ status: 'processing' }, now), true);
    assert.equal(isQueueEligible({ status: 'uploaded', nextRetryAt: null }, now), true);
  });

  it('nextRetryAt tuong lai -> loai khoi queue', () => {
    assert.equal(isQueueEligible({ status: 'processing', nextRetryAt: now + 1000 }, now), false);
    assert.equal(isQueueEligible({ status: 'uploaded', nextRetryAt: now + 60_000 }, now), false);
  });

  it('nextRetryAt da qua / dung now -> vao lai queue', () => {
    assert.equal(isQueueEligible({ status: 'processing', nextRetryAt: now - 1 }, now), true);
    assert.equal(isQueueEligible({ status: 'processing', nextRetryAt: now }, now), true);
  });

  it('done/error khong bao gio vao queue', () => {
    assert.equal(isQueueEligible({ status: 'done' }, now), false);
    assert.equal(isQueueEligible({ status: 'error' }, now), false);
    assert.equal(isQueueEligible({ status: 'pending' }, now), false);
  });
});

describe('claim + retry transitions (service dung nguyen cac ham nay)', () => {
  it('claim tang attempts, xoa lich hen, ve processing', () => {
    const next = applyClaim({ status: 'uploaded', attempts: 0, nextRetryAt: 999 });
    assert.equal(next.attempts, 1);
    assert.equal(next.nextRetryAt, null);
    assert.equal(next.status, 'processing');
    const again = applyClaim({ status: 'processing', attempts: 2 });
    assert.equal(again.attempts, 3);
  });

  it('retry duoi MAX: giu status, hen backoff theo attempts hien tai', () => {
    const now = 1_000_000;
    const next = applyRetry({ status: 'processing', attempts: 1 }, now, 'ffmpeg boom');
    assert.equal(next.status, 'processing');
    assert.equal(next.nextRetryAt, now + 30_000);
    const next2 = applyRetry({ status: 'processing', attempts: 3 }, now);
    assert.equal(next2.nextRetryAt, now + 120_000);
  });

  it('retry tai MAX: dead-letter, xoa lich hen, kem ly do', () => {
    const next = applyRetry({ status: 'processing', attempts: 5 }, 1_000_000, 'ffmpeg boom');
    assert.equal(next.status, 'error');
    assert.equal(next.nextRetryAt, null);
    assert.match(next.error, /dead-letter: 5 lan thu that bai/);
    assert.match(next.error, /ffmpeg boom/);
  });

  it('vong doi poison-job: 5 claim -> dead-letter o retry thu 5, delay 30/60/120/240', () => {
    let rec = { status: 'processing', attempts: 0, nextRetryAt: null };
    const delays = [];
    let now = 1_000_000;
    for (let i = 0; i < 5; i++) {
      rec = applyClaim(rec);
      assert.equal(rec.attempts, i + 1);
      const before = now;
      rec = applyRetry(rec, now, 'ffmpeg fail');
      if (i < 4) {
        assert.equal(rec.status, 'processing');
        delays.push((rec.nextRetryAt - before) / 1000);
        now = rec.nextRetryAt; // het backoff -> poll lai
        assert.equal(isQueueEligible(rec, now), true);
      } else {
        assert.equal(rec.status, 'error');
        assert.match(rec.error, /dead-letter/);
        assert.equal(isQueueEligible(rec, now), false);
      }
    }
    assert.deepEqual(delays, [30, 60, 120, 240]);
  });
});

describe('quyet dinh dien duration catalog', () => {
  it('chi dien khi item trong + co gia tri moi', () => {
    assert.equal(shouldFillCatalogDuration('', '1:01:01'), true);
    assert.equal(shouldFillCatalogDuration(null, '1:01:01'), true);
    assert.equal(shouldFillCatalogDuration(undefined, '1:01:01'), true);
    assert.equal(shouldFillCatalogDuration('0:05:00', '1:01:01'), false);
    assert.equal(shouldFillCatalogDuration('', null), false);
    assert.equal(shouldFillCatalogDuration('', ''), false);
  });
});
