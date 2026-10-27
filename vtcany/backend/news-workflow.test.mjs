// Test logic quy trinh duyet tin bai — chay truc tiep bang node --test,
// khong can build (Node strip type cua file .ts thuan).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  NEWS_WORKFLOW_STEPS,
  stepLabel,
  nextStepAfterApprove,
  transition,
  canApproveStep,
} from './src/modules/news/news-workflow.ts';

test('chuoi tin bai co 4 buoc duyet, buoc cuoi la XB', () => {
  assert.equal(NEWS_WORKFLOW_STEPS.length, 4);
  assert.equal(NEWS_WORKFLOW_STEPS[3].key, 'xb');
  assert.equal(stepLabel(1), 'TP — Trưởng phòng');
  assert.equal(stepLabel(4), 'XB — Xuất bản');
  assert.equal(stepLabel(0), null);
  assert.equal(stepLabel(5), null);
});

test('nhap -> gui duyet -> duyet tung buoc -> xuat ban o buoc cuoi', () => {
  let s = { status: 'draft', step: 0 };
  s = transition(s, 'submit');
  assert.deepEqual(s, { status: 'pending_review', step: 1 });
  s = transition(s, 'approve');
  assert.deepEqual(s, { status: 'pending_review', step: 2 });
  s = transition(s, 'approve');
  assert.deepEqual(s, { status: 'pending_review', step: 3 });
  s = transition(s, 'approve');
  assert.deepEqual(s, { status: 'pending_review', step: 4 });
  s = transition(s, 'approve');
  assert.deepEqual(s, { status: 'published', step: 0 });
  assert.throws(() => transition({ status: 'pending_review', step: 5 }, 'approve'));
});

test('tra lai tu buoc bat ky ve nhap, step reset 0', () => {
  assert.deepEqual(transition({ status: 'pending_review', step: 3 }, 'return'), { status: 'draft', step: 0 });
  assert.throws(() => transition({ status: 'draft', step: 0 }, 'return'));
});

test('xuat ban truc tiep chi tu nhap/ha xuat ban; go xuong chi tu da xuat ban', () => {
  assert.deepEqual(transition({ status: 'draft', step: 0 }, 'publish-direct'), { status: 'published', step: 0 });
  assert.deepEqual(transition({ status: 'unpublished', step: 0 }, 'publish-direct'), { status: 'published', step: 0 });
  assert.deepEqual(transition({ status: 'published', step: 0 }, 'unpublish'), { status: 'unpublished', step: 0 });
  assert.throws(() => transition({ status: 'pending_review', step: 2 }, 'publish-direct'));
  assert.throws(() => transition({ status: 'draft', step: 0 }, 'unpublish'));
});

test('quyen duyet theo ten Role: dung buoc moi duyet, toan quyen bypass', () => {
  assert.equal(canApproveStep('TP', false, 1), true);
  assert.equal(canApproveStep('tp', false, 1), true);
  assert.equal(canApproveStep('PBĐT', false, 1), false);
  assert.equal(canApproveStep('XB', false, 4), true);
  assert.equal(canApproveStep('Editor', false, 2), false);
  assert.equal(canApproveStep(null, false, 1), false);
  assert.equal(canApproveStep('Bat ky', true, 3), true);
  assert.equal(canApproveStep('TP', false, 0), false);
});

test('chuyen sai trang thai deu throw (khong cho nhay buoc)', () => {
  assert.throws(() => transition({ status: 'published', step: 0 }, 'submit'));
  assert.throws(() => transition({ status: 'draft', step: 0 }, 'approve'));
  assert.throws(() => transition({ status: 'pending_review', step: 0 }, 'approve'));
  assert.equal(nextStepAfterApprove(4), null);
  assert.equal(nextStepAfterApprove(2), 3);
});
