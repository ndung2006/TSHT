// Quy trinh duyet SU KIEN TOA SOAN — logic thuan, khong phu thuoc DB,
// de test truc tiep bang node --test. Sao khuon news-workflow.ts /
// epaper-workflow.ts (Goi 2A, giai doan 1).
//
// Chuoi duyet da chot trong tai lieu chia viec 2 nguoi (29/10/2026):
//   QLSK (tac gia, Quan ly su kien) tao + gui duyet -> TBT duyet = xuat ban.
// Chi 1 buoc duyet. Buoc NOP giu mau news/epaper: chi can quyen
// newsroom_events:update, KHONG khoa theo role tac gia (chot thiet ke
// 29/10/2026) — khoa role + tach nhiem vu (SoD) nam o buoc DUYET.
//
// CHU Y: `key`/`roleName` la khoa chan quyen duyet — ten Role trong CMS
// PHAI trung roleName (khong phan biet hoa/thuong). Chi doi `label`
// hien thi neu can; doi ten role se lam vo chan buoc.
//
// Y nghia workflowStep tren NewsroomEvent:
//   0 = khong nam trong quy trinh (nhap, da xuat ban hoac ha xuat ban)
//   1 = dang cho duyet o buoc 1 (TBT).
// Trang thai: draft | pending_review | published | unpublished.
//   - Tai khoan khong phai toan quyen chi duyet duoc khi Role trung
//     roleName cua buoc; Role chua ton tai trong DB -> khong ai (ngoai
//     toan quyen) duyet duoc: fail-closed.
//   - Xuat ban truc tiep tu nhap chi danh cho tai khoan toan quyen
//     (giu hanh vi mau news/epaper).

export interface WorkflowStep {
  key: string;
  label: string;
  /** Ten Role trong CMS phai trung de duoc duyet buoc nay. */
  roleName: string;
}

export const EVENT_WORKFLOW_STEPS: WorkflowStep[] = [
  { key: 'tbt', label: 'TBT — Tổng Biên tập', roleName: 'TBT' },
];

export const EVENT_WORKFLOW_AUTHOR_LABEL = 'QLSK';

export type EventWorkflowStatus = 'draft' | 'pending_review' | 'published' | 'unpublished';

export interface WorkflowState {
  status: EventWorkflowStatus;
  step: number;
}

export type WorkflowAction = 'submit' | 'approve' | 'return' | 'publish-direct' | 'unpublish';

export function stepLabel(step: number): string | null {
  if (step < 1 || step > EVENT_WORKFLOW_STEPS.length) return null;
  return EVENT_WORKFLOW_STEPS[step - 1].label;
}

/** Buoc tiep theo sau khi duyet (null = duyet xong -> xuat ban). */
export function nextStepAfterApprove(step: number): number | null {
  if (step < 1 || step > EVENT_WORKFLOW_STEPS.length) return null;
  return step === EVENT_WORKFLOW_STEPS.length ? null : step + 1;
}

/** Chuyen trang thai thuan; sai trang thai -> throw Error (service doi thanh 409). */
export function transition(state: WorkflowState, action: WorkflowAction): WorkflowState {
  const { status, step } = state;
  switch (action) {
    case 'submit':
      if (status !== 'draft' || step !== 0) throw new Error('chi su kien nhap moi gui duyet duoc');
      return { status: 'pending_review', step: 1 };
    case 'approve': {
      if (status !== 'pending_review') throw new Error('chi su kien dang cho duyet moi duyet duoc');
      if (step < 1 || step > EVENT_WORKFLOW_STEPS.length) throw new Error('buoc duyet khong hop le');
      const next = nextStepAfterApprove(step);
      if (next === null) return { status: 'published', step: 0 };
      return { status: 'pending_review', step: next };
    }
    case 'return':
      if (status !== 'pending_review') throw new Error('chi su kien dang cho duyet moi tra lai duoc');
      return { status: 'draft', step: 0 };
    case 'publish-direct':
      if ((status !== 'draft' && status !== 'unpublished') || step !== 0) throw new Error('chi su kien nhap hoac da ha xuat ban moi xuat ban truc tiep duoc');
      return { status: 'published', step: 0 };
    case 'unpublish':
      if (status !== 'published') throw new Error('chi su kien da xuat ban moi go xuong duoc');
      return { status: 'unpublished', step: 0 };
    default:
      throw new Error('hanh dong quy trinh khong hop le');
  }
}

/** Actor co duoc duyet buoc hien tai khong (toan quyen luon duoc). */
export function canApproveStep(actorRoleName: string | null, isFullAdmin: boolean, step: number): boolean {
  if (isFullAdmin) return true;
  if (step < 1 || step > EVENT_WORKFLOW_STEPS.length) return false;
  if (!actorRoleName) return false;
  return actorRoleName.toLowerCase() === EVENT_WORKFLOW_STEPS[step - 1].roleName.toLowerCase();
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
 *  cung mot su kien. previousActorId = actorId cua ban ghi approval gan
 *  nhat (voi chuoi 1 buoc: ban ghi submit). Khong xac dinh duoc (ban ghi
 *  cu thieu actorId) thi cho qua. Ngoai le tin nong chi duoc chap nhan
 *  khi breakingNews = true; service ghi log ngoai le ro rang. Ap dung ca
 *  cho tai khoan toan quyen. */
export function checkSeparationOfDuties(previousActorId: string | null, actorId: string | null, breakingNews = false): SeparationCheck {
  if (!previousActorId || !actorId || previousActorId !== actorId) return { allowed: true, isException: false };
  if (breakingNews) return { allowed: true, isException: true };
  return { allowed: false, isException: false };
}
