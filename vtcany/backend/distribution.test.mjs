// Test quy tac thuan module Phan phoi (giai doan 2) — chay truc tiep bang
// node --test, khong can build (file rules khong decorator, khong Prisma).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  cleanPlatforms,
  isHttpUrl,
  publishTargetUpdate,
  unpublishTargetUpdate,
} from './src/modules/distribution/distribution-rules.ts';
import { PERMISSION_MODULES } from './src/modules/auth/permissions.catalog.ts';

test('cleanPlatforms: loc platform la, khu trung, khong phai mang thi rong', () => {
  assert.deepEqual(cleanPlatforms(['app', 'tiktok', 'app', 'nope']), ['app', 'tiktok']);
  assert.deepEqual(cleanPlatforms('app'), []);
  assert.deepEqual(cleanPlatforms(undefined), []);
});

test('isHttpUrl: chi chap nhan http/https', () => {
  assert.equal(isHttpUrl('https://www.tiktok.com/@x/video/1'), true);
  assert.equal(isHttpUrl('http://facebook.com/p/1'), true);
  assert.equal(isHttpUrl('/images/a.png'), false);
  assert.equal(isHttpUrl('javascript:alert(1)'), false);
  assert.equal(isHttpUrl(''), false);
});

test('publish: app luon posted kem url portal; facebook/tiktok draft -> ready; da posted/failed giu nguyen', () => {
  assert.deepEqual(publishTargetUpdate({ platform: 'app', status: 'draft' }), { status: 'posted', url: '/nen-tang-so' });
  assert.deepEqual(publishTargetUpdate({ platform: 'app', status: 'posted' }), { status: 'posted', url: '/nen-tang-so' });
  assert.deepEqual(publishTargetUpdate({ platform: 'facebook', status: 'draft' }), { status: 'ready', url: null });
  assert.deepEqual(publishTargetUpdate({ platform: 'tiktok', status: 'draft' }), { status: 'ready', url: null });
  assert.equal(publishTargetUpdate({ platform: 'tiktok', status: 'posted' }), null);
  assert.equal(publishTargetUpdate({ platform: 'facebook', status: 'failed' }), null);
});

test('unpublish: chi app dang posted moi ve draft; dich tay giu nguyen', () => {
  assert.deepEqual(unpublishTargetUpdate({ platform: 'app', status: 'posted' }), { status: 'draft', url: null });
  assert.equal(unpublishTargetUpdate({ platform: 'app', status: 'draft' }), null);
  assert.equal(unpublishTargetUpdate({ platform: 'tiktok', status: 'posted' }), null);
  assert.equal(unpublishTargetUpdate({ platform: 'facebook', status: 'ready' }), null);
});

test('permission catalog co module distribution du 5 hanh dong', () => {
  const m = PERMISSION_MODULES.find((x) => x.key === 'distribution');
  assert.ok(m, 'thieu module distribution');
  assert.deepEqual([...m.actions].sort(), ['create', 'delete', 'publish', 'update', 'view']);
});
