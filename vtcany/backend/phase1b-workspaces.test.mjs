// Test loc menu theo workspace Dot 1b — chay truc tiep bang node --test,
// khong can build (Node strip type cua file .ts thuan, utils khong import
// Vue/Nuxt).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WORKSPACES, MENU_ITEMS, hasModulePermission, hasModuleAction, visibleMenu } from '../apps/cms/utils/workspaces.ts';

const routes = (groups) => groups.flatMap((g) => g.items.map((i) => i.to));
const labels = (groups) => groups.map((g) => g.label);
const itemByTo = (to) => MENU_ITEMS.find((i) => i.to === to);

test('toan quyen (*) thay du 5 workspace va 35 muc cap 1', () => {
  const groups = visibleMenu(['*']);
  assert.deepEqual(labels(groups), WORKSPACES.map((w) => w.label));
  // Tong muc cap 1 giam tu 43 xuong 35 sau don dep sidebar 2026-11-04:
  // xoa 7 muc (Phim, The loai phim, Dien vien, Bai viet lap, Su kien
  // lap, Giao dien lap, Goi cuoc) va gop Tap tin + Thu vien thanh 1
  // muc Kho Media (DAM). 3 muc cha accordion van tinh la 1 muc cap 1.
  assert.equal(routes(groups).length, 35);
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
  const tv = groups.find((g) => g.label === 'Xuất bản Truyền hình/Phát thanh');
  assert.ok(!tv || !tv.items.some((i) => i.to === '/bai-viet'));
});

test('quyen catalog thi chi thay 1 muc Kho Media (DAM) trong workspace Truyen hinh/Phat thanh', () => {
  const groups = visibleMenu(['catalog:read']);
  const tv = groups.find((g) => g.label === 'Xuất bản Truyền hình/Phát thanh');
  assert.deepEqual(routes([tv]), ['/thu-vien']);
  assert.equal(tv.items[0].label, 'Kho Media (DAM)');
  assert.equal(tv.items[0].module, 'catalog');
  assert.ok(!tv.items.some((i) => i.to === '/tap-tin'));
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

test('chi co quyen distribution thi thay Phan phoi o workspace Bao dien tu, khong thay Tin bai', () => {
  const groups = visibleMenu(['distribution:view']);
  const online = groups.find((g) => g.label === 'Xuất bản Báo điện tử');
  assert.deepEqual(routes([online]), ['/phan-phoi']);
});

test('don dep sidebar: muc OTT va muc lap khong con tren menu', () => {
  const all = routes(visibleMenu(['*']));
  for (const dead of ['/phim', '/the-loai', '/dien-vien', '/bai-viet', '/su-kien', '/giao-dien', '/goi-cuoc', '/tap-tin']) {
    assert.ok(!all.includes(dead), `${dead} phai bien khoi menu`);
  }
  // Ban chinh van giu: tin bai + su kien toa soan o Bao dien tu.
  assert.ok(all.includes('/tin-bai'));
  assert.ok(all.includes('/su-kien-toa-soan'));
});

test('Vung hien thi doi ve cuoi nhom Quan ly giao dien, giu quyen zones', () => {
  const groups = visibleMenu(['*']);
  const online = groups.find((g) => g.id === 'online');
  const iface = groups.find((g) => g.id === 'interface');
  assert.ok(!online.items.some((i) => i.to === '/vung-hien-thi'));
  assert.equal(iface.items[iface.items.length - 1].to, '/vung-hien-thi');
  assert.equal(iface.items[iface.items.length - 1].module, 'zones');
});

test('Banner nam ngay sau Quang cao trong nhom Bao dien tu', () => {
  const groups = visibleMenu(['*']);
  const online = groups.find((g) => g.id === 'online');
  const tos = online.items.map((i) => i.to);
  assert.equal(tos.indexOf('/banner'), tos.indexOf('/quang-cao-toa-soan') + 1);
});

test('3 muc cha accordion co dung menu con loc theo trang thai', () => {
  const tin = itemByTo('/tin-bai');
  assert.deepEqual(tin.children.map((c) => c.to), [
    '/tin-bai?new=1', '/tin-bai?status=draft', '/tin-bai?status=pending_review', '/tin-bai?status=published',
  ]);
  assert.deepEqual(tin.children.map((c) => c.status), [null, 'draft', 'pending_review', 'published']);
  assert.equal(tin.children[0].action, 'create');
  assert.ok(tin.children.slice(1).every((c) => c.action === null));

  const print = itemByTo('/bai-bao-in');
  assert.deepEqual(print.children.map((c) => c.to), [
    '/bai-bao-in?new=1', '/bai-bao-in?status=pending_review', '/bai-bao-in?status=approved',
  ]);
  assert.deepEqual(print.children.map((c) => c.status), [null, 'pending_review', 'approved']);

  const live = itemByTo('/tuong-thuat');
  assert.deepEqual(live.children.map((c) => c.to), [
    '/tuong-thuat?new=1', '/tuong-thuat?status=draft', '/tuong-thuat?status=pending_review', '/tuong-thuat?status=published',
  ]);
  assert.deepEqual(live.children.map((c) => c.status), [null, 'draft', 'pending_review', 'published']);
});

test('hasModuleAction: menu Them chi hien khi co quyen create', () => {
  assert.equal(hasModuleAction([], 'articles', null), true);
  assert.equal(hasModuleAction(['articles:view'], 'articles', 'create'), false);
  assert.equal(hasModuleAction(['articles:create'], 'articles', 'create'), true);
  assert.equal(hasModuleAction(['*'], 'articles', 'create'), true);
  assert.equal(hasModuleAction([], 'articles', 'create'), false);
});
