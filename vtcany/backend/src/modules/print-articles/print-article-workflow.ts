// Quy trinh duyet BAI BAO IN (chuyen tu bai bao dien tu sang) — logic
// thuan, khong phu thuoc DB, de test truc tiep bang node --test.
//
// Chuoi buoc SAO KHUON dinh nghia cua quy trinh so bao in
// (epaper-workflow.ts) — file nay tu chua (khong import file epaper) de
// node --test chay truc tiep duoc va tsc (commonjs) khong vuong import
// duoi .ts: KTV tao bai -> MD duyet -> T.PP duyet -> P.TBT duyet ->
// TBT duyet cuoi. Ten Role (roleName) la khoa chan buoc, khong phan
// biet hoa/thuong; chi doi `label` hien thi neu can. NEU doi ten buoc o
// day thi phai doi dong bo epaper-workflow.ts (va nguoc lai).
//
// KHAC voi so bao in o trang thai cuoi: bai bao in khong xuat ban cong
// khai len web (bao in xuat ban o cap so PDF). TBT duyet xong -> trang
// thai `approved` = "Da duyet, cho dan trang", la nguyen lieu cho to dan
// trang ghep vao so. Vi vay khong co hanh dong publish-direct /
// unpublish: bai dang cho duyet khong xoa duoc, bai da duyet cung khong
// xoa duoc, chi bai nhap moi xoa duoc (xem service).
//
// Y nghia workflowStep tren PrintArticle:
//   0 = khong nam trong quy trinh (nhap hoac da duyet)
//   k (1..4) = dang cho duyet o buoc k (STEPS[k-1]).
// Trang thai: draft | pending_review | approved.
//   - Nguoi co print_articles:update gui bai nhap -> cho duyet buoc 1.
//   - Nguoi co print_articles:publish duyet tung buoc; duyet buoc cuoi
//     (TBT) = da duyet, cho dan trang.
//   - Tra lai bat ky buoc nao -> ve nhap kem ly do (bat buoc).
//   - Tai khoan khong phai toan quyen chi duyet duoc buoc co roleName
//     trung ten Role cua minh. Role chua ton tai trong DB -> khong ai
//     (ngoai toan quyen) duyet duoc buoc do: fail-closed.

export interface WorkflowStep {
  key: string;
  label: string;
  /** Ten Role trong CMS phai trung de duoc duyet buoc nay. */
  roleName: string;
}

/** 4 buoc duyet cua quy trinh bao in (KTV la tac gia, khong phai buoc duyet). */
export const PRINT_ARTICLE_WORKFLOW_STEPS: WorkflowStep[] = [
  { key: 'md', label: 'MD — Duyệt Mo-rát', roleName: 'MD' },
  { key: 'tpp', label: 'T.PP — Trưởng/Phó phòng (Thư ký tòa soạn)', roleName: 'T.PP' },
  { key: 'ptbt', label: 'P.TBT — Phó Tổng Biên tập', roleName: 'P.TBT' },
  { key: 'tbt', label: 'TBT — Tổng Biên tập', roleName: 'TBT' },
];

export const PRINT_ARTICLE_WORKFLOW_AUTHOR_LABEL = 'KTV';

export type PrintArticleWorkflowStatus = 'draft' | 'pending_review' | 'approved';

export interface WorkflowState {
  status: PrintArticleWorkflowStatus;
  step: number;
}

export type WorkflowAction = 'submit' | 'approve' | 'return';

export function stepLabel(step: number): string | null {
  if (step < 1 || step > PRINT_ARTICLE_WORKFLOW_STEPS.length) return null;
  return PRINT_ARTICLE_WORKFLOW_STEPS[step - 1].label;
}

/** Buoc tiep theo sau khi duyet (null = duyet xong -> da duyet). */
export function nextStepAfterApprove(step: number): number | null {
  if (step < 1 || step > PRINT_ARTICLE_WORKFLOW_STEPS.length) return null;
  return step === PRINT_ARTICLE_WORKFLOW_STEPS.length ? null : step + 1;
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
      if (step < 1 || step > PRINT_ARTICLE_WORKFLOW_STEPS.length) throw new Error('buoc duyet khong hop le');
      const next = nextStepAfterApprove(step);
      if (next === null) return { status: 'approved', step: 0 };
      return { status: 'pending_review', step: next };
    }
    case 'return':
      if (status !== 'pending_review') throw new Error('chi bai dang cho duyet moi tra lai duoc');
      return { status: 'draft', step: 0 };
    default:
      throw new Error('hanh dong quy trinh khong hop le');
  }
}

/** Actor co duoc duyet buoc hien tai khong (toan quyen luon duoc). */
export function canApproveStep(actorRoleName: string | null, isFullAdmin: boolean, step: number): boolean {
  if (isFullAdmin) return true;
  if (step < 1 || step > PRINT_ARTICLE_WORKFLOW_STEPS.length) return false;
  if (!actorRoleName) return false;
  return actorRoleName.toLowerCase() === PRINT_ARTICLE_WORKFLOW_STEPS[step - 1].roleName.toLowerCase();
}

/** Nhan hanh dong duyet de hien thi trong lich su (tieng Viet khong dau, theo quy uoc API). */
export const WORKFLOW_ACTION_LABELS: Record<string, string> = {
  submit: 'gui duyet',
  approve: 'duyet',
  return: 'tra lai',
};

export interface SeparationCheck {
  allowed: boolean;
  /** true khi cho qua nho ngoai le tin nong (service phai ghi log ngoai le). */
  isException: boolean;
}

/** Tach nhiem vu: nguoi xu ly buoc truoc khong duoc duyet buoc sau cua
 *  cung mot bai. Ap dung cho ca toan quyen. Ngoai le tin nong chi duoc
 *  chap nhan khi breakingNews = true; service ghi log ngoai le ro rang. */
export function checkSeparationOfDuties(previousActorId: string | null, actorId: string | null, breakingNews = false): SeparationCheck {
  if (!previousActorId || !actorId || previousActorId !== actorId) return { allowed: true, isException: false };
  if (breakingNews) return { allowed: true, isException: true };
  return { allowed: false, isException: false };
}
