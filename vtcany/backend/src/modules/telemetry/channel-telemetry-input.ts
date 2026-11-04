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

export const HEARTBEAT_DEDUPE_WINDOW_MS = 45 * 1000;
export const CHANNEL_VIEW_TYPES = ['live', 'timeshift', 'vod'] as const;
export type ChannelViewType = (typeof CHANNEL_VIEW_TYPES)[number];

const MAX_LEN = 128;

function clean(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  if (!t) return null;
  return t.slice(0, MAX_LEN);
}

export interface NormalizedChannelHeartbeat {
  sessionId: string | null;
  channelName: string | null;
  viewType: ChannelViewType;
  contentId: string | null;
}

/**
 * live/timeshift: bat buoc co ten kenh; vod: bat buoc co contentId,
 * ten kenh neu co cung duoc chap nhan nhung service se bo qua (VOD
 * khong co kenh). Loai xem ngoai 3 gia tri -> throw Error (service
 * doi thanh BadRequestException).
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
  return {
    sessionId: clean(input?.sessionId),
    channelName,
    viewType: viewType as ChannelViewType,
    contentId,
  };
}
