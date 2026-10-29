// Media dinh dang cho bai viet da dinh dang (Goi 1B).
// File thuan, khong import Nest/Prisma — test truc tiep bang node --test
// (giong news-content.ts, zone-rules.ts).
//
// formatData luu tren NewsArticle.formatData (JSONB, nullable):
//   { videoUrl?, audioUrl?, imageUrl?, images? }
// - Chi chua URL media da host (tuong doi /... hoac http(s) tuyet doi).
//   Khong bao gio chua base64 (gioi han JSON backend 256kb) hay truong
//   noi bo: normalize loc bo moi key la.
// - Bai cu / bai khong co media rieng: formatData = null, hien thi roi
//   ve body nhu truoc (khong doi hanh vi cu).

export interface FormatData {
  videoUrl?: string;
  audioUrl?: string;
  imageUrl?: string;
  images?: string[];
}

export const MAX_GALLERY_IMAGES = 30;

/** Lam sach mot URL media: trim, bo chuoi rong; scheme nguy hiem -> throw. */
function cleanUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (!v) return null;
  // Chan javascript:/data:/vbscript: — data: cung bi chan vi format media
  // phai la URL da host, khong nhung base64 vao JSON.
  if (/^\s*(javascript|data|vbscript)\s*:/i.test(v)) {
    throw new Error(`URL media khong hop le: ${v.slice(0, 40)}`);
  }
  return v;
}

/**
 * Chuan hoa format_data tu input API. undefined/null/'' -> null (khong co
 * media rieng). Object sai dang hoac URL scheme nguy hiem -> throw Error,
 * service doi thanh BadRequestException.
 */
export function normalizeFormatData(value: unknown): FormatData | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('format_data phai la object');
  }
  const o = value as Record<string, unknown>;
  const out: FormatData = {};
  const videoUrl = cleanUrl(o.videoUrl);
  if (videoUrl) out.videoUrl = videoUrl;
  const audioUrl = cleanUrl(o.audioUrl);
  if (audioUrl) out.audioUrl = audioUrl;
  const imageUrl = cleanUrl(o.imageUrl);
  if (imageUrl) out.imageUrl = imageUrl;
  if (Array.isArray(o.images)) {
    const seen = new Set<string>();
    const images: string[] = [];
    for (const im of o.images) {
      const u = cleanUrl(im);
      if (u && !seen.has(u)) {
        seen.add(u);
        images.push(u);
      }
      if (images.length >= MAX_GALLERY_IMAGES) break;
    }
    if (images.length) out.images = images;
  }
  return Object.keys(out).length ? out : null;
}

/** Media chinh cua tung dinh dang, de trang cong khai quyet dinh cach hien thi. */
export function mediaKindFor(contentType: string | null | undefined): 'video' | 'audio' | 'gallery' | 'image' | 'none' {
  switch (contentType || 'text') {
    case 'video': return 'video';
    case 'audio': return 'audio';
    case 'gallery': return 'gallery';
    case 'infographic': return 'image';
    default: return 'none';
  }
}
