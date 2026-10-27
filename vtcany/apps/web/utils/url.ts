// Copy logic từ packages/contracts/src/url.ts để apps/web build độc lập
// (Coolify build với base_directory /apps/web, không thấy /packages).
const PUBLIC_ID_RE = /^[0-9a-f]{24}$/;
const SLUG_ID_RE = /^(.*)-([0-9a-f]{24})$/;

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
  if (!PUBLIC_ID_RE.test(publicId)) throw new Error('invalid public_id');
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

// URL chi tiết nội dung theo loại (giống quy ước vtcplay.vn: /phim|video|short/{slug}-{24hex}).
export function contentUrl(item: { type?: string; slug: string; public_id: string }): string {
  const kind =
    item.type === 'short' ? 'short' : item.type === 'video' ? 'video' : item.type === 'event' ? 'su-kien' : 'phim';
  return `/${kind}/${item.slug}-${item.public_id}`;
}
