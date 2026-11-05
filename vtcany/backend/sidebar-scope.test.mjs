// Test pham vi xem danh sach sidebar dot 2 — chay truc tiep bang
// node --test, khong can build (Node strip type cua file .ts thuan).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyNarrowScope,
  isNarrowScopeActor,
  myStepNumbers,
  narrowScopeFragment,
} from './src/modules/dashboard/sidebar-scope.ts';

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
