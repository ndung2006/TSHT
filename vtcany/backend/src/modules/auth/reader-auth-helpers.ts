// Ham thuan cho dang nhap ban doc Giai doan 1 — khong phu thuoc Nest,
// de test truc tiep bang node --test.
import { createHash, randomBytes } from 'crypto';

// Token xac nhan email: 24 gio. Token dat lai mat khau: 30 phut.
// Ca hai luu dang bam SHA-256, dung mot lan.
export const EMAIL_VERIFICATION_TTL_MS = 24 * 3600 * 1000;
export const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;
export const MIN_READER_PASSWORD_LEN = 8;

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// Token khong doan duoc (32 byte ngau nhien, base64url) — gia tri that
// chi xuat hien trong email/link gui cho nguoi dung, DB chi giu ban bam.
export function newOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '');
}

export function portalOrigin(): string {
  return (process.env.PORTAL_PUBLIC_ORIGIN || 'https://tsht.vtctech.xyz').replace(/\/$/, '');
}

export function verificationLink(token: string): string {
  return `${portalOrigin()}/xac-nhan-email?token=${encodeURIComponent(token)}`;
}

export function passwordResetLink(token: string): string {
  return `${portalOrigin()}/dat-lai-mat-khau?token=${encodeURIComponent(token)}`;
}
