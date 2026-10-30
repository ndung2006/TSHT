// Quy trinh duyet QUANG CAO TOA SOAN — logic thuan, khong phu thuoc DB,
// de test truc tiep bang node --test. Sao khuon events-workflow.ts
// (Goi 2B, giai doan 1 — quang cao lam truoc, binh luan lam sau).
//
// Chuoi duyet theo thiet ke 2B da trinh dieu phoi vien (30/10/2026):
//   QL-QC (tac gia, Quan ly quang cao) tao + gui duyet -> TBT duyet
//   = xuat ban. Chi 1 buoc duyet. Buoc NOP giu mau news/epaper/events:
//   chi can quyen newsroom_ads:update, KHONG khoa theo role tac gia —
//   khoa role + tach nhiem vu (SoD) nam o buoc DUYET.
//
// CHU Y: `key`/`roleName` la khoa chan quyen duyet — ten Role trong CMS
// PHAI trung roleName (khong phan biet hoa/thuong). Chi doi `label`
// hien thi neu can; doi ten role se lam vo chan buoc.
//
// Y nghia workflowStep tren NewsroomAd:
//   0 = khong nam trong quy trinh (nhap, da xuat ban hoac ha xuat ban)
//   1 = dang cho duyet o buoc 1 (TBT).
// Trang thai: draft | pending_review | published | unpublished.
//   - Tai khoan khong phai toan quyen chi duyet duoc khi Role trung
//     roleName cua buoc; Role chua ton tai trong DB -> khong ai (ngoai
//     toan quyen) duyet duoc: fail-closed.
//   - Xuat ban truc tiep tu nhap chi danh cho tai khoan toan quyen
//     (giu hanh vi mau news/epaper/events).

export interface WorkflowStep {
  key: string;
  label: string;
  /** Ten Role trong CMS phai trung de duoc duyet buoc nay. */
  roleName: string;
}

export const AD_WORKFLOW_STEPS: WorkflowStep[] = [
  { key: 'tbt', label: 'TBT — Tổng Biên tập', roleName: 'TBT' },
];

export const AD_WORKFLOW_AUTHOR_LABEL = 'QL-QC';

export type AdWorkflowStatus = 'draft' | 'pending_review' | 'published' | 'unpublished';

export interface WorkflowState {
  status: AdWorkflowStatus;
  step: number;
}

export type WorkflowAction = 'submit' | 'approve' | 'return' | 'publish-direct' | 'unpublish';

export function stepLabel(step: number): string | null {
  if (step < 1 || step > AD_WORKFLOW_STEPS.length) return null;
  return AD_WORKFLOW_STEPS[step - 1].label;
}

/** Buoc tiep theo sau khi duyet (null = duyet xong -> xuat ban). */
export function nextStepAfterApprove(step: number): number | null {
  if (step < 1 || step > AD_WORKFLOW_STEPS.length) return null;
  return step === AD_WORKFLOW_STEPS.length ? null : step + 1;
}

/** Chuyen trang thai thuan; sai trang thai -> throw Error (service doi thanh 409). */
export function transition(state: WorkflowState, action: WorkflowAction): WorkflowState {
  const { status, step } = state;
  switch (action) {
    case 'submit':
      if (status !== 'draft' || step !== 0) throw new Error('chi quang cao nhap moi gui duyet duoc');
      return { status: 'pending_review', step: 1 };
    case 'approve': {
      if (status !== 'pending_review') throw new Error('chi quang cao dang cho duyet moi duyet duoc');
      if (step < 1 || step > AD_WORKFLOW_STEPS.length) throw new Error('buoc duyet khong hop le');
      const next = nextStepAfterApprove(step);
      if (next === null) return { status: 'published', step: 0 };
      return { status: 'pending_review', step: next };
    }
    case 'return':
      if (status !== 'pending_review') throw new Error('chi quang cao dang cho duyet moi tra lai duoc');
      return { status: 'draft', step: 0 };
    case 'publish-direct':
      if ((status !== 'draft' && status !== 'unpublished') || step !== 0) throw new Error('chi quang cao nhap hoac da ha xuat ban moi xuat ban truc tiep duoc');
      return { status: 'published', step: 0 };
    case 'unpublish':
      if (status !== 'published') throw new Error('chi quang cao da xuat ban moi go xuong duoc');
      return { status: 'unpublished', step: 0 };
    default:
      throw new Error('hanh dong quy trinh khong hop le');
  }
}

/** Actor co duoc duyet buoc hien tai khong (toan quyen luon duoc). */
export function canApproveStep(actorRoleName: string | null, isFullAdmin: boolean, step: number): boolean {
  if (isFullAdmin) return true;
  if (step < 1 || step > AD_WORKFLOW_STEPS.length) return false;
  if (!actorRoleName) return false;
  return actorRoleName.toLowerCase() === AD_WORKFLOW_STEPS[step - 1].roleName.toLowerCase();
}

/** Nhan hanh dong duyet de hien thi trong lich su (tieng Viet khong dau, theo quy uoc API). */
export const WORKFLOW_ACTION_LABELS: Record<string, string> = {
  submit: 'gui duyet',
  approve: 'duyet',
  return: 'tra lai',
  publish: 'xuat ban',
  unpublish: 'go xuong',
};

export interface SeparationCheck {
  allowed: boolean;
  /** true khi cho qua nho ngoai le tin nong (service phai ghi log ngoai le). */
  isException: boolean;
}

/** Tach nhiem vu: nguoi xu ly buoc truoc khong duoc duyet buoc sau cua
 *  cung mot quang cao. previousActorId = actorId cua ban ghi approval
 *  gan nhat (voi chuoi 1 buoc: ban ghi submit). Khong xac dinh duoc
 *  (ban ghi cu thieu actorId) thi cho qua. Ngoai le tin nong chi duoc
 *  chap nhan khi breakingNews = true; service ghi log ngoai le ro
 *  rang. Ap dung ca cho tai khoan toan quyen. */
export function checkSeparationOfDuties(previousActorId: string | null, actorId: string | null, breakingNews = false): SeparationCheck {
  if (!previousActorId || !actorId || previousActorId !== actorId) return { allowed: true, isException: false };
  if (breakingNews) return { allowed: true, isException: true };
  return { allowed: false, isException: false };
}
