// Test permission catalog + RolesService — chay sau `npm run build`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  hasModulePermission,
  flattenPermissions,
  legacyListToMap,
  sanitizePermissionMap,
  PERMISSION_MODULES,
} from './dist/modules/auth/permissions.catalog.js';
import { RolesService } from './dist/modules/auth/roles.service.js';

test('catalog co 27 module, module users/roles/admins khong co publish, settings chi view+update', () => {
  assert.equal(PERMISSION_MODULES.length, 27);
  const byKey = Object.fromEntries(PERMISSION_MODULES.map((m) => [m.key, m.actions]));
  assert.deepEqual(byKey.users, ['view', 'create', 'update', 'delete']);
  assert.deepEqual(byKey.roles, ['view', 'create', 'update', 'delete']);
  assert.deepEqual(byKey.admins, ['view', 'create', 'update', 'delete']);
  assert.deepEqual(byKey.settings, ['view', 'update']);
  assert.equal(byKey.movies.length, 5);
});

test('hasModulePermission: wildcard, exact, legacy alias, module alias', () => {
  assert.ok(hasModulePermission({ '*': ['*'] }, 'movies:delete'));
  assert.ok(hasModulePermission({ movies: ['view', 'create'] }, 'movies:view'));
  assert.ok(!hasModulePermission({ movies: ['view'] }, 'movies:delete'));
  // legacy: write = bat ky hanh dong sua doi nao
  assert.ok(hasModulePermission({ catalog: ['create'] }, 'catalog:write'));
  assert.ok(hasModulePermission({ catalog: ['publish'] }, 'catalog:write'));
  assert.ok(!hasModulePermission({ catalog: ['view'] }, 'catalog:write'));
  // legacy: read = view
  assert.ok(hasModulePermission({ epg: ['view'] }, 'epg:read'));
  assert.ok(!hasModulePermission({ epg: ['create'] }, 'epg:read'));
  // legacy: submit = publish
  assert.ok(hasModulePermission({ videos: ['publish'] }, 'video:submit'));
  // module alias so it/so nhieu
  assert.ok(hasModulePermission({ videos: ['view'] }, 'video:read'));
  assert.ok(hasModulePermission({ video: ['view'] }, 'videos:view'));
  assert.ok(hasModulePermission({ categories: ['update'] }, 'category:update'));
  assert.ok(hasModulePermission({ users: ['view'] }, 'user:read'));
  assert.ok(hasModulePermission({ users: ['create'] }, 'user:write'));
  // deny
  assert.ok(!hasModulePermission({}, 'movies:view'));
  assert.ok(!hasModulePermission(null, 'movies:view'));
  assert.ok(!hasModulePermission({ movies: ['view'] }, 'invalid'));
});

test('flattenPermissions: lam phang + alias cu + alias so it/nhieu cho CMS can()', () => {
  const flat = flattenPermissions({ movies: ['view', 'create'], settings: ['view'], categories: ['update'] });
  assert.ok(flat.includes('movies:view'));
  assert.ok(flat.includes('movies:create'));
  assert.ok(flat.includes('movies:write'));
  assert.ok(flat.includes('movies:read'));
  assert.ok(flat.includes('settings:view'));
  assert.ok(flat.includes('settings:read'));
  assert.ok(!flat.includes('settings:write'));
  // alias so it/so nhieu
  assert.ok(flat.includes('categories:update'));
  assert.ok(flat.includes('category:update'));
  const flat2 = flattenPermissions({ videos: ['view'] });
  assert.ok(flat2.includes('videos:view') && flat2.includes('video:read'));
  assert.deepEqual(flattenPermissions({ '*': ['*'] }), ['*']);
  assert.deepEqual(flattenPermissions({}), []);
});

test('legacyListToMap: "*" -> wildcard', () => {
  assert.deepEqual(legacyListToMap(['*']), { '*': ['*'] });
  assert.deepEqual(legacyListToMap(['video:read', 'catalog:write']), {
    video: ['read'],
    catalog: ['write'],
  });
});

test('sanitizePermissionMap: loc action/module khong hop le', () => {
  const out = sanitizePermissionMap({
    movies: ['view', 'create', 'hack', 123],
    settings: ['view', 'delete'], // settings khong co delete
    nonexist: ['view'],
  });
  assert.deepEqual(out, { movies: ['view', 'create'], settings: ['view'] });
  assert.deepEqual(sanitizePermissionMap({ '*': '*' }), { '*': ['*'] });
  assert.deepEqual(sanitizePermissionMap(null), {});
});

// ---- RolesService voi fake Prisma ----
function fakePrisma() {
  const roles = [];
  const admins = [];
  let seq = 0;
  return {
    _roles: roles,
    _admins: admins,
    role: {
      count: async () => roles.length,
      findMany: async () => [...roles],
      findUnique: async ({ where }) => roles.find((r) => r.id === where.id || r.name === where.name) || null,
      findFirst: async ({ where }) => {
        if (where?.name && typeof where.name === 'object')
          return roles.find((r) => r.name.toLowerCase() === String(where.name.equals).toLowerCase()) || null;
        return roles.find((r) => where?.name ? r.name === where.name : true) || null;
      },
      create: async ({ data }) => {
        const r = { id: `r${++seq}`, createdAt: new Date(), ...data };
        roles.push(r);
        return r;
      },
      update: async ({ where, data }) => {
        const r = roles.find((x) => x.id === where.id);
        Object.assign(r, data);
        return r;
      },
      delete: async ({ where }) => {
        const i = roles.findIndex((x) => x.id === where.id);
        roles.splice(i, 1);
        return { ok: true };
      },
    },
    adminUser: {
      count: async ({ where } = {}) => admins.filter((a) => !where || Object.entries(where).every(([k, v]) => a[k] === v)).length,
      findMany: async ({ where } = {}) =>
        !where ? [...admins] : admins.filter((a) => Object.entries(where).every(([k, v]) => a[k] === v)),
      findUnique: async ({ where, include }) => {
        const a = admins.find((x) => x.id === where.id) || null;
        if (a && include?.role) a.role = roles.find((r) => r.id === a.roleId) || null;
        return a;
      },
      update: async ({ where, data }) => {
        const a = admins.find((x) => x.id === where.id);
        Object.assign(a, data);
        return a;
      },
    },
  };
}

test('RolesService.ensureSeed: seed 5 vai tro + backfill roleId', async () => {
  const prisma = fakePrisma();
  prisma._admins.push({ id: 'a1', roleName: 'editor', roleId: null, status: 'active' });
  const svc = new RolesService(prisma);
  await svc.ensureSeed();
  assert.equal(prisma._roles.length, 5);
  const names = prisma._roles.map((r) => r.name);
  assert.ok(names.includes('Super Admin') && names.includes('Moderators'));
  const superAdmin = prisma._roles.find((r) => r.name === 'Super Admin');
  assert.deepEqual(superAdmin.permissions, { '*': ['*'] });
  // backfill
  const a1 = prisma._admins.find((a) => a.id === 'a1');
  assert.ok(a1.roleId, 'roleId duoc backfill tu roleName cu');
  // idempotent
  await svc.ensureSeed();
  assert.equal(prisma._roles.length, 5);
});

test('RolesService CRUD + xoa role dang dung bi chan', async () => {
  const prisma = fakePrisma();
  const svc = new RolesService(prisma);
  await svc.ensureSeed();
  const created = await svc.create({ name: 'Test Role', permissions: { movies: ['view'] } });
  assert.equal(created.name, 'Test Role');
  await assert.rejects(() => svc.create({ name: '' }), /name required/);
  const updated = await svc.update(created.id, { permissions: { movies: ['view', 'create'] } });
  assert.deepEqual(updated.permissions, { movies: ['view', 'create'] });
  // gan admin vao role roi xoa -> chan
  prisma._admins.push({ id: 'a2', roleId: created.id, status: 'active' });
  await assert.rejects(() => svc.remove(created.id), /đang gán/);
  prisma._admins.length = 0;
  await svc.remove(created.id);
  assert.equal(prisma._roles.find((r) => r.id === created.id), undefined);
});

test('RolesService.permissionMapForAdmin: uu tien roleId', async () => {
  const prisma = fakePrisma();
  const svc = new RolesService(prisma);
  await svc.ensureSeed();
  const editor = prisma._roles.find((r) => r.name === 'Editor');
  prisma._admins.push({ id: 'a3', roleId: editor.id, roleName: 'editor', status: 'active' });
  const map = await svc.permissionMapForAdmin('a3');
  assert.ok(map.videos.includes('view'));
  assert.ok(hasModulePermission(map, 'video:read'));
  assert.ok(hasModulePermission(map, 'catalog:write'));
  assert.equal(await svc.permissionMapForAdmin('khong-co'), null);
});
