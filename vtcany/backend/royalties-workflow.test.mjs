// Test logic quy trinh duyet NHUAN BUT (Goi 2C) — chay truc tiep bang
// node --test, khong can build (Node strip type cua file .ts thuan).
// Sao khuon ads-workflow.test.mjs; chuoi 1 buoc: TP nop -> BBT duyet
// = khoa diem; mo khoa ngoai le dua ve nhap.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ROYALTY_WORKFLOW_STEPS,
  ROYALTY_WORKFLOW_AUTHOR_LABEL,
  stepLabel,
  nextStepAfterApprove,
  transition,
  canApproveStep,
  canUnlock,
  checkSeparationOfDuties,
} from './src/modules/royalties/royalties-workflow.ts';

test('chuoi nhuan but co 1 buoc duyet BBT, tac gia la TP', () => {
  assert.equal(ROYALTY_WORKFLOW_STEPS.length, 1);
  assert.equal(ROYALTY_WORKFLOW_STEPS[0].key, 'bbt');
  assert.equal(ROYALTY_WORKFLOW_STEPS[0].roleName, 'BBT');
  assert.equal(ROYALTY_WORKFLOW_AUTHOR_LABEL, 'TP');
  assert.equal(stepLabel(1), 'BBT — Ban Biên tập');
  assert.equal(stepLabel(0), null);
  assert.equal(stepLabel(2), null);
  assert.equal(nextStepAfterApprove(1), null);
});

test('nhap -> gui duyet -> BBT duyet la khoa diem ngay (buoc cuoi)', () => {
  let s = { status: 'draft', step: 0 };
  s = transition(s, 'submit');
  assert.deepEqual(s, { status: 'pending_review', step: 1 });
  s = transition(s, 'approve');
  assert.deepEqual(s, { status: 'approved', step: 0 });
});

test('dang cho duyet bi tra lai ve nhap', () => {
  const s = transition({ status: 'pending_review', step: 1 }, 'return');
  assert.deepEqual(s, { status: 'draft', step: 0 });
});

test('mo khoa chi tu trang thai da khoa, ve nhap', () => {
  const s = transition({ status: 'approved', step: 0 }, 'unlock');
  assert.deepEqual(s, { status: 'draft', step: 0 });
  assert.throws(() => transition({ status: 'draft', step: 0 }, 'unlock'));
  assert.throws(() => transition({ status: 'pending_review', step: 1 }, 'unlock'));
});

test('chuyen trang thai sai bi chan', () => {
  assert.throws(() => transition({ status: 'pending_review', step: 1 }, 'submit'));
  assert.throws(() => transition({ status: 'draft', step: 0 }, 'approve'));
  assert.throws(() => transition({ status: 'approved', step: 0 }, 'approve'));
  assert.throws(() => transition({ status: 'approved', step: 0 }, 'submit'));
  assert.throws(() => transition({ status: 'draft', step: 0 }, 'return'));
});

test('chi role BBT (khong phan biet hoa thuong) hoac toan quyen moi duyet/mo khoa', () => {
  assert.equal(canApproveStep('BBT', false, 1), true);
  assert.equal(canApproveStep('bbt', false, 1), true);
  assert.equal(canApproveStep('TP', false, 1), false);
  assert.equal(canApproveStep('TBT', false, 1), false);
  assert.equal(canApproveStep(null, false, 1), false);
  assert.equal(canApproveStep(null, true, 1), true);
  assert.equal(canApproveStep('Bat ky', true, 1), true);
  assert.equal(canApproveStep('BBT', false, 0), false);
  assert.equal(canApproveStep('BBT', false, 2), false);
  assert.equal(canUnlock('BBT', false), true);
  assert.equal(canUnlock('TP', false), false);
  assert.equal(canUnlock(null, true), true);
});

test('tach nhiem vu: nguoi nop khong tu duyet, ngoai le tin nong co log', () => {
  assert.deepEqual(checkSeparationOfDuties('u1', 'u2'), { allowed: true, isException: false });
  assert.deepEqual(checkSeparationOfDuties('u1', 'u1'), { allowed: false, isException: false });
  assert.deepEqual(checkSeparationOfDuties('u1', 'u1', true), { allowed: true, isException: true });
  assert.deepEqual(checkSeparationOfDuties(null, 'u1'), { allowed: true, isException: false });
  assert.deepEqual(checkSeparationOfDuties('u1', null), { allowed: true, isException: false });
});
