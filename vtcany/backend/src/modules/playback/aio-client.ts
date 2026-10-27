// Client server-to-server sang VTCAIO (theo docs 14-VTVGO + 25-VTC-ANY).
// VTC ANY KHONG tu ky HMAC - xin link xoay qua POST /api/hls-tokens bang partner key.
export interface AioConfig {
  baseUrl: string;
  partnerKey: string;
}

export interface AioChannel {
  name: string;
  status: string;
  live: boolean;
  epgId?: number | null;
  epgNow?: { title: string; startTime: string; endTime: string } | null;
  epg?: { schedule: string } | null;
  hls?: string | null; // link truc tiep kem theo scan (neu co)
  hlsRotating?: string | null; // link xoay ky san kem theo scan (neu co)
  hlsTranscode?: Array<{ preset: string; hls?: string }> | null;
  hlsTranscodeRotating?: Array<{ preset: string; hls: string }> | null;
  hlsMaster?: string | null; // master multibitrate tinh kem theo scan (neu co)
  hlsMasterRotating?: string | null; // master multibitrate xoay ky san (ABR, TTL 240p)
}

// Audio-only (VOV1/VOV3): preset khong co p360/p480/p720.
// Check ca hlsTranscode (cu) va hlsTranscodeRotating (moi) vi scan hien tai
// chi con rotating.
export function isAudioOnly(c: AioChannel): boolean {
  const presets = [...(c.hlsTranscode || []), ...(c.hlsTranscodeRotating || [])].map((t) => t.preset);
  return presets.length > 0 && presets.every((p) => !/^p\d+$/i.test(p));
}

export interface EpgTimelineItem {
  time: string;
  title: string;
  status: 'LIVE' | 'UPCOMING' | 'REPLAY';
  startIso?: string;
  endIso?: string;
}

// Gio hien thi EPG theo mui gio Viet Nam (server chay UTC nen getHours() bi lech).
// Doi qua bien moi truong EPG_TIMEZONE neu can.
const EPG_TZ = process.env.EPG_TIMEZONE || 'Asia/Ho_Chi_Minh';
const epgTimeFmt = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit', minute: '2-digit', hour12: false, timeZone: EPG_TZ,
});

// Map lich AIO (nhieu dang payload) ve timeline chuan. Khong map duoc -> [] (fallback local).
export function mapEpgSchedule(data: any, now = Date.now()): EpgTimelineItem[] {
  const arr: any[] = Array.isArray(data)
    ? data
    : data?.programs || data?.items || data?.schedule || data?.data || [];
  if (!Array.isArray(arr)) return [];
  const out: EpgTimelineItem[] = [];
  for (const it of arr) {
    const title = it?.title || it?.name;
    const start = it?.startTime || it?.start || it?.begin;
    const end = it?.endTime || it?.end;
    if (!title || !start) continue;
    const s = new Date(start).getTime();
    const e = end ? new Date(end).getTime() : NaN;
    const status = Number.isFinite(s) && s > now ? 'UPCOMING' : Number.isFinite(e) && e < now ? 'REPLAY' : 'LIVE';
    const d = new Date(Number.isFinite(s) ? s : now);
    const time = epgTimeFmt.format(d);
    out.push({
      time,
      title: String(title),
      status,
      startIso: Number.isFinite(s) ? new Date(s).toISOString() : undefined,
      endIso: Number.isFinite(e) ? new Date(e).toISOString() : undefined,
    });
  }
  return out;
}

export async function getEpgSchedule(cfg: AioConfig, scheduleUrl: string, date: string): Promise<any> {
  const withDate = scheduleUrl.replace('{date}', date);
  // scheduleUrl tuyet doi -> cat origin, giu path cho aioFetch.
  const path = withDate.startsWith('http') ? withDate.replace(/^https?:\/\/[^/]+/, '') : withDate;
  const withParam = path.includes('date=') ? path : `${path}${path.includes('?') ? '&' : '?'}date=${date}`;
  return aioFetch(cfg, withParam);
}

export interface AioToken {
  token: string;
  exp: number;
  url: string; // path: /hls/<CH>/index.m3u8?token=..&exp=..
}

export function clampTtlMinutes(v: number): number {
  if (!Number.isFinite(v)) return 240;
  return Math.min(1440, Math.max(5, Math.floor(v)));
}

// Master multibitrate: /hls/<CH>/index.m3u8 -> /api/hls/<CH>/master.m3u8 (docs 14 §7),
// giu nguyen token+exp.
export function toMasterUrl(path: string): string {
  return path.replace(/^\/hls\/([^/]+)\/index\.m3u8([?#]|$)/, '/api/hls/$1/master.m3u8$2');
}

export function fullUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}

// Doc han that cua link xoay tu query param exp trong URL (ms epoch).
// AIO tra exp trong response body khong phai han that (thuc te gan bang
// thoi diem hien tai); exp trong URL moi la han that (~4h).
export function urlExpMs(url: string): number | null {
  try {
    const q = url.indexOf('?');
    if (q < 0) return null;
    const v = new URLSearchParams(url.slice(q + 1)).get('exp');
    if (!v) return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n < 1e12 ? Math.round(n * 1000) : Math.round(n); // giay -> ms
  } catch {
    return null;
  }
}

async function aioFetch(cfg: AioConfig, path: string, init: RequestInit = {}): Promise<any> {
  if (!cfg.partnerKey) throw new Error('VTC_PARTNER_KEY is not configured (server-only)');
  // Retry 1 lan voi backoff cho loi mang/5xx (docs 14 §4). 401/403/404 tra ngay.
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15_000);
    try {
      const res = await fetch(fullUrl(cfg.baseUrl, path), {
        ...init,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.partnerKey}`, ...(init.headers || {}) },
        signal: ctrl.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) throw new Error('aio: invalid partner key (401)');
      if (res.status === 403) throw new Error(`aio: channel not opted-in or stopped (403)`);
      if (res.status === 404) throw new Error('aio: channel not found (404)');
      if (res.status >= 500) throw new Error(`aio: http ${res.status} (retryable)`);
      if (!res.ok) throw new Error(`aio: http ${res.status}`);
      return data;
    } catch (e: any) {
      lastErr = e;
      const retryable = /retryable|abort|fetch failed|network|ECONN/i.test(e?.message || e?.cause?.message || '');
      if (!retryable || attempt === 1) throw e;
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

export async function getChannels(cfg: AioConfig): Promise<{ baseUrl: string; channels: AioChannel[] }> {
  const data = await aioFetch(cfg, '/api/public/channels');
  return { baseUrl: data.baseUrl || cfg.baseUrl, channels: data.channels || [] };
}

export async function mintToken(cfg: AioConfig, channel: string, ttlMinutes: number): Promise<AioToken> {
  const data = await aioFetch(cfg, '/api/hls-tokens', {
    method: 'POST',
    body: JSON.stringify({ channel: channel.toUpperCase(), ttlMinutes: clampTtlMinutes(ttlMinutes) }),
  });
  if (!data?.token || !data?.exp || !data?.url) throw new Error('aio: bad token response');
  return { token: data.token, exp: data.exp, url: data.url };
}

// ---------------------------------------------------------------------------
// Timeshift / xem lai (catch-up): GET /api/timeshift/{tenkenh}?in=ISO&out=ISO
// Tra ve playlist m3u8 VOD dung khoang thoi gian. Toi da 6h/call; xac thuc
// bang partner key + IP allowlist hien tai (server-side).
// ---------------------------------------------------------------------------
export const TIMESHIFT_MAX_MS = 6 * 3600 * 1000;
export const TIMESHIFT_RETENTION_MS = 30 * 24 * 3600 * 1000;

// Bien the aioFetch tra ve text (cho m3u8), khong parse JSON.
async function aioFetchText(cfg: AioConfig, path: string): Promise<string> {
  if (!cfg.partnerKey) throw new Error('VTC_PARTNER_KEY is not configured (server-only)');
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30_000);
    try {
      const res = await fetch(fullUrl(cfg.baseUrl, path), {
        headers: { Authorization: `Bearer ${cfg.partnerKey}` },
        signal: ctrl.signal,
      });
      const text = await res.text();
      if (res.status === 401) throw new Error('aio: invalid partner key (401)');
      if (res.status === 403) throw new Error('aio: channel not opted-in or stopped (403)');
      if (res.status === 404) throw new Error('aio: timeshift not available (404)');
      if (res.status >= 500) throw new Error(`aio: http ${res.status} (retryable)`);
      if (!res.ok) throw new Error(`aio: http ${res.status}`);
      if (!text.includes('#EXTM3U')) throw new Error('aio: timeshift tra ve khong phai playlist m3u8');
      return text;
    } catch (e: any) {
      lastErr = e;
      const retryable = /retryable|abort|fetch failed|network|ECONN/i.test(e?.message || e?.cause?.message || '');
      if (!retryable || attempt === 1) throw e;
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

// 1 call timeshift (<= 6h). src: 'after' cho kenh ghi sau-encode (VD VOV1).
export async function getTimeshiftPlaylist(
  cfg: AioConfig,
  channel: string,
  startIso: string,
  endIso: string,
  src?: string | null,
): Promise<string> {
  const q = `in=${encodeURIComponent(startIso)}&out=${encodeURIComponent(endIso)}${src ? `&src=${encodeURIComponent(src)}` : ''}`;
  return aioFetchText(cfg, `/api/timeshift/${encodeURIComponent(channel)}?${q}`);
}

// ---------------------------------------------------------------------------
// Timeshift coverage: GET /api/timeshift/coverage -> vung du lieu that.
// { now, coverage: [{ channel, oldestAvailable (ISO), retentionDays, kinds: ['raw'|'after'] }] }
// - kinds quyet cach goi: co 'after' -> them ?src=after; chi 'raw' -> goi thuong.
// - oldestAvailable de kep khung gio, khoi 404 oan (thay vi doan so ngay retention).
// Cache 1h trong RAM; loi -> tra du lieu cache cu (neu co), khong thi null
// de caller fallback ve logic DB cu.
// ---------------------------------------------------------------------------
export interface TimeshiftCoverageEntry {
  channel: string;
  oldestAvailable: string;
  retentionDays: number;
  kinds: string[];
}
export interface TimeshiftCoverage {
  now?: string;
  coverage: TimeshiftCoverageEntry[];
}

const COVERAGE_TTL_MS = 60 * 60 * 1000;
let coverageCache: { at: number; data: TimeshiftCoverage } | null = null;

function channelKey(s: string): string {
  return (s || '').trim().toUpperCase();
}

export async function getTimeshiftCoverage(cfg: AioConfig): Promise<TimeshiftCoverage | null> {
  const nowMs = Date.now();
  if (coverageCache && nowMs - coverageCache.at < COVERAGE_TTL_MS) return coverageCache.data;
  try {
    const data = await aioFetch(cfg, '/api/timeshift/coverage');
    const raw = Array.isArray(data?.coverage) ? data.coverage : [];
    const coverage: TimeshiftCoverageEntry[] = raw
      .filter((e: any) => e && typeof e.channel === 'string')
      .map((e: any) => ({
        channel: e.channel,
        oldestAvailable: String(e.oldestAvailable || ''),
        retentionDays: Number(e.retentionDays) || 0,
        kinds: Array.isArray(e.kinds) ? e.kinds.map((k: any) => String(k)) : [],
      }));
    const result: TimeshiftCoverage = { now: data?.now ? String(data.now) : undefined, coverage };
    coverageCache = { at: nowMs, data: result };
    return result;
  } catch {
    return coverageCache?.data ?? null;
  }
}

export function findCoverageEntry(cov: TimeshiftCoverage | null | undefined, channel: string): TimeshiftCoverageEntry | null {
  if (!cov?.coverage?.length) return null;
  const key = channelKey(channel);
  return cov.coverage.find((e) => channelKey(e.channel) === key) ?? null;
}

// Dua URI tuong doi ve tuyet doi theo baseUrl cua AIO.
export function absolutizeUri(uri: string, baseUrl: string): string {
  const u = (uri || '').trim();
  if (!u || /^(https?:)?\/\//i.test(u) || u.startsWith('data:')) return u;
  const base = baseUrl.replace(/\/$/, '');
  return u.startsWith('/') ? `${new URL(base).origin}${u}` : `${base}/${u}`;
}

// Thay URI="..." tuong doi trong tag (EXT-X-KEY / EXT-X-MAP) thanh tuyet doi.
function absolutizeTagUris(tagLine: string, baseUrl: string): string {
  return tagLine.replace(/URI="([^"]+)"/g, (_m, u) => `URI="${absolutizeUri(u, baseUrl)}"`);
}

// Noi nhieu playlist VOD (moi chunk <= 6h) thanh 1 playlist duy nhat.
// - 1 header chung (TARGETDURATION dung truoc segment theo chuan HLS) + 1 ENDLIST.
// - DISCONTINUITY giua cac chunk (phong timestamp/codec lech); giu DISCONTINUITY trong chunk.
// - KEY/MAP duoc mang theo va ap dung dung segment.
// - Khong co segment nao -> throw 404 (de FE hien loi ro rang thay vi player quay mai).
export function stitchTimeshiftPlaylists(chunks: Array<{ playlist: string; baseUrl: string }>): string {
  const segs: string[] = [];
  let maxTarget = 10;
  let firstChunk = true;
  for (const { playlist, baseUrl } of chunks) {
    const chunkSegs: string[] = [];
    let pendingKey: string | null = null;
    let pendingMap: string | null = null;
    let pendingInf: string | null = null;
    for (const raw of playlist.split('\n')) {
      const line = raw.trim();
      if (!line) continue;
      if (line.startsWith('#EXT-X-TARGETDURATION:')) {
        const n = Number(line.split(':')[1]);
        if (Number.isFinite(n) && n > maxTarget) maxTarget = n;
        continue;
      }
      if (line.startsWith('#EXT-X-KEY:')) { pendingKey = absolutizeTagUris(line, baseUrl); continue; }
      if (line.startsWith('#EXT-X-MAP:')) { pendingMap = absolutizeTagUris(line, baseUrl); continue; }
      if (line.startsWith('#EXTINF:')) { pendingInf = line; continue; }
      if (line === '#EXT-X-DISCONTINUITY') { chunkSegs.push(line); continue; }
      if (line.startsWith('#')) continue; // header/footer chunk: VERSION, SEQUENCE, START, PROGRAM-DATE-TIME, ENDLIST...
      if (pendingInf) {
        if (pendingKey) { chunkSegs.push(pendingKey); pendingKey = null; }
        if (pendingMap) { chunkSegs.push(pendingMap); pendingMap = null; }
        chunkSegs.push(pendingInf, absolutizeUri(line, baseUrl));
        pendingInf = null;
      }
    }
    if (chunkSegs.length) {
      if (!firstChunk) segs.push('#EXT-X-DISCONTINUITY');
      segs.push(...chunkSegs);
      firstChunk = false;
    }
  }
  if (!segs.length) {
    throw Object.assign(new Error('aio: khong co ban ghi cho khung gio nay'), { status: 404 });
  }
  return [
    '#EXTM3U',
    '#EXT-X-VERSION:3',
    '#EXT-X-PLAYLIST-TYPE:VOD',
    `#EXT-X-TARGETDURATION:${Math.ceil(maxTarget)}`,
    ...segs,
    '#EXT-X-ENDLIST',
  ].join('\n') + '\n';
}
