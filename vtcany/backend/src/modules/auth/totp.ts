// TOTP (RFC 6238) viet tay bang node:crypto — Goi 2D-2. Khong them thu
// vien otp (mo truong build offline khong cai duoc goi moi); thuat toan
// ngan, kiem chung bang vector chuan RFC 6238 trong totp.test.mjs.
// Secret luu dang base32 (chuan cua cac app Authenticator).
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31];
  while (out.length % 8 !== 0) out += '=';
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = String(input || '').toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const ch of clean) {
    const idx = B32_ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error('base32 khong hop le');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** Sinh secret moi (20 byte = 160 bit, muc khuyen nghi cua RFC). */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20)).replace(/=+$/, '');
}

function hotp(secret: Buffer, counter: number, digits: number): string {
  const msg = Buffer.alloc(8);
  msg.writeBigInt64BE(BigInt(counter));
  const digest = createHmac('sha1', secret).update(msg).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  const mod = binary % 10 ** digits;
  return String(mod).padStart(digits, '0');
}

/** Ma TOTP tai mot moc thoi gian (mac dinh: 6 so, buoc 30s — chuan app). */
export function totp(secretBase32: string, timeMs: number, digits = 6, stepSeconds = 30): string {
  const counter = Math.floor(timeMs / 1000 / stepSeconds);
  return hotp(base32Decode(secretBase32), counter, digits);
}

/**
 * Xac thuc ma nguoi dung nhap: chap nhan cua so ±1 buoc (lech gio giua
 * dien thoai va may chu), so sanh an toan thoi gian. Ma phai la chuoi so
 * dung do dai — sai dinh dang la false ngay, khong nem loi.
 */
export function verifyTotp(secretBase32: string, code: unknown, timeMs: number, digits = 6, stepSeconds = 30): boolean {
  if (typeof code !== 'string' || !/^\d+$/.test(code) || code.length !== digits) return false;
  let secret: Buffer;
  try {
    secret = base32Decode(secretBase32);
  } catch {
    return false;
  }
  const counter = Math.floor(timeMs / 1000 / stepSeconds);
  const given = Buffer.from(code);
  for (const delta of [-1, 0, 1]) {
    const expected = Buffer.from(hotp(secret, counter + delta, digits));
    if (expected.length === given.length && timingSafeEqual(expected, given)) return true;
  }
  return false;
}

/** URL otpauth:// de app Authenticator quet/dan tay. */
export function otpauthUrl(secretBase32: string, account: string, issuer = 'VTC TSHT CMS'): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: 'SHA1',
    digits: '6',
    period: '30',
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
