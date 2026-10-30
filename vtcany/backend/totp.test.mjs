// Test TOTP bang vector chuan RFC 6238 (SHA1, secret ASCII
// "12345678901234567890" -> base32 GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  base32Decode, base32Encode, generateTotpSecret, otpauthUrl, totp, verifyTotp,
} from './src/modules/auth/totp.ts';

const SECRET_ASCII = '12345678901234567890';
const SECRET_B32 = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

test('base32: encode/decode khop vector RFC', () => {
  assert.equal(base32Encode(Buffer.from(SECRET_ASCII, 'ascii')), SECRET_B32);
  assert.equal(base32Decode(SECRET_B32).toString('ascii'), SECRET_ASCII);
  assert.throws(() => base32Decode('ABC!'), /khong hop le/);
});

test('totp: vector RFC 6238 (8 so) cat xuong 6 so', () => {
  // RFC 6238 Appendix B (SHA1): T=59 -> 94287082; T=1111111109 -> 07081804;
  // T=1234567890 -> 89005924; T=2000000000 -> 69279037.
  // (Da doi chieu bang mot ban cai dat doc lap — Python hmac — khop ca 4.)
  assert.equal(totp(SECRET_B32, 59_000, 8), '94287082');
  assert.equal(totp(SECRET_B32, 59_000), '287082');
  assert.equal(totp(SECRET_B32, 1_111_111_109_000, 8), '07081804');
  assert.equal(totp(SECRET_B32, 1_111_111_109_000), '081804');
  assert.equal(totp(SECRET_B32, 1_234_567_890_000), '005924');
  assert.equal(totp(SECRET_B32, 2_000_000_000_000, 8), '69279037');
});

test('verifyTotp: dung ma, cua so ±1 buoc, sai dinh dang', () => {
  const now = 1_700_000_000_000;
  const code = totp(SECRET_B32, now);
  assert.equal(verifyTotp(SECRET_B32, code, now), true);
  assert.equal(verifyTotp(SECRET_B32, code, now + 29_000), true); // van trong cua so
  assert.equal(verifyTotp(SECRET_B32, code, now + 61_000), false); // ngoai cua so ±1
  assert.equal(verifyTotp(SECRET_B32, '000000', now), false);
  assert.equal(verifyTotp(SECRET_B32, 'abcdef', now), false);
  assert.equal(verifyTotp(SECRET_B32, 123456, now), false);
  assert.equal(verifyTotp(SECRET_B32, '', now), false);
  assert.equal(verifyTotp('!!!', code, now), false);
});

test('generateTotpSecret: base32 32 ky tu, moi lan mot secret', () => {
  const a = generateTotpSecret();
  const b = generateTotpSecret();
  assert.match(a, /^[A-Z2-7]{32}$/);
  assert.notEqual(a, b);
  assert.equal(base32Decode(a).length, 20);
});

test('otpauthUrl: chua secret + issuer', () => {
  const u = otpauthUrl(SECRET_B32, 'test-tp@vtcany.vn');
  assert.ok(u.startsWith('otpauth://totp/'));
  assert.ok(u.includes(`secret=${SECRET_B32}`));
  assert.ok(u.includes('issuer=VTC+TSHT+CMS'));
});
