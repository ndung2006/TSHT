// Test UsersService (quan ly nguoi dung cuoi cho CMS) — fake Prisma, chay sau `npm run build`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as bcrypt from 'bcryptjs';
import { UsersService } from './dist/modules/auth/users.service.js';

// Fake Prisma in-memory: chi implement cac ham UsersService dung.
function fakePrisma() {
  const users = [];
  const profiles = [];
  const sessions = [];
  const comments = [];
  let seq = 0;
  const match = (u, where) => {
    if (!where || Object.keys(where).length === 0) return true;
    let ok = true;
    if (where.OR) ok = ok && where.OR.some((c) => match(u, c));
    if (where.NOT) ok = ok && !match(u, where.NOT);
    ok = ok && Object.entries(where)
      .filter(([k]) => k !== 'OR' && k !== 'NOT')
      .every(([k, v]) => {
        if (v && typeof v === 'object' && 'contains' in v) {
          const val = String(u[k] || '');
          return v.mode === 'insensitive'
            ? val.toLowerCase().includes(String(v.contains).toLowerCase())
            : val.includes(String(v.contains));
        }
        return u[k] === v;
      });
    return ok;
  };
  const fake = {
    _users: users,
    _comments: comments,
    // remove() dung $transaction: fake chay callback voi chinh fake nay
    // lam tx (tx.user/tx.userSession/tx.comment deu co).
    $transaction: async (fn) => fn(fake),
    comment: {
      updateMany: async ({ where, data }) => {
        let n = 0;
        for (const c of comments) {
          if (where?.userId !== undefined && c.userId !== where.userId) continue;
          Object.assign(c, data);
          n++;
        }
        return { count: n };
      },
    },
    user: {
      count: async ({ where } = {}) => users.filter((u) => match(u, where)).length,
      findMany: async ({ where, orderBy, skip, take } = {}) => {
        let r = users.filter((u) => match(u, where));
        if (orderBy?.createdAt) r = [...r].sort((a, b) => orderBy.createdAt === 'desc' ? b.createdAt - a.createdAt : a.createdAt - b.createdAt);
        return r.slice(skip || 0, (skip || 0) + (take ?? r.length));
      },
      findUnique: async ({ where }) => users.find((u) => Object.entries(where).every(([k, v]) => u[k] === v)) || null,
      findFirst: async ({ where } = {}) => users.find((u) => match(u, where)) || null,
      create: async ({ data }) => {
        const u = { id: data.id || `u-${++seq}`, status: 'active', createdAt: new Date(), ...data };
        users.push(u);
        return u;
      },
      update: async ({ where, data }) => {
        const u = users.find((x) => x.id === where.id);
        Object.assign(u, data);
        return u;
      },
      delete: async ({ where }) => {
        const i = users.findIndex((x) => x.id === where.id);
        const [u] = users.splice(i, 1);
        return u;
      },
    },
    userProfile: { create: async ({ data }) => { profiles.push(data); return data; } },
    userSession: {
      deleteMany: async () => ({ count: 0 }),
      updateMany: async ({ where, data }) => {
        let n = 0;
        for (const s of sessions) if (s.userId === where.userId) { Object.assign(s, data); n++; }
        return { count: n };
      },
    },
  };
  return fake;
}

test('create: chuan hoa email/phone, hash password, khong lo passwordHash', async () => {
  const svc = new UsersService(fakePrisma());
  const u = await svc.create({ email: '  TeSt@X.vn ', phone: '090 111 2222', displayName: 'An', password: 'matkhau123' });
  assert.equal(u.email, 'test@x.vn');
  assert.equal(u.phone, '0901112222');
  assert.equal(u.displayName, 'An');
  assert.equal(u.status, 'active');
  assert.ok(!('passwordHash' in u));
});

test('create: thieu email+phone -> 400; trung email -> 409; password ngan -> 400', async () => {
  const svc = new UsersService(fakePrisma());
  await assert.rejects(() => svc.create({ displayName: 'X' }), /can email/);
  await svc.create({ email: 'a@x.vn', password: 'matkhau123' });
  await assert.rejects(() => svc.create({ email: 'A@X.VN' }), /da ton tai/);
  await assert.rejects(() => svc.create({ email: 'b@x.vn', password: 'ngan' }), /it nhat 8/);
});

test('update: doi ten/khoa; email trung nguoi khac -> 409', async () => {
  const db = fakePrisma();
  const svc = new UsersService(db);
  const a = await svc.create({ email: 'a@x.vn' });
  await svc.create({ email: 'b@x.vn' });
  const u = await svc.update(a.id, { displayName: 'Ten Moi', status: 'banned' });
  assert.equal(u.displayName, 'Ten Moi');
  assert.equal(u.status, 'banned');
  await assert.rejects(() => svc.update(a.id, { email: 'b@x.vn' }), /da ton tai/);
  await assert.rejects(() => svc.update('khong-co', { displayName: 'x' }), /khong ton tai/);
});

test('resetPassword + verifyPasswordLogin: doi MK, login dung/sai, khoa tai khoan', async () => {
  const svc = new UsersService(fakePrisma());
  const u = await svc.create({ email: 'c@x.vn', password: 'matkhau-cu' });
  await svc.resetPassword(u.id, 'matkhau-moi');
  const ok = await svc.verifyPasswordLogin('C@X.VN', 'matkhau-moi');
  assert.equal(ok.id, u.id);
  await assert.rejects(() => svc.verifyPasswordLogin('c@x.vn', 'matkhau-cu'), /sai thong tin/);
  await assert.rejects(() => svc.verifyPasswordLogin('c@x.vn', ''), /thieu/);
  await svc.update(u.id, { status: 'banned' });
  await assert.rejects(() => svc.verifyPasswordLogin('c@x.vn', 'matkhau-moi'), /bi khoa/);
});

test('list: phan trang + tim kiem theo email/phone/ten', async () => {
  const svc = new UsersService(fakePrisma());
  await svc.create({ email: 'nguyen@x.vn', displayName: 'Nguyen Van A' });
  await svc.create({ phone: '0912345678', displayName: 'Tran B' });
  await svc.create({ email: 'khac@x.vn', displayName: 'Le C' });
  const all = await svc.list({ page: 1, limit: 20 });
  assert.equal(all.meta.total, 3);
  assert.equal(all.data.length, 3);
  const q1 = await svc.list({ q: 'nguyen' });
  assert.equal(q1.meta.total, 1); // khop email + ten cua cung 1 user
  const q2 = await svc.list({ q: '0912345678' });
  assert.equal(q2.meta.total, 1);
  const p1 = await svc.list({ page: 1, limit: 2 });
  assert.equal(p1.data.length, 2);
  assert.equal(p1.meta.total, 3);
});

test('upsertOAuth: tao moi + profile; goi lai khong tao trung; khoa -> forbidden', async () => {
  const svc = new UsersService(fakePrisma());
  const u1 = await svc.upsertOAuth({ provider: 'google', providerId: 'google:1', email: 'g@x.vn', displayName: 'G User' });
  assert.equal(u1.provider, 'google');
  assert.equal(u1.displayName, 'G User');
  const u2 = await svc.upsertOAuth({ provider: 'google', providerId: 'google:1', email: 'g@x.vn' });
  assert.equal(u2.id, u1.id);
  // cung email, provider khac -> dung chung user
  const u3 = await svc.upsertOAuth({ provider: 'facebook', providerId: 'facebook:9', email: 'g@x.vn' });
  assert.equal(u3.id, u1.id);
  await svc.update(u1.id, { status: 'banned' });
  await assert.rejects(() => svc.upsertOAuth({ provider: 'google', providerId: 'google:1' }), /bi khoa/);
});

test('remove: xoa user', async () => {
  const svc = new UsersService(fakePrisma());
  const u = await svc.create({ email: 'd@x.vn' });
  await svc.remove(u.id);
  const all = await svc.list({});
  assert.equal(all.meta.total, 0);
  await assert.rejects(() => svc.remove(u.id), /khong ton tai/);
});

// Binh luan dot 1 §6.3 (T68): xoa cung user -> binh luan cua user do
// duoc an danh hoa (userId null, ten moi, ip/userAgent null), giu
// nguyen body/status/createdAt; binh luan cua nguoi khac va tra loi
// cua toa soan (userId null san) khong bi cham.
test('remove: an danh hoa binh luan cua user bi xoa (§6.3)', async () => {
  const db = fakePrisma();
  const svc = new UsersService(db);
  const u = await svc.create({ email: 'e@x.vn', displayName: 'Ban Doc E' });
  const other = await svc.create({ email: 'f@x.vn', displayName: 'Ban Doc F' });
  const mineApproved = { id: 'c1', userId: u.id, authorName: 'Ban Doc E', body: 'Hay', status: 'approved', ip: '1.2.3.4', userAgent: 'UA', createdAt: new Date('2026-11-01T00:00:00.000Z') };
  const minePending = { id: 'c2', userId: u.id, authorName: 'Ban Doc E', body: 'Cho duyet', status: 'pending', ip: '1.2.3.4', userAgent: 'UA', createdAt: new Date('2026-11-02T00:00:00.000Z') };
  const others = { id: 'c3', userId: other.id, authorName: 'Ban Doc F', body: 'Cua F', status: 'approved', ip: '5.6.7.8', userAgent: 'UA', createdAt: new Date('2026-11-01T00:00:00.000Z') };
  const newsroom = { id: 'c4', userId: null, authorName: 'Tòa soạn', body: 'Tra loi', status: 'approved', ip: '9.9.9.9', userAgent: 'UA', createdAt: new Date('2026-11-01T00:00:00.000Z') };
  db._comments.push(mineApproved, minePending, others, newsroom);
  await svc.remove(u.id);
  for (const c of [mineApproved, minePending]) {
    assert.equal(c.userId, null);
    assert.equal(c.authorName, 'Bạn đọc đã xóa tài khoản');
    assert.equal(c.ip, null);
    assert.equal(c.userAgent, null);
  }
  assert.equal(mineApproved.body, 'Hay');
  assert.equal(mineApproved.status, 'approved');
  assert.equal(mineApproved.createdAt.toISOString(), '2026-11-01T00:00:00.000Z');
  assert.equal(minePending.status, 'pending');
  // Khong cham binh luan cua nguoi khac / cua toa soan.
  assert.equal(others.userId, other.id);
  assert.equal(others.authorName, 'Ban Doc F');
  assert.equal(others.ip, '5.6.7.8');
  assert.equal(newsroom.authorName, 'Tòa soạn');
  assert.equal(newsroom.ip, '9.9.9.9');
});
