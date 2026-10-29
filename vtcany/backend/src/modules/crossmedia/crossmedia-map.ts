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
//   co createdBy la id) nen authors = [] — lien thong nhuan but theo tac gia
//   la viec tiep theo, khong gan bua nguoi chuyen doi lam tac gia.
// - Khong co anh xa chuyen muc catalog -> chuyen muc tin bai nen
//   categoryId = null, bien tap gan chuyen muc khi duyet nhap.
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
}

export interface TvSource {
  id: string;
  title?: string | null;
  description?: string | null;
  thumbnail?: string | null;
  poster?: string | null;
  isVisible?: boolean;
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
  return {
    title,
    sapo: truncateSapo(desc),
    body,
    coverPath: relativeCover(src.thumbnail) ?? relativeCover(src.poster),
    authors: [],
    tags: [],
    contentType: 'text',
    sourceRef: { type: kind, id: src.id, title },
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
