// Logic ngay VN THUAN cho nhuan but — khong import Nest/Prisma de test
// truc tiep bang node --test (khuon dashboard-helpers.ts, royalties-score.ts).
// Service (royalties.service.ts) chi goi lai cac ham nay; phan noi DB cua
// service la mong (truyen khoang xuong Prisma / loc theo publishAt).
//
// Chuan ngay VN (xem phuong-an-dashboard §12): ngay VN = [17:00 UTC hom
// truoc, 17:00 UTC). Ky loc [from, to] (to BAO HAM) -> khoang Prisma
// NUA MO { gte, lt } qua vnDayRange, khong dung ngay UTC nhu truoc
// (new Date(from+'T00:00:00.000') / to+'T23:59:59.999' — gio local cua
// server, container chay UTC nen ra ngay UTC, lech 7 gio so voi ngay VN).
import { vnDayRange, vnTodayStr } from '../dashboard/dashboard-helpers';

/**
 * Ky VN [from, to] (to bao ham) -> khoang Prisma nua mo { gte, lt }.
 * - Chi co `from`: mo dau (gte = dau ngay VN `from`).
 * - Chi co `to`: mo cuoi (lt = cuoi ngay VN `to`, tuc dau ngay VN sau).
 * - Khong co from/to hoac ca hai khong hop le: null (khong loc).
 * Ngay khong hop le bi bo qua (giong hanh vi cu cua rangeWhere).
 */
export function royaltyPeriodRange(
  from?: string,
  to?: string,
): { gte?: Date; lt?: Date } | null {
  const range: { gte?: Date; lt?: Date } = {};
  if (from) {
    const f = vnDayRange(from).from;
    if (!Number.isNaN(f.getTime())) range.gte = f;
  }
  if (to) {
    const t = vnDayRange(to).to;
    if (!Number.isNaN(t.getTime())) range.lt = t;
  }
  return Object.keys(range).length ? range : null;
}

/** Ngay VN (YYYY-MM-DD) cua publishAt — dung de gom articlesByDay. */
export function royaltyPublishDay(publishAt: Date): string {
  return vnTodayStr(publishAt);
}
