// Test engine quy trinh duyet dong — chay truc tiep bang node --test,
// khong can build/DB. Bao phu: doi ten buoc, tra ve buoc truoc / ve
// nguoi tao, remap theo key, duyet khan, profile tung phan he, fallback.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  engineCanApprove,
  engineNextStep,
  engineStepLabel,
  engineTransition,
  remapStep,
} from './workflow-engine.ts';
import { EPAPER_WORKFLOW_STEPS } from '../epaper/epaper-workflow.ts';
import { NEWS_WORKFLOW_STEPS } from '../news/news-workflow.ts';
import { PRINT_ARTICLE_WORKFLOW_STEPS } from '../print-articles/print-article-workflow.ts';
import { EVENT_WORKFLOW_STEPS } from '../events/events-workflow.ts';
import { LIVEBLOG_WORKFLOW_STEPS } from '../liveblog/liveblog-workflow.ts';
import { AD_WORKFLOW_STEPS } from '../ads/ads-workflow.ts';
import { ROYALTY_WORKFLOW_STEPS } from '../royalties/royalties-workflow.ts';

const PUBLISHED = { finalStatus: 'published', publishDirectFrom: ['draft'], unpublishTo: 'draft', allowUnlock: false };
const APPROVED = { finalStatus: 'approved', publishDirectFrom: [], unpublishTo: null, allowUnlock: false };

function steps4() {
  return [
    { key: 'md', label: 'MD — Duyệt Mo-rát', roleName: 'MD', returnTo: 'creator', allowEmergency: false },
    { key: 'tpp', label: 'T.PP — Trưởng/Phó phòng', roleName: 'T.PP', returnTo: 'previous', allowEmergency: false },
    { key: 'ptbt', label: 'P.TBT — Phó Tổng Biên tập', roleName: 'P.TBT', returnTo: 'creator', allowEmergency: true },
    { key: 'tbt', label: 'TBT — Tổng Biên tập', roleName: 'TBT', returnTo: 'creator', allowEmergency: false },
  ];
}

test('(a) doi ten buoc: label hien thi doi, chan quyen theo roleName khong doi', () => {
  const steps = steps4();
  assert.equal(engineStepLabel(steps, 2), 'T.PP — Trưởng/Phó phòng');
  const renamed = steps.map((s) => (s.key === 'tpp' ? { ...s, label: 'T.PP — Ten moi' } : s));
  assert.equal(engineStepLabel(renamed, 2), 'T.PP — Ten moi');
  assert.equal(engineCanApprove(renamed, 'T.PP', false, 2), true);
  assert.equal(engineCanApprove(renamed, 'MD', false, 2), false);
  assert.equal(engineCanApprove(renamed, null, true, 2), true);
});

test('(b) tra ve buoc lien truoc: k -> k-1; tu buoc 1 thi ve nhap', () => {
  const steps = steps4();
  assert.deepEqual(engineTransition(PUBLISHED, steps, { status: 'pending_review', step: 2 }, 'return'), { status: 'pending_review', step: 1 });
  assert.deepEqual(engineTransition(PUBLISHED, steps, { status: 'pending_review', step: 1 }, 'return'), { status: 'draft', step: 0 });
  assert.throws(() => engineTransition(PUBLISHED, steps, { status: 'draft', step: 0 }, 'return'));
});

test('(c) tra ve nguoi tao: moi buoc -> nhap', () => {
  const steps = steps4();
  for (const step of [1, 3, 4]) {
    assert.deepEqual(engineTransition(PUBLISHED, steps, { status: 'pending_review', step }, 'return'), { status: 'draft', step: 0 });
  }
});

test('(d) remap theo key khi xoa/doi thu tu buoc co ho so dang chay', () => {
  const oldSteps = steps4();
  // Xoa buoc giua (tpp): ho so o tpp -> ve nhap; o ptbt/tbt doi xuong 1.
  const withoutTpp = [oldSteps[0], oldSteps[2], oldSteps[3]];
  assert.deepEqual(remapStep(oldSteps, withoutTpp, 2), { step: 0, resetToDraft: true });
  assert.deepEqual(remapStep(oldSteps, withoutTpp, 3), { step: 2, resetToDraft: false });
  assert.deepEqual(remapStep(oldSteps, withoutTpp, 4), { step: 3, resetToDraft: false });
  // Doi thu tu: tbt len dau — so buoc chay theo key, khong theo so cu.
  const reordered = [oldSteps[3], oldSteps[0], oldSteps[1], oldSteps[2]];
  assert.deepEqual(remapStep(oldSteps, reordered, 4), { step: 1, resetToDraft: false });
  assert.deepEqual(remapStep(oldSteps, reordered, 1), { step: 2, resetToDraft: false });
  // Ho so ngoai quy trinh thi giu nguyen.
  assert.deepEqual(remapStep(oldSteps, withoutTpp, 0), { step: 0, resetToDraft: false });
});

test('duyet khan: chi buoc allowEmergency=true moi duoc, xong la ket thuc luong', () => {
  const steps = steps4();
  assert.deepEqual(engineTransition(PUBLISHED, steps, { status: 'pending_review', step: 3 }, 'emergency-approve'), { status: 'published', step: 0 });
  assert.throws(() => engineTransition(PUBLISHED, steps, { status: 'pending_review', step: 2 }, 'emergency-approve'), /khong cho phep duyet khan/);
  assert.throws(() => engineTransition(PUBLISHED, steps, { status: 'draft', step: 0 }, 'emergency-approve'));
  // Bai bao in: duyet khan -> approved (khong xuat ban web).
  assert.deepEqual(engineTransition(APPROVED, steps, { status: 'pending_review', step: 3 }, 'emergency-approve'), { status: 'approved', step: 0 });
});

test('profile tung phan he: publish-direct / unpublish / unlock dung nhu cu', () => {
  const steps = steps4();
  assert.deepEqual(engineTransition(PUBLISHED, steps, { status: 'draft', step: 0 }, 'publish-direct'), { status: 'published', step: 0 });
  assert.deepEqual(engineTransition(PUBLISHED, steps, { status: 'published', step: 0 }, 'unpublish'), { status: 'draft', step: 0 });
  const newsProfile = { finalStatus: 'published', publishDirectFrom: ['draft', 'unpublished'], unpublishTo: 'unpublished', allowUnlock: false };
  assert.deepEqual(engineTransition(newsProfile, steps, { status: 'unpublished', step: 0 }, 'publish-direct'), { status: 'published', step: 0 });
  assert.deepEqual(engineTransition(newsProfile, steps, { status: 'published', step: 0 }, 'unpublish'), { status: 'unpublished', step: 0 });
  assert.throws(() => engineTransition(APPROVED, steps, { status: 'draft', step: 0 }, 'publish-direct'));
  assert.throws(() => engineTransition(APPROVED, steps, { status: 'published', step: 0 }, 'unpublish'));
  const royaltyProfile = { finalStatus: 'approved', publishDirectFrom: [], unpublishTo: null, allowUnlock: true };
  assert.deepEqual(engineTransition(royaltyProfile, steps, { status: 'approved', step: 0 }, 'unlock'), { status: 'draft', step: 0 });
  assert.throws(() => engineTransition(royaltyProfile, steps, { status: 'pending_review', step: 1 }, 'unlock'));
  assert.equal(engineNextStep(steps, 4), null);
  assert.equal(engineNextStep(steps, 2), 3);
});

test('(e) engine tuong duong ham cu: cung steps (them returnTo/emergency mac dinh) thi cung ket qua', async () => {
  // Moi module: chuyen STEPS cung sang EngineStep roi doi chieu engine
  // voi ham transition/stepLabel/canApproveStep/nextStepAfterApprove cu
  // tren ma tran trang thai — dam bao viec chuyen sang engine khong doi
  // hanh vi cua 7 luong hien co (chi khac message loi, khong so sanh).
  const mods = [
    ['epaper', EPAPER_WORKFLOW_STEPS, await import('../epaper/epaper-workflow.ts'),
      { finalStatus: 'published', publishDirectFrom: ['draft'], unpublishTo: 'draft', allowUnlock: false }],
    ['news', NEWS_WORKFLOW_STEPS, await import('../news/news-workflow.ts'),
      { finalStatus: 'published', publishDirectFrom: ['draft', 'unpublished'], unpublishTo: 'unpublished', allowUnlock: false }],
    ['print-article', PRINT_ARTICLE_WORKFLOW_STEPS, await import('../print-articles/print-article-workflow.ts'),
      { finalStatus: 'approved', publishDirectFrom: [], unpublishTo: null, allowUnlock: false }],
    ['events', EVENT_WORKFLOW_STEPS, await import('../events/events-workflow.ts'),
      { finalStatus: 'published', publishDirectFrom: ['draft', 'unpublished'], unpublishTo: 'unpublished', allowUnlock: false }],
    ['liveblog', LIVEBLOG_WORKFLOW_STEPS, await import('../liveblog/liveblog-workflow.ts'),
      { finalStatus: 'published', publishDirectFrom: ['draft', 'unpublished'], unpublishTo: 'unpublished', allowUnlock: false }],
    ['ads', AD_WORKFLOW_STEPS, await import('../ads/ads-workflow.ts'),
      { finalStatus: 'published', publishDirectFrom: ['draft', 'unpublished'], unpublishTo: 'unpublished', allowUnlock: false }],
    ['royalties', ROYALTY_WORKFLOW_STEPS, await import('../royalties/royalties-workflow.ts'),
      { finalStatus: 'approved', publishDirectFrom: [], unpublishTo: null, allowUnlock: true }],
  ];
  const statuses = ['draft', 'pending_review', 'published', 'unpublished', 'approved'];
  const actions = ['submit', 'approve', 'return', 'publish-direct', 'unpublish', 'unlock'];
  for (const [key, arr, old, profile] of mods) {
    const steps = arr.map((s) => ({ ...s, returnTo: 'creator', allowEmergency: false }));
    for (const step of [0, 1, 2, 5]) {
      assert.equal(engineStepLabel(steps, step), old.stepLabel(step), `${key} stepLabel ${step}`);
      assert.equal(engineNextStep(steps, step), old.nextStepAfterApprove(step), `${key} nextStep ${step}`);
      for (const role of ['MD', 'TBT', null]) {
        assert.equal(engineCanApprove(steps, role, false, step), old.canApproveStep(role, false, step), `${key} canApprove ${step} ${role}`);
      }
      assert.equal(engineCanApprove(steps, null, true, step), old.canApproveStep(null, true, step));
    }
    for (const status of statuses) {
      for (const step of [0, 1, 2, 5]) {
        for (const action of actions) {
          let a; let aErr = false;
          try { a = old.transition({ status, step }, action); } catch { aErr = true; }
          let b; let bErr = false;
          try { b = engineTransition(profile, steps, { status, step }, action); } catch { bErr = true; }
          assert.equal(bErr, aErr, `${key} ${status}/${step}/${action}: cu ${aErr ? 'throw' : JSON.stringify(a)} vs moi ${bErr ? 'throw' : JSON.stringify(b)}`);
          if (!aErr) assert.deepEqual(b, a, `${key} ${status}/${step}/${action}`);
        }
      }
    }
  }
  // Video fallback: 1 buoc TBT, mac dinh tat (kiem tra qua seed test).
});
