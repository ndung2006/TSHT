// Dinh dang noi dung chuan cho bai viet (Dot 1a).
// File thuan, khong import Nest/Prisma — test truc tiep bang node --test
// (giong news-workflow.ts). FE/App/OTT loc da phuong tien theo mot truong
// duy nhat content_type, thay vi chap va co + loai bai + chuyen muc roi
// (loi phan manh cua CMS Dien Bien).

export const CONTENT_TYPES = ['text', 'video', 'audio', 'gallery', 'infographic', 'emagazine'] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

export const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  text: 'Bài viết',
  video: 'Video',
  audio: 'Audio / Podcast',
  gallery: 'Chùm ảnh',
  infographic: 'Infographic',
  emagazine: 'Emagazine / Longform',
};

export function isContentType(value: unknown): value is ContentType {
  return typeof value === 'string' && (CONTENT_TYPES as readonly string[]).includes(value);
}

/**
 * Chuan hoa content_type tu input API. undefined/null/'' -> 'text' (tuong
 * thich nguoc: bai cu khong co truong nay van la bai standard).
 * Gia tri la -> throw Error, service doi thanh BadRequestException.
 */
export function normalizeContentType(value: unknown): ContentType {
  if (value === undefined || value === null || value === '') return 'text';
  if (!isContentType(value)) {
    throw new Error(`content_type khong hop le: ${String(value)} (chi nhan ${CONTENT_TYPES.join(', ')})`);
  }
  return value;
}
