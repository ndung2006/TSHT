// Quy trinh duyet so bao in (E-paper) — logic thuan, khong phu thuoc DB,
// de test truc tiep bang node --test.
//
// Chuoi buoc lay theo khao sat CMS Dien Bien (Toa Soan Hoi Tu), nhom maket
// bao in: KTV tao so -> MD duyet -> T.PP duyet -> P.TBT duyet ->
// TBT duyet cuoi (= xuat ban).
// Ten day du do user xac nhan 2026-10-27 (chi doi `label` hien thi o
// day; `key`, `roleName` va thu tu buoc KHONG doi nen quyen duyet theo
// ten Role + du lieu duyet cu van doc duoc, lich su cu giu nhan viet tat):
//   KTV  = Ky thuat vien (Che ban / Dan trang): nhan bai, dan trang
//          tren InDesign, xuat PDF bao in va tai len CMS.
//   MD   = Duyet Mo-rat (Duyet Ma-ket): doc bong, ra soat loi chinh ta,
//          cau chu va bo cuc trang bao ngay sau khi KTV dan trang xong.
//   T.PP = Truong / Pho phong (Thu ky toa soan): kiem tra tong the
//          noi dung, tit bai, vi tri tin bai truoc khi trinh Ban Bien tap.
//   P.TBT = Pho Tong Bien tap: lanh dao Ban Bien tap phu trach truc
//          tiep so bao.
//   TBT  = Tong Bien tap: phe duyet cuoi cung (ky duyet in / cho phep
//          xuat ban cong khai len trang doc dien tu).
//
// Y nghia workflowStep tren EpaperIssue:
//   0 = khong nam trong quy trinh (nhap hoac da xuat ban)
//   k (1..N) = dang cho duyet o buoc k (STEPS[k-1]).
// Trang thai: draft | pending_review | published.
//   - Nguoi co epaper:update gui nhap -> cho duyet buoc 1.
//   - Nguoi co epaper:publish duyet tung buoc; duyet buoc cuoi = xuat ban.
//   - Tra lai bat ky buoc nao -> ve nhap kem ly do.
//   - Xuat ban truc tiep tu nhap CHI danh cho tai khoan toan quyen
//     (map quyen '*': '*', tuong duong Super Admin/Admin) — giu nguyen
//     hanh vi hien tai cho admin, tranh bat admin duyet 4 buoc mot minh.
//   - Tai khoan khong phai toan quyen chi duyet duoc buoc co roleName
//     trung ten Role cua minh (khong phan biet hoa/thuong). Role chua
//     ton tai trong DB -> khong ai (ngoai toan quyen) duyet duoc buoc do:
//     fail-closed, admin phai tao Role dung ten truoc.

export interface WorkflowStep {
  key: string;
  label: string;
  /** Ten Role trong CMS phai trung de duoc duyet buoc nay. */
  roleName: string;
}

export const EPAPER_WORKFLOW_STEPS: WorkflowStep[] = [
  { key: 'md', label: 'MD — Duyệt Mo-rát', roleName: 'MD' },
  { key: 'tpp', label: 'T.PP — Trưởng/Phó phòng (Thư ký tòa soạn)', roleName: 'T.PP' },
  { key: 'ptbt', label: 'P.TBT — Phó Tổng Biên tập', roleName: 'P.TBT' },
  { key: 'tbt', label: 'TBT — Tổng Biên tập', roleName: 'TBT' },
];

export const EPAPER_WORKFLOW_AUTHOR_LABEL = 'KTV';

export type EpaperWorkflowStatus = 'draft' | 'pending_review' | 'published';

export interface WorkflowState {
  status: EpaperWorkflowStatus;
  step: number;
}

export type WorkflowAction = 'submit' | 'approve' | 'return' | 'publish-direct' | 'unpublish';

export function stepLabel(step: number): string | null {
  if (step < 1 || step > EPAPER_WORKFLOW_STEPS.length) return null;
  return EPAPER_WORKFLOW_STEPS[step - 1].label;
}

/** Buoc tiep theo sau khi duyet (null = duyet xong -> xuat ban). */
export function nextStepAfterApprove(step: number): number | null {
  if (step < 1 || step > EPAPER_WORKFLOW_STEPS.length) return null;
  return step === EPAPER_WORKFLOW_STEPS.length ? null : step + 1;
}

/** Chuyen trang thai thuan; sai trang thai -> throw Error (service doi thanh 409). */
export function transition(state: WorkflowState, action: WorkflowAction): WorkflowState {
  const { status, step } = state;
  switch (action) {
    case 'submit':
      if (status !== 'draft' || step !== 0) throw new Error('chi so nhap moi gui duyet duoc');
      return { status: 'pending_review', step: 1 };
    case 'approve': {
      if (status !== 'pending_review') throw new Error('chi so dang cho duyet moi duyet duoc');
      if (step < 1 || step > EPAPER_WORKFLOW_STEPS.length) throw new Error('buoc duyet khong hop le');
      const next = nextStepAfterApprove(step);
      if (next === null) return { status: 'published', step: 0 };
      return { status: 'pending_review', step: next };
    }
    case 'return':
      if (status !== 'pending_review') throw new Error('chi so dang cho duyet moi tra lai duoc');
      return { status: 'draft', step: 0 };
    case 'publish-direct':
      if (status !== 'draft' || step !== 0) throw new Error('chi so nhap moi xuat ban truc tiep duoc');
      return { status: 'published', step: 0 };
    case 'unpublish':
      if (status !== 'published') throw new Error('chi so da xuat ban moi go xuong duoc');
      return { status: 'draft', step: 0 };
    default:
      throw new Error('hanh dong quy trinh khong hop le');
  }
}

/** Actor co duoc duyet buoc hien tai khong (toan quyen luon duoc). */
export function canApproveStep(actorRoleName: string | null, isFullAdmin: boolean, step: number): boolean {
  if (isFullAdmin) return true;
  if (step < 1 || step > EPAPER_WORKFLOW_STEPS.length) return false;
  if (!actorRoleName) return false;
  return actorRoleName.toLowerCase() === EPAPER_WORKFLOW_STEPS[step - 1].roleName.toLowerCase();
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

/** Tach nhiem vu (Dot 1b): nguoi xu ly buoc truoc khong duoc duyet buoc sau
 *  cua cung mot so. previousActorId = actorId cua ban ghi approval gan
 *  nhat da dua so toi buoc hien tai (submit cho buoc 1, approve buoc k-1
 *  cho buoc k). Khong xac dinh duoc (ban ghi cu thieu actorId) thi cho qua
 *  vi khong the chung minh la cung nguoi. Ngoai le tin nong chi duoc chap
 *  nhan khi breakingNews = true; service ghi log ngoai le ro rang. */
export function checkSeparationOfDuties(previousActorId: string | null, actorId: string | null, breakingNews = false): SeparationCheck {
  if (!previousActorId || !actorId || previousActorId !== actorId) return { allowed: true, isException: false };
  if (breakingNews) return { allowed: true, isException: true };
  return { allowed: false, isException: false };
}
