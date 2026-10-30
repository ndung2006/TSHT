// Goi 1C: Chuyen doi cheo — anh xa nguon sang ban nhap Bao dien tu.
//
// Nguon hop le (theo tai lieu 1C: "tin TV da duyet" va "bai bao in da duyet"):
// - Video / short cua catalog: "da duyet" = isVisible === true (catalog khong
//   co chuoi duyet bien tap rieng; nut Xuat ban chi bat/tat hien thi).
//   Fail-closed: chua hien thi -> throw, khong tao nhap.
// - So bao in: "da duyet" = status === 'published' (da qua chuoi
//   KTV -> MD -> T.PP -> P.TBT -> TBT). Fail-closed tuong tu.
//
// Han che da khao sat (ghi ro, khong tu bia):
// - Video catalog phat chinh qua HLS ky HMAC (het han nhanh) nen khong
//   nhet URL HLS ky vao formatData (se hong sau vai phut va lo URL ky).
//   DAM Proxy MP4 (goi nay): file MP4 goc duoc phuc vu qua route on
//   dinh GET /api/v1/media/<uploadId>/file.mp4 (backend, gate theo video
//   catalog dang hien thi) + proxy TSHT /api/v2/media/<uploadId>/mp4;
//   ban nhap TV co videoFileId thi contentType 'video' + formatData
//   .videoUrl = URL proxy tuyet doi (xem portalMp4Url). File goc co the
//   dung codec ma mot so trinh duyet khong giai duoc (ban transcode HLS
//   moi la ban chuan phat) va viec giu file goc sau transcode chua xac
//   minh tren dia — thieu file thi endpoint tra 404, nhap roi ve text
//   luc chuyen doi (xem crossmedia.service.ts).
// - Nguon khong co ten tac gia (catalog khong co truong author; so bao chi
//   co createdBy la id) nen server KHONG bao gio tu gan tac gia: bien tap
//   chon/ghi tac gia luc chuyen doi (o CMS, mac dinh la email tai khoan
//   dang dang nhap, sua hoac xoa duoc); khong truyen / truyen rong thi
//   authors = [] nhu cu. Lien thong nhuan but theo tac gia la viec sau.
// - Khong co anh xa catalog -> chuyen muc tin bai nen bien tap chon chuyen
//   muc luc chuyen doi (dropdown tu /admin/news-categories); khong chon
//   thi categoryId = null nhu cu; server validate qua NewsService
//   checkCategory (sai -> 400, khong am tham null).
// - Chuyen doi trung bi chan o service: cung type + id trong sourceRef
//   (JSONB) ma da co bai thi tra 409 kem slug/publicId bai cu de CMS
//   dan toi. Bai da xoa thi khong con row nen moi row tim thay deu tinh.
// - videoFileId (id upload cua video catalog) duoc giu trong sourceRef de
//   buoc DAM Proxy sau nay co moi noi; rieng dot nay KHONG doi player,
//   KHONG sinh URL proxy, ban nhap TV van contentType 'text'.
// - Ban nhap tao qua NewsService.create nen luon o trang thai 'draft',
//   workflowStep 0 — di quy trinh tin bai binh thuong (PV -> TP -> PBDT ->
//   BBT -> XB) tu dau, khong tu xuat ban, khong bo buoc.
//
// Logic thuan, khong phu thuoc Nest/Prisma — test bang node --test
// (Node strip type file .ts thuan, theo mau news-format-data.test.mjs).

export interface SourceRef {
  type: 'tv-video' | 'tv-short' | 'epaper';
  id: string;
  title: string;
  issueNumber?: number;
  issueType?: string;
  // Goi 1C dot 2: id upload cua video catalog (form videos.vue/short.vue
  // mang videoFileId). DAM Proxy MP4 dung toi de sinh videoUrl.
  videoFileId?: string;
}

export interface TvSource {
  id: string;
  title?: string | null;
  description?: string | null;
  thumbnail?: string | null;
  poster?: string | null;
  isVisible?: boolean;
  videoFileId?: string | null;
}

export interface EpaperSource {
  publicId: string;
  title?: string | null;
  slug: string;
  issueNumber: number;
  issueType: string;
  publishDate?: string | null;
  coverPath?: string | null;
  status?: string | null;
}

export interface DraftInput {
  title: string;
  sapo: string;
  body: string;
  coverPath: string | null;
  authors: string[];
  tags: string[];
  contentType: 'text' | 'video';
  formatData?: { videoUrl?: string };
  sourceRef: SourceRef;
}

/**
 * URL proxy MP4 on dinh cho ban nhap video (DAM Proxy MP4).
 *
 * PHAI la URL tuyet doi ve origin cong khai, khong phai duong dan tuong
 * doi, vi ca hai noi render deu ghep origin cho URL tuong doi:
 * - Trang cong khai: server.mjs resolveFormatData() ghep moi URL tuong
 *   doi trong formatData voi origin backend (resolveVtcanyImageUrl) —
 *   duong dan '/api/v2/media/...' se bi ghep thanh backend origin +
 *   '/api/v2/...' (backend khong co route /api/v2) -> 404.
 * - CMS xem duyet: tin-bai.vue resolveMedia() ghep URL tuong doi voi
 *   apiBase (backend) — hong tuong tu; duong dan tran tren origin CMS
 *   cung khong co route /api/v2.
 * URL tuyet doi di qua ca hai noi render nguyen ven (ca hai deu giu
 * nguyen URL http(s) tuyet doi) va the <video> phat truc tiep qua proxy
 * TSHT ma khong can CORS (the media khong dung crossorigin).
 * Origin lay tu env PORTAL_PUBLIC_ORIGIN (Coolify backend set khi
 * deploy); mac dinh la origin san xuat hien tai.
 */
export function portalMp4Url(uploadId: string): string {
  const origin = (process.env.PORTAL_PUBLIC_ORIGIN || 'https://tsht.vtctech.xyz').replace(/\/+$/, '');
  return `${origin}/api/v2/media/${encodeURIComponent(uploadId)}/mp4`;
}

export function escapeHtml(input: string): string {
  return (input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Sapo tin bai gioi han 500 ky tu (validate o news.service.ts). */
export function truncateSapo(input: string | null | undefined): string {
  return (input || '').trim().slice(0, 500);
}

/**
 * Chuan hoa tac gia do bien tap chon/ghi luc chuyen doi (Goi 1C dot 2).
 * Khong truyen / null -> [] (nhu cu, server khong tu gan tac gia).
 * Sai dang (khong phai mang, phan tu khong phai chuoi) -> throw, service
 * doi thanh 400 (DTO o controller cung chan bang class-validator).
 * Trim, bo rong, dedupe, toi da 10 ten.
 */
export function normalizeAuthors(input: unknown): string[] {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input)) throw new Error('tac gia khong hop le');
  const out: string[] = [];
  for (const a of input) {
    if (typeof a !== 'string') throw new Error('tac gia khong hop le');
    const t = a.trim();
    if (t && !out.includes(t)) out.push(t);
    if (out.length >= 10) break;
  }
  return out;
}

/**
 * Chi ke thua anh bia khi la duong dan tuong doi '/...' (quy uoc coverPath
 * cua tin bai) hoac ten file anh tran. Ten file tran (khong slash, duoi
 * anh) duoc ghep thanh '/images/<file>': anh goc nam o storage/images,
 * backend phuc vu static o /images/<file> (main.ts useStaticAssets) —
 * dung quy uoc coverPath '/images/...' ma resolveMedia() o CMS va
 * resolveVtcanyImageUrl o server.mjs ghep origin backend. URL tuyet doi
 * (http...) khong dua vao coverPath; duong dan tuong doi khong bat dau
 * bang '/' (vd 'images/a.png') van bi loai de khong doan sai.
 */
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif)$/i;
export function relativeCover(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (v.startsWith('/')) return v;
  if (!v.includes('/') && !v.includes('\\') && IMAGE_EXT.test(v)) return `/images/${v}`;
  return null;
}

function requireTitle(title: string | null | undefined): string {
  const t = (title || '').trim();
  if (!t) throw new Error('tieu de nguon bat buoc');
  return t;
}

/**
 * Video / short catalog -> ban nhap. Fail-closed: chua xuat ban
 * (isVisible !== true) thi throw, khong tao nhap.
 * Co videoFileId -> nhap video (contentType 'video', formatData.videoUrl
 * la URL proxy MP4 on dinh); khong co -> nhap text nhu cu. Kiem tra file
 * goc co that tren dia hay khong KHONG nam o ham thuan nay ma o service
 * (crossmedia.service.ts): thieu file thi nhap roi ve text, chuyen doi
 * van khong fail.
 */
export function mapTvToDraft(src: TvSource, kind: 'tv-video' | 'tv-short'): DraftInput {
  if (!src || typeof src.id !== 'string' || !src.id) throw new Error('nguon truyen hinh khong hop le');
  if (src.isVisible !== true) throw new Error('nguon chua xuat ban');
  const title = requireTitle(src.title);
  const desc = (src.description || '').trim();
  const kindLabel = kind === 'tv-short' ? 'video ngan' : 'video';
  const body = desc
    ? `<p>${escapeHtml(desc)}</p><p><em>Chuyển đổi từ ${kindLabel} Truyền hình “${escapeHtml(title)}”.</em></p>`
    : `<p><em>Chuyển đổi từ ${kindLabel} Truyền hình “${escapeHtml(title)}”.</em></p>`;
  const videoFileId = typeof src.videoFileId === 'string' ? src.videoFileId.trim() : '';
  return {
    title,
    sapo: truncateSapo(desc),
    body,
    coverPath: relativeCover(src.thumbnail) ?? relativeCover(src.poster),
    authors: [],
    tags: [],
    contentType: videoFileId ? 'video' : 'text',
    ...(videoFileId ? { formatData: { videoUrl: portalMp4Url(videoFileId) } } : {}),
    sourceRef: { type: kind, id: src.id, title, ...(videoFileId ? { videoFileId } : {}) },
  };
}

export function issueTypeLabel(issueType: string): string {
  return issueType === 'vung_cao' ? 'Vùng cao' : 'Thường';
}

/**
 * So bao in -> ban nhap. Fail-closed: chua xuat ban (status !== 'published')
 * thi throw, khong tao nhap. Link ve so bao goc dung URL cong khai
 * /bao-in/<slug> (xem epaper.utils.ts: issueUrl).
 */
export function mapEpaperToDraft(issue: EpaperSource): DraftInput {
  if (!issue || typeof issue.publicId !== 'string' || !issue.publicId) throw new Error('so bao khong hop le');
  if (issue.status !== 'published') throw new Error('so bao chua xuat ban');
  const title = requireTitle(issue.title);
  const summary = `Số báo ${issueTypeLabel(issue.issueType)} số ${issue.issueNumber}` +
    (issue.publishDate ? `, ngày ${issue.publishDate}` : '');
  return {
    title,
    sapo: truncateSapo(summary),
    body: `<p>${escapeHtml(summary)}.</p><p><a href="/bao-in/${escapeHtml(issue.slug)}">Xem số báo gốc</a></p>`,
    coverPath: relativeCover(issue.coverPath),
    authors: [],
    tags: [],
    contentType: 'text',
    sourceRef: { type: 'epaper', id: issue.publicId, title, issueNumber: issue.issueNumber, issueType: issue.issueType },
  };
}
