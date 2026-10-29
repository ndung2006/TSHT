// Test logic quy trinh duyet LIVEBLOG (Goi 2A) — chay truc tiep bang
// node --test, khong can build (Node strip type cua file .ts thuan).
// Sao khuon news-workflow.test.mjs; chuoi 1 buoc: PVTT nop -> PTTT duyet.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  LIVEBLOG_WORKFLOW_STEPS,
  LIVEBLOG_WORKFLOW_AUTHOR_LABEL,
  stepLabel,
  nextStepAfterApprove,
  transition,
  canApproveStep,
  checkSeparationOfDuties,
} from './src/modules/liveblog/liveblog-workflow.ts';

test('chuoi liveblog co 1 buoc duyet PTTT, tac gia la PVTT', () => {
  assert.equal(LIVEBLOG_WORKFLOW_STEPS.length, 1);
  assert.equal(LIVEBLOG_WORKFLOW_STEPS[0].key, 'pttt');
  assert.equal(LIVEBLOG_WORKFLOW_STEPS[0].roleName, 'PTTT');
  assert.equal(LIVEBLOG_WORKFLOW_AUTHOR_LABEL, 'PVTT');
  assert.equal(stepLabel(1), 'PTTT — Phó phòng tường thuật');
  assert.equal(stepLabel(0), null);
  assert.equal(stepLabel(2), null);
  assert.equal(nextStepAfterApprove(1), null);
});

test('nhap -> gui duyet -> PTTT duyet la xuat ban ngay (buoc cuoi)', () => {
  let s = { status: 'draft', step: 0 };
  s = transition(s, 'submit');
  assert.deepEqual(s, { status: 'pending_review', step: 1 });
  s = transition(s, 'approve');
  assert.deepEqual(s, { status: 'published', step: 0 });
  assert.throws(() => transition({ status: 'pending_review', step: 2 }, 'approve'));
});

test('tra lai ve nhap, step reset 0', () => {
  assert.deepEqual(transition({ status: 'pending_review', step: 1 }, 'return'), { status: 'draft', step: 0 });
  assert.throws(() => transition({ status: 'draft', step: 0 }, 'return'));
});

test('xuat ban truc tiep chi tu nhap/ha xuat ban; go xuong chi tu da xuat ban', () => {
  assert.deepEqual(transition({ status: 'draft', step: 0 }, 'publish-direct'), { status: 'published', step: 0 });
  assert.deepEqual(transition({ status: 'unpublished', step: 0 }, 'publish-direct'), { status: 'published', step: 0 });
  assert.deepEqual(transition({ status: 'published', step: 0 }, 'unpublish'), { status: 'unpublished', step: 0 });
  assert.throws(() => transition({ status: 'pending_review', step: 1 }, 'publish-direct'));
  assert.throws(() => transition({ status: 'draft', step: 0 }, 'unpublish'));
});

test('quyen duyet theo ten Role: chi PTTT, QLSK/TBT khong duyet duoc liveblog', () => {
  assert.equal(canApproveStep('PTTT', false, 1), true);
  assert.equal(canApproveStep('pttt', false, 1), true);
  assert.equal(canApproveStep('PVTT', false, 1), false);
  assert.equal(canApproveStep('TBT', false, 1), false);
  assert.equal(canApproveStep(null, false, 1), false);
  assert.equal(canApproveStep('Bat ky', true, 1), true);
  assert.equal(canApproveStep('PTTT', false, 0), false);
});

test('SoD: nguoi nop khong tu duyet duoc; ngoai le tin nong thi qua va danh dau', () => {
  assert.deepEqual(checkSeparationOfDuties('u1', 'u2'), { allowed: true, isException: false });
  assert.deepEqual(checkSeparationOfDuties('u1', 'u1'), { allowed: false, isException: false });
  assert.deepEqual(checkSeparationOfDuties('u1', 'u1', true), { allowed: true, isException: true });
  assert.deepEqual(checkSeparationOfDuties(null, 'u1'), { allowed: true, isException: false });
});

test('chuyen sai trang thai deu throw (khong cho nhay buoc)', () => {
  assert.throws(() => transition({ status: 'published', step: 0 }, 'submit'));
  assert.throws(() => transition({ status: 'draft', step: 0 }, 'approve'));
  assert.throws(() => transition({ status: 'pending_review', step: 0 }, 'approve'));
});
