// Test pham vi xem danh sach sidebar dot 2 — chay truc tiep bang
// node --test, khong can build (Node strip type cua file .ts thuan).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyNarrowScope,
  isNarrowScopeActor,
  myStepNumbers,
  myStepNumbersFromRoleMap,
  narrowScopeFragment,
} from './src/modules/dashboard/sidebar-scope.ts';
import {
  ROLE_LAYOUT,
  isNewsroomWide,
} from './src/modules/dashboard/dashboard-layout.config.ts';
import { drillReturnedIds } from './src/modules/dashboard/dashboard-queries.ts';

const PV = { id: 'u-pv', roleName: 'PV', isFullAdmin: false };
const TP = { id: 'u-tp', roleName: 'TP', isFullAdmin: false };
const TBT = { id: 'u-tbt', roleName: 'TBT', isFullAdmin: false };
const ADMIN = { id: 'u-adm', roleName: 'Super Admin', isFullAdmin: true };
const NEWS_STEPS = [
  { roleName: 'TP' }, { roleName: 'PBĐT' },
  { roleName: 'BBT' }, { roleName: 'XB' },
];
const PRINT_STEPS = [
  { roleName: 'TP' }, { roleName: 'T.PP' }, { roleName: 'T.PP' },
  { roleName: 'P.TBT' }, { roleName: 'T.PP' }, { roleName: 'P.TBT' },
  { roleName: 'TBT', roleNames: ['TBT', 'P.TBT'] },
];

test('isNarrowScopeActor: PV/TP hep, TBT/Super Admin/toan quyen rong', () => {
  assert.equal(isNarrowScopeActor(PV), true);
  assert.equal(isNarrowScopeActor(TP), true);
  assert.equal(isNarrowScopeActor(TBT), false);
  assert.equal(isNarrowScopeActor(ADMIN), false);
  assert.equal(isNarrowScopeActor({ id: null, roleName: 'PV', isFullAdmin: false }), false);
  assert.equal(isNarrowScopeActor(null), false);
});

test('myStepNumbers: dung buoc role duoc duyet, khong phan biet hoa/thuong, buoc nhieu role', () => {
  assert.deepEqual(myStepNumbers(NEWS_STEPS, 'TP'), [1]);
  assert.deepEqual(myStepNumbers(NEWS_STEPS, 'tp'), [1]);
  assert.deepEqual(myStepNumbers(NEWS_STEPS, 'PV'), []);
  assert.deepEqual(myStepNumbers(NEWS_STEPS, 'TBT'), []);
  assert.deepEqual(myStepNumbers(PRINT_STEPS, 'P.TBT'), [4, 6, 7]);
  assert.deepEqual(myStepNumbers(PRINT_STEPS, 'T.PP'), [2, 3, 5]);
  assert.deepEqual(myStepNumbers(PRINT_STEPS, null), []);
});

test('narrowScopeFragment: draft -> chi cua minh; pending -> cua minh hoac buoc minh duyet', () => {
  assert.deepEqual(
    narrowScopeFragment({ status: 'draft', actor: PV, mySteps: [] }),
    { createdBy: 'u-pv' },
  );
  assert.deepEqual(
    narrowScopeFragment({ status: 'pending_review', actor: TP, mySteps: [1] }),
    { OR: [{ createdBy: 'u-tp' }, { workflowStep: { in: [1] } }] },
  );
  assert.deepEqual(
    narrowScopeFragment({ status: 'pending_review', actor: PV, mySteps: [] }),
    { OR: [{ createdBy: 'u-pv' }] },
  );
});

test('narrowScopeFragment: role rong khong bi gioi han', () => {
  assert.equal(narrowScopeFragment({ status: 'draft', actor: TBT, mySteps: [] }), null);
  assert.equal(narrowScopeFragment({ status: 'pending_review', actor: ADMIN, mySteps: [] }), null);
});

test('narrowScopeFragment: loai tru drill co dinh nghia rieng (myQueue/buoc/mine/scope)', () => {
  const base = { status: 'draft', actor: PV, mySteps: [] };
  assert.equal(narrowScopeFragment({ ...base, myQueue: '1' }), null);
  assert.equal(narrowScopeFragment({ ...base, workflowStep: '2' }), null);
  assert.equal(narrowScopeFragment({ ...base, mine: '1' }), null);
  assert.equal(narrowScopeFragment({ ...base, scopeParam: 'mine' }), null);
});

test('narrowScopeFragment: returned/neverSubmitted ep ve draft (nhap bi tra cua minh)', () => {
  assert.deepEqual(
    narrowScopeFragment({ returned: '1', actor: PV, mySteps: [] }),
    { createdBy: 'u-pv' },
  );
  assert.deepEqual(
    narrowScopeFragment({ neverSubmitted: '1', actor: PV, mySteps: [] }),
    { createdBy: 'u-pv' },
  );
});

test('narrowScopeFragment: trang thai khac / khong trang thai khong gioi han', () => {
  assert.equal(narrowScopeFragment({ status: 'published', actor: PV, mySteps: [] }), null);
  assert.equal(narrowScopeFragment({ status: 'approved', actor: PV, mySteps: [] }), null);
  assert.equal(narrowScopeFragment({ actor: PV, mySteps: [] }), null);
});

test('applyNarrowScope: AND fragment vao where; null thi giu nguyen where', () => {
  const where = { status: 'draft' };
  const out = applyNarrowScope(where, { status: 'draft', actor: PV, mySteps: [] });
  assert.deepEqual(out, { AND: [{ status: 'draft' }, { createdBy: 'u-pv' }] });
  assert.equal(applyNarrowScope(where, { status: 'draft', actor: TBT, mySteps: [] }), where);
});

// ------------------------------------------------------------------
// Widget tang B = drill danh sach (sua truoc push dot 2, 2026-11-05):
// wB1 cot "Bi tra ve" va wB2 "cho dan" phai dung chung applyNarrowScope
// voi API danh sach. Khong co DB nen test o muc where: ap where cua
// widget va where cua list len cung fixture, hai tap id phai trung nhau.
// Matcher chi ho tro cac dang where code that sinh ra: bang nhau,
// {in: [...]}, AND, OR.
// ------------------------------------------------------------------
const KTV = { id: 'u-ktv', roleName: 'KTV', isFullAdmin: false };
const TPP = { id: 'u-tpp', roleName: 'T.PP', isFullAdmin: false };
// Map buoc kieu stepMaps: { [step]: roleNames[] } cho chuoi bai bao in.
const PRINT_ROLE_MAP = {
  1: ['TP'], 2: ['T.PP'], 3: ['T.PP'], 4: ['P.TBT'],
  5: ['T.PP'], 6: ['P.TBT'], 7: ['TBT', 'P.TBT'],
};

function matchWhere(row, where) {
  if (!where || typeof where !== 'object') return true;
  return Object.entries(where).every(([k, v]) => {
    if (k === 'AND') return v.every((w) => matchWhere(row, w));
    if (k === 'OR') return v.some((w) => matchWhere(row, w));
    if (v && typeof v === 'object' && 'in' in v) return v.in.includes(row[k]);
    return row[k] === v;
  });
}

test('myStepNumbersFromRoleMap: dung buoc tu map stepMaps, khong phan biet hoa/thuong', () => {
  assert.deepEqual(myStepNumbersFromRoleMap(PRINT_ROLE_MAP, 'TP'), [1]);
  assert.deepEqual(myStepNumbersFromRoleMap(PRINT_ROLE_MAP, 'T.PP'), [2, 3, 5]);
  assert.deepEqual(myStepNumbersFromRoleMap(PRINT_ROLE_MAP, 'P.TBT'), [4, 6, 7]);
  assert.deepEqual(myStepNumbersFromRoleMap(PRINT_ROLE_MAP, 'TBT'), [7]);
  assert.deepEqual(myStepNumbersFromRoleMap(PRINT_ROLE_MAP, 't.pp'), [2, 3, 5]);
  assert.deepEqual(myStepNumbersFromRoleMap(PRINT_ROLE_MAP, 'KTV'), []);
  assert.deepEqual(myStepNumbersFromRoleMap(PRINT_ROLE_MAP, null), []);
  assert.deepEqual(myStepNumbersFromRoleMap(null, 'TP'), []);
});

test('B1: so cot Bi tra ve cua widget = so dong drill cho ca role hep (TP) va role rong (T.PP)', async () => {
  // Fixture: 4 nhap tin bai — 2 cua TP (1 bi tra, 1 chua gui), 1 cua PV
  // bi tra, 1 cua PV chua gui. Approval moi nhat quyet dinh "bi tra".
  const drafts = [
    { id: 'd1', status: 'draft', createdBy: 'u-tp' },
    { id: 'd2', status: 'draft', createdBy: 'u-tp' },
    { id: 'd3', status: 'draft', createdBy: 'u-pv' },
    { id: 'd4', status: 'draft', createdBy: 'u-pv' },
  ];
  const approvals = [
    { articleId: 'd1', action: 'submit', createdAt: new Date('2026-11-01') },
    { id: 'x', articleId: 'd1', action: 'return', createdAt: new Date('2026-11-02') },
    { articleId: 'd2', action: 'submit', createdAt: new Date('2026-11-01') },
    { articleId: 'd3', action: 'submit', createdAt: new Date('2026-11-01') },
    { articleId: 'd3', action: 'return', createdAt: new Date('2026-11-02') },
  ];
  const fakeDb = { newsArticleApproval: { findMany: async () => approvals } };
  const allReturned = await drillReturnedIds(fakeDb, 'newsArticleApproval', 'articleId', drafts.map((d) => d.id));
  assert.deepEqual([...allReturned].sort(), ['d1', 'd3']);
  for (const [actor, expected] of [[TP, ['d1']], [TPP, ['d1', 'd3']]]) {
    // Widget: dem tren nhap da gioi han pham vi (wB1 dung
    // applyNarrowScope giong list).
    const widgetWhere = applyNarrowScope({ status: 'draft' }, { status: 'draft', actor, mySteps: [] });
    const widgetRows = drafts.filter((d) => matchWhere(d, widgetWhere) && allReturned.includes(d.id));
    // List drill (?status=draft&returned=1): returned id TOAN CUC giao
    // voi fragment pham vi hep — cung tap hop voi widget.
    const listWhere = applyNarrowScope(
      { status: 'draft', id: { in: allReturned } },
      { status: 'draft', returned: '1', actor, mySteps: [] },
    );
    const listRows = drafts.filter((d) => matchWhere(d, listWhere));
    assert.deepEqual(widgetRows.map((d) => d.id).sort(), expected, `widget ${actor.roleName}`);
    assert.deepEqual(listRows.map((d) => d.id).sort(), expected, `list ${actor.roleName}`);
  }
});

test('B2: so Cho dan cua widget = so dong drill ?status=pending_review cho KTV, TP', () => {
  // Fixture bai bao in cho duyet: KTV khong co buoc duyet nao (chi thay
  // cua minh); TP duyet buoc 1 (thay cua minh + buoc 1).
  const pendings = [
    { id: 'p1', status: 'pending_review', createdBy: 'u-ktv', workflowStep: 3 },
    { id: 'p2', status: 'pending_review', createdBy: 'u-tp', workflowStep: 2 },
    { id: 'p3', status: 'pending_review', createdBy: 'u-pv', workflowStep: 1 },
    { id: 'p4', status: 'pending_review', createdBy: 'u-pv', workflowStep: 4 },
  ];
  for (const [actor, expected] of [
    [KTV, ['p1']],
    [TP, ['p2', 'p3']],
    [TPP, ['p1', 'p2', 'p3', 'p4']],
  ]) {
    const steps = myStepNumbersFromRoleMap(PRINT_ROLE_MAP, actor.roleName);
    const where = applyNarrowScope(
      { status: 'pending_review' },
      { status: 'pending_review', actor, mySteps: steps },
    );
    assert.deepEqual(
      pendings.filter((p) => matchWhere(p, where)).map((p) => p.id).sort(),
      expected,
      `pending ${actor.roleName}`,
    );
  }
  // Where widget KTV phai la OR chi cua minh (khong co buoc duyet).
  assert.deepEqual(
    applyNarrowScope({ status: 'pending_review' }, { status: 'pending_review', actor: KTV, mySteps: [] }),
    { AND: [{ status: 'pending_review' }, { OR: [{ createdBy: 'u-ktv' }] }] },
  );
});

test('drill cua cac widget B khac khong bi khoa pham vi anh huong', () => {
  // Cac drill nay khong nam trong draft/pending hoac co dinh nghia
  // rieng (workflowStep/myQueue/mine) nen fragment tra null — widget
  // khong can sua: B1 theo buoc, B1 xuat ban/ha xuat ban, B2 theo so
  // bao + da duyet, B4/B5 xuat ban, B6 theo buoc, B7 tim theo tieu de.
  const drills = [
    { workflowStep: '2' },
    { workflowStep: '2', myQueue: '1' },
    { status: 'published', publishFrom: '2026-11-01', publishTo: '2026-11-08' },
    { unpublishedFrom: '2026-11-01', unpublishedTo: '2026-11-08' },
    { issueType: 'thuong', issueNumber: '320' },
    { status: 'approved' },
    { q: 'tieu de bai' },
  ];
  for (const q of drills) {
    assert.equal(
      narrowScopeFragment({ ...q, actor: TP, mySteps: [1] }),
      null,
      `drill ${JSON.stringify(q)} phai bypass fragment`,
    );
  }
});

test('kiem ke layout: role hep nao co widget B, widget do xu ly pham vi ra sao', () => {
  const bOf = (role) => (ROLE_LAYOUT[role] || []).filter((c) => c.startsWith('B'));
  // PV khong co widget B nao.
  assert.deepEqual(bOf('PV'), []);
  // TP la role hep duy nhat co B1 (cot Bi tra ve da sua theo actor) va
  // B6 (drill theo buoc, bypass fragment, khong can sua).
  assert.deepEqual(bOf('TP'), ['B1', 'B6']);
  // KTV/MD la role hep co B2 (Cho dan da sua theo actor).
  assert.deepEqual(bOf('KTV'), ['B2']);
  assert.deepEqual(bOf('MD'), ['B2']);
  // Moi role khac co widget B deu la role rong — fragment tra null nen
  // so widget giu toan cuc nhu GĐ1.
  for (const role of Object.keys(ROLE_LAYOUT)) {
    if (['TP', 'KTV', 'MD', 'PV'].includes(role)) continue;
    assert.ok(
      isNewsroomWide(role, false) || bOf(role).every((c) => c === 'B7'),
      `${role} co widget B ${bOf(role)} nhung khong phai role rong — can kiem lai pham vi`,
    );
  }
  // B5 (drill pending theo chuyen muc) chi o role rong T.PP — neu mot
  // role hep co B5 thi drill pending se lech so widget.
  const b5Holders = Object.keys(ROLE_LAYOUT).filter((r) => bOf(r).includes('B5'));
  assert.deepEqual(b5Holders, ['T.PP']);
});
