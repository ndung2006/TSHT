// Test nghiem thu so lieu dashboard GĐ1 (tai lieu duyet 04/11/2026, muc 9
// + 2 tieu chi moi): chi test cac file thuan (config/helpers/queries),
// khong can DB, khong can Nest. Chay:
//   node --test --import ./test-hooks-register.mjs dashboard-gd1.test.mjs
// (hook can thiet vi queries.ts import helpers kieu extensionless theo
// tsconfig; xem test-resolve-hooks.mjs)
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  ALL_GD1_WIDGETS,
  ALL_WIDGETS,
  FALLBACK_LAYOUT,
  ROLE_LAYOUT,
  STUCK_THRESHOLD_HOURS,
  EPG_CACHE_TTL_MS,
  resolveLayout,
} from './src/modules/dashboard/dashboard-layout.config.ts';
import {
  vnTodayStr,
  vnDayRange,
  periodRange,
  median,
  isOverdue,
  latestApprovalsByItem,
  isReturnedDraft,
  isStrictDraft,
  inMyQueue,
  filterMyQueue,
  groupSubstitutes,
  epgDayState,
  fmtVnNumber,
  fmtVnDate,
} from './src/modules/dashboard/dashboard-helpers.ts';
import {
  DASHBOARD_MODULES,
  pendingWhere,
  myQueueWhere,
  strictDraftWhere,
  myReturnedBaseWhere,
  stepRolesFromDefinitions,
  stepLabelsFromDefinitions,
  drillReturnedIds,
  drillNeverSubmittedIds,
  applyDrillWhere,
} from './src/modules/dashboard/dashboard-queries.ts';

describe('GĐ1 gom dung 16 widget, khong them khong bot', () => {
  it('ALL_GD1_WIDGETS = 16 ma, khong co C4', () => {
    assert.equal(ALL_GD1_WIDGETS.length, 16);
    assert.ok(!ALL_GD1_WIDGETS.includes('C4'));
    for (const c of ['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'D1', 'D2', 'D4', 'D5', 'E1']) {
      assert.ok(ALL_GD1_WIDGETS.includes(c), `thieu ${c}`);
    }
  });
  it('EPG cache TTL trong 10-15 phut', () => {
    assert.ok(EPG_CACHE_TTL_MS >= 10 * 60 * 1000 && EPG_CACHE_TTL_MS <= 15 * 60 * 1000);
  });
});

describe('bo cuc theo role (backend config, khong hardcode UI)', () => {
  it('full-admin thay toan bo widget (16 GĐ1 + D3 tu GĐ2)', () => {
    assert.deepEqual(resolveLayout('PV', true), ALL_WIDGETS);
    assert.deepEqual(resolveLayout(null, true), ALL_WIDGETS);
  });
  it('Thu ky (T.PP) dung subset duyet: A1, A4, B1, B4, B5, B6, E1', () => {
    assert.deepEqual(resolveLayout('T.PP', false), ['A1', 'A4', 'B1', 'B4', 'B5', 'B6', 'E1']);
  });
  it('Quan tri chung (Admin fallback) va BBT/TBT dung subset duyet', () => {
    assert.deepEqual(resolveLayout('TBT', false), ['A1', 'D5', 'B1', 'B2', 'B3', 'B6', 'E1']);
    assert.deepEqual(resolveLayout('BBT', false), ['A1', 'D5', 'B1', 'B2', 'B3', 'B6', 'E1']);
  });
  it('role khong co trong ma tran -> fallback A1, A2, A3, E1', () => {
    assert.deepEqual(resolveLayout('ROLE_LA_NAO_DO', false), FALLBACK_LAYOUT);
    assert.deepEqual(resolveLayout(null, false), FALLBACK_LAYOUT);
  });
  it('ten role lech hoa/thuong van map duoc', () => {
    assert.deepEqual(resolveLayout('t.pp', false), resolveLayout('T.PP', false));
  });
  it('moi role trong ROLE_LAYOUT chi chua widget hop le (GĐ1 + D3)', () => {
    for (const [role, layout] of Object.entries(ROLE_LAYOUT)) {
      for (const c of layout) assert.ok(ALL_WIDGETS.includes(c), `${role} chua ${c} ngoai tap hop`);
    }
  });
});

describe('ranh gioi ngay Asia/Ho_Chi_Minh', () => {
  it('23:59 va 00:01 VN thuoc 2 ngay khac nhau', () => {
    assert.equal(vnTodayStr(new Date('2026-11-03T16:59:00Z')), '2026-11-03');
    assert.equal(vnTodayStr(new Date('2026-11-03T17:01:00Z')), '2026-11-04');
  });
  it('vnDayRange: ngay VN = [00:00+07, 00:00+07 hom sau)', () => {
    const { from, to } = vnDayRange('2026-11-04');
    assert.equal(from.toISOString(), '2026-11-03T17:00:00.000Z');
    assert.equal(to.toISOString(), '2026-11-04T17:00:00.000Z');
  });
  it('periodRange 7d = hom nay tru 6 ngay .. het hom nay', () => {
    const now = new Date('2026-11-04T10:00:00+07:00');
    const r = periodRange('7d', undefined, undefined, now);
    assert.equal(r.from.toISOString(), '2026-10-28T17:00:00.000Z');
    assert.equal(r.to.toISOString(), '2026-11-04T17:00:00.000Z');
  });
});

describe('tach nhiem vu A1 (ap ca full-admin, xet MOI approval truoc)', () => {
  const roles = { news: { 1: 'TP', 2: 'PBĐT', 3: 'BBT', 4: 'XB' } };
  const base = { module: 'news', status: 'pending_review', workflowStep: 1, createdBy: 'u-creator', approvalActorIds: [] };
  it('nguoi dung buoc thi vao hang cho', () => {
    assert.equal(inMyQueue(base, { id: 'u-tp', roleName: 'TP', isFullAdmin: false }, roles), true);
  });
  it('nguoi tao bi loai du dung buoc', () => {
    assert.equal(inMyQueue(base, { id: 'u-creator', roleName: 'TP', isFullAdmin: false }, roles), false);
  });
  it('co BAT KY approval truoc do thi bi loai (khong chi approval gan nhat)', () => {
    assert.equal(inMyQueue({ ...base, approvalActorIds: ['u-tp'] }, { id: 'u-tp', roleName: 'TP', isFullAdmin: false }, roles), false);
  });
  it('full-admin thay moi buoc NHUNG van bi loai neu la nguoi tao hoac da duyet truoc', () => {
    assert.equal(inMyQueue(base, { id: 'u-admin', roleName: 'Super Admin', isFullAdmin: true }, roles), true);
    assert.equal(inMyQueue(base, { id: 'u-creator', roleName: 'Super Admin', isFullAdmin: true }, roles), false);
    assert.equal(inMyQueue({ ...base, approvalActorIds: ['u-admin'] }, { id: 'u-admin', roleName: 'Super Admin', isFullAdmin: true }, roles), false);
  });
  it('sai buoc / sai trang thai / buoc 0 thi khong vao hang cho', () => {
    assert.equal(inMyQueue({ ...base, workflowStep: 2 }, { id: 'u-tp', roleName: 'TP', isFullAdmin: false }, roles), false);
    assert.equal(inMyQueue({ ...base, status: 'draft' }, { id: 'u-tp', roleName: 'TP', isFullAdmin: false }, roles), false);
    assert.equal(inMyQueue({ ...base, workflowStep: 0 }, { id: 'u-tp', roleName: 'TP', isFullAdmin: false }, roles), false);
  });
  it('filterMyQueue giu nguyen thu tu', () => {
    const items = [
      { ...base, workflowStep: 1 },
      { ...base, createdBy: 'u-tp' },
      { ...base, workflowStep: 1, approvalActorIds: [] },
    ];
    assert.equal(filterMyQueue(items, { id: 'u-tp', roleName: 'TP', isFullAdmin: false }, roles).length, 2);
  });
});

describe('bai bi tra ve: o cot B1 + A2, KHONG o A3', () => {
  const rows = [
    { itemId: 'a', step: 0, action: 'submit', createdAt: new Date('2026-11-01T01:00:00Z') },
    { itemId: 'a', step: 1, action: 'return', createdAt: new Date('2026-11-02T01:00:00Z') },
    { itemId: 'b', step: 0, action: 'submit', createdAt: new Date('2026-11-01T01:00:00Z') },
    { itemId: 'b', step: 1, action: 'approve', createdAt: new Date('2026-11-02T01:00:00Z') },
  ];
  it('latestApprovalsByItem khong phu thuoc thu tu dau vao', () => {
    const fwd = latestApprovalsByItem(rows);
    const rev = latestApprovalsByItem([...rows].reverse());
    assert.equal(fwd.get('a')?.action, 'return');
    assert.equal(rev.get('a')?.action, 'return');
    assert.equal(fwd.get('b')?.action, 'approve');
  });
  it('draft + approval gan nhat return = bi tra (B1 cot + A2)', () => {
    const latest = latestApprovalsByItem(rows);
    assert.equal(isReturnedDraft('draft', latest.get('a')), true);
    assert.equal(isReturnedDraft('draft', latest.get('b')), false);
    assert.equal(isReturnedDraft('pending_review', latest.get('a')), false);
  });
  it('nhap CHUA TUNG gui moi vao A3; bai bi tra (da gui) KHONG vao A3', () => {
    assert.equal(isStrictDraft('draft', false), true);
    assert.equal(isStrictDraft('draft', true), false);
    assert.equal(isStrictDraft('pending_review', false), false);
  });
});

describe('B6: nguong treo + trung vi', () => {
  it('nguong duyet: tin bai 4h, bai bao in 12h, so bao 2h', () => {
    assert.equal(STUCK_THRESHOLD_HOURS.news, 4);
    assert.equal(STUCK_THRESHOLD_HOURS.printArticle, 12);
    assert.equal(STUCK_THRESHOLD_HOURS.epaper, 2);
  });
  it('isOverdue so sanh dung nguong', () => {
    const entered = new Date('2026-11-04T00:00:00Z');
    assert.equal(isOverdue(entered, 4, new Date('2026-11-04T05:00:00Z')), true);
    assert.equal(isOverdue(entered, 4, new Date('2026-11-04T03:59:00Z')), false);
  });
  it('median le/chan/rong', () => {
    assert.equal(median([1, 2, 3]), 2);
    assert.equal(median([1, 2, 3, 4]), 2.5);
    assert.equal(median([]), null);
  });
});

describe('B7: dem duyet thay (actorRole khac role cua buoc)', () => {
  const roles = { news: { 1: 'TP', 2: 'PBĐT' } };
  it('chi dem approval co actorRole khac role buoc, bo qua buoc 0 va trung role', () => {
    const out = groupSubstitutes([
      { actorId: 'u1', actorRole: 'Super Admin', step: 1 },
      { actorId: 'u1', actorRole: 'Super Admin', step: 2 },
      { actorId: 'u2', actorRole: 'TP', step: 1 },
      { actorId: 'u3', actorRole: 'TBT', step: 0 },
    ], roles, () => 'news');
    assert.deepEqual(out, [{ actorId: 'u1', actorRole: 'Super Admin', count: 2 }]);
  });
  it('sap xep giam dan theo count', () => {
    const out = groupSubstitutes([
      { actorId: 'u1', actorRole: 'Super Admin', step: 1 },
      { actorId: 'u2', actorRole: 'TBT', step: 1 },
      { actorId: 'u2', actorRole: 'TBT', step: 2 },
    ], roles, () => 'news');
    assert.equal(out[0].actorId, 'u2');
  });
});

describe('B3/D5: khong co nguon EPG != 0', () => {
  it('radio khong co chuong trinh -> no-source kem reason, khong phai 0', () => {
    const s = epgDayState(0, true, false);
    assert.equal(s.state, 'no-source');
    assert.match(s.reason || '', /AIO không cung cấp EPG phát thanh/);
  });
  it('kenh co nguon khong co chuong trinh -> empty (se ban canh bao D5 neu la ngay mai)', () => {
    assert.equal(epgDayState(0, false, false).state, 'empty');
  });
  it('co chuong trinh -> ok, ban cache cu -> stale', () => {
    assert.equal(epgDayState(5, false, false).state, 'ok');
    assert.equal(epgDayState(5, true, true).state, 'stale');
  });
});

describe('where-builder dung chung widget <-> danh sach', () => {
  it('myQueueWhere: pending + buoc + khong phai nguoi tao + khong approval truoc', () => {
    assert.deepEqual(myQueueWhere('u1', 2), {
      status: 'pending_review', workflowStep: 2,
      createdBy: { not: 'u1' }, approvals: { none: { actorId: 'u1' } },
    });
    assert.deepEqual(myQueueWhere('u1'), {
      status: 'pending_review', createdBy: { not: 'u1' }, approvals: { none: { actorId: 'u1' } },
    });
  });
  it('fail-closed khi khong co userId', () => {
    assert.deepEqual(myQueueWhere(null), { id: '___no_user___' });
    assert.deepEqual(strictDraftWhere(undefined), { id: '___no_user___' });
    assert.deepEqual(myReturnedBaseWhere(''), { id: '___no_user___' });
  });
  it('strictDraftWhere: draft + cua toi + khong approval submit', () => {
    assert.deepEqual(strictDraftWhere('u1'), {
      status: 'draft', createdBy: 'u1', approvals: { none: { action: 'submit' } },
    });
  });
  it('pendingWhere co/khong buoc', () => {
    assert.deepEqual(pendingWhere(), { status: 'pending_review' });
    assert.deepEqual(pendingWhere(3), { status: 'pending_review', workflowStep: 3 });
  });
  it('stepRoles/stepLabels: buoc k = vi tri sortOrder (1-based)', () => {
    const defs = [{ moduleKey: 'news', steps: [
      { roleName: 'PBĐT', label: 'Phó ban', sortOrder: 2 },
      { roleName: 'TP', label: 'Trưởng phòng', sortOrder: 1 },
    ] }];
    assert.deepEqual(stepRolesFromDefinitions(defs), { news: { 1: 'TP', 2: 'PBĐT' } });
    assert.deepEqual(stepLabelsFromDefinitions(defs), { news: { 1: 'Trưởng phòng', 2: 'Phó ban' } });
  });
  it('DASHBOARD_MODULES gom dung 7 phan he A1 (khong co video)', () => {
    assert.equal(DASHBOARD_MODULES.length, 7);
    assert.ok(!DASHBOARD_MODULES.some((m) => m.key === 'video'));
  });
});

describe('drill helpers (danh sach dung chung dinh nghia voi widget)', () => {
  const fakeDb = (approvals) => ({
    newsArticleApproval: {
      findMany: async ({ where }) => approvals.filter((a) => {
        if (where.articleId?.in && !where.articleId.in.includes(a.articleId)) return false;
        if (where.action && a.action !== where.action) return false;
        return true;
      }),
    },
  });
  it('drillReturnedIds: chi muc nhap ma approval gan nhat la return', async () => {
    const db = fakeDb([
      { articleId: 'a', action: 'submit', createdAt: new Date('2026-11-01') },
      { articleId: 'a', action: 'return', createdAt: new Date('2026-11-02') },
      { articleId: 'b', action: 'submit', createdAt: new Date('2026-11-01') },
      { articleId: 'b', action: 'approve', createdAt: new Date('2026-11-02') },
      { articleId: 'c', action: 'return', createdAt: new Date('2026-11-01') },
      { articleId: 'c', action: 'submit', createdAt: new Date('2026-11-02') },
    ]);
    assert.deepEqual(await drillReturnedIds(db, 'newsArticleApproval', 'articleId', ['a', 'b', 'c']), ['a']);
  });
  it('drillNeverSubmittedIds: chi muc chua tung co submit', async () => {
    const db = fakeDb([
      { articleId: 'a', action: 'submit', createdAt: new Date('2026-11-01') },
      { articleId: 'b', action: 'return', createdAt: new Date('2026-11-01') },
    ]);
    assert.deepEqual(await drillNeverSubmittedIds(db, 'newsArticleApproval', 'articleId', ['a', 'b']), ['b']);
  });
  it('applyDrillWhere: myQueue ghi de status + buoc + tach nhiem vu', async () => {
    const where = { status: 'draft' };
    const db = { newsArticle: { findMany: async () => [] } };
    await applyDrillWhere(db, 'newsArticle', 'newsArticleApproval', 'articleId', where,
      { workflowStep: '2', myQueue: '1' }, 'u1');
    assert.deepEqual(where, {
      status: 'pending_review', workflowStep: 2,
      createdBy: { not: 'u1' }, approvals: { none: { actorId: 'u1' } },
    });
  });
});

describe('dinh dang kieu Viet Nam', () => {
  it('fmtVnNumber: 1234 -> 1.234', () => {
    assert.equal(fmtVnNumber(1234), '1.234');
  });
  it('fmtVnDate: dd/MM/yyyy', () => {
    assert.equal(fmtVnDate(new Date('2026-11-04T10:00:00+07:00')), '04/11/2026');
  });
});
