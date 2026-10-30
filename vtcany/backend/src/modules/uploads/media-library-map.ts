// Map/filter/phân trang cho Thư viện media thống nhất (Dot 1a).
// File thuan, khong import Nest/Prisma — test truc tiep bang node --test.
// Nguon du lieu: bang media_assets (Postgres, source of truth) + danh
// sach in-memory cua UploadsService (anh/video vua upload, upsert DB dang
// fire-and-forget nen co the chua kip xuat hien trong DB). Merge theo id,
// uu tien ban ghi in-memory (tuoi hon, co them posterUrl/transcode).

export type MediaKind = 'image' | 'video' | 'audio';
export const MEDIA_KINDS: readonly string[] = ['image', 'video', 'audio'];

export interface MediaItem {
  id: string;
  filename: string;
  kind: MediaKind;
  contentType: string;
  sizeBytes: number;
  /** URL dung duoc ngay: anh/audio = URL file; video = '' (HLS can ky HMAC, xem posterUrl). */
  url: string;
  posterUrl: string;
  status: string;
  createdAt: number;
  /** Thu muc logic (Goi 2D-1); ban ghi in-memory chua co truong nay. */
  folderId?: string | null;
}

export interface MediaQuery {
  kind?: string;
  q?: string;
  page?: unknown;
  limit?: unknown;
  folderId?: unknown;
}

export interface NormalizedMediaQuery {
  kind: MediaKind | null;
  q: string;
  page: number;
  limit: number;
  /** undefined = khong loc theo thu muc; null = chua phan loai; string = id thu muc. */
  folderId?: string | null;
}

export function normalizeMediaQuery(input: MediaQuery): NormalizedMediaQuery {
  let kind: MediaKind | null = null;
  if (input?.kind !== undefined && input.kind !== '' && input.kind !== null) {
    if (!MEDIA_KINDS.includes(String(input.kind))) {
      throw new Error(`kind khong hop le: ${String(input.kind)} (chi nhan image, video, audio)`);
    }
    kind = String(input.kind) as MediaKind;
  }
  const page = Math.max(1, Number(input?.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(input?.limit) || 20));
  const out: NormalizedMediaQuery = { kind, q: typeof input?.q === 'string' ? input.q.trim() : '', page, limit };
  // folderId: khong truyen -> KHONG co khoa (giu nguyen hop dong cu);
  // 'root' -> null (chua phan loai); chuoi khac -> id thu muc.
  const rawFolder = (input as any)?.folderId;
  if (rawFolder !== undefined && rawFolder !== null && rawFolder !== '') {
    out.folderId = String(rawFolder) === 'root' ? null : String(rawFolder);
  }
  return out;
}

/** Dong media_assets -> MediaItem. kind la -> null (bo qua: subtitle...). */
export function mapDbRow(row: any, publicBase: string, posterUrl = ''): MediaItem | null {
  const kind = row?.fileType;
  if (!MEDIA_KINDS.includes(kind)) return null;
  const fileUrl = row?.fileUrl || '';
  const url = (kind === 'image' || kind === 'audio') && fileUrl
    ? `${publicBase}${fileUrl}`
    : '';
  return {
    id: String(row.id),
    filename: row.filename || String(row.id),
    kind,
    contentType: row.contentType || '',
    sizeBytes: Number(row.sizeBytes || 0),
    url,
    posterUrl: kind === 'video' ? posterUrl : '',
    status: row.status || '',
    createdAt: row.createdAt ? new Date(row.createdAt).getTime() : 0,
    folderId: row.folderId ?? null,
  };
}

/** Anh trong UploadsService.listImages() -> MediaItem. */
export function mapMemoryImage(rec: any): MediaItem {
  return {
    id: String(rec.id),
    filename: rec.filename || String(rec.id),
    kind: 'image',
    contentType: rec.contentType || '',
    sizeBytes: Number(rec.sizeBytes || 0),
    url: rec.url || '',
    posterUrl: '',
    status: 'done',
    createdAt: Number(rec.createdAt || 0),
  };
}

/** Video trong UploadsService.listUploads() -> MediaItem. */
export function mapMemoryVideo(rec: any): MediaItem {
  return {
    id: String(rec.id),
    filename: rec.filename || String(rec.id),
    kind: 'video',
    contentType: rec.contentType || '',
    sizeBytes: Number(rec.sizeBytes || 0),
    url: '',
    posterUrl: rec.posterUrl || '',
    status: rec.transcode || rec.status || '',
    createdAt: Number(rec.createdAt || 0),
  };
}

/** Merge DB + in-memory (trung id thi giu ban in-memory, bo sung posterUrl), roi loc + sap xep + phan trang. */
export function mergeAndPage(
  dbItems: MediaItem[],
  memoryItems: MediaItem[],
  query: NormalizedMediaQuery,
): { data: MediaItem[]; total: number; page: number; limit: number } {
  const byId = new Map<string, MediaItem>();
  for (const it of dbItems) byId.set(it.id, it);
  for (const it of memoryItems) {
    const prev = byId.get(it.id);
    // Ban in-memory khong co folderId -> giu folderId cua ban DB.
    byId.set(it.id, prev ? { ...prev, ...it, posterUrl: it.posterUrl || prev.posterUrl, folderId: it.folderId !== undefined ? it.folderId : prev.folderId } : it);
  }
  let items = [...byId.values()];
  if (query.folderId !== undefined) {
    items = items.filter((it) => (it.folderId ?? null) === query.folderId);
  }
  if (query.kind) items = items.filter((it) => it.kind === query.kind);
  if (query.q) {
    const needle = query.q.toLowerCase();
    items = items.filter((it) => it.filename.toLowerCase().includes(needle));
  }
  items.sort((a, b) => b.createdAt - a.createdAt);
  const total = items.length;
  const start = (query.page - 1) * query.limit;
  return { data: items.slice(start, start + query.limit), total, page: query.page, limit: query.limit };
}
