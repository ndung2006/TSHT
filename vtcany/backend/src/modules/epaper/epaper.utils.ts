import { randomBytes } from 'crypto';

// Logic thuan cua module bao in (khong phu thuoc Nest/Prisma) de test don vi
// duoc ma khong can DB. Quy tac nghiep vu:
// - issueType chi nhan 'thuong' | 'vung_cao'.
// - So bao la so nguyen duong; cap (issueType, issueNumber) la duy nhat.
// - So da xuat ban KHONG doi duoc issueNumber; cac truong khac chi doi kem
//   changeReason (ly do bat buoc) va phai ghi revision.
// - Slug gan voi publicId (24 hex) nen doi loai/ten/ngay khong doi slug/URL.

export const ISSUE_TYPES = ['thuong', 'vung_cao'] as const;
export type IssueType = (typeof ISSUE_TYPES)[number];

export function isIssueType(v: unknown): v is IssueType {
  return typeof v === 'string' && (ISSUE_TYPES as readonly string[]).includes(v);
}

export function generatePublicId(): string {
  return randomBytes(12).toString('hex');
}

export function issueSlug(issueNumber: number, publicId: string): string {
  return `bao-tuyen-quang-so-${issueNumber}-${publicId}`;
}

export function issueUrl(slug: string): string {
  return `/bao-in/${slug}`;
}

export function parsePublishDate(v: unknown): Date | null {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  // Chan ngay khong ton tai bi Date tu dong dich (vd 2026-02-30 -> 03-02).
  if (d.toISOString().slice(0, 10) !== v) return null;
  return d;
}

export interface PatchCheck {
  ok: boolean;
  error?: string;
}

/**
 * Kiem tra mot PATCH len so bao. Tra ve loi hien thi duoc cho CMS; service
 * dich thanh HttpException. Khong cham DB o day (trung UNIQUE do DB bao).
 * Quy tac: so da xuat ban thi issueNumber la bat bien; moi thay doi khac
 * tren so da xuat ban deu bat buoc changeReason va ghi revision.
 */
export function checkPatch(
  wasPublished: boolean,
  current: { issueNumber: number },
  patch: Record<string, unknown>,
): PatchCheck {
  if (patch.issueNumber !== undefined && patch.issueNumber !== current.issueNumber) {
    return { ok: false, error: 'so da xuat ban: khong doi so bao' };
  }
  if (patch.issueType !== undefined && !isIssueType(patch.issueType)) {
    return { ok: false, error: 'issue_type chi nhan thuong hoac vung_cao' };
  }
  if (wasPublished) {
    const changed = Object.keys(patch).some((k) => k !== 'changeReason' && patch[k] !== undefined);
    if (changed && !(typeof patch.changeReason === 'string' && patch.changeReason.trim())) {
      return { ok: false, error: 'sua so da xuat ban bat buoc nhap change_reason' };
    }
  }
  return { ok: true };
}
