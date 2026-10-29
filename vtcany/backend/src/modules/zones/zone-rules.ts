// Zone/Widget Manager — Gói 1A (quy tac thuan, khong import Nest/Prisma
// de test truc tiep bang node --test, theo mau workspaces.ts).
//
// Vung hien thi trang chu TSHT (layout that, khong lay so cua bao khac):
// - 'tieu-diem'    -> khoi "Tin noi bat" trang chu, 4 slot (hien home.js
//                    goi /api/v2/news?featured=1&limit=4).
// - 'tin-moi-nhat' -> khoi "Tin moi nhat" trang chu, 8 slot (hien home.js
//                    goi /api/v2/news?limit=8).
// Khoi "Noi bat" hero o dau trang chu la so bao in moi nhat, khong phai
// tin bai, nen khong thuoc quan ly zone o goi nay. Khoi chuyen muc rieng
// (moi chuyen muc mot khoi) la viec mo rong sau 1A, chua lam o goi nay.

export interface ZoneDef {
  key: string;
  name: string;
  description: string;
  /** So slot toi da cua vung (theo layout that trang chu). */
  slotLimit: number;
  sortOrder: number;
}

export const ZONE_DEFS: ZoneDef[] = [
  {
    key: 'tieu-diem',
    name: 'Tiêu điểm',
    description: 'Khối Tin nổi bật trên trang chủ',
    slotLimit: 4,
    sortOrder: 1,
  },
  {
    key: 'tin-moi-nhat',
    name: 'Tin mới nhất',
    description: 'Khối Tin mới nhất trên trang chủ (dòng sự kiện)',
    slotLimit: 8,
    sortOrder: 2,
  },
];

export function isZoneKey(key: string): boolean {
  return ZONE_DEFS.some((z) => z.key === key);
}

export function zoneDef(key: string): ZoneDef | null {
  return ZONE_DEFS.find((z) => z.key === key) ?? null;
}

/** Nguon tu nhien de lap day slot trong khi vung chua du bai ghim:
 * - tieu-diem: bai co tick noi bat (isFeatured), moi nhat truoc.
 * - tin-moi-nhat: bai moi nhat.
 * Bai da ghim khong bao gio xuat hien lai o phan lap day. */
export function naturalSource(key: string): 'featured' | 'latest' {
  return key === 'tieu-diem' ? 'featured' : 'latest';
}

/** Ghep khoi hien thi cong khai: bai ghim truoc (theo thu tu ghim),
 * sau do lap day tu nguon tu nhien (tru bai da ghim), gioi han slot.
 * Thu tu ghim do service sap theo sortOrder truoc khi goi ham nay.
 * keyOf xac dinh bai trung nhau (API cong khai dung publicId, khong
 * dung id noi bo). */
export function buildBlockItems<T>(
  pinned: T[],
  natural: T[],
  limit: number,
  keyOf: (item: T) => string,
): T[] {
  const out: T[] = [];
  const seen = new Set<string>();
  for (const it of pinned) {
    if (out.length >= limit) break;
    const k = keyOf(it);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  for (const it of natural) {
    if (out.length >= limit) break;
    const k = keyOf(it);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  return out;
}

/** sortOrder cho bai ghim moi: lon nhat hien co + 1 (rong -> 1). */
export function nextSortOrder(items: { sortOrder: number }[]): number {
  if (!items.length) return 1;
  return Math.max(...items.map((i) => i.sortOrder)) + 1;
}
