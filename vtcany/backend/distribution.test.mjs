// Test quy tac thuan module Phan phoi (giai doan 2) — chay truc tiep bang
// node --test, khong can build (file rules khong decorator, khong Prisma).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  catalogPublicIdForThumbnail,
  cleanPlatforms,
  isCatalogOnlyUpdate,
  isCatalogPublicId,
  isHttpUrl,
  publishTargetUpdate,
  shortPlayTarget,
  unpublishTargetUpdate,
} from './src/modules/distribution/distribution-rules.ts';
import { PERMISSION_MODULES } from './src/modules/auth/permissions.catalog.ts';

test('cleanPlatforms: loc platform la, khu trung, khong phai mang thi rong', () => {
  assert.deepEqual(cleanPlatforms(['app', 'tiktok', 'app', 'nope']), ['app', 'tiktok']);
  assert.deepEqual(cleanPlatforms(['youtube', 'facebook']), ['youtube', 'facebook']);
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

test('publish: app luon posted kem url portal; facebook/tiktok/youtube draft -> ready; da posted/failed giu nguyen', () => {
  assert.deepEqual(publishTargetUpdate({ platform: 'app', status: 'draft' }), { status: 'posted', url: '/nen-tang-so' });
  assert.deepEqual(publishTargetUpdate({ platform: 'app', status: 'posted' }), { status: 'posted', url: '/nen-tang-so' });
  assert.deepEqual(publishTargetUpdate({ platform: 'facebook', status: 'draft' }), { status: 'ready', url: null });
  assert.deepEqual(publishTargetUpdate({ platform: 'tiktok', status: 'draft' }), { status: 'ready', url: null });
  assert.deepEqual(publishTargetUpdate({ platform: 'youtube', status: 'draft' }), { status: 'ready', url: null });
  assert.equal(publishTargetUpdate({ platform: 'tiktok', status: 'posted' }), null);
  assert.equal(publishTargetUpdate({ platform: 'youtube', status: 'posted' }), null);
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

// ---- Tham chieu catalog (goi sua phat short 2026-11-05) ----
test('isCatalogPublicId: chi chap nhan 24 ky tu hex', () => {
  assert.equal(isCatalogPublicId('b524149752f2c6014bc4fd1b'), true);
  assert.equal(isCatalogPublicId('B524149752F2C6014BC4FD1B'), false);
  assert.equal(isCatalogPublicId('b524149752f2c6014bc4fd1'), false); // 23 ky tu
  assert.equal(isCatalogPublicId('b524149752f2c6014bc4fd1bb'), false); // 25 ky tu
  assert.equal(isCatalogPublicId(''), false);
  assert.equal(isCatalogPublicId(null), false);
  assert.equal(isCatalogPublicId(undefined), false);
  assert.equal(isCatalogPublicId(123), false);
});

test('shortPlayTarget: chi bai video co tham chieu hop le moi phat noi tuyen', () => {
  assert.deepEqual(
    shortPlayTarget({ catalogPublicId: 'b524149752f2c6014bc4fd1b', mediaType: 'video' }),
    { kind: 'short', publicId: 'b524149752f2c6014bc4fd1b' },
  );
  assert.equal(shortPlayTarget({ catalogPublicId: null, mediaType: 'video' }), null); // bai cu khong gan catalog
  assert.equal(shortPlayTarget({ catalogPublicId: 'b524149752f2c6014bc4fd1b', mediaType: 'image' }), null);
  assert.equal(shortPlayTarget({ catalogPublicId: 'khong-hop-le', mediaType: 'video' }), null);
  assert.equal(shortPlayTarget({}), null);
});

test('catalogPublicIdForThumbnail: khop chinh xac ten file thumbnail (ca 6 bai hien co)', () => {
  const abs = 'https://vtcany-api.vtctech.xyz/images/thumb-upl-1793864571176.jpg';
  const rel = '/images/thumb-upl-1793864571176.jpg';
  assert.equal(catalogPublicIdForThumbnail(abs), 'b524149752f2c6014bc4fd1b');
  assert.equal(catalogPublicIdForThumbnail(rel), 'b524149752f2c6014bc4fd1b'); // luu tuong doi hay tuyet doi deu khop
  assert.equal(catalogPublicIdForThumbnail('/images/thumb-upl-1793864276259.jpg'), '1fbd81870f703436d681cadb');
  assert.equal(catalogPublicIdForThumbnail('/images/thumb-upl-1793864372642.jpg'), '098d2b0ddb039736b3086290');
  assert.equal(catalogPublicIdForThumbnail('/images/thumb-upl-1793864437963.jpg'), 'bcdf7b68d5786eb56f78fbe2');
  assert.equal(catalogPublicIdForThumbnail('/images/thumb-upl-1793864480477.jpg'), '8e0dd3916b048567dd53eb08');
  assert.equal(catalogPublicIdForThumbnail('/images/thumb-upl-1793864529660.jpg'), '7f5a98096d0246da338e1d1f');
  // Thumbnail mau cua short seed (khong phai short that) khong khop bai nao.
  assert.equal(catalogPublicIdForThumbnail('https://any.vtcrd.top/samples/sample-short-1.jpg'), null);
  assert.equal(catalogPublicIdForThumbnail('https://vtcany-api.vtctech.xyz/images/thumb-upl-9999999999999.jpg'), null);
  assert.equal(catalogPublicIdForThumbnail(''), null);
  assert.equal(catalogPublicIdForThumbnail(null), null);
});

test('isCatalogOnlyUpdate: bai published chi duoc gan/go catalogPublicId, doi noi dung khac thi chan', () => {
  const title = 'Giày thêu của người Xạ Phang';
  // Dien ma short cho bai live: chi catalog + tieu de hien tai (no-op) -> cho.
  assert.equal(isCatalogOnlyUpdate({ title, catalogPublicId: '1fbd81870f703436d681cadb' }, title), true);
  assert.equal(isCatalogOnlyUpdate({ catalogPublicId: '1fbd81870f703436d681cadb' }, title), true); // khong gui title
  assert.equal(isCatalogOnlyUpdate({ title, catalogPublicId: null }, title), true); // go gan
  // Doi noi dung khac -> chan (ke ca khi kem catalog).
  assert.equal(isCatalogOnlyUpdate({ title: 'Tieu de moi', catalogPublicId: '1fbd81870f703436d681cadb' }, title), false);
  assert.equal(isCatalogOnlyUpdate({ title, caption: 'sapo moi' }, title), false);
  assert.equal(isCatalogOnlyUpdate({ title, mediaUrl: '/images/khac.jpg' }, title), false);
  assert.equal(isCatalogOnlyUpdate({ title, mediaType: 'image' }, title), false);
  assert.equal(isCatalogOnlyUpdate({ title, platforms: ['app'] }, title), false);
});
