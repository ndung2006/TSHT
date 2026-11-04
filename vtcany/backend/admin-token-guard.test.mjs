// Test: token doc gia/OTT khong duoc dung route admin.
// Logic thuan trong admin-token.ts (guard co decorator Nest nen test
// .mjs khong import truc tiep duoc — hook chi strip type, khong
// xu ly decorator/parameter properties).
import test from 'node:test';
import assert from 'node:assert/strict';
import { fallbackPermissionMap, isCmsToken } from './src/modules/auth/admin-token.ts';
import { hasModulePermission } from './src/modules/auth/permissions.catalog.ts';

test('isCmsToken: enduser -> false; cms / khong kind -> true', () => {
  assert.equal(isCmsToken({ kind: 'enduser', sub: 'u-1' }), false);
  assert.equal(isCmsToken({ kind: 'cms', sub: 'a-1', role: 'PV' }), true);
  assert.equal(isCmsToken({ sub: 'a-1', role: 'PV' }), true);
  assert.equal(isCmsToken(null), false);
  assert.equal(isCmsToken(undefined), false);
});

test('fallbackPermissionMap: khong role -> {} (403); role CMS cu giu nguyen', () => {
  assert.deepEqual(fallbackPermissionMap({ kind: 'enduser', sub: 'u-1' }), {});
  assert.deepEqual(fallbackPermissionMap({ sub: 'a-1' }), {});
  assert.deepEqual(fallbackPermissionMap({ role: 'admin' }), { '*': ['*'] });
  const editor = fallbackPermissionMap({ role: 'editor' });
  assert.ok(editor.video?.includes('read'));
});

test('mo phong guard cho token doc gia tren uploads/media: bi chan', () => {
  const reader = { kind: 'enduser', sub: 'u-1' };
  assert.equal(isCmsToken(reader), false); // guard nem 403 truoc khi xet quyen
  const map = fallbackPermissionMap(reader);
  assert.equal(hasModulePermission(map, 'video:create'), false);
  assert.equal(hasModulePermission(map, 'catalog:read'), false);
  assert.equal(hasModulePermission(map, 'catalog:delete'), false);
});

test('mo phong guard cho token CMS co map DB: khong doi', () => {
  const cms = { kind: 'cms', sub: 'a-1', role: 'PV' };
  assert.equal(isCmsToken(cms), true);
  // DB map thang (duong binh thuong) — guard dung map nay, khong fallback.
  const dbMap = { video: ['create'], catalog: ['read', 'write'] };
  assert.equal(hasModulePermission(dbMap, 'video:create'), true);
  assert.equal(hasModulePermission(dbMap, 'catalog:delete'), false);
});
