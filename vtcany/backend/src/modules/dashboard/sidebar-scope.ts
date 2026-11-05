// Pham vi xem danh sach cho sidebar dot 2 — file thuan, KHONG import
// Nest/Prisma (khuon dashboard-queries.ts) de test truc tiep bang
// node --test.
//
// Quy tac (user chot 2026-11-05, tu phat hien lo nhap PV: test-pv thay 9
// nhap bai bao in trong khi cua minh chi 6, tin bai 3 vs 1):
// - Role HEP = khong toan quyen ('*') va khong thuoc NEWSROOM_WIDE_ROLES
//   (Super Admin, TBT, P.TBT, BBT, T.PP).
// - Role hep mo danh sach loc theo trang thai:
//   + status=draft -> chi muc do chinh minh tao (createdBy = actorId).
//   + status=pending_review -> muc do minh tao HOAC dang o buoc minh
//     duoc duyet (workflowStep thuoc cac buoc co roleName cua minh).
//   + cac trang thai khac (published/approved/...) -> khong gioi han
//     (danh sach cong khai trong toa soan, so dem toan cuc khop nhau).
// - Khong ap khi request da co dinh nghia pham vi rieng: myQueue (hang
//   cho cua toi, dinh nghia A1), workflowStep (drill theo buoc),
//   mine (da la cua toi), scope (loc scope tuong minh cua tin bai).
//   returned / neverSubmitted KHONG chan: chung giao voi dieu kien draft
//   thanh nhap bi tra / chua gui CUA MINH (role hep) — dung dinh nghia
//   "Bi tra ve" cua dot 2 (role hep = mine + returned).
// - So dem sidebar-counts dung chung quy tac nay nen so tren menu luon
//   bang so dong danh sach khi bam (nguyen tac dot 2).
// - NGOAI LE DA BIET (ghi ro, khong sua o dot 2): drill "Bi tra ve" cua
//   widget B1 dung query {status: 'draft', returned: 1} giong het muc con
//   sidebar, trong khi so B1 la toan cuc. Role hep duy nhat co B1 trong
//   layout la TP se thay drill B1 chi liet ke nhap bi tra CUA MINH (tap
//   con cua so B1), khong phai toan cuc. Cac drill khac khong anh
//   huong: A1/myQueue va drill theo buoc duoc loai tru o tren; drill
//   A2/A3 chi liet ke muc cua chinh user; drill published/unpublished
//   khong nam trong 2 trang thai bi gioi han.

import { isNewsroomWide } from './dashboard-layout.config';

export interface NarrowScopeActor {
  id: string | null;
  roleName: string | null;
  isFullAdmin: boolean;
}

/** true neu actor thuoc dien gioi han pham vi (role hep, co dinh danh). */
export function isNarrowScopeActor(actor: NarrowScopeActor | null | undefined): boolean {
  if (!actor || !actor.id) return false;
  return !isNewsroomWide(actor.roleName, actor.isFullAdmin);
}

/**
 * So thu tu buoc (1-based) ma role duoc duyet, tu danh sach buoc cua
 * workflow-config (moi buoc: roleName don hoac roleNames[]). Khong co
 * role -> [] (chi con dieu kien "cua minh" o fragment pending).
 */
export function myStepNumbers(
  steps: Array<{ roleName: string; roleNames?: string[] | null }>,
  roleName: string | null | undefined,
): number[] {
  if (!roleName) return [];
  const want = String(roleName).toLowerCase();
  const out: number[] = [];
  (steps || []).forEach((s, i) => {
    const names = s.roleNames?.length ? s.roleNames : [s.roleName];
    if (names.some((r) => String(r).toLowerCase() === want)) out.push(i + 1);
  });
  return out;
}

export interface NarrowScopeInput {
  status?: string | null;
  myQueue?: string | null;
  workflowStep?: string | null;
  mine?: string | null;
  /** Loc scope tuong minh cua tin bai ('mine'/'approved'/'published'). */
  scopeParam?: string | null;
  returned?: string | null;
  neverSubmitted?: string | null;
  actor: NarrowScopeActor | null | undefined;
  /** Cac buoc actor duoc duyet (tu myStepNumbers). */
  mySteps: number[];
}

/**
 * Fragment where Prisma de AND voi where danh sach; null = khong gioi
 * han. Trang thai hieu dung sau drill: returned/neverSubmitted ep ve
 * draft (giong applyDrillWhere).
 */
export function narrowScopeFragment(input: NarrowScopeInput): Record<string, any> | null {
  const { actor } = input;
  if (!isNarrowScopeActor(actor) || !actor!.id) return null;
  if (input.myQueue || input.workflowStep || input.mine || input.scopeParam) return null;
  const effectiveStatus = (input.returned || input.neverSubmitted) ? 'draft' : (input.status || null);
  if (effectiveStatus === 'draft') return { createdBy: actor!.id };
  if (effectiveStatus === 'pending_review') {
    const or: Array<Record<string, any>> = [{ createdBy: actor!.id }];
    if (input.mySteps.length) or.push({ workflowStep: { in: input.mySteps } });
    return { OR: or };
  }
  return null;
}

/** Gop fragment vao where: { AND: [where, fragment] } hoac giu nguyen. */
export function applyNarrowScope(
  where: Record<string, any>,
  input: NarrowScopeInput,
): Record<string, any> {
  const frag = narrowScopeFragment(input);
  if (!frag) return where;
  return { AND: [where, frag] };
}
