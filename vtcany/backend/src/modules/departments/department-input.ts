// Validate/normalize + slug cho Phong ban (Dot 1a).
// File thuan, khong import Nest/Prisma — test truc tiep bang node --test.
// Slug dung cung thuat toan voi news.service.slugify (bo dau tieng Viet,
// 'd' -> 'd', ky tu la -> '-') nhung viet rieng de khong phu thuoc
// runtime vao module news.

export function slugifyDepartment(input: string): string {
  return (input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180);
}

export interface DepartmentInput {
  name?: unknown;
  slug?: unknown;
  sortOrder?: unknown;
  isVisible?: unknown;
}

export interface NormalizedDepartment {
  name: string;
  slug: string;
  sortOrder: number;
  isVisible: boolean;
}

/** name bat buoc; slug de trong = tu sinh tu name; sortOrder mac dinh 0. */
export function normalizeDepartmentInput(input: DepartmentInput): NormalizedDepartment {
  const name = typeof input?.name === 'string' ? input.name.trim() : '';
  if (!name) throw new Error('ten phong ban bat buoc');
  const rawSlug = typeof input?.slug === 'string' ? input.slug.trim() : '';
  const slug = slugifyDepartment(rawSlug || name) || 'phong-ban';
  const sortOrder = Number.isFinite(Number(input?.sortOrder)) ? Math.trunc(Number(input?.sortOrder)) : 0;
  return { name, slug, sortOrder, isVisible: input?.isVisible !== false };
}

/**
 * Patch: tra ve CHI cac truong co trong input (undefined = giu nguyen,
 * service khong ghi de). Neu doi ten ma khong nhap slug thi slug tu sinh
 * lai tu ten moi; neu khong doi ten/slug thi khong co key slug.
 */
export function normalizeDepartmentPatch(
  input: DepartmentInput,
  row: { name: string; slug: string },
): Partial<NormalizedDepartment> {
  const out: Partial<NormalizedDepartment> = {};
  if (input?.name !== undefined) {
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (!name) throw new Error('ten phong ban bat buoc');
    out.name = name;
    if (input?.slug === undefined) out.slug = slugifyDepartment(name) || row.slug;
  }
  if (input?.slug !== undefined) {
    const rawSlug = typeof input.slug === 'string' ? input.slug.trim() : '';
    out.slug = slugifyDepartment(rawSlug || out.name || row.name) || row.slug;
  }
  if (input?.sortOrder !== undefined && Number.isFinite(Number(input.sortOrder))) {
    out.sortOrder = Math.trunc(Number(input.sortOrder));
  }
  if (input?.isVisible !== undefined) out.isVisible = input.isVisible !== false;
  return out;
}
