// Sap xep chuyen muc dung chung cho MOI o chon / bo loc chuyen muc trong
// CMS (quyet dinh 2026-11-05): chuyen muc cha len truoc thanh mot khoi o
// dau danh sach, sau do moi den cac chuyen muc con dang "Cha / Con", gom
// theo cha va theo dung thu tu cua khoi cha o tren. Trong moi khoi: theo
// sortOrder da dat trong trang Danh muc; chua dat (0 / thieu) thi theo
// bang chu cai tieng Viet (locale vi — "D" dung sau "D", dau dung dung cho).
//
// Quy tac ap dung cho ca danh sach goc lan ket qua tim kiem: loc xong van
// giu nguyen thu tu nay (cha khop len truoc, roi cac "Cha / Con" khop).
// Chuyen muc dang an (isVisible === false) KHONG don xuong cuoi — nam dung
// vi tri theo quy tac, nhan "An" do ham buildCategoryOptions gan them.
//
// Ghi chu: parentId o API co the la id hoac publicId (tuy endpoint), nen
// tra cha theo ca hai khoa. Con mo coi (cha khong co trong danh sach) hoac
// con cua con duoc gom ve cha goc; neu khong tim duoc cha goc thi xep cuoi
// cung, sap theo sortOrder roi ten.
export interface CategoryLike {
  id: string;
  publicId?: string | null;
  name: string;
  slug?: string;
  parentId?: string | null;
  parentName?: string | null;
  sortOrder?: number | null;
  isVisible?: boolean;
}

export interface CategoryOption {
  label: string;
  value: string;
  hidden: boolean;
  isParent: boolean;
}

const viCollator = new Intl.Collator('vi');

export function compareCategories(a: CategoryLike, b: CategoryLike): number {
  const d = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  if (d !== 0) return d;
  return viCollator.compare(a.name || '', b.name || '');
}

function categoryByKey<T extends CategoryLike>(cats: T[]): Map<string, T> {
  const byKey = new Map<string, T>();
  for (const c of cats) {
    byKey.set(c.id, c);
    if (c.publicId) byKey.set(c.publicId, c);
  }
  return byKey;
}

export function categoryParentOf<T extends CategoryLike>(cats: T[], c: T): T | null {
  if (!c.parentId) return null;
  return categoryByKey(cats).get(c.parentId) || null;
}

function rootParentOf<T extends CategoryLike>(byKey: Map<string, T>, c: T): T | null {
  let cur: T | null = c;
  const seen = new Set<string>();
  while (cur?.parentId) {
    if (seen.has(cur.id)) return null;
    seen.add(cur.id);
    const p = byKey.get(cur.parentId);
    if (!p) return null;
    cur = p;
  }
  return cur;
}

/** Sap xep: khoi cha truoc (sortOrder roi ten vi), roi cac con gom theo cha
 *  theo dung thu tu khoi cha; con trong moi cha cung sortOrder roi ten vi. */
export function sortCategories<T extends CategoryLike>(cats: T[]): T[] {
  const byKey = categoryByKey(cats);
  const parents = cats.filter((c) => !c.parentId).sort(compareCategories);
  const kids = new Map<string, T[]>();
  const orphans: T[] = [];
  for (const c of cats) {
    if (!c.parentId) continue;
    const root = rootParentOf(byKey, c);
    if (root && root !== c) {
      const list = kids.get(root.id) || [];
      list.push(c);
      kids.set(root.id, list);
    } else {
      orphans.push(c);
    }
  }
  const out: T[] = [...parents];
  for (const p of parents) out.push(...(kids.get(p.id) || []).sort(compareCategories));
  out.push(...orphans.sort(compareCategories));
  return out;
}

/** Nhan hien thi "Cha / Con" (cha thi chi ten), kem " (An)" khi dang an. */
export function categoryLabel<T extends CategoryLike>(cats: T[], c: T): string {
  const parent = categoryParentOf(cats, c);
  const base = parent ? `${parent.name} / ${c.name}` : c.name;
  return c.isVisible === false ? `${base} (Ẩn)` : base;
}

/** Options cho PrimeVue Dropdown (value mac dinh = publicId, roi id). */
export function buildCategoryOptions<T extends CategoryLike>(
  cats: T[],
  valueOf: (c: T) => string = (c) => c.publicId || c.id,
): CategoryOption[] {
  const sorted = sortCategories(cats);
  return sorted.map((c) => ({
    label: categoryLabel(cats, c),
    value: valueOf(c),
    hidden: c.isVisible === false,
    isParent: !c.parentId,
  }));
}

/** Options chi gom cac muc cha (dung cho o chon "Chuyen muc cha"). */
export function buildParentCategoryOptions<T extends CategoryLike>(
  cats: T[],
  valueOf: (c: T) => string = (c) => c.publicId || c.id,
): CategoryOption[] {
  return buildCategoryOptions(cats, valueOf).filter((o) => o.isParent);
}

/** Loc theo tu khoa tren danh sach DA sap xep: khop ten muc hoac ten cha
 *  (khong dau hoa/thuong); giu nguyen thu tu cha-truoc-con-sau. */
export function filterCategories<T extends CategoryLike>(cats: T[], keyword: string): T[] {
  const kw = (keyword || '').trim().toLowerCase();
  const sorted = sortCategories(cats);
  if (!kw) return sorted;
  const byKey = categoryByKey(cats);
  return sorted.filter((c) => {
    if ((c.name || '').toLowerCase().includes(kw)) return true;
    const parentName = c.parentName || (c.parentId ? byKey.get(c.parentId)?.name : null);
    return !!parentName && parentName.toLowerCase().includes(kw);
  });
}
