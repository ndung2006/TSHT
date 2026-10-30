// Logic thuan cho ket noi Facebook (Goi 2D-3) — khong import Nest/Prisma,
// test truc tiep bang node --test. Phan goi Graph API nam o
// facebook.service.ts; o day chi co cau hinh, URL OAuth, ke hoach dang
// bai va doc phan hoi Graph.

export const GRAPH_VERSION = 'v21.0';
export const FACEBOOK_SCOPES = ['pages_manage_posts', 'pages_read_engagement', 'public_profile'];

export interface FacebookConfig {
  appId: string;
  appSecret: string;
  redirectUri: string;
}

/**
 * Cau hinh Meta doc tu env. Thieu bat ky truong nao -> null (CMS hien
 * "chua cau hinh", khong hien nut ket noi gia). redirectUri phai khop
 * chinh xac URI da dang ky trong Meta App (Facebook Login > Settings).
 */
export function facebookConfigFromEnv(env: Record<string, string | undefined>): FacebookConfig | null {
  const appId = (env.FB_APP_ID || '').trim();
  const appSecret = (env.FB_APP_SECRET || '').trim();
  const redirectUri = (env.FB_REDIRECT_URI || '').trim();
  if (!appId || !appSecret || !redirectUri) return null;
  return { appId, appSecret, redirectUri };
}

/** URL dang nhap Meta de nguoi co quyen chon Page va cap Page token. */
export function buildOAuthUrl(config: FacebookConfig, state: string): string {
  const params = new URLSearchParams({
    client_id: config.appId,
    redirect_uri: config.redirectUri,
    state,
    scope: FACEBOOK_SCOPES.join(','),
    response_type: 'code',
  });
  return `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${params.toString()}`;
}

export function graphUrl(path: string): string {
  return `https://graph.facebook.com/${GRAPH_VERSION}/${path.replace(/^\//, '')}`;
}

/** Ghep URL tuong doi (/images/...) thanh tuyet doi bang origin cong khai. */
export function absolutize(url: string | null | undefined, publicBase: string): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  if (!publicBase) return null;
  return `${publicBase.replace(/\/$/, '')}${url.startsWith('/') ? '' : '/'}${url}`;
}

export interface FacebookPostPlan {
  endpoint: string; // duong dan Graph (kem pageId)
  body: Record<string, string>;
}

/**
 * Ke hoach dang 1 bai phan phoi len Page:
 * - co anh URL tuyet doi -> POST /{page}/photos { url, caption }.
 * - khong co anh hop le -> POST /{page}/feed { message } (+ link neu
 *   mediaUrl la URL http(s) trang thuong).
 * Video: giai doan nay dang nhu bai feed kem link (chua up video truc
 * tiep len Graph — viec rieng, khong gia danh da dang video).
 */
export function planFacebookPost(
  pageId: string,
  post: { title: string; caption?: string | null; mediaUrl?: string | null; mediaType?: string },
  publicBase: string,
): FacebookPostPlan {
  const message = [post.title, post.caption || ''].filter(Boolean).join('\n\n');
  const mediaAbs = absolutize(post.mediaUrl, publicBase);
  if (post.mediaType === 'image' && mediaAbs) {
    return { endpoint: `${pageId}/photos`, body: { url: mediaAbs, caption: message } };
  }
  const body: Record<string, string> = { message };
  if (mediaAbs) body.link = mediaAbs;
  return { endpoint: `${pageId}/feed`, body };
}

/**
 * Doc phan hoi Graph sau khi dang:
 * - /feed tra { id: "pageId_postId" }.
 * - /photos tra { id: photoId, post_id: "pageId_postId" } (uu tien post_id).
 * Tra null neu khong co id (khong bao gio tu ghi posted khi thieu id).
 */
export function parseGraphPostResult(json: any): { postId: string; url: string } | null {
  const id = (json && (json.post_id || json.id)) ? String(json.post_id || json.id) : '';
  if (!id) return null;
  return { postId: id, url: `https://www.facebook.com/${id}` };
}

/** Trich thong diep loi Graph (neu co) de ghi vao note cua dich. */
export function graphErrorMessage(json: any, fallback = 'Graph API loi khong ro'): string {
  const msg = json?.error?.message;
  return typeof msg === 'string' && msg ? msg.slice(0, 500) : fallback;
}
