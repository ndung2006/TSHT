// Don IP/User-Agent cua binh luan cu (Binh luan dot 1, thiet ke §6.2):
// binh luan co createdAt < now - 12 thang va ip IS NOT NULL thi set
// ip = NULL, userAgent = NULL. KHONG xoa binh luan, KHONG doi
// body/status/createdAt.
//
// Luu y ve cach truy cap DB: worker KHONG co Prisma/pg (chi noi voi
// backend qua HTTP internal endpoint, giong /internal/transcode-queue
// va /internal/media-webhook). Vi vay ham pure o day nhan vao mot
// CommentMetaStore (truy van/cap nhat) de test duoc ma khong can DB
// that; ban trien khai mac dinh (createHttpCommentMetaStore) goi
// backend POST /internal/cleanup-old-comment-meta (x-webhook-secret)
// voi 2 op:
//   { op: 'list',  cutoff: <ISO> } -> { rows: [{ id, createdAt, ip, userAgent }] }
//     (cac comment co createdAt < cutoff va ip IS NOT NULL; tra du
//     createdAt/ip de phia worker loc lai phong thu truoc khi clear)
//   { op: 'clear', ids: string[] } -> { cleared: number }
//     (set ip = NULL, userAgent = NULL cho cac id do)
// Endpoint backend nay CHUA TON TAI (thuoc module comments cua backend);
// khi chua co, job o index.ts chi log canh bao va bo qua, khong lam
// hong worker. Cutoff do worker tinh va gui kem (1 dinh nghia duy
// nhat ve "12 thang"), backend chi ap dung, khong tu tinh lai.
export const COMMENT_META_RETENTION_MS = 365 * 24 * 60 * 60 * 1000; // 12 thang ≈ 365 ngay

// Tan suat chay job (throttle): 1 lan/ngay. Khac voi thoi han luu tru
// (12 thang) — dung nham 2 hang so nay voi nhau.
export const COMMENT_META_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

export interface CommentMetaRow {
  id: string;
  createdAt: Date | string;
  ip: string | null;
  userAgent: string | null;
}

export interface CommentMetaStore {
  // Tra ve cac row co createdAt < cutoff va ip IS NOT NULL.
  findStale: (cutoff: Date) => Promise<CommentMetaRow[]>;
  // Set ip = NULL, userAgent = NULL cho cac id; tra ve so row da doi.
  clearMeta: (ids: string[]) => Promise<number>;
}

// Moc thoi gian: chi don comment tao TRUOC moc nay (dieu kien <, khong
// lay bang — comment vua tron 12 thang o lan chay sau moi bi don).
export function staleCommentMetaCutoff(now = new Date(), maxAgeMs = COMMENT_META_RETENTION_MS): Date {
  return new Date(now.getTime() - maxAgeMs);
}

// Quet + don. Tra ve { checked, cleared }.
// Phong thu: loc lai o day (createdAt < cutoff va ip != null) de mot
// store tra thua row (tuoi hoac ip null) cung khong bi don nham.
export async function cleanupOldCommentMeta(
  store: CommentMetaStore,
  now = new Date(),
  maxAgeMs = COMMENT_META_RETENTION_MS,
): Promise<{ checked: number; cleared: number }> {
  const cutoff = staleCommentMetaCutoff(now, maxAgeMs);
  const rows = await store.findStale(cutoff);
  const staleIds = rows
    .filter((r) => r && r.ip != null && new Date(r.createdAt).getTime() < cutoff.getTime())
    .map((r) => r.id);
  const checked = staleIds.length;
  if (checked === 0) return { checked: 0, cleared: 0 };
  const cleared = await store.clearMeta(staleIds);
  return { checked, cleared };
}

// Store mac dinh: goi backend internal endpoint (xem ghi chu dau file).
// fetchImpl de truyen stub khi test; mac dinh dung fetch toan cuc.
export function createHttpCommentMetaStore(
  backendUrl: string,
  secret: string,
  fetchImpl: typeof fetch = fetch,
): CommentMetaStore {
  const call = async (body: any): Promise<any> => {
    const res = await fetchImpl(`${backendUrl.replace(/\/$/, '')}/internal/cleanup-old-comment-meta`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-webhook-secret': secret },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`cleanup-old-comment-meta ${res.status}`);
    return res.json();
  };
  return {
    findStale: async (cutoff: Date) => {
      const out = await call({ op: 'list', cutoff: cutoff.toISOString() });
      return (out?.rows || []).map((r: any) => ({
        id: r.id,
        createdAt: r.createdAt,
        ip: r.ip ?? null,
        userAgent: r.userAgent ?? null,
      }));
    },
    clearMeta: async (ids: string[]) => {
      const out = await call({ op: 'clear', ids });
      return Number(out?.cleared || 0);
    },
  };
}
