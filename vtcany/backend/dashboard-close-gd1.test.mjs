// Test dong GĐ1 dashboard (2026-11-04): chi test cac file thuan
// (config/queries), khong can DB, khong can Nest. Chay:
//   node --test --import ./test-hooks-register.mjs dashboard-close-gd1.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  ALL_WIDGETS,
  NEWSROOM_WIDE_ROLES,
  ROLE_LAYOUT,
  STUCK_THRESHOLD_HOURS,
  isNewsroomWide,
  resolveLayout,
} from './src/modules/dashboard/dashboard-layout.config.ts';
import { drillUnpublishedIds } from './src/modules/dashboard/dashboard-queries.ts';

describe('403: role goi widget khong co trong layout phai bi chan (controller chi throw tren dieu kien nay)', () => {
  it('moi role trong ma tran deu khong thay widget ngoai layout cua minh', () => {
    for (const [role, layout] of Object.entries(ROLE_LAYOUT)) {
      const resolved = resolveLayout(role, false);
      assert.deepEqual(resolved, layout, role);
      for (const w of ALL_WIDGETS) {
        if (!layout.includes(w)) {
          assert.ok(!resolved.includes(w), `${role} le ra khong duoc xem ${w}`);
        }
      }
    }
  });
  it('full-admin thay toan bo, khong bi 403 widget nao', () => {
    assert.deepEqual(resolveLayout('PV', true), [...ALL_WIDGETS]);
  });
  it('role la / khong co trong ma tran -> fallback, cac widget ngoai fallback bi chan', () => {
    for (const role of ['ROLE_LA_NAO_DO', null, undefined]) {
      const resolved = resolveLayout(role, false);
      for (const w of ALL_WIDGETS) {
        if (!['A1', 'A2', 'A3', 'E1'].includes(w)) assert.ok(!resolved.includes(w));
      }
    }
  });
  it('widget khong ton tai (ngoai tap widget) -> controller tra 404, khong phai 403', () => {
    assert.ok(!ALL_WIDGETS.includes('C1'));
    assert.ok(!ALL_WIDGETS.includes('Z9'));
  });
});

describe('nguong treo theo module (user chot 2026-11-04)', () => {
  it('tuong thuat 30 phut, su kien 4h, quang cao 4h, nhuan but 72h', () => {
    assert.equal(STUCK_THRESHOLD_HOURS.liveblog, 0.5);
    assert.equal(STUCK_THRESHOLD_HOURS.events, 4);
    assert.equal(STUCK_THRESHOLD_HOURS.ads, 4);
    assert.equal(STUCK_THRESHOLD_HOURS.royalties, 72);
  });
  it('cac phan he cu giu nguyen: tin bai 4h, bai bao in 12h, so bao 2h', () => {
    assert.equal(STUCK_THRESHOLD_HOURS.news, 4);
    assert.equal(STUCK_THRESHOLD_HOURS.printArticle, 12);
    assert.equal(STUCK_THRESHOLD_HOURS.epaper, 2);
  });
});

describe('pham vi A4: nhom toan toa soan thay toan bo, role khac chi thay muc minh tao', () => {
  it('Super Admin, TBT, P.TBT, BBT, T.PP la nhom toan toa soan', () => {
    assert.deepEqual([...NEWSROOM_WIDE_ROLES].sort(), ['BBT', 'P.TBT', 'Super Admin', 'T.PP', 'TBT'].sort());
    for (const r of NEWSROOM_WIDE_ROLES) assert.equal(isNewsroomWide(r, false), true, r);
  });
  it('full-admin luon toan toa soan, ke ca role khong co trong nhom', () => {
    assert.equal(isNewsroomWide('PV', true), true);
    assert.equal(isNewsroomWide(null, true), true);
  });
  it('role hep khong toan toa soan (khong phan biet hoa/thuong)', () => {
    for (const r of ['PV', 'TP', 'KTV', 'QLSK', 'PVTT', 'QL-QC', null, undefined]) {
      assert.equal(isNewsroomWide(r, false), false, String(r));
    }
    assert.equal(isNewsroomWide('tbt', false), true);
    assert.equal(isNewsroomWide('t.pp', false), true);
  });
});

describe('drill ha xuat ban trong ky (B1)', () => {
  function fakeDb(rows) {
    return {
      newsArticleApproval: {
        findMany: async ({ where }) => rows.filter(
          (r) => r.action === where.action
            && r.createdAt >= where.createdAt.gte
            && r.createdAt < where.createdAt.lt,
        ),
      },
    };
  }
  it('chi lay bai co unpublish trong khoang, khac nhau theo bai', async () => {
    const db = fakeDb([
      { articleId: 'a1', action: 'unpublish', createdAt: new Date('2026-11-02T10:00:00Z') },
      { articleId: 'a1', action: 'unpublish', createdAt: new Date('2026-11-03T10:00:00Z') },
      { articleId: 'a2', action: 'publish', createdAt: new Date('2026-11-02T11:00:00Z') },
      { articleId: 'a3', action: 'unpublish', createdAt: new Date('2026-10-20T10:00:00Z') },
    ]);
    const ids = await drillUnpublishedIds(db, 'newsArticleApproval', 'articleId',
      new Date('2026-11-01T00:00:00Z'), new Date('2026-11-08T00:00:00Z'));
    assert.deepEqual(ids, ['a1']);
  });
  it('khong co unpublish trong ky -> danh sach rong', async () => {
    const ids = await drillUnpublishedIds(fakeDb([]), 'newsArticleApproval', 'articleId',
      new Date('2026-11-01T00:00:00Z'), new Date('2026-11-08T00:00:00Z'));
    assert.deepEqual(ids, []);
  });
});
