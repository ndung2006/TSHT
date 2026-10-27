// Quy trinh duyet bai viet tin tuc — logic thuan, khong phu thuoc DB,
// de test truc tiep bang node --test. Lam theo mau epaper-workflow.ts.
//
// Chuoi buoc lay theo khao sat CMS Dien Bien (Toa Soan Hoi Tu), nhom tin
// bai online: PV (tac gia) tao bai -> TP duyet -> PBDT duyet ->
// BBT duyet -> XB duyet cuoi (= xuat ban).
// Ten day du do user xac nhan 2026-10-27 (nhom online):
//   PV   = Phong vien (tac gia viet bai).
//   TP   = Truong phong (lanh dao phong chuyen mon).
//   PBDT = Pho Ban dien tu.
//   BBT  = Ban bien tap.
//   XB   = Xuat ban (cap cho phep xuat ban cong khai).
// CHU Y: `key`/`roleName` la khoa chan quyen duyet — ten Role trong CMS
// PHAI trung roleName (khong phan biet hoa/thuong). Chi doi `label`
// hien thi neu can; doi ten role se lam vo chan buoc.
//
// Y nghia workflowStep tren NewsArticle:
//   0 = khong nam trong quy trinh (nhap, da xuat ban hoac ha xuat ban)
//   k (1..N) = dang cho duyet o buoc k (STEPS[k-1]).
// Trang thai: draft | pending_review | published | unpublished.
//   - Nguoi co articles:update gui bai nhap -> cho duyet buoc 1.
//   - Nguoi co articles:publish duyet tung buoc; duyet buoc cuoi = xuat ban.
//   - Tra lai bat ky buoc nao -> ve nhap kem ly do (bat buoc).
//   - Xuat ban truc tiep tu nhap/ha xuat ban CHI danh cho tai khoan toan
//     quyen (map quyen '*': '*') — giu hanh vi v1 cho admin, tranh bat
//     admin duyet 4 buoc mot minh; tai khoan thuong phai di qua quy trinh.
//   - Tai khoan khong phai toan quyen chi duyet duoc buoc co roleName
//     trung ten Role cua minh. Role chua ton tai trong DB -> khong ai
//     (ngoai toan quyen) duyet duoc buoc do: fail-closed.

export interface WorkflowStep {
  key: string;
  label: string;
  /** Ten Role trong CMS phai trung de duoc duyet buoc nay. */
  roleName: string;
}

export const NEWS_WORKFLOW_STEPS: WorkflowStep[] = [
  { key: 'tp', label: 'TP — Trưởng phòng', roleName: 'TP' },
  { key: 'pbdt', label: 'PBĐT — Phó Ban điện tử', roleName: 'PBĐT' },
  { key: 'bbt', label: 'BBT — Ban biên tập', roleName: 'BBT' },
  { key: 'xb', label: 'XB — Xuất bản', roleName: 'XB' },
];

export const NEWS_WORKFLOW_AUTHOR_LABEL = 'PV';

export type NewsWorkflowStatus = 'draft' | 'pending_review' | 'published' | 'unpublished';

export interface WorkflowState {
  status: NewsWorkflowStatus;
  step: number;
}

export type WorkflowAction = 'submit' | 'approve' | 'return' | 'publish-direct' | 'unpublish';

export function stepLabel(step: number): string | null {
  if (step < 1 || step > NEWS_WORKFLOW_STEPS.length) return null;
  return NEWS_WORKFLOW_STEPS[step - 1].label;
}

/** Buoc tiep theo sau khi duyet (null = duyet xong -> xuat ban). */
export function nextStepAfterApprove(step: number): number | null {
  if (step < 1 || step > NEWS_WORKFLOW_STEPS.length) return null;
  return step === NEWS_WORKFLOW_STEPS.length ? null : step + 1;
}

/** Chuyen trang thai thuan; sai trang thai -> throw Error (service doi thanh 409). */
export function transition(state: WorkflowState, action: WorkflowAction): WorkflowState {
  const { status, step } = state;
  switch (action) {
    case 'submit':
      if (status !== 'draft' || step !== 0) throw new Error('chi bai nhap moi gui duyet duoc');
      return { status: 'pending_review', step: 1 };
    case 'approve': {
      if (status !== 'pending_review') throw new Error('chi bai dang cho duyet moi duyet duoc');
      if (step < 1 || step > NEWS_WORKFLOW_STEPS.length) throw new Error('buoc duyet khong hop le');
      const next = nextStepAfterApprove(step);
      if (next === null) return { status: 'published', step: 0 };
      return { status: 'pending_review', step: next };
    }
    case 'return':
      if (status !== 'pending_review') throw new Error('chi bai dang cho duyet moi tra lai duoc');
      return { status: 'draft', step: 0 };
    case 'publish-direct':
      if ((status !== 'draft' && status !== 'unpublished') || step !== 0) throw new Error('chi bai nhap hoac da ha xuat ban moi xuat ban truc tiep duoc');
      return { status: 'published', step: 0 };
    case 'unpublish':
      if (status !== 'published') throw new Error('chi bai da xuat ban moi go xuong duoc');
      return { status: 'unpublished', step: 0 };
    default:
      throw new Error('hanh dong quy trinh khong hop le');
  }
}

/** Actor co duoc duyet buoc hien tai khong (toan quyen luon duoc). */
export function canApproveStep(actorRoleName: string | null, isFullAdmin: boolean, step: number): boolean {
  if (isFullAdmin) return true;
  if (step < 1 || step > NEWS_WORKFLOW_STEPS.length) return false;
  if (!actorRoleName) return false;
  return actorRoleName.toLowerCase() === NEWS_WORKFLOW_STEPS[step - 1].roleName.toLowerCase();
}

/** Nhan hanh dong duyet de hien thi trong lich su (tieng Viet khong dau, theo quy uoc API). */
export const WORKFLOW_ACTION_LABELS: Record<string, string> = {
  submit: 'gui duyet',
  approve: 'duyet',
  return: 'tra lai',
  publish: 'xuat ban',
  unpublish: 'go xuong',
};
