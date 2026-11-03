// Logic thuan cho transcode retry/backoff/dead-letter (duong poll) + format
// duration. Module nay KHONG import gi (Nest/Prisma/fs) de test truc tiep
// bang node --test (Node strip type file .ts thuan), theo mau cac test
// workflow. Worker (transcode-worker.mjs) mirror 3 ham retryDelaySec /
// shouldDeadLetter / formatDurationHms (giong cach isValidUploadId mirror
// media-sign.ts): giu 2 ban dong bo khi doi hang so.
//
// Thiet ke (duong poll, khong sua duong BullMQ — BullMQ da co attempts/
// backoff rieng va live dang chay duong poll):
//   - Worker nhan job -> POST webhook 'attempt' TRUOC khi chay ffmpeg:
//     backend tang attempts ngay, ke ca worker chet sau claim thi lan thu
//     do van duoc dem (tranh vong lap crash khong dem duoc).
//   - ffmpeg loi / webhook 'done' loi -> POST webhook 'retry' (KHONG 'error'):
//     attempts < MAX -> giu status 'processing', hen nextRetryAt = now +
//     backoff mu; attempts >= MAX -> status 'error' kem ly do dead-letter
//     (terminal, khong con trong queue, CMS hien duoc qua transcode='error').
//   - Queue endpoint LOAI job co nextRetryAt trong tuong lai.
//   - Record 'error' cu van khong vao queue (khong doi hanh vi cu).

/** So lan thu toi da truoc khi dead-letter. */
export const MAX_TRANSCODE_ATTEMPTS = 5;

/** Delay backoff co so (giay) va tran. */
export const RETRY_BASE_DELAY_SEC = 30;
export const RETRY_MAX_DELAY_SEC = 3600;

/** Ban ghi toi thieu ma cac ham duoi can (khop UploadRecord). */
export interface RetryRecord {
  status: string;
  attempts?: number;
  nextRetryAt?: number | null;
}

/** Delay backoff mu: 30s, 60s, 120s, 240s, ... tran 1h. attempts <= 0 tinh nhu 1. */
export function retryDelaySec(attempts: number): number {
  const a = Math.max(1, Math.floor(attempts) || 1);
  return Math.min(RETRY_BASE_DELAY_SEC * 2 ** (a - 1), RETRY_MAX_DELAY_SEC);
}

/** Da het luot thu? */
export function shouldDeadLetter(attempts: number): boolean {
  return (attempts || 0) >= MAX_TRANSCODE_ATTEMPTS;
}

/** Ly do dead-letter luu vao rec.error (hien thi duoc trong CMS). */
export function deadLetterReason(attempts: number, detail?: string): string {
  const base = `dead-letter: ${attempts || 0} lan thu that bai (toi da ${MAX_TRANSCODE_ATTEMPTS})`;
  const d = (detail || '').trim();
  if (!d) return base;
  return `${base} — ${d.length > 200 ? d.slice(0, 200) : d}`;
}

/** Giay -> "h:mm:ss" (3661 -> "1:01:01", 90 -> "0:01:30"). Khong hop le -> null. */
export function formatDurationHms(totalSec: number): string | null {
  if (!Number.isFinite(totalSec) || totalSec < 0) return null;
  const s = Math.floor(totalSec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

/** Job co duoc queue tra ve o thoi diem nowMs khong. */
export function isQueueEligible(rec: RetryRecord, nowMs: number): boolean {
  if (rec.status !== 'processing' && rec.status !== 'uploaded') return false;
  if (rec.nextRetryAt != null && rec.nextRetryAt > nowMs) return false;
  return true;
}

/** Chuyen doi khi worker claim job: tang attempts, xoa lich hen cu, ve 'processing'. */
export function applyClaim<T extends RetryRecord>(rec: T): T {
  return { ...rec, status: 'processing', attempts: (rec.attempts || 0) + 1, nextRetryAt: null };
}

/**
 * Chuyen doi khi worker bao 'retry' (ffmpeg loi / webhook 'done' loi).
 * attempts < MAX: giu status, hen nextRetryAt theo backoff.
 * attempts >= MAX: dead-letter (status 'error' + ly do, xoa lich hen).
 * Goi khi record khong o trang thai processing/uploaded thi service phai
 * bo qua truoc (retry cu sau done/error) — ham nay khong tu doi status
 * thanh 'error' cho record la.
 */
export function applyRetry<T extends RetryRecord & { error?: string }>(
  rec: T,
  nowMs: number,
  message?: string,
): T {
  const attempts = rec.attempts || 0;
  if (shouldDeadLetter(attempts)) {
    return { ...rec, status: 'error', error: deadLetterReason(attempts, message), nextRetryAt: null };
  }
  return { ...rec, nextRetryAt: nowMs + retryDelaySec(attempts) * 1000 };
}

/** Co nen dien duration vao CatalogItem khong: chi khi item chua co va co gia tri moi. */
export function shouldFillCatalogDuration(
  existingDuration: string | null | undefined,
  newHms: string | null | undefined,
): boolean {
  return !existingDuration && !!newHms;
}
