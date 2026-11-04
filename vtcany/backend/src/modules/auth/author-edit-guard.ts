// Gioi han sua bai cua PV — ham thuan, test truc tiep bang node --test.
//
// Quy tac (duyet 2026-11-04, chi ap cho role PV — cac role khac giu
// hanh vi cu): PV chi duoc sua bai DO MINH TAO, khi bai o trang thai
// nhap. Bai bi tra ve cung ve nhap (returnTo=creator) nen cung thuoc
// dien sua duoc. Bai dang cho duyet / da duyet / da xuat ban: PV khong
// sua duoc (muon sua phai tra lai ve nhap truoc, hoac nho role khac).
// Full-admin khong bao gio co roleName 'PV' nen khong bi anh huong.

export interface EditableRow {
  createdBy?: string | null;
  status?: string | null;
}

export interface EditActor {
  id?: string | null;
  roleName?: string | null;
}

/** Tra ve null khi duoc sua, thong bao loi khi bi chan. */
export function pvEditCheck(row: EditableRow, actor: EditActor): string | null {
  if (!actor.roleName || actor.roleName.toLowerCase() !== 'pv') return null;
  if (!actor.id || row.createdBy !== actor.id) return 'chi duoc sua bai do minh tao';
  if (row.status !== 'draft') return 'chi sua duoc bai o trang thai nhap (bai dang cho duyet hoac da duyet phai tra lai ve nhap truoc)';
  return null;
}
