// Cong tac tach nhiem vu + luat 11.2 (muc 2 tai lieu duyet dashboard) —
// ham thuan, khong phu thuoc Nest/DB, test truc tiep bang node --test.
//
// CONG TAC: ENFORCE_SEPARATION_OF_DUTIES
// - false (mac dinh, ban demo): khong ap cong SoD khi duyet — chi con
//   cong Role (duyet dung buoc cua role minh; full-admin duyet moi
//   buoc). A1 cua full-admin hien moi muc cho duyet.
// - true (trien khai that): ap luat 11.2 duoi day cho moi lan duyet.
//   Tieu chi nghiem thu "tach nhiem vu" CHI kiem khi cong tac BAT.
//
// LUAT 11.2 (khi BAT) — xet tren TAT CA approval truoc do cua cung mot
// muc (khong chi buoc lien truoc), dua tren actorRole ghi trong lich su:
// - CHAN neu nguoi duyet la tac gia (createdBy), ke ca khi role cua ho
//   trung role buoc hien tai (tac gia tu duyet).
// - CHAN neu nguoi duyet da xu ly bat ky buoc truoc nao co role KHAC
//   role buoc hien tai (vd da duyet buoc T.PP roi duyet buoc P.TBT).
// - CHO neu moi buoc truoc nguoi do da xu ly deu CUNG role voi buoc
//   hien tai (vong lap cung role: T.PP lan 1 -> lan 2, P.TBT lan 1 ->
//   lan 2; buoc cuoi nhieu Role: role cu nam trong roleNames hien tai
//   la cung role). actorRole null/rong tinh la khac (fail-closed).
// - Ngoai le tin nong (breakingNews) van mo cong nhu cu, ghi log
//   isException ro rang; service tu chiu trach nhiem ghi log.
//
// LUU Y: cong Role (engineCanApprove) chay TRUOC cong SoD: nguoi khong
// thuoc role buoc hien tai da bi chan tu cong Role, cong SoD chi them
// lop chan tac gia + khac role truoc do (chu yeu anh huong full-admin
// va cac buoc lap role).

export const ENFORCE_SEPARATION_OF_DUTIES = false;

export interface SodPriorApproval {
  actorId?: string | null;
  actorRole?: string | null;
  /** 'submit' = gui bai (tac gia); cac action khac = da xu ly buoc. */
  action: string;
}

export interface SodDecision {
  allowed: boolean;
  /** true khi cho qua nho ngoai le tin nong (service ghi log ngoai le). */
  isException: boolean;
  reason?: string;
}

function sameRole(a: string | null | undefined, roles: string[]): boolean {
  if (!a) return false;
  const wanted = a.toLowerCase();
  return roles.some((r) => String(r).toLowerCase() === wanted);
}

export function evaluateSoD(input: {
  creatorId?: string | null;
  actorId?: string | null;
  prior: SodPriorApproval[];
  /** Cac Role duoc duyet buoc hien tai (roleNames cua buoc). */
  currentRoleNames: string[];
  breakingNews?: boolean;
}): SodDecision {
  const { creatorId, actorId, prior, currentRoleNames, breakingNews } = input;
  if (!actorId) return { allowed: false, isException: false, reason: 'khong xac dinh duoc nguoi duyet' };
  if (creatorId && creatorId === actorId) {
    if (breakingNews) return { allowed: true, isException: true, reason: 'ngoai le tin nong (tac gia tu duyet)' };
    return { allowed: false, isException: false, reason: 'tac gia khong duoc tu duyet bai cua minh' };
  }
  for (const p of prior) {
    if (p.action === 'submit') continue; // gui bai da xet o luat tac gia
    if (!p.actorId || p.actorId !== actorId) continue;
    if (!sameRole(p.actorRole, currentRoleNames)) {
      if (breakingNews) return { allowed: true, isException: true, reason: 'ngoai le tin nong (da xu ly buoc khac role truoc do)' };
      return { allowed: false, isException: false, reason: 'da xu ly buoc truoc co role khac buoc hien tai' };
    }
  }
  return { allowed: true, isException: false };
}
