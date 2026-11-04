// Ham thuan cho dashboard GĐ1 — KHONG import Nest/Prisma, test truc tiep
// bang node --test (khuon retry-policy.ts). Moi dinh nghia chi so o day
// hoac dashboard-queries.ts; widget va danh sach drill-down dung chung.

const VN_TZ = 'Asia/Ho_Chi_Minh';

/** Ngay hien tai theo gio VN, dang YYYY-MM-DD. */
export function vnTodayStr(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: VN_TZ,
  }).format(now);
}

/** Ngay VN cach hom nay n ngay (n am = qua khu), dang YYYY-MM-DD. */
export function vnDayStrOffset(offsetDays: number, now = new Date()): string {
  const d = new Date(now.getTime() + offsetDays * 24 * 60 * 60 * 1000);
  return vnTodayStr(d);
}

/**
 * Khoang [from, to) theo gio UTC tuong ung mot ngay VN (00:00 -> 00:00
 * hom sau). publishAt luu UTC nen moi bucket theo ngay phai qua ham nay,
 * khong dung ngay UTC.
 */
export function vnDayRange(dateStr: string): { from: Date; to: Date } {
  // Ngay VN = UTC+7 quanh nam (khong DST) nen cong/tru 7 gio la dung.
  const from = new Date(`${dateStr}T00:00:00+07:00`);
  const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
  return { from, to };
}

/**
 * Khoang ky loc: 'today' | '7d' | '30d' | 'custom'. 7d/30d = cac ngay VN
 * ket thuc hom nay (bao gom hom nay). Custom: from/to la ngay VN, to
 * bao ham (lay het ngay to).
 */
export function periodRange(
  period: string,
  fromStr?: string,
  toStr?: string,
  now = new Date(),
): { from: Date; to: Date } {
  const today = vnTodayStr(now);
  if (period === 'today') return vnDayRange(today);
  if (period === '30d') {
    const { from } = vnDayRange(vnDayStrOffset(-29, now));
    const { to } = vnDayRange(today);
    return { from, to };
  }
  if (period === 'custom' && fromStr) {
    const { from } = vnDayRange(fromStr);
    const end = toStr || fromStr;
    const { to } = vnDayRange(end);
    return { from, to };
  }
  // Mac dinh: 7 ngay.
  const { from } = vnDayRange(vnDayStrOffset(-6, now));
  const { to } = vnDayRange(today);
  return { from, to };
}

/** Gioi han hien thi: tu ngay VN sang khoang Date de query Prisma. */
export function vnDateToUtc(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00+07:00`);
}

export function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function waitHours(enteredAt: Date | number, now = new Date()): number {
  const t = enteredAt instanceof Date ? enteredAt.getTime() : enteredAt;
  return Math.max(0, (now.getTime() - t) / 3600_000);
}

export function isOverdue(enteredAt: Date | number, thresholdHours: number, now = new Date()): boolean {
  return waitHours(enteredAt, now) > thresholdHours;
}

// ---------------------------------------------------------------------------
// Phan loai tren approval (dung chung cho widget va danh sach drill-down)
// ---------------------------------------------------------------------------

export interface ApprovalRow {
  itemId: string;
  step: number;
  actorId?: string | null;
  actorRole?: string | null;
  action: string;
  comment?: string | null;
  isException?: boolean;
  exceptionReason?: string | null;
  createdAt: Date;
}

/** Approval moi nhat theo tung muc (so sanh createdAt, khong phu thuoc
 *  thu tu rows tra ve). Tra ve Map itemId -> row. */
export function latestApprovalsByItem(rows: ApprovalRow[]): Map<string, ApprovalRow> {
  const out = new Map<string, ApprovalRow>();
  for (const r of rows) {
    const cur = out.get(r.itemId);
    if (!cur || r.createdAt.getTime() >= cur.createdAt.getTime()) out.set(r.itemId, r);
  }
  return out;
}

/** Muc "bi tra ve, dang sua": status draft + approval gan nhat la return.
 *  (Ghi day du: gui bai LUON ghi approval 'submit' o ca 7 phan he nen
 *  thoi diem vao buoc 1 lay tu approval gan nhat, khong can fallback.) */
export function isReturnedDraft(status: string, latest: ApprovalRow | undefined): boolean {
  return status === 'draft' && !!latest && latest.action === 'return';
}

/** Nhap "chua tung gui" (A3 hieu chat): draft + khong co approval submit
 *  nao. Bai bi tra ve da tung submit nen tu dong loai khoi A3. */
export function isStrictDraft(status: string, hasSubmit: boolean): boolean {
  return status === 'draft' && !hasSubmit;
}

// ---------------------------------------------------------------------------
// Hang cho cua toi (A1) — tach nhiem vu ap dung ca full-admin
// ---------------------------------------------------------------------------

export interface QueueItem {
  module: string;
  workflowStep: number;
  status: string;
  createdBy?: string | null;
  /** Tat ca actorId da co approval tren muc (moi buoc, khong chi gan nhat). */
  approvalActorIds: string[];
}

export interface QueueUser {
  id: string | null;
  roleName: string | null;
  isFullAdmin: boolean;
}

/**
 * Muc co trong hang cho cua toi khi: dang pending_review, buoc > 0, va
 * (full-admin hoac role cua buoc == role cua toi), dong thoi toi khong
 * phai nguoi tao va khong co BAT KY approval nao truoc do tren muc
 * (tai lieu duyet 11.2 muc 2 — khong chi xet approval gan nhat).
 * stepRoleByModule: { [module]: { [step]: roleName } }.
 */
export function inMyQueue(
  item: QueueItem,
  user: QueueUser,
  stepRoleByModule: Record<string, Record<number, string>>,
): boolean {
  if (item.status !== 'pending_review' || !item.workflowStep || item.workflowStep <= 0) return false;
  if (!user.isFullAdmin) {
    const role = stepRoleByModule[item.module]?.[item.workflowStep];
    if (!role || !user.roleName || role.toLowerCase() !== user.roleName.toLowerCase()) return false;
  }
  if (user.id && item.createdBy && item.createdBy === user.id) return false;
  if (user.id && item.approvalActorIds.includes(user.id)) return false;
  return true;
}

/** Loc danh sach muc ve dung hang cho cua toi (giữ nguyen thu tu dau vao). */
export function filterMyQueue(
  items: QueueItem[],
  user: QueueUser,
  stepRoleByModule: Record<string, Record<number, string>>,
): QueueItem[] {
  return items.filter((it) => inMyQueue(it, user, stepRoleByModule));
}

// ---------------------------------------------------------------------------
// B7: duyet thay — approval co actorRole khac role cua buoc (step > 0)
// ---------------------------------------------------------------------------

export interface SubstituteRow {
  actorId?: string | null;
  actorRole?: string | null;
  step: number;
}

/** Nhom cac approval duyet thay theo actor (chi dem, khong ket luan
 *  dung/sai: full-admin bypass la tinh nang hop le, B7 chi thong ke). */
export function groupSubstitutes(
  rows: SubstituteRow[],
  stepRoleByModule: Record<string, Record<number, string>>,
  moduleOf: (row: SubstituteRow) => string,
): Array<{ actorId: string | null; actorRole: string | null; count: number }> {
  const out = new Map<string, { actorId: string | null; actorRole: string | null; count: number }>();
  for (const r of rows) {
    if (r.step <= 0) continue; // hanh dong ngoai buoc (publish/unpublish) khong tinh
    const role = stepRoleByModule[moduleOf(r)]?.[r.step];
    if (!role) continue;
    if (r.actorRole && r.actorRole.toLowerCase() === role.toLowerCase()) continue;
    const key = `${r.actorId || ''}|${r.actorRole || ''}`;
    const cur = out.get(key) || { actorId: r.actorId || null, actorRole: r.actorRole || null, count: 0 };
    cur.count += 1;
    out.set(key, cur);
  }
  return [...out.values()].sort((a, b) => b.count - a.count);
}

// ---------------------------------------------------------------------------
// EPG: phan biet "khong co nguon" voi "trong" (so 0 that)
// ---------------------------------------------------------------------------

export type EpgDayState = 'ok' | 'empty' | 'no-source' | 'stale';

/**
 * Trang thai EPG mot ngay cua mot kenh:
 * - co chuong trinh -> ok (ke ca ban cache cu: stale kem updatedAt);
 * - kenh radio (audioOnly) ma khong co chuong trinh -> no-source, kem
 *   reason "AIO không cung cấp EPG phát thanh, cần nhập tay"; KHONG
 *   tinh la 0, KHONG ban canh bao D5;
 * - kenh co nguon ma khong co chuong trinh -> empty (ban canh bao D5
 *   neu la ngay mai).
 */
export function epgDayState(
  programs: number,
  audioOnly: boolean,
  stale: boolean,
): { state: EpgDayState; reason: string | null } {
  if (programs > 0) return { state: stale ? 'stale' : 'ok', reason: null };
  if (audioOnly) {
    return { state: 'no-source', reason: 'AIO không cung cấp EPG phát thanh, cần nhập tay' };
  }
  return { state: 'empty', reason: null };
}

// ---------------------------------------------------------------------------
// Dinh dang kieu Viet Nam (hien thi)
// ---------------------------------------------------------------------------

export function fmtVnNumber(n: number): string {
  return new Intl.NumberFormat('vi-VN').format(n);
}

/** Dinh dang dung luong (B, KB, MB, GB, TB — 1 so le, kieu Viet Nam). */
export function fmtBytes(n: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = Math.max(0, n || 0);
  let u = 0;
  while (v >= 1024 && u < units.length - 1) { v /= 1024; u += 1; }
  const s = v >= 100 || u === 0
    ? new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(v)
    : new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(v);
  return `${s} ${units[u]}`;
}

// ---------------------------------------------------------------------------
// D3 (GĐ2): tong hop dung luong luu tru theo loai file
// ---------------------------------------------------------------------------

export interface MediaSizeRow {
  fileType: string | null;
  sizeBytes: number | bigint | null;
}

export interface MediaSizeAgg {
  type: string;
  label: string;
  files: number;
  bytes: number;
}

const MEDIA_TYPE_LABELS: Record<string, string> = {
  image: 'Ảnh',
  video: 'Video',
  audio: 'Âm thanh',
  subtitle: 'Phụ đề',
};

/** Gom sizeBytes theo fileType (DB tra BigInt, doi sang Number — tong o muc
 *  GB, xa duoi gioi han so nguyen an toan). Row khong co sizeBytes van
 *  dem vao files, dong gop 0 byte. Thu tu: image, video, audio, subtitle,
 *  loai la, chua phan loai. */
export function sumMediaSizes(rows: MediaSizeRow[]): MediaSizeAgg[] {
  const order = ['image', 'video', 'audio', 'subtitle'];
  const map = new Map<string, MediaSizeAgg>();
  const keyOf = (t: string | null): string => {
    if (!t) return '__null__';
    return order.includes(t) ? t : '__other__';
  };
  const labelOf = (k: string): string => {
    if (k === '__null__') return 'Chưa phân loại';
    if (k === '__other__') return 'Loại khác';
    return MEDIA_TYPE_LABELS[k] || k;
  };
  for (const r of rows) {
    const k = keyOf(r.fileType);
    const cur = map.get(k) || { type: k, label: labelOf(k), files: 0, bytes: 0 };
    cur.files += 1;
    cur.bytes += Number(r.sizeBytes || 0);
    map.set(k, cur);
  }
  return [...order, '__other__', '__null__']
    .filter((k) => map.has(k))
    .map((k) => map.get(k) as MediaSizeAgg);
}

/** dd/MM/yyyy theo gio VN. */
export function fmtVnDate(d: Date | string | number): string {
  const date = d instanceof Date ? d : new Date(d);
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric', timeZone: VN_TZ,
  }).format(date);
}

/** HH:mm theo gio VN. */
export function fmtVnTime(d: Date | string | number): string {
  const date = d instanceof Date ? d : new Date(d);
  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: VN_TZ,
  }).format(date);
}
