import { isValidPublicId, slugify } from './public-id.ts';

// Bước 3/8 — Helper URL public đúng quy ước VTC Play (Mục 1.1):
// /{type}/{slug}-{public_id_24hex}  VD: /phim/tham-tinh-6925687120dd0e58b0facba3

const SLUG_ID_RE = /^(.*)-([0-9a-f]{24})$/;

export function buildPublicUrl(type: string, slug: string, publicId: string): string {
  if (!isValidPublicId(publicId)) throw new Error('invalid public_id (must be 24 hex chars)');
  const s = slugify(slug);
  if (!s) throw new Error('invalid slug');
  return `/${type}/${s}-${publicId}`;
}

export function parseSlugId(param: string): { slug: string; publicId: string } {
  const tail = (param || '').split('/').pop() as string;
  const m = tail.match(SLUG_ID_RE);
  if (!m) throw new Error('invalid slug-id format, expected {slug}-{24hex}');
  return { slug: m[1], publicId: m[2] };
}

export function isValidSlugId(param: string): boolean {
  return SLUG_ID_RE.test((param || '').split('/').pop() as string);
}
