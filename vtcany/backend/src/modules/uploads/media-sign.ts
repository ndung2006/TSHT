import { createHmac, timingSafeEqual } from 'crypto';

// Ky HMAC cho URL phat media tu host (VOD worker transcode -> /media/*).
// Khac voi upstream AIO (link xoay bang partner key): day la noi dung
// DO backend phuc vu truc tiep tu storage/hls nen backend tu ky va tu verify.
const UPLOAD_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** Kiem tra format uploadId (chong path traversal). */
export function isValidUploadId(uploadId: string): boolean {
  return !!uploadId && UPLOAD_ID_RE.test(uploadId);
}
let warned = false;

function mediaSecret(): string {
  const s = process.env.MEDIA_URL_SECRET || '';
  if (s) return s;
  if (!warned) {
    warned = true;
    // eslint-disable-next-line no-console
    console.warn('[media-sign] MEDIA_URL_SECRET chua dat - dung secret mac dinh, CHI hop le cho dev!');
  }
  return 'dev-only-insecure-media-secret';
}

/** Ky: HMAC-SHA256(secret, "<uploadId>.<exp>") -> hex. */
export function signMedia(uploadId: string, exp: number): string {
  return createHmac('sha256', mediaSecret()).update(`${uploadId}.${exp}`).digest('hex');
}

/** Verify chu ky + han su dung + format uploadId (chong path traversal). */
export function verifyMedia(uploadId: string, exp: string | number | undefined, sig: string | undefined): boolean {
  if (!isValidUploadId(uploadId)) return false;
  const expNum = Number(exp);
  if (!Number.isFinite(expNum) || !sig) return false;
  if (Math.floor(Date.now() / 1000) > expNum) return false;
  const expected = Buffer.from(signMedia(uploadId, expNum), 'utf8');
  const actual = Buffer.from(sig, 'utf8');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export const PLAYLIST_TTL_SEC = 15 * 60; // URL playlist: 15 phut de bat dau phat
export const SEGMENT_TTL_SEC = 8 * 60 * 60; // URL segment: 8 tieng (phat dan trong luc xem)
