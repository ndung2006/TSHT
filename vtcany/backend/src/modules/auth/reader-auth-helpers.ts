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

// Danh sach cho phep tra lien ket xac nhan / dat lai mat khau trong phan
// hoi API (chi moi truong test, bat bang DEV_AUTH_LINKS kem
// DEV_AUTH_LINKS_ALLOW, danh sach cach nhau bang dau phay). Khop email
// dung, khong phan biet hoa/thuong; cho phep ca dang local+tag@domain
// (vi du ktcn.digital+test1@vtc.vn khi danh sach co ktcn.digital@vtc.vn).
// Email ngoai danh sach khong bao gio nhan duoc lien ket qua API.
export function isDevLinkAllowedEmail(email: string, allowList: string): boolean {
  const em = (email || '').trim().toLowerCase();
  if (!em || !em.includes('@')) return false;
  const [mLocal, mDomain] = em.split('@');
  return (allowList || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .some((entry) => {
      if (em === entry) return true;
      const [eLocal, eDomain] = entry.split('@');
      if (!eLocal || !eDomain || eDomain !== mDomain) return false;
      return mLocal.startsWith(eLocal + '+');
    });
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
