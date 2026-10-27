import { randomBytes } from 'crypto';

// Bước 1/8 — Quy ước ID VTC ANY (khớp VTC Play thực tế).
// public_id: 12 bytes random -> hex 24 ký tự (giống MongoDB ObjectId).
// URL public: /{type}/{slug}-{public_id}  VD: /phim/tham-tinh-6925687120dd0e58b0facba3

const PUBLIC_ID_RE = /^[0-9a-f]{24}$/;

export function generatePublicId(): string {
  return randomBytes(12).toString('hex');
}

export function isValidPublicId(id: string): boolean {
  return PUBLIC_ID_RE.test(id);
}

// slugify tiêu đề tiếng Việt: không dấu, lowercase, gạch ngang.
export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

export function buildPublicUrl(type: string, slug: string, publicId: string): string {
  if (!isValidPublicId(publicId)) throw new Error('invalid public_id (must be 24 hex chars)');
  const s = slugify(slug);
  if (!s) throw new Error('invalid slug');
  return `/${type}/${s}-${publicId}`;
}

// Tách "/phim/tham-tinh-<24hex>" hoặc "tham-tinh-<24hex>" -> { slug, publicId }.
export function parseSlugId(param: string): { slug: string; publicId: string } {
  const tail = param.split('/').pop() as string;
  const m = tail.match(/^(.*)-([0-9a-f]{24})$/);
  if (!m) throw new Error('invalid slug-id format, expected {slug}-{24hex}');
  return { slug: m[1], publicId: m[2] };
}
