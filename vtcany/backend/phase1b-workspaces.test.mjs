// Test loc menu theo workspace Dot 1b — chay truc tiep bang node --test,
// khong can build (Node strip type cua file .ts thuan, utils khong import
// Vue/Nuxt).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WORKSPACES, hasModulePermission, visibleMenu } from '../apps/cms/utils/workspaces.ts';

const routes = (groups) => groups.flatMap((g) => g.items.map((i) => i.to));
const labels = (groups) => groups.map((g) => g.label);

test('toan quyen (*) thay du 4 workspace va toan bo menu', () => {
  const groups = visibleMenu(['*']);
  assert.deepEqual(labels(groups), WORKSPACES.map((w) => w.label));
  assert.equal(routes(groups).length, 27);
});

test('chi co quyen epaper thi thay workspace Bao in, cong trang Thong ke khong gate quyen', () => {
  const groups = visibleMenu(['epaper:view']);
  assert.deepEqual(labels(groups), ['Xuất bản Báo in', 'Quản trị chung']);
  assert.deepEqual(routes(groups), ['/bao-in', '/thong-ke']);
});

test('chi co quyen articles thi thay Tin bai o workspace Bao dien tu, khong thay Danh muc/Banner/Giao dien, va khong thay Bai viet catalog o workspace Truyen hinh', () => {
  const groups = visibleMenu(['articles:view']);
  const online = groups.find((g) => g.label === 'Xuất bản Báo điện tử');
  assert.deepEqual(routes([online]), ['/tin-bai']);
  const tv = groups.find((g) => g.label === 'Sản xuất Truyền hình/Phát thanh');
  assert.ok(!tv || !tv.items.some((i) => i.to === '/bai-viet'));
});

test('quyen catalog thi thay Tap tin + Thu vien trong workspace Truyen hinh/Phat thanh', () => {
  const groups = visibleMenu(['catalog:read']);
  const tv = groups.find((g) => g.label === 'Sản xuất Truyền hình/Phát thanh');
  assert.ok(tv.items.some((i) => i.to === '/tap-tin'));
  assert.ok(tv.items.some((i) => i.to === '/thu-vien'));
  assert.ok(tv.items.some((i) => i.to === '/bai-viet'));
  assert.ok(!tv.items.some((i) => i.to === '/truyen-hinh'));
});

test('khong co quyen nao thi chi thay trang khong gate (Thong ke)', () => {
  const groups = visibleMenu([]);
  assert.deepEqual(routes(groups), ['/thong-ke']);
});

test('hasModulePermission: module null luon hien; sai module thi an', () => {
  assert.equal(hasModulePermission([], null), true);
  assert.equal(hasModulePermission(['articles:view'], 'articles'), true);
  assert.equal(hasModulePermission(['articles:view'], 'epaper'), false);
  assert.equal(hasModulePermission(['*'], 'epaper'), true);
});
