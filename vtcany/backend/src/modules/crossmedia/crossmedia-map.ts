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
// - Khong co URL MP4 on dinh nao de ke thua: video catalog phat qua HLS ky
//   HMAC (het han nhanh), file MP4 goc tren dia khong co endpoint cong khai.
//   Nhet URL HLS ky vao formatData se hong sau vai phut va lo URL ky —
//   nen ban nhap TV de contentType 'text', media that doi ban DAM Proxy MP4
//   (muc mo ben duoi). Anh bia chi ke thua khi la duong dan tuong doi '/'.
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
  // Goi 1C dot 2, chi dat nen: id upload cua video catalog (form
  // videos.vue/short.vue mang videoFileId). Khong phai URL phat, khong doi
  // player — buoc DAM Proxy sau nay moi dung toi.
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
  contentType: 'text';
  sourceRef: SourceRef;
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
 * cua tin bai). URL tuyet doi (http...) khong dua vao coverPath.
 */
export function relativeCover(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  return v.startsWith('/') ? v : null;
}

function requireTitle(title: string | null | undefined): string {
  const t = (title || '').trim();
  if (!t) throw new Error('tieu de nguon bat buoc');
  return t;
}

/**
 * Video / short catalog -> ban nhap. Fail-closed: chua xuat ban
 * (isVisible !== true) thi throw, khong tao nhap.
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
    contentType: 'text',
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
