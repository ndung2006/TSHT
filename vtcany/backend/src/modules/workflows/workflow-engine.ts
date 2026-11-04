// Engine quy trinh duyet DONG — logic thuan, khong phu thuoc DB, de test
// truc tiep bang node --test. Thay the cac ham rieng trong tung file
// *-workflow.ts (giu nguyen cac file do lam fallback + test cu).
//
// Khac biet so voi cac file cu:
// - Moi ham nhan them mang steps (lay tu DB, fallback ve mang cung) thay
//   vi doc hang so module-level.
// - 'return' ton trong returnTo cua tung buoc: 'creator' -> ve nhap
//   (hanh vi cu); 'previous' -> ve buoc lien truoc, tu buoc 1 thi ve nhap
//   (truoc buoc 1 la nguoi tao).
// - Them hanh dong 'emergency-approve': chi buoc co allowEmergency=true
//   moi duoc duyet khan; duyet khan ket thuc luong ngay (ve trang thai
//   cuoi cua phan he). Service ghi lich su isException=true + ly do khan.
// - Moi phan he co 1 profile: trang thai cuoi, publish-direct cho phep tu
//   trang thai nao, unpublish ve dau, co unlock khong. Profile phai khop
//   dung ham transition cu cua phan he do (xem workflow-fallback.ts).

export interface EngineStep {
  key: string;
  label: string;
  /** Role chinh (hien thi + tuong thich nguoc). */
  roleName: string;
  /** Cac Role duoc duyet buoc nay; rong/thieu = [roleName]. Buoc cuoi
   *  bai bao in (T.BT-PT.BT) co 2 Role: ['TBT', 'P.TBT']. */
  roleNames?: string[];
  /** 'creator': tra ve nhap | 'previous': tra ve buoc lien truoc. */
  returnTo: 'creator' | 'previous';
  /** Buoc nay co duoc duyet khan khong. */
  allowEmergency: boolean;
}

/** Cac Role duoc duyet mot buoc (chuan hoa: roleNames rong -> [roleName]). */
export function stepRoleNames(s: EngineStep): string[] {
  const names = (s.roleNames || []).map((r) => String(r).trim()).filter(Boolean);
  return names.length ? names : [s.roleName];
}

export interface ModuleProfile {
  /** Trang thai khi duyet xong buoc cuoi (published | approved). */
  finalStatus: string;
  /** Trang thai nao duoc xuat ban truc tiep (full-admin): [] = khong cho. */
  publishDirectFrom: string[];
  /** Unpublish ve trang thai nao; null = phan he khong co unpublish. */
  unpublishTo: string | null;
  /** Co hanh dong unlock khong (chi royalties: approved -> draft). */
  allowUnlock: boolean;
}

export interface WorkflowState {
  status: string;
  step: number;
}

export type EngineAction =
  | 'submit'
  | 'approve'
  | 'return'
  | 'emergency-approve'
  | 'publish-direct'
  | 'unpublish'
  | 'unlock';

/** Nhan buoc k (1-based) hoac null khi ngoai khoang. */
export function stepAt(steps: EngineStep[], step: number): EngineStep | null {
  if (step < 1 || step > steps.length) return null;
  return steps[step - 1];
}

export function engineStepLabel(steps: EngineStep[], step: number): string | null {
  return stepAt(steps, step)?.label ?? null;
}

/** Buoc tiep theo sau khi duyet (null = duyet xong -> trang thai cuoi). */
export function engineNextStep(steps: EngineStep[], step: number): number | null {
  if (step < 1 || step > steps.length) return null;
  return step === steps.length ? null : step + 1;
}

/** Actor co duoc duyet buoc hien tai khong (toan quyen luon duoc).
 *  Buoc nhieu Role: actor thuoc BAT KY Role nao trong roleNames la duoc
 *  (buoc cuoi bai bao in: TBT hoac P.TBT). So sanh khong phan biet
 *  hoa/thuong. */
export function engineCanApprove(
  steps: EngineStep[],
  actorRoleName: string | null,
  isFullAdmin: boolean,
  step: number,
): boolean {
  if (isFullAdmin) return true;
  const s = stepAt(steps, step);
  if (!s || !actorRoleName) return false;
  const wanted = actorRoleName.toLowerCase();
  return stepRoleNames(s).some((r) => r.toLowerCase() === wanted);
}

/** Chuyen trang thai thuan; sai trang thai -> throw Error (service doi thanh 409). */
export function engineTransition(
  profile: ModuleProfile,
  steps: EngineStep[],
  state: WorkflowState,
  action: EngineAction,
): WorkflowState {
  const { status, step } = state;
  switch (action) {
    case 'submit':
      if (status !== 'draft' || step !== 0) throw new Error('chi nhap moi gui duyet duoc');
      return { status: 'pending_review', step: 1 };
    case 'approve': {
      if (status !== 'pending_review') throw new Error('chi muc dang cho duyet moi duyet duoc');
      if (!stepAt(steps, step)) throw new Error('buoc duyet khong hop le');
      const next = engineNextStep(steps, step);
      if (next === null) return { status: profile.finalStatus, step: 0 };
      return { status: 'pending_review', step: next };
    }
    case 'return': {
      // Ham cu khong kiem tra khoang buoc (chi kiem tra status): step
      // ngoai khoang van ve nhap. Giu dung: chi ap dung 'previous' khi
      // buoc hien tai hop le, con lai ve nhap.
      if (status !== 'pending_review') throw new Error('chi muc dang cho duyet moi tra lai duoc');
      const cur = stepAt(steps, step);
      if (cur && cur.returnTo === 'previous' && step > 1) return { status: 'pending_review', step: step - 1 };
      return { status: 'draft', step: 0 };
    }
    case 'emergency-approve': {
      if (status !== 'pending_review') throw new Error('chi muc dang cho duyet moi duyet khan duoc');
      const cur = stepAt(steps, step);
      if (!cur) throw new Error('buoc duyet khong hop le');
      if (!cur.allowEmergency) throw new Error('buoc nay khong cho phep duyet khan');
      return { status: profile.finalStatus, step: 0 };
    }
    case 'publish-direct':
      if (!profile.publishDirectFrom.includes(status) || step !== 0) {
        throw new Error('chi nhap moi xuat ban truc tiep duoc');
      }
      return { status: 'published', step: 0 };
    case 'unpublish':
      if (status !== 'published' || profile.unpublishTo === null) {
        throw new Error('chi muc da xuat ban moi go xuong duoc');
      }
      return { status: profile.unpublishTo, step: 0 };
    case 'unlock':
      if (!profile.allowUnlock || status !== 'approved' || step !== 0) {
        throw new Error('chi muc da khoa moi mo khoa duoc');
      }
      return { status: 'draft', step: 0 };
    default:
      throw new Error('hanh dong quy trinh khong hop le');
  }
}

export interface RemapResult {
  /** So buoc moi (0 = ve nhap). */
  step: number;
  /** true khi buoc cu bi xoa nen ho so phai ve nhap. */
  resetToDraft: boolean;
}

/**
 * Remap so buoc cua ho so dang chay khi cau truc buoc thay doi.
 * Giu theo KEY (khong theo so): buoc giu nguyen key thi nhan vi tri moi
 * cua key do; buoc bi xoa ma ho so dang dung o do thi ve nhap.
 */
export function remapStep(
  oldSteps: EngineStep[],
  newSteps: EngineStep[],
  currentStep: number,
): RemapResult {
  if (currentStep < 1) return { step: 0, resetToDraft: false };
  const key = oldSteps[currentStep - 1]?.key;
  if (!key) return { step: 0, resetToDraft: true };
  const idx = newSteps.findIndex((s) => s.key === key);
  if (idx < 0) return { step: 0, resetToDraft: true };
  return { step: idx + 1, resetToDraft: false };
}
