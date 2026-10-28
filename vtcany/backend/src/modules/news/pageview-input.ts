// Validate/normalize input cho endpoint thu pageview (Dot 1a).
// File thuan, khong import Nest/Prisma — test truc tiep bang node --test.
// Ton trong rieng tu: chi nhan bai (publicId) hoac duong dan, khong nhan
// IP/user-agent/user id. Chua chong lam dung (de lam sau — xem PageViewService).

const MAX_LEN = 500;

function clean(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  if (!t) return null;
  return t.slice(0, MAX_LEN);
}

export interface PageViewInput {
  articlePublicId?: unknown;
  path?: unknown;
}

export interface NormalizedPageView {
  articlePublicId: string | null;
  path: string;
}

/**
 * It nhat 1 trong 2 truong phai co gia tri; ca 2 rong -> throw Error
 * (service doi thanh BadRequestException). path mac dinh '' khi chi co
 * articlePublicId.
 */
export function normalizePageViewInput(input: PageViewInput): NormalizedPageView {
  const articlePublicId = clean(input?.articlePublicId);
  const path = clean(input?.path);
  if (!articlePublicId && !path) {
    throw new Error('pageview can articlePublicId hoac path');
  }
  return { articlePublicId, path: path || '' };
}
