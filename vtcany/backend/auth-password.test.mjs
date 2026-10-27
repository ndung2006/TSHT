import { test } from 'node:test';
import assert from 'node:assert/strict';
import bcryptModule from 'bcryptjs';
import { AuthService } from './dist/modules/auth/auth.service.js';

const bcrypt = bcryptModule.default ?? bcryptModule;

const fakeJwt = {
  signAsync: async (payload) => Buffer.from(JSON.stringify(payload)).toString('base64url'),
};

// Prisma gia: chi phan adminUser ma AuthService dung.
function fakePrisma() {
  const rows = new Map();
  return {
    rows,
    adminUser: {
      count: async () => rows.size,
      findFirst: async ({ where }) => {
        for (const r of rows.values()) {
          if (where.id && r.id !== where.id) continue;
          if (where.username && r.username !== where.username) continue;
          if (where.email?.equals && (r.email || '').toLowerCase() !== where.email.equals.toLowerCase()) continue;
          return r;
        }
        return null;
      },
      create: async ({ data }) => {
        const row = { ...data };
        rows.set(row.id, row);
        return row;
      },
      update: async ({ where, data }) => {
        const row = rows.get(where.id);
        Object.assign(row, data);
        return row;
      },
    },
  };
}

test('auth in-memory: doi mat khau -> mat khau cu chet, moi song, refresh bi thu hoi', async () => {
  const svc = new AuthService(fakeJwt);
  const login1 = await svc.adminLogin('admin@vtcany.vn', 'Admin@123');
  assert.ok(login1.access_token);
  await assert.rejects(() => svc.changePassword('u-root-0', 'sai-mat-khau', 'MatKhauMoi@2026'), /current password incorrect/);
  await assert.rejects(() => svc.changePassword('u-root-0', 'Admin@123', 'ngan'), /weak password/);
  await assert.rejects(() => svc.changePassword('u-root-0', 'Admin@123', 'Admin@123'), /password unchanged/);
  const res = await svc.changePassword('u-root-0', 'Admin@123', 'MatKhauMoi@2026');
  assert.deepEqual(res, { ok: true });
  await assert.rejects(() => svc.adminLogin('admin@vtcany.vn', 'Admin@123'), /invalid credentials/);
  const login2 = await svc.adminLogin('admin@vtcany.vn', 'MatKhauMoi@2026');
  assert.ok(login2.access_token);
  await assert.rejects(() => svc.refresh(login1.refresh_token), /invalid refresh token/);
  // Tra lai hash seed (khong qua changePassword vi 'Admin@123' ngan hon muc toi thieu).
  const { USERS } = await import('./dist/modules/auth/users.store.js');
  USERS.find((u) => u.id === 'u-root-0').passwordHash = bcrypt.hashSync('Admin@123', 10);
});

test('auth DB: seed khi bang trong, doi mat khau ben qua "restart" (instance moi)', async () => {
  const prisma = fakePrisma();
  const svc = new AuthService(fakeJwt, prisma);
  await svc.onModuleInit();
  assert.equal(prisma.rows.size, 3);
  const before = await svc.adminLogin('editor', 'x').catch((e) => e);
  assert.match(String(before.message || before), /invalid credentials/);
  const login1 = await svc.login('editor', 'editor123');
  assert.ok(login1.access_token);
  assert.equal(prisma.rows.get('u-editor-1').lastLogin instanceof Date, true);
  await svc.changePassword('u-editor-1', 'editor123', 'EditorMoi@2026!');
  // Instance moi mo phong backend restart: chi con du lieu DB.
  const svc2 = new AuthService(fakeJwt, prisma);
  await svc2.onModuleInit();
  assert.equal(prisma.rows.size, 3);
  await assert.rejects(() => svc2.login('editor', 'editor123'), /invalid credentials/);
  const login2 = await svc2.login('editor', 'EditorMoi@2026!');
  assert.ok(login2.access_token);
  const row = prisma.rows.get('u-editor-1');
  assert.equal(await bcrypt.compare('EditorMoi@2026!', row.passwordHash), true);
  const me = await svc2.me({ sub: 'u-editor-1', kind: 'cms', role: 'editor' });
  assert.equal(me.user.username, 'editor');
  assert.equal(me.user.role, 'editor');
});

test('auth fallback: DB loi -> login fallback RAM nhung CAM doi mat khau; DB khoe lai -> tu quay ve DB (khong dinh vinh vien)', async () => {
  const prisma = fakePrisma();
  // Row chi DB biet (mat khau khac han store in-memory) de phan biet nguon doc.
  prisma.rows.set('u-db-9', {
    id: 'u-db-9', username: 'dbadmin', email: 'db@vtcany.vn',
    passwordHash: bcrypt.hashSync('DbOnly@12345', 10),
    fullName: 'DB Admin', roleName: 'admin', status: 'active',
  });
  const healthy = { ...prisma.adminUser };
  const boom = async () => { throw new Error('connection refused'); };
  prisma.adminUser.count = boom;
  prisma.adminUser.findFirst = boom;
  prisma.adminUser.create = boom;
  prisma.adminUser.update = boom;

  const svc = new AuthService(fakeJwt, prisma);
  await svc.onModuleInit(); // seed that bai -> vao cooldown fallback
  // Dang fallback: tai khoan DB khong thay...
  await assert.rejects(() => svc.adminLogin('db@vtcany.vn', 'DbOnly@12345'), /invalid credentials/);
  // ...nhung tai khoan in-memory van dang nhap duoc (giu kha dung)...
  const memLogin = await svc.adminLogin('admin@vtcany.vn', 'Admin@123');
  assert.ok(memLogin.access_token);
  // ...va TUYET DOI khong cho doi mat khau (ghi RAM se mat khi restart).
  await assert.rejects(() => svc.changePassword('u-root-0', 'Admin@123', 'MatKhauMoi@2026'), /database unavailable/);

  // DB khoe lai + het cooldown: auth tu quay ve DB, khong dinh fallback nua.
  Object.assign(prisma.adminUser, healthy);
  svc.dbDownUntil = 0;
  const dbLogin = await svc.adminLogin('db@vtcany.vn', 'DbOnly@12345');
  assert.ok(dbLogin.access_token);
  const res = await svc.changePassword('u-db-9', 'DbOnly@12345', 'DbMoi@2026!');
  assert.deepEqual(res, { ok: true });
  assert.equal(await bcrypt.compare('DbMoi@2026!', prisma.rows.get('u-db-9').passwordHash), true);
});
