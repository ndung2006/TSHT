// Validate/normalize input cho endpoint thu heartbeat kenh (GĐ3 nen).
// File thuan, khong import Nest/Prisma — test truc tiep bang node --test
// (khuon pageview-input.ts).
// Rieng tu: chi nhan sessionId (chuoi ngau nhien do client tu sinh,
// khong dinh danh nguoi dung), ten kenh, loai xem, contentId (VOD);
// khong nhan IP/user id, khong luu user-agent (UA chi dung de loc bot
// roi bo, giong PageView).
// Chong gui lap: cung (session, kenh, loai, content) trong 45 giay thi
// chi tinh 1 heartbeat (ngan hon nhip gui 60 giay de khong lam mat
// heartbeat that, nhung chan gui trung do retry).
// Beat cuoi VOD (3c-final-beat): frontend gui them watchedSeconds (so
// giay THUC SU PHAT, cong don theo phien) + final:true + durationSec
// (thoi luong noi dung, giay) khi video ket thuc / pause lau / roi
// trang. Beat cuoi MIEN dedupe 45s; beat cuoi cua cung 1 phien dedupe
// theo MAX (xem decideFinalBeat). watchedSeconds bi CHAN: <=
// durationSec x 1,5 (neu biet thoi luong), khong biet -> toi da 3600;
// vuot thi CAT ve nguong + log (khong tu choi beat).

export const HEARTBEAT_DEDUPE_WINDOW_MS = 45 * 1000;
export const CHANNEL_VIEW_TYPES = ['live', 'timeshift', 'vod'] as const;
export type ChannelViewType = (typeof CHANNEL_VIEW_TYPES)[number];

// Gioi han tren cho watchedSeconds khi khong biet thoi luong noi dung.
export const MAX_WATCHED_SECONDS = 3600;
// He so chan: watchedSeconds toi da = durationSec x he so nay.
export const WATCHED_SECONDS_DURATION_FACTOR = 1.5;

const MAX_LEN = 128;

function clean(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  if (!t) return null;
  return t.slice(0, MAX_LEN);
}

// So nguyen >= 0 tu gia tri gui len (so thuc -> lay phan nguyen);
// khong phai so / am / NaN / Infinity -> null (bo qua, khong throw).
function parseNonNegativeInt(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const n = Math.floor(value);
  return n < 0 ? null : n;
}

export interface NormalizedChannelHeartbeat {
  sessionId: string | null;
  channelName: string | null;
  viewType: ChannelViewType;
  contentId: string | null;
  // Beat cuoi: so giay thuc phat (da chan), null neu khong gui / khong hop le.
  watchedSeconds: number | null;
  // true neu day la beat cuoi cua phien (ended / pause lau / pagehide).
  isFinal: boolean;
  // Thoi luong noi dung (giay, da lam tron), null neu khong gui / khong hop le.
  durationSec: number | null;
  // true neu watchedSeconds bi cat ve nguong (service ghi log).
  clamped: boolean;
}

export type FinalBeatDecision =
  | { action: 'create'; watchedSeconds: number | null }
  | { action: 'update'; watchedSeconds: number }
  | { action: 'skip' };

/**
 * Beat cuoi dedupe theo MAX cho cung (session, kenh, loai, content):
 * - Chua co beat cuoi -> chen row moi (du watchedSeconds co hay khong).
 * - Da co beat cuoi: chi cap nhat khi gia tri moi lon hon gia tri da
 *   co (cong don theo phien); gia tri moi nho hon / bang / khong co
 *   thi bo qua — khong chen row trung.
 * Ham thuan (khong DB) de test truc tiep; service chi goi ham nay sau
 * khi tim beat cuoi hien co. Beat cuoi MIEN dedupe 45s (khong xet
 * createdAt): 2 beat cuoi cach nhau > 45s van dedupe theo MAX.
 */
export function decideFinalBeat(
  existing: { watchedSeconds: number | null } | null,
  incomingWatchedSeconds: number | null,
): FinalBeatDecision {
  if (!existing) {
    return { action: 'create', watchedSeconds: incomingWatchedSeconds };
  }
  const prev = existing.watchedSeconds;
  if (incomingWatchedSeconds === null) return { action: 'skip' };
  if (prev === null || incomingWatchedSeconds > prev) {
    return { action: 'update', watchedSeconds: incomingWatchedSeconds };
  }
  return { action: 'skip' };
}

/**
 * live/timeshift: bat buoc co ten kenh; vod: bat buoc co contentId,
 * ten kenh neu co cung duoc chap nhan nhung service se bo qua (VOD
 * khong co kenh). Loai xem ngoai 3 gia tri -> throw Error (service
 * doi thanh BadRequestException).
 * watchedSeconds / durationSec / final: chi nhan, khong throw khi
 * sai (sai -> null / false); watchedSeconds vuot nguong -> cat ve
 * nguong + clamped=true (service ghi log, khong tu choi beat).
 */
export function normalizeChannelHeartbeatInput(input: any): NormalizedChannelHeartbeat {
  const viewType = input?.type;
  if (typeof viewType !== 'string' || !(CHANNEL_VIEW_TYPES as readonly string[]).includes(viewType)) {
    throw new Error('loai xem khong hop le (live | timeshift | vod)');
  }
  const channelName = clean(input?.channel);
  const contentId = clean(input?.contentId);
  if ((viewType === 'live' || viewType === 'timeshift') && !channelName) {
    throw new Error('kenh khong duoc de trong voi live/timeshift');
  }
  if (viewType === 'vod' && !contentId) {
    throw new Error('contentId khong duoc de trong voi vod');
  }
  const isFinal = input?.final === true;
  const durationSecRaw = parseNonNegativeInt(input?.durationSec);
  // Thoi luong 0 giay la vo nghia -> coi nhu khong biet.
  const durationSec = durationSecRaw !== null && durationSecRaw > 0 ? durationSecRaw : null;
  let watchedSeconds = parseNonNegativeInt(input?.watchedSeconds);
  let clamped = false;
  if (watchedSeconds !== null) {
    const max =
      durationSec !== null
        ? Math.floor(durationSec * WATCHED_SECONDS_DURATION_FACTOR)
        : MAX_WATCHED_SECONDS;
    if (watchedSeconds > max) {
      watchedSeconds = max;
      clamped = true;
    }
  }
  return {
    sessionId: clean(input?.sessionId),
    channelName,
    viewType: viewType as ChannelViewType,
    contentId,
    watchedSeconds,
    isFinal,
    durationSec,
    clamped,
  };
}
