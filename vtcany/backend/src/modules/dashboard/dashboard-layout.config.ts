// Cau hinh bo cuc dashboard theo vai tro (GĐ1) — file thuần, KHONG import
// Nest/Prisma de test truc tiep bang node --test (khuon retry-policy.ts).
// Quy tac (tai lieu duyet, muc 5 + muc 11):
// - Ma tran roleName -> widget, chi lay subset GĐ1 (16 widget). C4, C1, C2,
//   C3, C5, C6, C7, D3 la giai doan sau, KHONG liet ke o GĐ1.
// - Full-admin (quyen '*':'*') thay toan bo 16 widget GĐ1, nhung van chiu
//   quy tac tach nhiem vu o A1 (xem dashboard-helpers.ts).
// - Role khong co trong ma tran -> fallback A1, A2, A3, E1.
// - He thong chi co 1 role / tai khoan (AdminUser.roleId duy nhat) nen
//   khong co hop widget cua "nhieu role" — tieu chi nghiem thu cu ve
//   "tai khoan 2 role" da duoc thay bang tieu chi tach nhiem vu (muc 9).
// - Luu y: role seed 'Admin' co quyen '*' nen thuc te resolve ve toan bo
//   16 widget qua nhanh full-admin; dong 'Admin' duoi day chi ap dung khi
//   mot role ten Admin khong co quyen '*' (du phong).

export const ALL_GD1_WIDGETS = [
  'A1', 'A2', 'A3', 'A4',
  'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7',
  'D1', 'D2', 'D4', 'D5', 'E1',
] as const;

export type WidgetCode = (typeof ALL_GD1_WIDGETS)[number];

export const WIDGET_META: Record<WidgetCode, { title: string; tier: 'A' | 'B' | 'D' | 'E' }> = {
  A1: { title: 'Hàng chờ của tôi', tier: 'A' },
  A2: { title: 'Bị trả về', tier: 'A' },
  A3: { title: 'Nháp của tôi', tier: 'A' },
  A4: { title: 'Hẹn xuất bản 24 giờ tới', tier: 'A' },
  B1: { title: 'Phễu báo điện tử', tier: 'B' },
  B2: { title: 'Báo in kỳ tới', tier: 'B' },
  B3: { title: 'Lịch phát sóng', tier: 'B' },
  B4: { title: 'Sản lượng xuất bản', tier: 'B' },
  B5: { title: 'Theo chuyên mục', tier: 'B' },
  B6: { title: 'Việc treo', tier: 'B' },
  B7: { title: 'Cảnh báo quy trình', tier: 'B' },
  D1: { title: 'Trạng thái kênh', tier: 'D' },
  D2: { title: 'Xử lý media', tier: 'D' },
  D4: { title: 'Nhật ký hoạt động', tier: 'D' },
  D5: { title: 'Cảnh báo vận hành', tier: 'D' },
  E1: { title: 'Quản lý nhanh', tier: 'E' },
};

export const ROLE_LAYOUT: Record<string, WidgetCode[]> = {
  // Ban bien tap / Tong bien tap
  TBT: ['A1', 'D5', 'B1', 'B2', 'B3', 'B6', 'E1'],
  'P.TBT': ['A1', 'D5', 'B1', 'B2', 'B3', 'B6', 'E1'],
  BBT: ['A1', 'D5', 'B1', 'B2', 'B3', 'B6', 'E1'],
  // Thu ky toa soan / Phong Bao dien tu
  'T.PP': ['A1', 'A4', 'B1', 'B4', 'B5', 'B6', 'E1'],
  // Truong phong
  TP: ['A1', 'A2', 'B1', 'B6', 'E1'],
  // Xuat ban Bao in
  KTV: ['A1', 'B2', 'E1'],
  MD: ['A1', 'B2', 'E1'],
  // Phong vien, bien tap vien + tac gia/duyet vien cac phan he buoc don
  PV: ['A1', 'A2', 'A3', 'E1'],
  'PBĐT': ['A1', 'A2', 'A3', 'E1'],
  XB: ['A1', 'A2', 'A3', 'E1'],
  QLSK: ['A1', 'A2', 'A3', 'E1'],
  PVTT: ['A1', 'A2', 'A3', 'E1'],
  PTTT: ['A1', 'A2', 'A3', 'E1'],
  'QL-QC': ['A1', 'A2', 'A3', 'E1'],
  // Quan tri chung (khi khong co quyen '*'): D5, B7, D1, D2, D4, E1.
  // Role seed 'Admin' co '*' nen thuc te ve toan bo 16 widget (xem ghi
  // chu o dau file); dong nay la du phong cho role quan tri khong '*'.
  Admin: ['D5', 'B7', 'D1', 'D2', 'D4', 'E1'],
};

export const FALLBACK_LAYOUT: WidgetCode[] = ['A1', 'A2', 'A3', 'E1'];

/** Thu tu widget cua nguoi dang nhap. Full-admin -> toan bo 16 widget. */
export function resolveLayout(roleName: string | null | undefined, isFullAdmin: boolean): WidgetCode[] {
  if (isFullAdmin) return [...ALL_GD1_WIDGETS];
  if (!roleName) return [...FALLBACK_LAYOUT];
  const found = ROLE_LAYOUT[roleName];
  if (found) return [...found];
  // Ten role co the lech hoa/thuong so voi seed: thu khong phan biet hoa.
  const key = Object.keys(ROLE_LAYOUT).find((k) => k.toLowerCase() === roleName.toLowerCase());
  if (key) return [...ROLE_LAYOUT[key]];
  return [...FALLBACK_LAYOUT];
}

// Nguong "treo" (gio) — user chot 2026-11-04 khi dong GĐ1: tin bai 4h,
// bai bao in 12h, so bao PDF 2h moi buoc; tuong thuat 30 phut (0.5h),
// su kien 4h, quang cao 4h, nhuan but 72h. Nguong nam o day de doi 1 cho,
// khong rac trong tung widget.
export const STUCK_THRESHOLD_HOURS: Record<string, number> = {
  news: 4,
  printArticle: 12,
  epaper: 2,
  events: 4,
  liveblog: 0.5,
  ads: 4,
  royalties: 72,
};

/** Nhom role thay TOAN BO A4 (hen xuat ban 24h toi) — user chot 2026-11-04
 *  khi dong GĐ1. Role khac chi thay muc do minh tao. 'Super Admin' la ten
 *  role seed co quyen '*' nen thuong da ve full-admin; liet ke ca ten de
 *  quy tac dung ca khi role do khong co '*' (du phong). */
export const NEWSROOM_WIDE_ROLES: string[] = ['Super Admin', 'TBT', 'P.TBT', 'BBT', 'T.PP'];

/** true neu actor thuoc nhom toan toa soan (xem toan bo A4). */
export function isNewsroomWide(roleName: string | null | undefined, isFullAdmin: boolean): boolean {
  if (isFullAdmin) return true;
  if (!roleName) return false;
  return NEWSROOM_WIDE_ROLES.some((r) => r.toLowerCase() === roleName.toLowerCase());
}

// Cache EPG phia server cho B3/D5: TTL 12 phut (tai lieu duyet: 10–15 phut).
export const EPG_CACHE_TTL_MS = 12 * 60 * 1000;

// Cua so canh bao D5: so bao / quang cao trong 7 ngay toi.
export const OPS_WINDOW_DAYS = 7;
