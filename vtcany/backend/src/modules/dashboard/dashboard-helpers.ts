// Ham thuan cho dashboard GĐ1 — KHONG import Nest/Prisma, test truc tiep
// bang node --test (khuon retry-policy.ts). Moi dinh nghia chi so o day
// hoac dashboard-queries.ts; widget va danh sach drill-down dung chung.
import { readdirSync, statSync } from 'fs';
import { join } from 'path';

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

/** Gioi han hien thi: tu ngay VN sang khoang Date de query Prisma.
 * CHI dung cho moc instant (vd loc createdAt theo khoang) — KHONG dung
 * cho cot @db.Date (xem vnDateForDb ben duoi). */
export function vnDateToUtc(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00+07:00`);
}

/**
 * Ngay VN -> Date de ghi/query cot @db.Date (pageview_daily,
 * channel_telemetry_daily). PHAI dung giua trua UTC cua dung ngay VN do,
 * KHONG dung nua dem +07:00: nua dem +07:00 = 17:00 UTC ngay hom truoc,
 * session DB o UTC se cat ve ngay hom truoc khi luu vao cot DATE (loi
 * nhan ngay 04/11 -> 03/11 phat hien 05/11/2026). Giua trua UTC thi ngay
 * UTC luon bang ngay VN voi moi session timezone trong UTC-12..UTC+12.
 * Moi noi ghi va kiem tra "da gop" (pvDone/chDone) deu phai dung ham nay.
 */
export function vnDateForDb(dateStr: string): Date {
  return new Date(`${dateStr}T12:00:00Z`);
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
  /** actorRole cua cac approval do CHINH user hien tai thuc hien (de tinh
   *  ngoai le vong lap cung role). Thieu -> dung dinh nghia chat cu
   *  (bat ky approval nao cua toi cung loai). */
  myApprovalRoles?: string[];
}

export interface QueueUser {
  id: string | null;
  roleName: string | null;
  isFullAdmin: boolean;
}

function roleIn(roleName: string | null | undefined, roles: string[]): boolean {
  if (!roleName) return false;
  const wanted = roleName.toLowerCase();
  return roles.some((r) => String(r).toLowerCase() === wanted);
}

/** Chuan hoa map buoc: gia tri buoc co the la role don (string, tuong
 *  thich test/caller cu) hoac mang roleNames. */
function asRoleNamesMap(
  m: Record<string, Record<number, string | string[]>>,
): Record<string, Record<number, string[]>> {
  const out: Record<string, Record<number, string[]>> = {};
  for (const [mod, steps] of Object.entries(m || {})) {
    out[mod] = {};
    for (const [step, v] of Object.entries(steps || {})) {
      out[mod][Number(step)] = Array.isArray(v) ? v : [v];
    }
  }
  return out;
}

/**
 * Muc co trong hang cho cua toi khi: dang pending_review, buoc > 0, va
 * role buoc (roleNames) chua role cua toi (hoac full-admin), dong thoi:
 * - full-admin + cong tac TAT -> hien moi muc cho (bo ca loai tru tao
 *   boi minh va da xu ly) — ban demo;
 * - con lai: toi khong phai nguoi tao, va khong co approval truoc do co
 *   actorRole NGOAI roleNames cua buoc hien tai (luat 11.2 + ngoai le
 *   vong lap cung role: da duyet buoc T.PP thi van thay muc o buoc
 *   T.PP tiep theo; da duyet buoc khac role thi bi loai).
 * stepRoleNamesByModule: { [module]: { [step]: roleNames[] } }.
 * opts.enforceSoD: true = ap loai tru ca full-admin (trien khai that);
 *   false = full-admin thay moi (ban demo, mac dinh true de an toan neu
 *   service quen truyen — service luon truyen tu cong tac).
 */
export function inMyQueue(
  item: QueueItem,
  user: QueueUser,
  stepRoleNamesByModule: Record<string, Record<number, string | string[]>>,
  opts?: { enforceSoD?: boolean },
): boolean {
  if (item.status !== 'pending_review' || !item.workflowStep || item.workflowStep <= 0) return false;
  const map = asRoleNamesMap(stepRoleNamesByModule);
  const roles = map[item.module]?.[item.workflowStep];
  if (!roles?.length) return false;
  if (!user.isFullAdmin && !roleIn(user.roleName, roles)) return false;
  if (user.isFullAdmin && opts?.enforceSoD === false) return true;
  if (user.id && item.createdBy && item.createdBy === user.id) return false;
  if (item.myApprovalRoles !== undefined) {
    // actorRole null/rong tinh la ngoai role (fail-closed).
    if (user.id && item.myApprovalRoles.some((r) => !roleIn(r || null, roles))) return false;
  } else if (user.id && item.approvalActorIds.includes(user.id)) {
    return false;
  }
  return true;
}

/** Loc danh sach muc ve dung hang cho cua toi (giữ nguyen thu tu dau vao). */
export function filterMyQueue(
  items: QueueItem[],
  user: QueueUser,
  stepRoleNamesByModule: Record<string, Record<number, string | string[]>>,
  opts?: { enforceSoD?: boolean },
): QueueItem[] {
  return items.filter((it) => inMyQueue(it, user, stepRoleNamesByModule, opts));
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
 *  dung/sai: full-admin bypass la tinh nang hop le, B7 chi thong ke).
 *  Duyet thay = actorRole KHONG nam trong roleNames cua buoc do
 *  (buoc cuoi bai bao in: TBT hoac P.TBT deu hop le). Buoc khong co
 *  trong map thi bo qua (khong ket luan duoc). actorRole null van dem
 *  (giu hanh vi cu: chi role trung moi loai). */
export function groupSubstitutes(
  rows: SubstituteRow[],
  stepRoleNamesByModule: Record<string, Record<number, string | string[]>>,
  moduleOf: (row: SubstituteRow) => string,
): Array<{ actorId: string | null; actorRole: string | null; count: number }> {
  const map = asRoleNamesMap(stepRoleNamesByModule);
  const out = new Map<string, { actorId: string | null; actorRole: string | null; count: number }>();
  for (const r of rows) {
    if (r.step <= 0) continue; // hanh dong ngoai buoc (publish/unpublish) khong tinh
    const roles = map[moduleOf(r)]?.[r.step];
    if (!roles?.length) continue;
    if (r.actorRole && roles.some((x) => x.toLowerCase() === r.actorRole!.toLowerCase())) continue;
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
 *   neu la ngay hom nay va da qua gio chot 07:30).
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

/** Gio VN (0-23) cua mot thoi diem — dung cho gio chot canh bao D5.
 *  Dung formatToParts vi dinh dang vi-VN tra '10 giờ', Number() truc
 *  tiep se ra NaN. */
export function vnHourOf(d: Date): number {
  const parts = new Intl.DateTimeFormat('vi-VN', {
    hour: 'numeric', hour12: false, timeZone: VN_TZ,
  }).formatToParts(d);
  return Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
}

/** So phut tu 00:00 gio VN cua mot thoi diem (0-1439). */
export function vnMinutesOfDay(d: Date): number {
  const parts = new Intl.DateTimeFormat('vi-VN', {
    hour: 'numeric', minute: 'numeric', hour12: false, timeZone: VN_TZ,
  }).formatToParts(d);
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return h * 60 + m;
}

/** Da qua gio chot trong ngay (gio VN) hay chua. cutoffMinute mac dinh
 *  0 nen cach goi cu (chi truyen gio) van dung. */
export function isPastDailyCutoff(now: Date, cutoffHour: number, cutoffMinute = 0): boolean {
  return vnMinutesOfDay(now) >= cutoffHour * 60 + cutoffMinute;
}

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

/** Mot dong cua widget D3 (drill null = dong khong link; unit = don vi
 *  hien sau so luong, mac dinh 'file' o CMS — chi dong HLS dat rieng). */
export interface StorageRow {
  type: string;
  label: string;
  files: number;
  bytes: number;
  unit?: string;
  drill: { route: string; query: Record<string, string> } | null;
}

/** Do dung luong cay HLS (storage/hls): files = so thu muc con TRUC TIEP
 *  (moi thu muc = 1 video da chuyen ma), bytes = tong kich thuoc toan bo
 *  cay (de quy). Thu muc khong ton tai / khong doc duoc -> 0/0, khong
 *  nem loi (widget van hien dong 0). */
export function measureHlsStorage(storageRoot: string): { files: number; bytes: number } {
  const hlsDir = join(storageRoot, 'hls');
  let files = 0;
  let bytes = 0;
  const walk = (dir: string): void => {
    let entries: Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }>;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = join(dir, e.name);
      try {
        if (e.isDirectory()) {
          if (dir === hlsDir) files += 1; // chi dem thu muc cap 1
          walk(p);
        } else if (e.isFile()) {
          bytes += statSync(p).size;
        }
      } catch { /* file bien mat giua chung: bo qua */ }
    }
  };
  walk(hlsDir);
  return { files, bytes };
}

/** Xay dung dung 5 dong luu tru goc + dong HLS cho widget D3 (GĐ2).
 *  - Anh/Video/Am thanh: tu sumMediaSizes (thieu loai thi 0 file/0 byte).
 *  - PDF bao in: dem theo so co pdfPath (khong theo cot pdfSizeBytes).
 *  - Khac: gop subtitle + loai la + chua phan loai thanh 1 dong, drill
 *    null (Thu vien khong loc duoc kind=other).
 *  - Ban chuyen ma (HLS): tong dung luong HLS da chuyen ma, KHONG tinh
 *    trong cac dong tren; drill null. */
export function buildStorageRows(
  mediaAggs: MediaSizeAgg[],
  pdfFiles: number,
  pdfBytes: number,
  hlsFiles: number,
  hlsBytes: number,
): StorageRow[] {
  const byType = new Map(mediaAggs.map((a) => [a.type, a]));
  const pick = (t: string): { files: number; bytes: number } => {
    const a = byType.get(t);
    return { files: a?.files ?? 0, bytes: a?.bytes ?? 0 };
  };
  const other = ['subtitle', '__other__', '__null__'].reduce(
    (acc, k) => {
      const a = byType.get(k);
      if (a) { acc.files += a.files; acc.bytes += a.bytes; }
      return acc;
    },
    { files: 0, bytes: 0 },
  );
  const img = pick('image');
  const vid = pick('video');
  const aud = pick('audio');
  return [
    { type: 'image', label: 'Ảnh', files: img.files, bytes: img.bytes, drill: { route: '/thu-vien', query: { kind: 'image' } } },
    { type: 'video', label: 'Video', files: vid.files, bytes: vid.bytes, drill: { route: '/thu-vien', query: { kind: 'video' } } },
    { type: 'audio', label: 'Âm thanh', files: aud.files, bytes: aud.bytes, drill: { route: '/thu-vien', query: { kind: 'audio' } } },
    { type: 'pdf', label: 'PDF báo in', files: pdfFiles, bytes: pdfBytes, drill: { route: '/bao-in', query: {} } },
    { type: 'other', label: 'Khác', files: other.files, bytes: other.bytes, drill: null },
    // Dong HLS dem theo VIDEO (moi thu muc = 1 video da chuyen ma), khong
    // goi la 'file': CMS hien "N video đã chuyển mã · X GB".
    { type: 'hls', label: 'Bản chuyển mã (HLS)', files: hlsFiles, bytes: hlsBytes, unit: 'video đã chuyển mã', drill: null },
  ];
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

// ---------------------------------------------------------------------------
// B7: dem thanh vien theo role hieu luc
// ---------------------------------------------------------------------------

/** Dem thanh vien theo role hieu luc — giong adminIdentity: uu tien ten
 *  role qua quan he, fallback cot roleName; user khong active (khoa) KHONG
 *  dem. Thay groupBy cot roleName: cot nay co the trong khi role gan qua
 *  roleId, lam B7 bao 0 thanh vien sai (phat hien khi kiem chung live
 *  2026-11-04: test-tbt dang nhap duoc nhung B7 bao TBT 0 thanh vien). */
export function countMembersByRole(
  rows: Array<{ roleName?: string | null; status?: string | null; role?: { name?: string | null } | null }>,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) {
    if (r.status && r.status !== 'active') continue;
    const name = (r.role?.name || r.roleName || '').toLowerCase();
    if (!name) continue;
    out.set(name, (out.get(name) || 0) + 1);
  }
  return out;
}

/** Tong thanh vien duyet duoc mot buoc = tong thanh vien cua CAC Role
 *  trong roleNames (moi user chi 1 role nen tong = kich thuoc hop).
 *  Buoc cuoi bai bao in {TBT, P.TBT} dem ca 2 role, khong chi TBT. */
export function sumMembersForStep(memberCount: Map<string, number>, roleNames: string[]): number {
  let n = 0;
  for (const r of roleNames) n += memberCount.get(String(r).toLowerCase()) || 0;
  return n;
}

// ---------------------------------------------------------------------------
// B7: moc doi cau truc quy trinh
// ---------------------------------------------------------------------------

/** B7 co tinh approval nay vao duyet thay khong: bo qua approval truoc
 *  moc doi cau truc cua phan he, vi so thu tu buoc cu khong con map dung
 *  buoc moi (vd chuoi bai bao in 4 buoc -> 7 buoc). cutoff null = tinh
 *  het. Approval dung moc van tinh (>=). Chi anh huong dem duyet thay
 *  (theo so buoc); danh sach ngoai le khong dung so buoc nen khong loc. */
export function passesStructureCutoff(createdAt: Date, cutoff: Date | null | undefined): boolean {
  if (!cutoff) return true;
  return createdAt.getTime() >= new Date(cutoff).getTime();
}
