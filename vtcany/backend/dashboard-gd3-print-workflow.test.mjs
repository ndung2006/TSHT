// Test chuoi bai bao in moi (mau Dien Bien Phu) + buoc nhieu Role +
// cong tac SoD 11.2 — file thuan, node --test truc tiep.
//   node --test --import ./test-hooks-register.mjs dashboard-gd3-print-workflow.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { engineCanApprove, stepRoleNames } from './src/modules/workflows/workflow-engine.ts';
import { ENFORCE_SEPARATION_OF_DUTIES, evaluateSoD } from './src/modules/workflows/sod.ts';
import {
  PRINT_ARTICLE_WORKFLOW_STEPS,
  PRINT_ARTICLE_WORKFLOW_AUTHOR_LABEL,
} from './src/modules/print-articles/print-article-workflow.ts';
import {
  filterMyQueue,
  groupSubstitutes,
  inMyQueue,
  passesStructureCutoff,
  sumMembersForStep,
} from './src/modules/dashboard/dashboard-helpers.ts';
import { stepRoleNamesFromDefinitions } from './src/modules/dashboard/dashboard-queries.ts';
import { pvEditCheck } from './src/modules/auth/author-edit-guard.ts';

// Chuoi moi: 7 buoc duyet (PV la tac gia) — map theo anh xa da duyet.
const STEPS = [
  { key: 'tp_pv', label: 'TP.PV — Trưởng phòng phóng viên', roleName: 'TP', roleNames: ['TP'] },
  { key: 'bbt_tkts', label: 'BBT.TKTS — Ban biên tập thư ký tòa soạn', roleName: 'T.PP', roleNames: ['T.PP'] },
  { key: 'tpp_tkts1', label: 'TPP.TKTS1 — Trưởng, phó phòng thư ký tòa soạn (lần 1)', roleName: 'T.PP', roleNames: ['T.PP'] },
  { key: 'p_tbt1', label: 'P.TBT1 — Phó tổng biên tập (lần 1)', roleName: 'P.TBT', roleNames: ['P.TBT'] },
  { key: 'tpp_tkts2', label: 'TPP.TKTS2 — Trưởng, phó phòng thư ký tòa soạn (lần 2)', roleName: 'T.PP', roleNames: ['T.PP'] },
  { key: 'p_tbt2', label: 'P.TBT2 — Phó tổng biên tập (lần 2)', roleName: 'P.TBT', roleNames: ['P.TBT'] },
  { key: 't_bt_pt_bt', label: 'T.BT-PT.BT — Tổng biên tập hoặc Phó tổng biên tập, chốt cuối', roleName: 'TBT', roleNames: ['TBT', 'P.TBT'] },
];

const ROLES = {
  'print-article': {
    1: ['TP'], 2: ['T.PP'], 3: ['T.PP'], 4: ['P.TBT'], 5: ['T.PP'], 6: ['P.TBT'], 7: ['TBT', 'P.TBT'],
  },
};

describe('chuoi bai bao in moi (7 buoc duyet + tac gia PV)', () => {
  it('fallback co dung 7 buoc, dung key/role theo anh xa da duyet', () => {
    assert.equal(PRINT_ARTICLE_WORKFLOW_STEPS.length, 7);
    assert.deepEqual(PRINT_ARTICLE_WORKFLOW_STEPS.map((s) => s.key), STEPS.map((s) => s.key));
    assert.deepEqual(PRINT_ARTICLE_WORKFLOW_STEPS.map((s) => s.roleNames || [s.roleName]), STEPS.map((s) => s.roleNames));
    assert.equal(PRINT_ARTICLE_WORKFLOW_AUTHOR_LABEL, 'PV');
  });
  it('stepRoleNames: thieu roleNames -> [roleName]', () => {
    assert.deepEqual(stepRoleNames({ key: 'x', label: 'X', roleName: 'TP', returnTo: 'creator', allowEmergency: false }), ['TP']);
    assert.deepEqual(stepRoleNames(STEPS[6]), ['TBT', 'P.TBT']);
  });
});

describe('engine buoc nhieu Role (buoc cuoi {TBT, P.TBT})', () => {
  it('TBT va P.TBT deu duyet duoc buoc cuoi, T.PP thi khong', () => {
    assert.equal(engineCanApprove(STEPS, 'TBT', false, 7), true);
    assert.equal(engineCanApprove(STEPS, 'P.TBT', false, 7), true);
    assert.equal(engineCanApprove(STEPS, 'T.PP', false, 7), false);
    assert.equal(engineCanApprove(STEPS, 'TBT', true, 7), true);
  });
  it('buoc don Role giu nguyen: chi dung role moi duyet duoc', () => {
    assert.equal(engineCanApprove(STEPS, 'TP', false, 1), true);
    assert.equal(engineCanApprove(STEPS, 'T.PP', false, 1), false);
  });
});

describe('cong tac SoD mac dinh TAT (ban demo)', () => {
  it('ENFORCE_SEPARATION_OF_DUTIES === false', () => {
    assert.equal(ENFORCE_SEPARATION_OF_DUTIES, false);
  });
});

describe('SoD 11.2 khi BAT (evaluateSoD)', () => {
  const creator = 'u-pv';
  it('T.PP vong 1 -> vong 2: DUOC', () => {
    const d = evaluateSoD({ creatorId: creator, actorId: 'u-tpp', prior: [{ actorId: 'u-tpp', actorRole: 'T.PP', action: 'approve' }], currentRoleNames: ['T.PP'] });
    assert.equal(d.allowed, true);
  });
  it('P.TBT vong 1 -> vong 2: DUOC', () => {
    const d = evaluateSoD({ creatorId: creator, actorId: 'u-ptbt', prior: [{ actorId: 'u-ptbt', actorRole: 'P.TBT', action: 'approve' }], currentRoleNames: ['P.TBT'] });
    assert.equal(d.allowed, true);
  });
  it('P.TBT vong 1 -> buoc cuoi {TBT, P.TBT}: DUOC (role cu nam trong roleNames)', () => {
    const d = evaluateSoD({ creatorId: creator, actorId: 'u-ptbt', prior: [{ actorId: 'u-ptbt', actorRole: 'P.TBT', action: 'approve' }], currentRoleNames: ['TBT', 'P.TBT'] });
    assert.equal(d.allowed, true);
  });
  it('da duyet T.PP roi duyet buoc P.TBT: BI CHAN', () => {
    const d = evaluateSoD({ creatorId: creator, actorId: 'u-tpp', prior: [{ actorId: 'u-tpp', actorRole: 'T.PP', action: 'approve' }], currentRoleNames: ['P.TBT'] });
    assert.equal(d.allowed, false);
  });
  it('da duyet T.PP + P.TBT roi quay lai buoc T.PP: BI CHAN (co buoc truoc khac role)', () => {
    const d = evaluateSoD({ creatorId: creator, actorId: 'u-x', prior: [
      { actorId: 'u-x', actorRole: 'T.PP', action: 'approve' },
      { actorId: 'u-x', actorRole: 'P.TBT', action: 'approve' },
    ], currentRoleNames: ['T.PP'] });
    assert.equal(d.allowed, false);
  });
  it('tac gia tu duyet: BI CHAN ke ca khi role trung buoc', () => {
    const d = evaluateSoD({ creatorId: creator, actorId: creator, prior: [{ actorId: creator, actorRole: 'T.PP', action: 'submit' }], currentRoleNames: ['T.PP'] });
    assert.equal(d.allowed, false);
  });
  it('nguoi khac chua xu ly gi: DUOC; row submit cua nguoi khac khong tinh', () => {
    const d = evaluateSoD({ creatorId: creator, actorId: 'u-tp', prior: [{ actorId: 'u-tp', actorRole: 'TP', action: 'submit' }], currentRoleNames: ['TP'] });
    assert.equal(d.allowed, true);
  });
  it('ngoai le tin nong mo cong + danh dau isException', () => {
    const d = evaluateSoD({ creatorId: creator, actorId: 'u-tpp', prior: [{ actorId: 'u-tpp', actorRole: 'T.PP', action: 'approve' }], currentRoleNames: ['P.TBT'], breakingNews: true });
    assert.equal(d.allowed, true);
    assert.equal(d.isException, true);
  });
});

describe('A1 theo roleNames (inMyQueue tinh chinh)', () => {
  const item = (step, extra = {}) => ({
    module: 'print-article', workflowStep: step, status: 'pending_review',
    createdBy: 'u-pv', approvalActorIds: [], ...extra,
  });
  it('P.TBT thay bai o buoc cuoi {TBT, P.TBT}', () => {
    assert.equal(inMyQueue(item(7), { id: 'u-ptbt', roleName: 'P.TBT', isFullAdmin: false }, ROLES), true);
    assert.equal(inMyQueue(item(7), { id: 'u-tpp', roleName: 'T.PP', isFullAdmin: false }, ROLES), false);
  });
  it('T.PP van thay muc o buoc T.PP tiep theo sau khi duyet vong 1', () => {
    const it3 = item(3, { approvalActorIds: ['u-tpp'], myApprovalRoles: ['T.PP'] });
    assert.equal(inMyQueue(it3, { id: 'u-tpp', roleName: 'T.PP', isFullAdmin: false }, ROLES), true);
  });
  it('T.PP bi loai khoi muc buoc P.TBT neu truoc do da duyet T.PP', () => {
    const it4 = item(4, { approvalActorIds: ['u-tpp'], myApprovalRoles: ['T.PP'] });
    assert.equal(inMyQueue(it4, { id: 'u-tpp', roleName: 'T.PP', isFullAdmin: false }, ROLES), false);
  });
  it('full-admin + cong tac TAT: thay moi muc ke ca tu tao/da xu ly', () => {
    const admin = { id: 'u-admin', roleName: 'Super Admin', isFullAdmin: true };
    assert.equal(inMyQueue(item(7, { createdBy: 'u-admin' }), admin, ROLES, { enforceSoD: false }), true);
    assert.equal(inMyQueue(item(7, { approvalActorIds: ['u-admin'], myApprovalRoles: ['Super Admin'] }), admin, ROLES, { enforceSoD: false }), true);
  });
  it('full-admin + cong tac BAT: bi loai khi tu tao hoac da xu ly (actorRole Super Admin ngoai role buoc)', () => {
    const admin = { id: 'u-admin', roleName: 'Super Admin', isFullAdmin: true };
    assert.equal(inMyQueue(item(7, { createdBy: 'u-admin' }), admin, ROLES, { enforceSoD: true }), false);
    assert.equal(inMyQueue(item(7, { approvalActorIds: ['u-admin'], myApprovalRoles: ['Super Admin'] }), admin, ROLES, { enforceSoD: true }), false);
    assert.equal(inMyQueue(item(7), admin, ROLES, { enforceSoD: true }), true);
  });
  it('duong cu (khong co myApprovalRoles): bat ky approval nao cua toi cung loai', () => {
    assert.equal(inMyQueue(item(3, { approvalActorIds: ['u-tpp'] }), { id: 'u-tpp', roleName: 'T.PP', isFullAdmin: false }, ROLES), false);
  });
  it('filterMyQueue giu nguyen thu tu', () => {
    const items = [item(7), item(3, { approvalActorIds: ['u-tpp'], myApprovalRoles: ['T.PP'] })];
    const out = filterMyQueue(items, { id: 'u-tpp', roleName: 'T.PP', isFullAdmin: false }, ROLES);
    assert.equal(out.length, 1);
    assert.equal(out[0].workflowStep, 3);
  });
});

describe('B7 theo roleNames', () => {
  it('groupSubstitutes: TBT/P.TBT o buoc cuoi la hop le, T.PP la duyet thay', () => {
    const rows = [
      { actorId: 'a', actorRole: 'TBT', step: 7 },
      { actorId: 'b', actorRole: 'P.TBT', step: 7 },
      { actorId: 'c', actorRole: 'T.PP', step: 7 },
      { actorId: 'd', actorRole: 'TP', step: 1 },
      { actorId: 'e', actorRole: 'PV', step: 1 },
    ];
    const out = groupSubstitutes(rows, ROLES, () => 'print-article');
    assert.deepEqual(out.map((o) => o.actorId).sort(), ['c', 'e']);
  });
  it('stepRoleNamesFromDefinitions: roleNames passthrough + fallback [roleName]', () => {
    const m = stepRoleNamesFromDefinitions([
      { moduleKey: 'print-article', steps: [
        { roleName: 'TP', roleNames: ['TP'], sortOrder: 0 },
        { roleName: 'TBT', roleNames: ['TBT', 'P.TBT'], sortOrder: 1 },
        { roleName: 'MD', sortOrder: 2 },
      ] },
    ]);
    assert.deepEqual(m['print-article'][1], ['TP']);
    assert.deepEqual(m['print-article'][2], ['TBT', 'P.TBT']);
    assert.deepEqual(m['print-article'][3], ['MD']);
  });
  it('sumMembersForStep: buoc cuoi dem ca TBT va P.TBT', () => {
    const counts = new Map([['tbt', 1], ['p.tbt', 2], ['t.pp', 3]]);
    assert.equal(sumMembersForStep(counts, ['TBT', 'P.TBT']), 3);
    assert.equal(sumMembersForStep(counts, ['T.PP']), 3);
    assert.equal(sumMembersForStep(counts, ['MD']), 0);
  });
});

describe('B7 moc doi cau truc (khong dem thua approval cu)', () => {
  const cutoff = new Date('2026-11-05T00:00:00Z');
  it('truoc moc -> bo qua; dung moc va sau moc -> tinh', () => {
    assert.equal(passesStructureCutoff(new Date('2026-11-04T23:59:59Z'), cutoff), false);
    assert.equal(passesStructureCutoff(new Date('2026-11-05T00:00:00Z'), cutoff), true);
    assert.equal(passesStructureCutoff(new Date('2026-11-06T00:00:00Z'), cutoff), true);
  });
  it('khong co moc (null/undefined) -> tinh het', () => {
    assert.equal(passesStructureCutoff(new Date('2020-01-01T00:00:00Z'), null), true);
    assert.equal(passesStructureCutoff(new Date('2020-01-01T00:00:00Z'), undefined), true);
  });
});

describe('gioi han sua bai cua PV (chi bai minh tao, trang thai nhap)', () => {
  it('PV sua nhap cua minh: DUOC', () => {
    assert.equal(pvEditCheck({ createdBy: 'u-pv', status: 'draft' }, { id: 'u-pv', roleName: 'PV' }), null);
  });
  it('PV sua nhap cua nguoi khac: BI CHAN', () => {
    assert.ok(pvEditCheck({ createdBy: 'u-khac', status: 'draft' }, { id: 'u-pv', roleName: 'PV' }));
  });
  it('PV sua bai dang cho duyet / da duyet / da xuat ban cua minh: BI CHAN', () => {
    for (const s of ['pending_review', 'approved', 'published', 'unpublished']) {
      assert.ok(pvEditCheck({ createdBy: 'u-pv', status: s }, { id: 'u-pv', roleName: 'PV' }), s);
    }
  });
  it('role khac (TP/T.PP/full-admin) khong bi guard nay chan', () => {
    assert.equal(pvEditCheck({ createdBy: 'u-khac', status: 'published' }, { id: 'u-tp', roleName: 'TP' }), null);
    assert.equal(pvEditCheck({ createdBy: 'u-khac', status: 'published' }, { id: 'u-admin', roleName: 'Super Admin' }), null);
  });
});
