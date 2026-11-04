// Test GĐ2 dashboard (widget D3 luu tru) — file thuan, node --test truc tiep.
//   node --test --import ./test-hooks-register.mjs dashboard-gd2.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  ALL_WIDGETS,
  ROLE_LAYOUT,
  WIDGET_META,
  resolveLayout,
} from './src/modules/dashboard/dashboard-layout.config.ts';
import { fmtBytes, sumMediaSizes } from './src/modules/dashboard/dashboard-helpers.ts';

describe('D3 thuoc tap widget tu GĐ2, dung role moi thay', () => {
  it('ALL_WIDGETS = 16 GĐ1 + D3, meta D3 tier D', () => {
    assert.equal(ALL_WIDGETS.length, 17);
    assert.ok(ALL_WIDGETS.includes('D3'));
    assert.equal(WIDGET_META.D3.title, 'Lưu trữ');
    assert.equal(WIDGET_META.D3.tier, 'D');
  });
  it('Admin (quan tri chung, khong *) co D3 sau D2; role khac khong co D3', () => {
    assert.deepEqual(resolveLayout('Admin', false), ['D5', 'B7', 'D1', 'D2', 'D3', 'D4', 'E1']);
    for (const [role, layout] of Object.entries(ROLE_LAYOUT)) {
      if (role === 'Admin') continue;
      assert.ok(!layout.includes('D3'), `${role} le ra khong co D3`);
    }
  });
  it('full-admin thay D3', () => {
    assert.ok(resolveLayout('PV', true).includes('D3'));
  });
});

describe('gom sizeBytes theo fileType (D3)', () => {
  it('gom dung loai, dem ca row khong co sizeBytes, thu tu co dinh', () => {
    const rows = sumMediaSizes([
      { fileType: 'video', sizeBytes: 1000 },
      { fileType: 'image', sizeBytes: 2000 },
      { fileType: 'video', sizeBytes: BigInt(3000) },
      { fileType: 'audio', sizeBytes: null },
      { fileType: null, sizeBytes: 500 },
      { fileType: 'subtitle', sizeBytes: 700 },
      { fileType: 'weird', sizeBytes: 11 },
    ]);
    assert.deepEqual(rows.map((r) => r.type), ['image', 'video', 'audio', 'subtitle', '__other__', '__null__']);
    const byType = Object.fromEntries(rows.map((r) => [r.type, r]));
    assert.deepEqual([byType.image.files, byType.image.bytes], [1, 2000]);
    assert.deepEqual([byType.video.files, byType.video.bytes], [2, 4000]);
    assert.deepEqual([byType.audio.files, byType.audio.bytes], [1, 0]);
    assert.deepEqual([byType.subtitle.files, byType.subtitle.bytes], [1, 700]);
    assert.deepEqual([byType.__other__.files, byType.__other__.bytes], [1, 11]);
    assert.deepEqual([byType.__null__.files, byType.__null__.bytes], [1, 500]);
    assert.equal(byType.__null__.label, 'Chưa phân loại');
  });
  it('rong -> khong co dong nao', () => {
    assert.deepEqual(sumMediaSizes([]), []);
  });
});

describe('fmtBytes', () => {
  it('B/KB/MB/GB dung don vi, so le kieu Viet Nam', () => {
    assert.equal(fmtBytes(0), '0 B');
    assert.equal(fmtBytes(512), '512 B');
    assert.equal(fmtBytes(2048), '2 KB');
    assert.equal(fmtBytes(1536), '1,5 KB');
    assert.equal(fmtBytes(5 * 1024 * 1024), '5 MB');
    assert.equal(fmtBytes(3 * 1024 * 1024 * 1024), '3 GB');
  });
});
