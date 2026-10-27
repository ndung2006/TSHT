import { createHash } from 'crypto';

// Bước 5/8 — Quy ước nhóm kênh + EPG date-picker (Mục 3C, 11B).

export const TV_GROUPS = [
  'Kênh VTV',
  'KÊNH ĐỊA PHƯƠNG',
  'RADIO',
  'ANTV-Truyền hình CAND',
  'QPVN',
];

export function groupForChannel(name: string): string {
  const n = (name || '').toUpperCase();
  if (n.startsWith('VTV')) return 'Kênh VTV';
  if (n.includes('ANTV')) return 'ANTV-Truyền hình CAND';
  if (n.includes('QPVN')) return 'QPVN';
  if (n.startsWith('VOV') || n.includes('RADIO') || /[-\s]FM$/.test(n) || n.endsWith('RADIO')) return 'RADIO';
  return 'KÊNH ĐỊA PHƯƠNG';
}

// public_id ổn định cho kênh live (không có trong DB).
export function channelPublicId(name: string): string {
  return createHash('sha256').update(`tv-channel:${(name || '').toUpperCase()}`).digest('hex').slice(0, 24);
}

function toISODate(d: Date): string {
  // Dung UTC getters vi date duoc dung tu Date.UTC (ngay VN).
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

// Cửa sổ EPG 5 ngày: hôm nay -3 .. hôm nay +1 (VD 26,27,28,Hôm nay,30).
// Ngay "hom nay" tinh theo gio Viet Nam (server chay UTC).
export function epgDateWindow(today = new Date()): string[] {
  const vnToday = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Ho_Chi_Minh',
  }).format(today);
  const [y, m, dd] = vnToday.split('-').map(Number);
  const out: string[] = [];
  for (let delta = -3; delta <= 1; delta++) {
    const d = new Date(Date.UTC(y, m - 1, dd + delta));
    out.push(toISODate(d));
  }
  return out;
}

export function dateLabel(iso: string, todayIso: string): string {
  if (iso === todayIso) return 'Hôm nay';
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

export function channelKeyOf(name: string): string {
  return (name || '').trim().toUpperCase();
}

export interface AioChannelLite {
  name: string;
  audioOnly?: boolean;
}

// Ban ghi quan tri luu trong bang channel_overrides (tat ca field deu optional).
export interface ChannelOverrideLite {
  channelKey: string;
  isVisible?: boolean;
  sortOrder?: number | null;
  groupName?: string | null;
  displayName?: string | null;
  description?: string | null;
  logoUrl?: string | null;
  bannerUrl?: string | null;
  planId?: string | null;
  hlsUrl?: string | null;
  dashUrl?: string | null;
  catchupHlsUrl?: string | null;
  timeshiftEnabled?: boolean;
  timeshiftSrc?: string | null;
  useAioEpg?: boolean;
  isCustom?: boolean;
}

// Kênh được phép lấy EPG từ AIO hay không (mặc định có; chỉ tắt khi admin chọn).
export function aioEpgAllowed(override?: ChannelOverrideLite | null): boolean {
  return override?.useAioEpg !== false;
}

export interface TvChannelItemOut {
  public_id: string;
  name: string;
  logo: string | null;
  audio_only: boolean;
  banner_url: string | null;
  plan_id: string | null;
  is_custom: boolean;
}

// Ghep kenh AIO voi lop quan tri BE: an kenh isVisible=false, doi nhom/thu tu/
// ten/logo theo override, them kenh tu tao (isCustom) khong co tren AIO.
// Ham thuan (khong IO) de unit test doc lap.
export function applyChannelOverrides(
  aioChannels: AioChannelLite[],
  overrides: ChannelOverrideLite[],
): { groups: Array<{ name: string; channels: TvChannelItemOut[] }> } {
  const byKey = new Map<string, ChannelOverrideLite>();
  for (const o of overrides || []) byKey.set(channelKeyOf(o.channelKey), o);

  const merged: Array<{ group: string; sortOrder: number | null; item: TvChannelItemOut }> = [];
  const seen = new Set<string>();

  for (const c of aioChannels || []) {
    const key = channelKeyOf(c.name);
    seen.add(key);
    const o = byKey.get(key);
    if (o && o.isVisible === false) continue;
    const display = (o?.displayName || '').trim() || c.name;
    merged.push({
      group: (o?.groupName || '').trim() || groupForChannel(c.name),
      sortOrder: o?.sortOrder ?? null,
      item: {
        public_id: channelPublicId(c.name),
        name: display,
        logo: o?.logoUrl || null,
        audio_only: !!c.audioOnly,
        banner_url: o?.bannerUrl || null,
        plan_id: o?.planId || null,
        is_custom: false,
      },
    });
  }

  // Kenh/su kien admin tu them (khong co tren AIO).
  for (const o of overrides || []) {
    const key = channelKeyOf(o.channelKey);
    if (!o.isCustom || seen.has(key) || o.isVisible === false) continue;
    const display = (o.displayName || '').trim() || o.channelKey;
    merged.push({
      group: (o.groupName || '').trim() || 'KÊNH ĐỊA PHƯƠNG',
      sortOrder: o.sortOrder ?? null,
      item: {
        public_id: channelPublicId(display),
        name: display,
        logo: o.logoUrl || null,
        audio_only: false,
        banner_url: o.bannerUrl || null,
        plan_id: o.planId || null,
        is_custom: true,
      },
    });
  }

  const groupOrder: string[] = [...TV_GROUPS];
  for (const m of merged) if (!groupOrder.includes(m.group)) groupOrder.push(m.group);

  const groups = groupOrder.map((name) => ({
    name,
    channels: merged
      .filter((m) => m.group === name)
      .sort((a, b) => {
        const sa = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
        const sb = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
        if (sa !== sb) return sa - sb;
        return a.item.name.localeCompare(b.item.name, 'vi');
      })
      .map((m) => m.item),
  }));
  return { groups };
}

// Chuẩn hóa tiếng Việt không dấu để tìm kiếm (Mục 3D).
export function normalizeVi(input: string): string {
  return (input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
