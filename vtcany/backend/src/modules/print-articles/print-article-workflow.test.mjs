// Test quy trinh duyet bai bao in — chay truc tiep bang node --test,
// khong can build (Node strip type cua file .ts thuan).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PRINT_ARTICLE_WORKFLOW_STEPS,
  canApproveStep,
  checkSeparationOfDuties,
  nextStepAfterApprove,
  stepLabel,
  transition,
} from './print-article-workflow.ts';

test('chuoi buoc la MD -> T.PP -> P.TBT -> TBT (tai su dung quy trinh bao in)', () => {
  assert.deepEqual(PRINT_ARTICLE_WORKFLOW_STEPS.map((s) => s.roleName), ['MD', 'T.PP', 'P.TBT', 'TBT']);
  assert.equal(stepLabel(1), 'MD — Duyệt Mo-rát');
  assert.equal(stepLabel(4), 'TBT — Tổng Biên tập');
  assert.equal(stepLabel(0), null);
  assert.equal(stepLabel(5), null);
});

test('submit: nhap -> cho duyet buoc 1; nhap sai trang thai thi throw', () => {
  assert.deepEqual(transition({ status: 'draft', step: 0 }, 'submit'), { status: 'pending_review', step: 1 });
  assert.throws(() => transition({ status: 'pending_review', step: 1 }, 'submit'));
  assert.throws(() => transition({ status: 'approved', step: 0 }, 'submit'));
});

test('approve: di tung buoc, duyet buoc cuoi (TBT) -> approved, step ve 0', () => {
  assert.deepEqual(transition({ status: 'pending_review', step: 1 }, 'approve'), { status: 'pending_review', step: 2 });
  assert.deepEqual(transition({ status: 'pending_review', step: 3 }, 'approve'), { status: 'pending_review', step: 4 });
  assert.deepEqual(transition({ status: 'pending_review', step: 4 }, 'approve'), { status: 'approved', step: 0 });
  assert.throws(() => transition({ status: 'draft', step: 0 }, 'approve'));
  assert.throws(() => transition({ status: 'approved', step: 0 }, 'approve'));
  assert.equal(nextStepAfterApprove(4), null);
  assert.equal(nextStepAfterApprove(2), 3);
});

test('return: cho duyet ve nhap; nhap/da duyet tra lai thi throw', () => {
  assert.deepEqual(transition({ status: 'pending_review', step: 2 }, 'return'), { status: 'draft', step: 0 });
  assert.throws(() => transition({ status: 'draft', step: 0 }, 'return'));
  assert.throws(() => transition({ status: 'approved', step: 0 }, 'return'));
});

test('khong co publish-direct / unpublish: bai bao in khong xuat ban cong khai', () => {
  assert.throws(() => transition({ status: 'draft', step: 0 }, 'publish-direct'));
  assert.throws(() => transition({ status: 'approved', step: 0 }, 'unpublish'));
});

test('canApproveStep: dung role moi duyet duoc buoc do; toan quyen luon duoc', () => {
  assert.equal(canApproveStep('MD', false, 1), true);
  assert.equal(canApproveStep('md', false, 1), true);
  assert.equal(canApproveStep('T.PP', false, 1), false);
  assert.equal(canApproveStep('TBT', false, 4), true);
  assert.equal(canApproveStep('KTV', false, 1), false);
  assert.equal(canApproveStep(null, false, 1), false);
  assert.equal(canApproveStep('bat-ky', true, 3), true);
  assert.equal(canApproveStep('MD', false, 0), false);
  assert.equal(canApproveStep('MD', false, 5), false);
});

test('tach nhiem vu: trung nguoi buoc truoc thi chan, ke ca toan quyen; ngoai le tin nong cho qua co log', () => {
  assert.deepEqual(checkSeparationOfDuties('u1', 'u1'), { allowed: false, isException: false });
  assert.deepEqual(checkSeparationOfDuties('u1', 'u2'), { allowed: true, isException: false });
  assert.deepEqual(checkSeparationOfDuties(null, 'u1'), { allowed: true, isException: false });
  assert.deepEqual(checkSeparationOfDuties('u1', 'u1', true), { allowed: true, isException: true });
  assert.deepEqual(checkSeparationOfDuties('u1', 'u1', false), { allowed: false, isException: false });
});
