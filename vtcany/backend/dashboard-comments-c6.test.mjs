// Test dashboard dot 1 binh luan (A1 + C6) — file thuan, node --test
// truc tiep, khong can DB/Nest (giong dashboard-gd2.test.mjs).
//   node --test --import ./test-hooks-register.mjs dashboard-comments-c6.test.mjs
// Luu y: wA1/wC6 nam trong DashboardService (Nest, can Prisma + cac
// service khac) nen khong import truc tiep o day duoc — backend nay
// chua co node_modules. Test o day bao phu phan kiem duoc bang code
// thuan: cau hinh C6 (tap widget/meta/layout theo role) + logic trung
// vi thoi gian duyet (median() chung cua helpers, wC6 dung ham nay).
// Kiem live wA1/wC6 (so dem, drill) lam o tang kiem chung sau deploy.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  ALL_WIDGETS,
  ROLE_LAYOUT,
  WIDGET_META,
  resolveLayout,
} from './src/modules/dashboard/dashboard-layout.config.ts';
import { median } from './src/modules/dashboard/dashboard-helpers.ts';

describe('C6 thuoc tap widget, tier C, title "Tương tác"', () => {
  it('ALL_WIDGETS = 16 GĐ1 + D3 + C6', () => {
    assert.equal(ALL_WIDGETS.length, 18);
    assert.ok(ALL_WIDGETS.includes('C6'));
    assert.equal(WIDGET_META.C6.title, 'Tương tác');
    assert.equal(WIDGET_META.C6.tier, 'C');
  });
  it('PBĐT va T.PP thay C6 (role duoc seed comments:publish)', () => {
    assert.ok(resolveLayout('PBĐT', false).includes('C6'));
    assert.ok(resolveLayout('T.PP', false).includes('C6'));
    assert.deepEqual(resolveLayout('PBĐT', false), ['A1', 'A2', 'A3', 'C6', 'E1']);
    assert.deepEqual(resolveLayout('T.PP', false), ['A1', 'A4', 'B1', 'B4', 'B5', 'B6', 'C6', 'E1']);
  });
  it('role khac (khong full-admin) khong thay C6', () => {
    for (const [role, layout] of Object.entries(ROLE_LAYOUT)) {
      if (role === 'PBĐT' || role === 'T.PP') continue;
      assert.ok(!layout.includes('C6'), `${role} le ra khong co C6`);
    }
  });
  it('full-admin thay C6; role la fallback khong thay C6', () => {
    assert.ok(resolveLayout('PV', true).includes('C6'));
    assert.ok(!resolveLayout('ROLE_LA_NAO_DO', false).includes('C6'));
    assert.ok(!resolveLayout(null, false).includes('C6'));
  });
});

describe('median thoi gian duyet (giay) cho C6', () => {
  // Thoi gian duyet cua 1 binh luan = (moderatedAt - createdAt) / 1000.
  const secs = (pairs) => pairs.map(([c, m]) => (new Date(m).getTime() - new Date(c).getTime()) / 1000);
  it('so le -> gia tri giua', () => {
    assert.equal(median(secs([
      ['2026-11-08T00:00:00Z', '2026-11-08T00:01:00Z'], // 60
      ['2026-11-08T00:00:00Z', '2026-11-08T00:05:00Z'], // 300
      ['2026-11-08T00:00:00Z', '2026-11-08T00:02:00Z'], // 120
    ])), 120);
  });
  it('so chan -> trung binh 2 gia tri giua', () => {
    assert.equal(median([60, 300, 120, 600]), 210);
  });
  it('khong co binh luan nao duoc xu ly trong ky -> null', () => {
    assert.equal(median([]), null);
  });
  it('1 binh luan -> chinh thoi gian do; dau vao chua sap xep van dung', () => {
    assert.equal(median([600, 60, 300]), 300);
    assert.equal(median([45]), 45);
  });
});
