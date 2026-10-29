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
