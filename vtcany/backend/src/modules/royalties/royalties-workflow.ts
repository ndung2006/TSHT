// Quy trinh duyet NHUAN BUT — logic thuan, khong phu thuoc DB, de test
// truc tiep bang node --test. Sao khuon ads-workflow.ts (Goi 2C).
//
// Chuoi duyet theo thiet ke 2C da chot voi dieu phoi vien (30/10/2026):
//   Truong phong (TP) cham diem + gui duyet -> BBT duyet = KHOA diem.
//   Chi 1 buoc duyet. Buoc NOP chi can quyen royalties:update, KHONG
//   khoa theo role tac gia — khoa role + tach nhiem vu (SoD) nam o buoc
//   DUYET (giu mau news/epaper/events/ads).
//   Diem da khoa chi sua duoc sau khi BBT MO KHOA ngoai le (bat buoc
//   ly do, ghi log isException); mo khoa dua ban cham ve nhap.
//
// CHU Y: `key`/`roleName` la khoa chan quyen duyet — ten Role trong CMS
// PHAI trung roleName (khong phan biet hoa/thuong). Chi doi `label`
// hien thi neu can; doi ten role se lam vo chan buoc.
//
// Y nghia workflowStep tren ArticleRoyalty:
//   0 = khong nam trong quy trinh (nhap hoac da duyet/khoa)
//   1 = dang cho duyet o buoc 1 (BBT).
// Trang thai: draft | pending_review | approved (approved = da khoa).
//   - Tai khoan khong phai toan quyen chi duyet/mo khoa duoc khi Role
//     trung roleName cua buoc; Role chua ton tai trong DB -> khong ai
//     (ngoai toan quyen) duyet duoc: fail-closed.

export interface WorkflowStep {
  key: string;
  label: string;
  /** Ten Role trong CMS phai trung de duoc duyet buoc nay. */
  roleName: string;
}

export const ROYALTY_WORKFLOW_STEPS: WorkflowStep[] = [
  { key: 'bbt', label: 'BBT — Ban Biên tập', roleName: 'BBT' },
];

export const ROYALTY_WORKFLOW_AUTHOR_LABEL = 'TP';

export type RoyaltyWorkflowStatus = 'draft' | 'pending_review' | 'approved';

export interface WorkflowState {
  status: RoyaltyWorkflowStatus;
  step: number;
}

export type WorkflowAction = 'submit' | 'approve' | 'return' | 'unlock';

export function stepLabel(step: number): string | null {
  if (step < 1 || step > ROYALTY_WORKFLOW_STEPS.length) return null;
  return ROYALTY_WORKFLOW_STEPS[step - 1].label;
}

/** Buoc tiep theo sau khi duyet (null = duyet xong -> khoa diem). */
export function nextStepAfterApprove(step: number): number | null {
  if (step < 1 || step > ROYALTY_WORKFLOW_STEPS.length) return null;
  return step === ROYALTY_WORKFLOW_STEPS.length ? null : step + 1;
}

/** Chuyen trang thai thuan; sai trang thai -> throw Error (service doi thanh 409). */
export function transition(state: WorkflowState, action: WorkflowAction): WorkflowState {
  const { status, step } = state;
  switch (action) {
    case 'submit':
      if (status !== 'draft' || step !== 0) throw new Error('chi ban cham nhap moi gui duyet duoc');
      return { status: 'pending_review', step: 1 };
    case 'approve': {
      if (status !== 'pending_review') throw new Error('chi ban cham dang cho duyet moi duyet duoc');
      if (step < 1 || step > ROYALTY_WORKFLOW_STEPS.length) throw new Error('buoc duyet khong hop le');
      const next = nextStepAfterApprove(step);
      if (next === null) return { status: 'approved', step: 0 };
      return { status: 'pending_review', step: next };
    }
    case 'return':
      if (status !== 'pending_review') throw new Error('chi ban cham dang cho duyet moi tra lai duoc');
      return { status: 'draft', step: 0 };
    case 'unlock':
      // Mo khoa ngoai le: chi tu trang thai da khoa (approved). Gate
      // role BBT + ly do bat buoc nam o service (canApproveStep rieng).
      if (status !== 'approved' || step !== 0) throw new Error('chi ban cham da khoa moi mo khoa duoc');
      return { status: 'draft', step: 0 };
    default:
      throw new Error('hanh dong quy trinh khong hop le');
  }
}

/** Actor co duoc duyet buoc hien tai khong (toan quyen luon duoc). */
export function canApproveStep(actorRoleName: string | null, isFullAdmin: boolean, step: number): boolean {
  if (isFullAdmin) return true;
  if (step < 1 || step > ROYALTY_WORKFLOW_STEPS.length) return false;
  if (!actorRoleName) return false;
  return actorRoleName.toLowerCase() === ROYALTY_WORKFLOW_STEPS[step - 1].roleName.toLowerCase();
}

/** Mo khoa cung khoa theo role cua buoc duyet duy nhat (BBT). */
export function canUnlock(actorRoleName: string | null, isFullAdmin: boolean): boolean {
  return canApproveStep(actorRoleName, isFullAdmin, ROYALTY_WORKFLOW_STEPS.length);
}

/** Nhan hanh dong duyet de hien thi trong lich su (tieng Viet khong dau, theo quy uoc API). */
export const WORKFLOW_ACTION_LABELS: Record<string, string> = {
  submit: 'gui duyet',
  approve: 'duyet',
  return: 'tra lai',
  publish: 'khoa diem',
  unlock: 'mo khoa',
};

export interface SeparationCheck {
  allowed: boolean;
  /** true khi cho qua nho ngoai le tin nong (service phai ghi log ngoai le). */
  isException: boolean;
}

/** Tach nhiem vu: nguoi xu ly buoc truoc khong duoc duyet buoc sau cua
 *  cung mot ban cham. previousActorId = actorId cua ban ghi approval
 *  gan nhat (voi chuoi 1 buoc: ban ghi submit). Khong xac dinh duoc
 *  (ban ghi cu thieu actorId) thi cho qua. Ngoai le tin nong chi duoc
 *  chap nhan khi breakingNews = true; service ghi log ngoai le ro
 *  rang. Ap dung ca cho tai khoan toan quyen. */
export function checkSeparationOfDuties(previousActorId: string | null, actorId: string | null, breakingNews = false): SeparationCheck {
  if (!previousActorId || !actorId || previousActorId !== actorId) return { allowed: true, isException: false };
  if (breakingNews) return { allowed: true, isException: true };
  return { allowed: false, isException: false };
}
