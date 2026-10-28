// Test Phong ban: slug/validate (Dot 1a) + gan quyen departments:*.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  normalizeDepartmentInput, normalizeDepartmentPatch, slugifyDepartment,
} from './src/modules/departments/department-input.ts';
import {
  PERMISSION_MODULES, hasModulePermission, sanitizePermissionMap,
} from './src/modules/auth/permissions.catalog.ts';

test('slug tieng Viet: bo dau, d -> d, ky tu la -> -', () => {
  assert.equal(slugifyDepartment('Phòng Báo điện tử'), 'phong-bao-dien-tu');
  assert.equal(slugifyDepartment('Ban Tổng biên tập!'), 'ban-tong-bien-tap');
  assert.equal(slugifyDepartment(''), '');
});

test('tao phong ban: ten bat buoc, slug tu sinh, sortOrder/isVisible mac dinh', () => {
  assert.deepEqual(
    normalizeDepartmentInput({ name: 'Phòng Báo điện tử' }),
    { name: 'Phòng Báo điện tử', slug: 'phong-bao-dien-tu', sortOrder: 0, isVisible: true },
  );
  assert.throws(() => normalizeDepartmentInput({ name: '   ' }), /ten phong ban bat buoc/);
  assert.throws(() => normalizeDepartmentInput({}), /ten phong ban bat buoc/);
  assert.deepEqual(
    normalizeDepartmentInput({ name: 'A', slug: 'tu-nhap', sortOrder: 3, isVisible: false }),
    { name: 'A', slug: 'tu-nhap', sortOrder: 3, isVisible: false },
  );
});

test('patch: chi tra ve truong co trong input; doi ten -> slug tu sinh lai', () => {
  const row = { name: 'Phong Cu', slug: 'phong-cu' };
  assert.deepEqual(normalizeDepartmentPatch({}, row), {});
  assert.deepEqual(
    normalizeDepartmentPatch({ name: 'Phòng Mới' }, row),
    { name: 'Phòng Mới', slug: 'phong-moi' },
  );
  assert.deepEqual(
    normalizeDepartmentPatch({ slug: 'slug-rieng' }, row),
    { slug: 'slug-rieng' },
  );
  assert.deepEqual(
    normalizeDepartmentPatch({ sortOrder: 5, isVisible: false }, row),
    { sortOrder: 5, isVisible: false },
  );
  assert.throws(() => normalizeDepartmentPatch({ name: '' }, row), /ten phong ban bat buoc/);
});

test('quyen: module departments co du 5 hanh dong, sanitize giu lai, guard chan dung', () => {
  const mod = PERMISSION_MODULES.find((m) => m.key === 'departments');
  assert.ok(mod, 'thieu module departments trong PERMISSION_MODULES');
  assert.deepEqual([...mod.actions], ['view', 'create', 'update', 'publish', 'delete']);
  assert.deepEqual(
    sanitizePermissionMap({ departments: ['view', 'create', 'bogus'], articles: ['view'] }),
    { departments: ['view', 'create'], articles: ['view'] },
  );
  assert.equal(hasModulePermission({ departments: ['view'] }, 'departments:view'), true);
  assert.equal(hasModulePermission({ departments: ['view'] }, 'departments:create'), false);
  assert.equal(hasModulePermission({ '*': ['*'] }, 'departments:delete'), true);
  assert.equal(hasModulePermission({}, 'departments:view'), false);
});
