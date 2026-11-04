// Quy trinh duyet BAI BAO IN (chuyen tu bai bao dien tu sang) — logic
// thuan, khong phu thuoc DB, de test truc tiep bang node --test.
//
// Chuoi buoc THEO MAU BAO DIEN BIEN PHU (duyet 2026-11-04): PV viet bai
// -> TP.PV -> BBT.TKTS -> TPP.TKTS (lan 1) -> P.TBT (lan 1) -> TPP.TKTS
// (lan 2) -> P.TBT (lan 2) -> T.BT-PT.BT chot cuoi. ANH XA Role TSHT
// (khong tao Role moi): TP.PV -> TP; BBT.TKTS -> T.PP (theo dieu chinh
// cua user: khong phai BBT); TPP.TKTS -> T.PP; P.TBT -> P.TBT;
// T.BT-PT.BT -> buoc nhieu Role {TBT, P.TBT}. Moi buoc giu key va nhan
// rieng nhu mau; cac buoc lap role (T.PP x3, P.TBT x2) la buoc rieng
// biet, khong gop.
//
// KHAC voi so bao in o trang thai cuoi: bai bao in khong xuat ban cong
// khai len web (bao in xuat ban o cap so PDF). Buoc cuoi duyet xong ->
// trang thai `approved` = "Da duyet, cho dan trang", la nguyen lieu cho
// to dan trang ghep vao so. Vi vay khong co hanh dong publish-direct /
// unpublish: bai dang cho duyet khong xoa duoc, bai da duyet cung khong
// xoa duoc, chi bai nhap moi xoa duoc (xem service).
//
// Chuoi maket KTV -> MD -> T.PP -> P.TBT -> TBT CHI dung cho EpaperIssue
// (ca so bao, xem epaper-workflow.ts), KHONG dung cho bai bao in nua.
//
// Y nghia workflowStep tren PrintArticle:
//   0 = khong nam trong quy trinh (nhap hoac da duyet)
//   k (1..7) = dang cho duyet o buoc k (STEPS[k-1]).
// Trang thai: draft | pending_review | approved.
//   - Nguoi co print_articles:update gui bai nhap -> cho duyet buoc 1.
//   - Nguoi co print_articles:publish duyet tung buoc; duyet buoc cuoi
//     (TBT hoac P.TBT) = da duyet, cho dan trang.
//   - Tra lai bat ky buoc nao -> ve nhap kem ly do (bat buoc).
//   - Tai khoan khong phai toan quyen chi duyet duoc buoc co Role cua
//     minh nam trong roleNames cua buoc. Role chua ton tai trong DB ->
//     khong ai (ngoai toan quyen) duyet duoc buoc do: fail-closed.

export interface WorkflowStep {
  key: string;
  label: string;
  /** Ten Role chinh trong CMS (hien thi + tuong thich nguoc). */
  roleName: string;
  /** Cac Role duoc duyet buoc nay; thieu = [roleName]. */
  roleNames?: string[];
}

/** 7 buoc duyet cua quy trinh bai bao in (PV la tac gia, khong phai buoc duyet). */
export const PRINT_ARTICLE_WORKFLOW_STEPS: WorkflowStep[] = [
  { key: 'tp_pv', label: 'TP.PV — Trưởng phòng phóng viên', roleName: 'TP', roleNames: ['TP'] },
  { key: 'bbt_tkts', label: 'BBT.TKTS — Ban biên tập thư ký tòa soạn', roleName: 'T.PP', roleNames: ['T.PP'] },
  { key: 'tpp_tkts1', label: 'TPP.TKTS1 — Trưởng, phó phòng thư ký tòa soạn (lần 1)', roleName: 'T.PP', roleNames: ['T.PP'] },
  { key: 'p_tbt1', label: 'P.TBT1 — Phó tổng biên tập (lần 1)', roleName: 'P.TBT', roleNames: ['P.TBT'] },
  { key: 'tpp_tkts2', label: 'TPP.TKTS2 — Trưởng, phó phòng thư ký tòa soạn (lần 2)', roleName: 'T.PP', roleNames: ['T.PP'] },
  { key: 'p_tbt2', label: 'P.TBT2 — Phó tổng biên tập (lần 2)', roleName: 'P.TBT', roleNames: ['P.TBT'] },
  { key: 't_bt_pt_bt', label: 'T.BT-PT.BT — Tổng biên tập hoặc Phó tổng biên tập, chốt cuối', roleName: 'TBT', roleNames: ['TBT', 'P.TBT'] },
];

export const PRINT_ARTICLE_WORKFLOW_AUTHOR_LABEL = 'PV';

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

/** Actor co duoc duyet buoc hien tai khong (toan quyen luon duoc).
 *  Buoc nhieu Role: actor thuoc bat ky Role nao trong roleNames la duoc. */
export function canApproveStep(actorRoleName: string | null, isFullAdmin: boolean, step: number): boolean {
  if (isFullAdmin) return true;
  if (step < 1 || step > PRINT_ARTICLE_WORKFLOW_STEPS.length) return false;
  if (!actorRoleName) return false;
  const s = PRINT_ARTICLE_WORKFLOW_STEPS[step - 1];
  const roles = (s.roleNames?.length ? s.roleNames : [s.roleName]).map((r) => r.toLowerCase());
  return roles.includes(actorRoleName.toLowerCase());
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
