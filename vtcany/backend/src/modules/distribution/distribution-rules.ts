// Quy tac thuan cua module Phan phoi (khong decorator, khong import Nest
// hay Prisma) de test truc tiep bang node --test. Service chi goi cac ham
// nay roi moi cham Prisma — logic trang thai khong nam rac trong service.
export const DISTRIBUTION_PLATFORMS = ['app', 'facebook', 'tiktok', 'youtube'] as const;
export type DistributionPlatform = (typeof DISTRIBUTION_PLATFORMS)[number];

export const DISTRIBUTION_MEDIA_TYPES = ['image', 'video'] as const;

export function cleanPlatforms(input: unknown): DistributionPlatform[] {
  if (!Array.isArray(input)) return [];
  const out: DistributionPlatform[] = [];
  for (const p of input) {
    if ((DISTRIBUTION_PLATFORMS as readonly string[]).includes(p) && !out.includes(p as DistributionPlatform)) {
      out.push(p as DistributionPlatform);
    }
  }
  return out;
}

export function isHttpUrl(u: string): boolean {
  try {
    const parsed = new URL(u);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

// ---- Tham chieu catalog cho bai phan phoi (goi sua phat short 2026-11-05) ----
// public_id cua short trong catalog = sha256('catalog:' + id noi bo).slice(0, 24)
// (catalog.service.ts catalogPublicId) — dang 24 ky tu hex.
export function isCatalogPublicId(v: unknown): boolean {
  return typeof v === 'string' && /^[0-9a-f]{24}$/.test(v);
}

// Portal chi phat noi tuyen short Web khi bai co tham chieu catalog hop le
// VA la video; cac truong hop khac tra null = giu hanh vi cu (link media /
// link ngoai). Bai khong gan catalog (catalogPublicId null) khong phat.
export function shortPlayTarget(post: { catalogPublicId?: string | null; mediaType?: string | null }): { kind: 'short'; publicId: string } | null {
  if (post?.mediaType !== 'video') return null;
  if (!isCatalogPublicId(post?.catalogPublicId)) return null;
  return { kind: 'short', publicId: post.catalogPublicId as string };
}

// Bang khop thumbnail -> public_id dung cho dot dien du lieu 6 bai hien co
// (migration 20261105200000 lam that bang SQL LIKE '%<ten file>'; ham nay
// chi de test quy tac khop, khong dung o duong chay: media_url luu dang
// tuong doi hay tuyet doi deu khop vi chi so cuoi chuoi).
export const DISTRIBUTION_THUMBNAIL_CATALOG_MAP: Array<{ thumbnail: string; catalogPublicId: string }> = [
  { thumbnail: 'thumb-upl-1793864571176.jpg', catalogPublicId: 'b524149752f2c6014bc4fd1b' }, // Den tho Hoang Cong Chat
  { thumbnail: 'thumb-upl-1793864529660.jpg', catalogPublicId: '7f5a98096d0246da338e1d1f' }, // Muong Lay
  { thumbnail: 'thumb-upl-1793864480477.jpg', catalogPublicId: '8e0dd3916b048567dd53eb08' }, // Dua xanh Na Sang
  { thumbnail: 'thumb-upl-1793864437963.jpg', catalogPublicId: 'bcdf7b68d5786eb56f78fbe2' }, // 3 bi kip san may
  { thumbnail: 'thumb-upl-1793864372642.jpg', catalogPublicId: '098d2b0ddb039736b3086290' }, // Kho Chua La
  { thumbnail: 'thumb-upl-1793864276259.jpg', catalogPublicId: '1fbd81870f703436d681cadb' }, // Giay theu Xa Phang
];

export function catalogPublicIdForThumbnail(mediaUrl: unknown): string | null {
  if (typeof mediaUrl !== 'string' || !mediaUrl) return null;
  const found = DISTRIBUTION_THUMBNAIL_CATALOG_MAP.find((m) => mediaUrl.endsWith(m.thumbnail));
  return found ? found.catalogPublicId : null;
}

// Trang thai dich khi bai duoc XUAT BAN. Tra null = giu nguyen.
// - app (Web): luon posted (hien tren /nen-tang-so), kem url portal.
// - facebook/tiktok/youtube: chi draft -> ready (chuan bi); dich da
//   posted/failed thi giu nguyen de khong xoa link da ghi nhan.
//   Youtube la dich thu cong nhu TikTok (dang tay qua YouTube Studio
//   roi dan link ve), khong co connector tu dong trong giai doan nay.
export function publishTargetUpdate(t: { platform: string; status: string }): { status: string; url: string | null } | null {
  if (t.platform === 'app') return { status: 'posted', url: '/nen-tang-so' };
  if (t.status === 'draft') return { status: 'ready', url: null };
  return null;
}

// Trang thai dich khi bai bi GO XUAT BAN. Chi dich app dang posted moi
// tro ve draft (vi portal khong con hien bai); dich tay giu nguyen.
export function unpublishTargetUpdate(t: { platform: string; status: string }): { status: string; url: string | null } | null {
  if (t.platform === 'app' && t.status === 'posted') return { status: 'draft', url: null };
  return null;
}
