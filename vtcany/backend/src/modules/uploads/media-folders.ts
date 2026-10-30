// Logic thuan cho thu muc Thu vien media (Goi 2D-1) — khong import
// Nest/Prisma, test truc tiep bang node --test. Thu muc la LOGIC (phan
// loai trong DB), khong bao gio di chuyen file vat ly.

export interface FolderRow {
  id: string;
  name: string;
  parentId: string | null;
}

/** Ten thu muc: trim + gom khoang trang, 1..120 ky tu. Sai -> null. */
export function cleanFolderName(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const name = input.trim().replace(/\s+/g, ' ');
  if (!name || name.length > 120) return null;
  return name;
}

/**
 * Chuan hoa tham so folderId cua GET /admin/media:
 * - khong truyen (undefined/'') -> undefined (khong loc, nhu cu)
 * - 'root' -> null (chi file chua phan loai)
 * - chuoi khac -> chinh no (id thu muc)
 */
export function parseFolderFilter(raw: unknown): string | null | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const v = String(raw);
  if (v === 'root') return null;
  return v;
}

/**
 * Dat folder `id` vao duoi `newParentId` co tao vong lap khong?
 * Vong lap khi newParentId la chinh id hoac la hau due cua id.
 * parentId khong ton tai trong danh sach -> coi nhu khong vong (service
 * se chan rieng bang kiem tra ton tai).
 */
export function wouldCreateCycle(folders: FolderRow[], id: string, newParentId: string | null): boolean {
  if (!newParentId) return false;
  if (newParentId === id) return true;
  const parentOf = new Map(folders.map((f) => [f.id, f.parentId]));
  const seen = new Set<string>();
  let cur: string | null = newParentId;
  while (cur) {
    if (cur === id) return true;
    if (seen.has(cur)) return true; // du lieu san co vong: dung som
    seen.add(cur);
    cur = parentOf.get(cur) ?? null;
  }
  return false;
}

export interface FolderWithCounts extends FolderRow {
  fileCount: number; // file nam truc tiep trong thu muc
  totalCount: number; // fileCount + moi thu muc con chau
  depth: number;
}

/**
 * Gan so file + do sau cho danh sach thu muc phang, tra ve danh sach da
 * sap xep dang cay (cha truoc con, cung cap xep theo ten) de CMS render
 * thang. Thu muc "mo coi" (parentId tro toi id khong ton tai) coi nhu
 * thu muc goc.
 */
export function foldersWithCounts(
  folders: FolderRow[],
  countsByFolder: Map<string, number>,
): FolderWithCounts[] {
  const ids = new Set(folders.map((f) => f.id));
  const rows: FolderWithCounts[] = folders.map((f) => ({
    ...f,
    parentId: f.parentId && ids.has(f.parentId) ? f.parentId : null,
    fileCount: countsByFolder.get(f.id) || 0,
    totalCount: 0,
    depth: 0,
  }));
  const byId = new Map(rows.map((r) => [r.id, r]));
  // totalCount cua moi thu muc = fileCount cua no + cua moi hau due:
  // voi tung thu muc r, cong fileCount cua r vao r va moi to tien cua r.
  for (const r of rows) {
    const seen = new Set<string>();
    let cur: FolderWithCounts | undefined = r;
    while (cur) {
      if (seen.has(cur.id)) break;
      seen.add(cur.id);
      cur.totalCount += r.fileCount;
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
  }
  const childrenOf = new Map<string | null, FolderWithCounts[]>();
  for (const r of rows) {
    const key = r.parentId;
    if (!childrenOf.has(key)) childrenOf.set(key, []);
    childrenOf.get(key)!.push(r);
  }
  for (const list of childrenOf.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  }
  const out: FolderWithCounts[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const r of childrenOf.get(parent) || []) {
      r.depth = depth;
      out.push(r);
      walk(r.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}
