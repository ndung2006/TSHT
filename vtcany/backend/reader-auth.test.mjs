import { test } from 'node:test';
import assert from 'node:assert/strict';
import bcryptModule from 'bcryptjs';
import { createHash } from 'node:crypto';
import { AuthService } from './dist/modules/auth/auth.service.js';
import { UsersService } from './dist/modules/auth/users.service.js';
import { MailerService } from './dist/modules/auth/mailer.service.js';
import { hashToken, isDevLinkAllowedEmail, isValidEmail, newOpaqueToken, passwordResetLink, verificationLink } from './dist/modules/auth/reader-auth-helpers.js';
import { verifyTurnstile } from './dist/modules/auth/turnstile.js';

const bcrypt = bcryptModule.default ?? bcryptModule;
const sha256 = (s) => createHash('sha256').update(s).digest('hex');

// ---- Prisma gia: Map bo nho cho cac bang AuthService/UsersService dung ----
function matchWhere(row, where) {
  if (!where) return true;
  for (const [k, v] of Object.entries(where)) {
    if (k === 'OR') {
      if (!v.some((sub) => matchWhere(row, sub))) return false;
      continue;
    }
    if (k === 'NOT') {
      if (matchWhere(row, v)) return false;
      continue;
    }
    // Prisma coi cot NULL == null trong where; fake Map luu truong thieu
    // la undefined nen chuan hoa undefined -> null truoc khi so sanh.
    const rv = row[k] === undefined ? null : row[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
      if ('equals' in v && rv !== v.equals) return false;
      if ('contains' in v) {
        const hay = String(rv ?? '');
        const needle = String(v.contains);
        if (v.mode === 'insensitive' ? !hay.toLowerCase().includes(needle.toLowerCase()) : !hay.includes(needle)) return false;
      }
      if ('gt' in v && !(rv > v.gt)) return false;
      if ('lt' in v && !(rv < v.lt)) return false;
      continue;
    }
    if (rv !== v) return false;
  }
  return true;
}

function table() {
  const rows = new Map();
  return {
    rows,
    findUnique: async ({ where }) => {
      for (const r of rows.values()) if (matchWhere(r, where)) return { ...r };
      return null;
    },
    findFirst: async ({ where }) => {
      for (const r of rows.values()) if (matchWhere(r, where)) return { ...r };
      return null;
    },
    findMany: async ({ where, orderBy, skip = 0, take } = {}) => {
      let list = [...rows.values()].filter((r) => matchWhere(r, where)).map((r) => ({ ...r }));
      if (orderBy) {
        const [k, dir] = Object.entries(orderBy)[0];
        list.sort((a, b) => (a[k] < b[k] ? -1 : 1) * (dir === 'desc' ? -1 : 1));
      }
      return take === undefined ? list.slice(skip) : list.slice(skip, skip + take);
    },
    count: async ({ where } = {}) => [...rows.values()].filter((r) => matchWhere(r, where)).length,
    create: async ({ data }) => {
      const row = { ...data, createdAt: data.createdAt ?? new Date() };
      rows.set(row.id, row);
      return { ...row };
    },
    update: async ({ where, data }) => {
      for (const r of rows.values()) {
        if (matchWhere(r, where)) {
          Object.assign(r, data);
          return { ...r };
        }
      }
      throw new Error('not found');
    },
    updateMany: async ({ where, data }) => {
      let count = 0;
      for (const r of rows.values()) {
        if (matchWhere(r, where)) { Object.assign(r, data); count++; }
      }
      return { count };
    },
    deleteMany: async ({ where } = {}) => {
      let count = 0;
      for (const [id, r] of rows) {
        if (matchWhere(r, where)) { rows.delete(id); count++; }
      }
      return { count };
    },
  };
}

function fakePrisma() {
  return {
    user: table(),
    userProfile: table(),
    userSession: table(),
    userEmailToken: table(),
    userRefreshToken: table(),
    adminUser: { count: async () => 0 },
  };
}

const fakeJwt = {
  signAsync: async (payload) => Buffer.from(JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000) })).toString('base64url'),
  verifyAsync: async (token) => JSON.parse(Buffer.from(token, 'base64url').toString('utf8')),
};

function fakeMailer() {
  const sent = [];
  return {
    sent,
    devLinksEnabled: () => process.env.DEV_AUTH_LINKS === 'true',
    sendVerificationEmail: async (to, displayName, token) => {
      sent.push({ kind: 'verify', to, token });
      return { sent: true, devUrl: verificationLink(token) };
    },
    sendPasswordResetEmail: async (to, displayName, token) => {
      sent.push({ kind: 'reset', to, token });
      return { sent: true, devUrl: passwordResetLink(token) };
    },
  };
}

function setup() {
  const prisma = fakePrisma();
  const users = new UsersService(prisma);
  const mailer = fakeMailer();
  const auth = new AuthService(fakeJwt, prisma, users, undefined, mailer);
  return { prisma, users, mailer, auth };
}

const OLD_ENV = { ...process.env };
function setEnv(patch) {
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}
function restoreEnv() {
  for (const k of Object.keys(process.env)) if (!(k in OLD_ENV)) delete process.env[k];
  for (const [k, v] of Object.entries(OLD_ENV)) process.env[k] = v;
}

// ---- Helpers thuan ----
test('reader helpers: hashToken on dinh, token ngau nhien khong trung, email hop le', () => {
  assert.equal(hashToken('abc'), sha256('abc'));
  assert.match(hashToken('abc'), /^[0-9a-f]{64}$/);
  const a = newOpaqueToken();
  const b = newOpaqueToken();
  assert.notEqual(a, b);
  assert.match(a, /^[A-Za-z0-9_-]+$/);
  assert.ok(isValidEmail('nguoi@bao.vn'));
  assert.ok(!isValidEmail('khong-phai-email'));
  assert.ok(!isValidEmail('a@b'));
  assert.ok(verificationLink('tok123').includes('/xac-nhan-email?token=tok123'));
  assert.ok(passwordResetLink('tok123').includes('/dat-lai-mat-khau?token=tok123'));
});

test('turnstile: success true/false, loi mang -> false, thieu secret/token -> false', async () => {
  const okFetch = async () => ({ ok: true, json: async () => ({ success: true }) });
  const noFetch = async () => ({ ok: true, json: async () => ({ success: false }) });
  const errFetch = async () => { throw new Error('network down'); };
  assert.equal(await verifyTurnstile('secret', 'tok', okFetch), true);
  assert.equal(await verifyTurnstile('secret', 'tok', noFetch), false);
  assert.equal(await verifyTurnstile('secret', 'tok', errFetch), false);
  assert.equal(await verifyTurnstile('', 'tok', okFetch), false);
  assert.equal(await verifyTurnstile('secret', '', okFetch), false);
});

test('mailer that (khong SMTP): tra sent:false + devUrl, khong nem loi', async () => {
  setEnv({ SMTP_HOST: undefined });
  try {
    const m = new MailerService();
    assert.equal(m.isConfigured(), false);
    const r = await m.sendVerificationEmail('a@b.co', 'An', 'tok-xyz');
    assert.equal(r.sent, false);
    assert.ok(r.devUrl.includes('/xac-nhan-email?token=tok-xyz'));
  } finally { restoreEnv(); }
});

// ---- Dang ky + xac nhan email ----
test('dang ky: tao user + token bam + gui mail; trung email -> 409-style; yeu cau dau vao', async () => {
  setEnv({ DATABASE_URL: 'postgres://test', DEV_AUTH_LINKS: 'true', DEV_AUTH_LINKS_ALLOW: 'a@bao.vn', TURNSTILE_SECRET_KEY: undefined });
  try {
    const { prisma, mailer, auth } = setup();
    const res = await auth.registerReader({ displayName: 'Nguyen Van A', email: 'A@Bao.VN', password: 'MatKhau123', termsAccepted: true });
    assert.equal(res.ok, true);
    assert.equal(res.email, 'a@bao.vn');
    assert.equal(res.emailSent, true);
    assert.ok(res.devVerificationUrl.includes('/xac-nhan-email?token='));
    const u = await prisma.user.findUnique({ where: { email: 'a@bao.vn' } });
    assert.ok(u);
    assert.ok(u.emailVerifiedAt == null); // DB that tra NULL; fake Map tra undefined — deu la "chua xac nhan".
    assert.ok(u.termsAcceptedAt instanceof Date);
    assert.ok(await bcrypt.compare('MatKhau123', u.passwordHash));
    assert.equal(mailer.sent.length, 1);
    assert.equal(mailer.sent[0].kind, 'verify');
    const tok = mailer.sent[0].token;
    const row = await prisma.userEmailToken.findUnique({ where: { tokenHash: hashToken(tok) } });
    assert.ok(row);
    assert.equal(row.purpose, 'email_verification');
    assert.equal(row.tokenHash, hashToken(tok));
    assert.notEqual(row.tokenHash, tok);

    await assert.rejects(() => auth.registerReader({ displayName: 'X', email: 'a@bao.vn', password: 'MatKhau123', termsAccepted: true }), /email already registered/);
    await assert.rejects(() => auth.registerReader({ displayName: 'X', email: 'moi@bao.vn', password: 'ngan', termsAccepted: true }), /weak password/);
    await assert.rejects(() => auth.registerReader({ displayName: 'X', email: 'moi@bao.vn', password: 'MatKhau123', termsAccepted: false }), /terms not accepted/);
    await assert.rejects(() => auth.registerReader({ displayName: 'X', email: 'khong-phai-email', password: 'MatKhau123', termsAccepted: true }), /invalid email/);
  } finally { restoreEnv(); }
});

test('xac nhan email: token dung duoc 1 lan; token sai/het han bi tu choi', async () => {
  setEnv({ DATABASE_URL: 'postgres://test', DEV_AUTH_LINKS: 'true', TURNSTILE_SECRET_KEY: undefined });
  try {
    const { prisma, mailer, auth } = setup();
    await auth.registerReader({ displayName: 'B', email: 'b@bao.vn', password: 'MatKhau123', termsAccepted: true });
    const tok = mailer.sent[0].token;
    assert.deepEqual(await auth.verifyReaderEmail(tok), { ok: true });
    const u = await prisma.user.findUnique({ where: { email: 'b@bao.vn' } });
    assert.ok(u.emailVerifiedAt instanceof Date);
    await assert.rejects(() => auth.verifyReaderEmail(tok), /invalid or expired token/);
    await assert.rejects(() => auth.verifyReaderEmail('token-sai'), /invalid or expired token/);
    // Het han: tao token roi lui expiresAt ve qua khu.
    await auth.registerReader({ displayName: 'C', email: 'c@bao.vn', password: 'MatKhau123', termsAccepted: true });
    const tok2 = mailer.sent[1].token;
    // findUnique tra BAN SAO nen phai update truc tiep moi doi duoc han.
    await prisma.userEmailToken.update({ where: { tokenHash: hashToken(tok2) }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await assert.rejects(() => auth.verifyReaderEmail(tok2), /invalid or expired token/);
  } finally { restoreEnv(); }
});

// ---- Quen / dat lai mat khau ----
test('quen mat khau: email ton tai thi gui link; email la thi tra giong het; link cu chet khi phat link moi', async () => {
  setEnv({ DATABASE_URL: 'postgres://test', DEV_AUTH_LINKS: 'true', DEV_AUTH_LINKS_ALLOW: 'd@bao.vn', TURNSTILE_SECRET_KEY: undefined });
  try {
    const { mailer, auth } = setup();
    await auth.registerReader({ displayName: 'D', email: 'd@bao.vn', password: 'MatKhau123', termsAccepted: true });
    mailer.sent.length = 0;
    const r1 = await auth.forgotReaderPassword('d@bao.vn');
    assert.deepEqual(Object.keys(r1).sort(), ['devResetUrl', 'ok']);
    assert.ok(r1.devResetUrl.includes('/dat-lai-mat-khau?token='));
    assert.equal(mailer.sent.length, 1);
    const tok1 = mailer.sent[0].token;
    const r2 = await auth.forgotReaderPassword('khong-co@bao.vn');
    assert.deepEqual(r2, { ok: true });
    assert.equal(mailer.sent.length, 1);
    await auth.forgotReaderPassword('d@bao.vn');
    const tok2 = mailer.sent[1].token;
    assert.notEqual(tok1, tok2);
    await assert.rejects(() => auth.resetReaderPassword(tok1, 'MatKhauMoi123'), /invalid or expired token/);
    assert.deepEqual(await auth.resetReaderPassword(tok2, 'MatKhauMoi123'), { ok: true });
    await assert.rejects(() => auth.resetReaderPassword(tok2, 'MatKhauKhac123'), /invalid or expired token/);
    const login = await auth.userPasswordLogin('d@bao.vn', 'MatKhauMoi123');
    assert.ok(login.access_token);
    await assert.rejects(() => auth.userPasswordLogin('d@bao.vn', 'MatKhau123'), /sai thong tin dang nhap/);
  } finally { restoreEnv(); }
});

// ---- Lien ket dev chi tra cho email trong DEV_AUTH_LINKS_ALLOW ----
test('dev link: chi email trong allowlist moi nhan link + co log (email, IP, thoi diem)', async () => {
  // Ham thuan: khop dung, khong phan biet hoa/thuong, cho dang local+tag.
  assert.equal(isDevLinkAllowedEmail('ktcn.digital@vtc.vn', 'ktcn.digital@vtc.vn'), true);
  assert.equal(isDevLinkAllowedEmail('KTCN.Digital@VTC.VN', 'ktcn.digital@vtc.vn'), true);
  assert.equal(isDevLinkAllowedEmail('ktcn.digital+test1@vtc.vn', 'ktcn.digital@vtc.vn'), true);
  assert.equal(isDevLinkAllowedEmail('ktcn.digital+tsht1@vtc.vn', 'ktcn.digital@vtc.vn, khac@vtc.vn'), true);
  assert.equal(isDevLinkAllowedEmail('ndung2006@gmail.com', 'ktcn.digital@vtc.vn'), false);
  assert.equal(isDevLinkAllowedEmail('ktcn.digital@khac.vn', 'ktcn.digital@vtc.vn'), false);
  assert.equal(isDevLinkAllowedEmail('ktcn.digital@vtc.vn', ''), false);
  assert.equal(isDevLinkAllowedEmail('khac@vtc.vn', 'ktcn.digital@vtc.vn'), false);

  setEnv({ DATABASE_URL: 'postgres://test', DEV_AUTH_LINKS: 'true', DEV_AUTH_LINKS_ALLOW: 'ktcn.digital@vtc.vn', TURNSTILE_SECRET_KEY: undefined });
  try {
    const { mailer, auth } = setup();
    const logs = [];
    auth.logger = { log: (m) => logs.push(String(m)), warn: () => {}, error: () => {} };
    // Email trong danh sach: dang ky tra link + ghi log.
    const r1 = await auth.registerReader({ displayName: 'KTCN', email: 'ktcn.digital@vtc.vn', password: 'MatKhau123', termsAccepted: true, clientIp: '203.0.113.7' });
    assert.ok(r1.devVerificationUrl.includes('/xac-nhan-email?token='));
    assert.ok(logs.some((m) => m.includes('DEV_AUTH_LINK') && m.includes('email_verification') && m.includes('ktcn.digital@vtc.vn') && m.includes('203.0.113.7')));
    // Dang plus-addressing cung duoc.
    const r1b = await auth.registerReader({ displayName: 'KTCN1', email: 'ktcn.digital+test1@vtc.vn', password: 'MatKhau123', termsAccepted: true, clientIp: '203.0.113.7' });
    assert.ok(r1b.devVerificationUrl.includes('/xac-nhan-email?token='));
    // Email ngoai danh sach (Gmail): thu that van gui, phan hoi KHONG co link.
    const r2 = await auth.registerReader({ displayName: 'N', email: 'ndung2006@gmail.com', password: 'MatKhau123', termsAccepted: true, clientIp: '203.0.113.7' });
    assert.deepEqual(Object.keys(r2).sort(), ['email', 'emailSent', 'ok']);
    assert.equal(mailer.sent.filter((s) => s.to === 'ndung2006@gmail.com').length, 1);
    assert.equal(logs.filter((m) => m.includes('ndung2006@gmail.com') && m.includes('DEV_AUTH_LINK')).length, 0);
    // Quen mat khau: trong danh sach tra link reset + log; ngoai danh sach khong.
    const f1 = await auth.forgotReaderPassword('ktcn.digital@vtc.vn', undefined, '203.0.113.7');
    assert.ok(f1.devResetUrl.includes('/dat-lai-mat-khau?token='));
    assert.ok(logs.some((m) => m.includes('DEV_AUTH_LINK') && m.includes('password_reset') && m.includes('ktcn.digital@vtc.vn')));
    const f2 = await auth.forgotReaderPassword('ndung2006@gmail.com');
    assert.deepEqual(f2, { ok: true });
  } finally { restoreEnv(); }
  // Tat DEV_AUTH_LINKS: ngay ca email trong danh sach cung khong co link.
  setEnv({ DATABASE_URL: 'postgres://test', DEV_AUTH_LINKS: undefined, DEV_AUTH_LINKS_ALLOW: 'ktcn.digital@vtc.vn', TURNSTILE_SECRET_KEY: undefined });
  try {
    const { auth } = setup();
    const r = await auth.registerReader({ displayName: 'KTCN', email: 'ktcn.digital@vtc.vn', password: 'MatKhau123', termsAccepted: true });
    assert.deepEqual(Object.keys(r).sort(), ['email', 'emailSent', 'ok']);
  } finally { restoreEnv(); }
});

// ---- Dang nhap + khoa tam ----
test('dang nhap sai 5 lan -> khoa tam 15 phut; dung thi mo; het khoa thi dang nhap lai duoc', async () => {
  setEnv({ DATABASE_URL: 'postgres://test', DEV_AUTH_LINKS: 'true', TURNSTILE_SECRET_KEY: undefined });
  try {
    const { auth } = setup();
    await auth.registerReader({ displayName: 'E', email: 'e@bao.vn', password: 'MatKhau123', termsAccepted: true });
    for (let i = 0; i < 5; i++) {
      await assert.rejects(() => auth.userPasswordLogin('e@bao.vn', 'sai'), /sai thong tin dang nhap/);
    }
    await assert.rejects(() => auth.userPasswordLogin('e@bao.vn', 'MatKhau123'), /account temporarily locked/);
    // Gia lap het 15 phut khoa.
    const realNow = Date.now;
    Date.now = () => realNow() + 16 * 60 * 1000;
    try {
      const login = await auth.userPasswordLogin('e@bao.vn', 'MatKhau123');
      assert.ok(login.access_token);
    } finally { Date.now = realNow; }
    // Dang nhap dung xoa dem sai: sai lai 1 lan chua khoa.
    await assert.rejects(() => auth.userPasswordLogin('e@bao.vn', 'sai'), /sai thong tin dang nhap/);
    const login2 = await auth.userPasswordLogin('e@bao.vn', 'MatKhau123');
    assert.ok(login2.access_token);
  } finally { restoreEnv(); }
});

// ---- Refresh token DB + doi mat khau vo hieu phien cu ----
test('refresh token luu DB dang bam: xoay vong, token cu chet, logout thu hoi', async () => {
  setEnv({ DATABASE_URL: 'postgres://test', DEV_AUTH_LINKS: 'true', TURNSTILE_SECRET_KEY: undefined });
  try {
    const { prisma, auth } = setup();
    await auth.registerReader({ displayName: 'F', email: 'f@bao.vn', password: 'MatKhau123', termsAccepted: true });
    const login = await auth.userPasswordLogin('f@bao.vn', 'MatKhau123');
    const row = await prisma.userRefreshToken.findUnique({ where: { tokenHash: hashToken(login.refresh_token) } });
    assert.ok(row);
    assert.equal(row.kind, 'enduser');
    assert.equal(row.revokedAt, undefined);
    const rotated = await auth.refresh(login.refresh_token);
    assert.ok(rotated.access_token);
    assert.notEqual(rotated.refresh_token, login.refresh_token);
    const oldRow = await prisma.userRefreshToken.findUnique({ where: { tokenHash: hashToken(login.refresh_token) } });
    assert.ok(oldRow.revokedAt instanceof Date);
    await assert.rejects(() => auth.refresh(login.refresh_token), /invalid refresh token/);
    assert.deepEqual(await auth.logoutReader(rotated.refresh_token), { ok: true });
    await assert.rejects(() => auth.refresh(rotated.refresh_token), /invalid refresh token/);
  } finally { restoreEnv(); }
});

test('doi mat khau: sai mat khau cu bi tu choi; doi xong access token cu chet, refresh cu chet', async () => {
  setEnv({ DATABASE_URL: 'postgres://test', DEV_AUTH_LINKS: 'true', TURNSTILE_SECRET_KEY: undefined });
  try {
    const { prisma, auth } = setup();
    await auth.registerReader({ displayName: 'G', email: 'g@bao.vn', password: 'MatKhau123', termsAccepted: true });
    const login = await auth.userPasswordLogin('g@bao.vn', 'MatKhau123');
    const iat = Math.floor(Date.now() / 1000);
    const sub = login.user.id;
    await assert.rejects(() => auth.changeReaderPassword(sub, iat, 'sai-mat-khau', 'MatKhauMoi123'), /current password incorrect/);
    await assert.rejects(() => auth.changeReaderPassword(sub, iat, 'MatKhau123', 'ngan'), /weak password/);
    await assert.rejects(() => auth.changeReaderPassword(sub, iat, 'MatKhau123', 'MatKhau123'), /password unchanged/);
    // Doi mat khau (khong stub thoi gian: `new Date()` trong service
    // doc dong ho he thong, khong doc Date.now() nen stub Date.now +2s
    // khong lam moc doi mat khau dich chuyen — test cu flaky tuy theo
    // giay login co trung giay doi mat khau khong. Thay vao do doc moc
    // that tu DB roi kiem tra so sanh theo giay mot cach xac dinh.)
    assert.deepEqual(await auth.changeReaderPassword(sub, iat, 'MatKhau123', 'MatKhauMoi123'), { ok: true });
    // Refresh token cu chet.
    await assert.rejects(() => auth.refresh(login.refresh_token), /invalid refresh token/);
    // Moc that tu DB.
    const u0 = await prisma.user.findUnique({ where: { email: 'g@bao.vn' } });
    assert.ok(u0.passwordChangedAt instanceof Date);
    const changedSec = Math.floor(new Date(u0.passwordChangedAt).getTime() / 1000);
    // Access token cap TRUOC moc doi mat khau chet o me().
    await assert.rejects(() => auth.me({ sub, kind: 'enduser', iat: changedSec - 1 }), /session expired, please login again/);
    // Token cap CUNG giay voi moc doi mat khau duoc chap nhan (cua so <1s,
    // tranh truong hop dang nhap lai ngay sau khi doi mat khau bi chan oan).
    const meSameSecond = await auth.me({ sub, kind: 'enduser', iat: changedSec });
    assert.equal(meSameSecond.kind, 'enduser');
    // Dang nhap moi song binh thuong.
    const login2 = await auth.userPasswordLogin('g@bao.vn', 'MatKhauMoi123');
    const me = await auth.me({ sub, kind: 'enduser', iat: Math.floor(Date.now() / 1000) });
    assert.equal(me.kind, 'enduser');
    assert.equal(me.user.id, sub);
    assert.ok(login2.access_token);
    const u = await prisma.user.findUnique({ where: { email: 'g@bao.vn' } });
    assert.ok(u.passwordChangedAt instanceof Date);
  } finally { restoreEnv(); }
});

// ---- Tai khoan: doi ten + yeu cau xoa ----
test('tai khoan: doi ten hien thi; yeu cau xoa thi khoa tai khoan + ghi nhan', async () => {
  setEnv({ DATABASE_URL: 'postgres://test', DEV_AUTH_LINKS: 'true', TURNSTILE_SECRET_KEY: undefined });
  try {
    const { prisma, auth } = setup();
    await auth.registerReader({ displayName: 'H', email: 'h@bao.vn', password: 'MatKhau123', termsAccepted: true });
    const login = await auth.userPasswordLogin('h@bao.vn', 'MatKhau123');
    const sub = login.user.id;
    const iat = Math.floor(Date.now() / 1000);
    const updated = await auth.updateReaderMe(sub, iat, '  Nguyen Van H  ');
    assert.equal(updated.displayName, 'Nguyen Van H');
    await assert.rejects(() => auth.updateReaderMe(sub, iat, '   '), /display name required/);
    assert.deepEqual(await auth.requestReaderDeletion(sub, iat, 'Khong dung nua'), { ok: true });
    const u = await prisma.user.findUnique({ where: { email: 'h@bao.vn' } });
    assert.equal(u.status, 'banned');
    assert.ok(u.deletionRequestedAt instanceof Date);
    assert.equal(u.deletionRequestReason, 'Khong dung nua');
    await assert.rejects(() => auth.userPasswordLogin('h@bao.vn', 'MatKhau123'), /tai khoan bi khoa/);
  } finally { restoreEnv(); }
});

// ---- Luat gop OAuth theo email ----
test('gop OAuth: khong gop vao tai khoan email chua xac nhan neu OAuth khong chung minh; Google verified thi gop + danh dau', async () => {
  setEnv({ DATABASE_URL: 'postgres://test' });
  try {
    const { prisma, users } = setup();
    // Tai khoan email chua xac nhan (dang ky tay, chua verify).
    await prisma.user.create({
      data: { id: 'u-unverified', email: 'u@bao.vn', passwordHash: await bcrypt.hash('MatKhau123', 10), status: 'active' },
    });
    await assert.rejects(
      () => users.upsertOAuth({ provider: 'google', providerId: 'google:sub-1', email: 'u@bao.vn', displayName: 'U', emailVerified: false }),
      (e) => e.code === 'email_not_verified',
    );
    await assert.rejects(
      () => users.upsertOAuth({ provider: 'facebook', providerId: 'facebook:fb-1', email: 'u@bao.vn', displayName: 'U' }),
      (e) => e.code === 'email_not_verified',
    );
    const merged = await users.upsertOAuth({ provider: 'google', providerId: 'google:sub-1', email: 'u@bao.vn', displayName: 'U', emailVerified: true });
    assert.equal(merged.id, 'u-unverified');
    assert.ok(merged.emailVerifiedAt);
    assert.equal(merged.provider, 'google');
    // Tai khoan moi qua Google verified -> co moc xac nhan; qua Facebook -> khong.
    const gNew = await users.upsertOAuth({ provider: 'google', providerId: 'google:sub-2', email: 'g2@bao.vn', displayName: 'G2', emailVerified: true });
    assert.ok(gNew.emailVerifiedAt);
    const fbNew = await users.upsertOAuth({ provider: 'facebook', providerId: 'facebook:fb-2', email: 'fb2@bao.vn', displayName: 'FB2' });
    assert.equal(fbNew.emailVerifiedAt, null);
  } finally { restoreEnv(); }
});
