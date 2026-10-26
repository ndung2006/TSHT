// Phase 2 — Adapter VTCAIO, theo TAI LIEU CAU HINH v1.0 ngay 2026-10-26
// (mo hinh link xoay, chuan tich hop nhu VTC ANY dang su dung).
//
// NGUON CHINH: API vtcaio cua don vi. CMS + DB noi bo chi la lop du phong /
// ghi de khi API loi. Browser KHONG BAO GIO goi truc tiep vtcaio va khong
// bao gio thay partner key: moi goi vtcaio deu qua server (API /api/v1/*).
//
// Cau hinh (bien moi truong, KHONG dua vao code/repo/log):
//   VTCAIO_API_BASE — mac dinh https://luuchieu1.vtcplay.vn (khong co / cuoi).
//   VTCAIO_API_KEY  — PARTNER_KEY cua ben tich hop (Bearer). Khong co key thi
//                     adapter bao not_configured, server dung DB noi bo.
// Khong con VTCAIO_CHANNELS_PATH / RADIO_PATH / EPG_PATH nua: endpoint da
// chot trong tai lieu (xem duoi), khong doan them.
//
// Endpoint (tai lieu v1.0):
//   GET  /api/public/channels
//        -> danh sach kenh. Truong dung: name (viet hoa, khong dau — dinh danh
//           khi xin link va goi EPG), status (chi RUNNING moi phat duoc),
//           live, epgId, epgNow {title, startTime, endTime}, hlsRotating,
//           hlsTranscodeRotating [{preset, hls}] (TV: p720/p480/p360;
//           radio: paudio/paudio64), hlsMasterRotating (khuyen nghi: mot URL,
//           player tu chon muc theo bang thong), epg {schedule: URL mau}.
//        Cac truong link tinh hls / hlsTranscode / hlsMaster la null/[] doi
//        voi doi tac link xoay va PHAI BO QUA, khong dung.
//   POST /api/hls-tokens  {channel: "<NAME>", ttlMinutes: 240}
//        -> {token, exp (epoch mili-giay), url (tuong doi, vd
//           /hls/<NAME>/index.m3u8?token=..&exp=..)}.
//        Mot token/kênh dung chung cho: goc (url tra ve), transcode
//        /hls/<NAME>/tc-<preset>/index.m3u8?token=..&exp=.., master (khuyen
//        nghi) /api/hls/<NAME>/master.m3u8?token=..&exp=.. . Url tuong doi
//        phai noi sau base URL moi thanh link phat hoan chinh.
//   GET  /api/epg/schedule?channel=<NAME>&date=YYYY-MM-DD (Asia/Ho_Chi_Minh)
//        -> {partnerChannelId, localName, date, timezone, updatedAt,
//           fetchedAt, programs: [{id, channelId, title, description,
//           startTime, endTime, updatedAt}]} (ISO 8601 +07:00, sap xep theo
//           gio bat dau).
//        Cua so du lieu: hom nay + 2 ngay truoc + 7 ngay toi, dong bo ~10 phut.
//        programs:[] = ngay do chua co du lieu, KHONG phai loi. Ngay ngoai
//        cua so tra 404 tu vtcaio — adapter dich thanh items:[] + note,
//        khong phai loi 500.
//
// TODO (ngoai pham vi dot nay, muc 7 tai lieu — catch-up / xem lai):
//   GET /api/timeshift/coverage (kiem tra do sau kha dung theo kenh, ~2 ngay)
//   GET /api/timeshift/<NAME>?in=<dau>&out=<cuoi> (ISO 8601 hoac epoch,
//   toi da 6 gio moi lan goi; playlist VOD co ENDLIST, tua duoc).

const BASE = (process.env.VTCAIO_API_BASE || "https://luuchieu1.vtcplay.vn").replace(/\/$/, "");
const API_KEY = process.env.VTCAIO_API_KEY || "";

export function vtcaioConfigured() { return Boolean(API_KEY); }
export function vtcaioChannelsConfigured() { return vtcaioConfigured(); }
export function vtcaioEpgConfigured() { return vtcaioConfigured(); }

export function joinVtcaioUrl(relative) {
  if (!relative) return "";
  if (/^https?:\/\//i.test(relative)) return relative;
  return BASE + (relative.startsWith("/") ? relative : "/" + relative);
}

class VtcaioError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function fetchVtcaio(path, options = {}) {
  if (!API_KEY) return { ok: false, reason: "not_configured" };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const r = await fetch(BASE + path, {
      ...options,
      headers: { Accept: "application/json", Authorization: `Bearer ${API_KEY}`, ...(options.headers || {}) },
      signal: ctrl.signal,
    });
    let body = null;
    try { body = await r.json(); } catch { body = null; }
    if (!r.ok) throw new VtcaioError(r.status, `vtcaio HTTP ${r.status}`);
    return body;
  } finally { clearTimeout(timer); }
}

function pickArray(json) {
  if (Array.isArray(json)) return { recognized: true, items: json };
  if (json && Array.isArray(json.channels)) return { recognized: true, items: json.channels };
  if (json && Array.isArray(json.items)) return { recognized: true, items: json.items };
  if (json && Array.isArray(json.data)) return { recognized: true, items: json.data };
  return { recognized: false, items: [] };
}

function explicitKind(raw) {
  for (const v of [raw.kind, raw.type, raw.category]) {
    if (typeof v === "string" && ["tv", "radio"].includes(v.toLowerCase())) return v.toLowerCase();
    if (typeof v === "string" && /radio|audio|phat thanh/i.test(v)) return "radio";
    if (typeof v === "string" && /tv|truyen hinh|television/i.test(v)) return "tv";
  }
  return null;
}

function normalizeChannel(raw) {
  const name = raw.name || raw.channel || null;
  if (!name) return null;
  // Link tinh phai bo qua hoan toan (tai lieu: null/[] doi voi link xoay).
  const presets = (Array.isArray(raw.hlsTranscodeRotating) ? raw.hlsTranscodeRotating : [])
    .filter((p) => p && p.preset && p.hls)
    .map((p) => ({ preset: String(p.preset), hls: String(p.hls) }));
  const isRadio = presets.some((p) => p.preset === "paudio" || p.preset === "paudio64");
  const kind = explicitKind(raw) || (isRadio ? "radio" : "tv");
  const master = raw.hlsMasterRotating || raw.hlsRotating || "";
  return {
    id: null,
    slug: String(name).toLowerCase(),
    name: String(name),
    kind,
    status: raw.status || null,
    live: Boolean(raw.live),
    epgId: raw.epgId ?? null,
    epgNow: raw.epgNow ? { title: raw.epgNow.title || "", startTime: raw.epgNow.startTime || null, endTime: raw.epgNow.endTime || null } : null,
    stream_url: master ? String(master) : "",
    stream_kind: "hls",
    presets,
    epg_schedule: raw.epg && raw.epg.schedule ? String(raw.epg.schedule) : null,
    description: raw.description || "",
    is_active: raw.status ? raw.status === "RUNNING" : true,
    sort_order: 0,
  };
}

export async function fetchVtcaioChannels() {
  if (!vtcaioConfigured()) return { ok: false, reason: "not_configured" };
  try {
    const json = await fetchVtcaio("/api/public/channels");
    if (json && json.ok === false) return { ok: false, reason: "not_configured" };
    const picked = pickArray(json);
    if (!picked.recognized) return { ok: false, reason: "empty_or_unrecognized_format" };
    const items = picked.items.map(normalizeChannel).filter(Boolean);
    return { ok: true, items };
  } catch (e) {
    if (e instanceof VtcaioError) return { ok: false, reason: `http_${e.status}`, error: e.message };
    return { ok: false, reason: "fetch_failed", error: e.message };
  }
}

function hhmmFromIso(iso) {
  if (!iso) return "";
  const m = String(iso).match(/T(\d{2}:\d{2})/);
  return m ? m[1] : String(iso).slice(0, 5);
}

function normalizeProgram(raw, channelName, date) {
  if (!raw.title) return null;
  return {
    id: raw.id ?? null,
    channel_slug: String(channelName).toLowerCase(),
    channel_name: raw.channelName || null,
    channelId: raw.channelId ?? null,
    program_date: date,
    start_time: hhmmFromIso(raw.startTime),
    end_time: hhmmFromIso(raw.endTime),
    startTime: raw.startTime || null,
    endTime: raw.endTime || null,
    title: String(raw.title),
    description: raw.description || "",
    replay_url: "",
  };
}

export async function fetchVtcaioSchedule(date, channelName) {
  if (!vtcaioConfigured()) return { ok: false, reason: "not_configured" };
  try {
    const json = await fetchVtcaio(`/api/epg/schedule?channel=${encodeURIComponent(channelName)}&date=${encodeURIComponent(date)}`);
    const programs = json && Array.isArray(json.programs) ? json.programs : [];
    const items = programs.map((r) => normalizeProgram(r, channelName, date)).filter(Boolean);
    items.sort((a, b) => (a.startTime || "") < (b.startTime || "") ? -1 : 1);
    return {
      ok: true, items,
      channelName, localName: json ? json.localName || null : null,
      // programs:[] = chua co du lieu (khong phai loi); phan biet o note de
      // frontend hien dung thong diep, khong bao "loi".
      note: items.length ? null : "Ngày này chưa có dữ liệu lịch (phía cấp nguồn đồng bộ theo ngày, thử lại sau).",
    };
  } catch (e) {
    if (e instanceof VtcaioError && e.status === 404) {
      // Ngoai cua so EPG (hom nay +2 ngay truoc +7 ngay toi): tra rong + note,
      // khong phai 500, khong roi ve fallback CMS gay hieu lam.
      return { ok: true, items: [], note: "Ngày ngoài cửa sổ lịch phát sóng (hôm nay, 2 ngày trước và 7 ngày tới) nên không có dữ liệu." };
    }
    if (e instanceof VtcaioError) return { ok: false, reason: `http_${e.status}`, error: e.message };
    return { ok: false, reason: "fetch_failed", error: e.message };
  }
}

// Giai quyet tham so channel cua API /api/v1/schedule thanh ten kenh vtcaio:
// - Ten kenh cu the (vd PHUTHO): dung luon.
// - "tv"/"radio"/rong: chon kenh RUNNING dau tien cua loai tuong ung (hoac
//   kenh RUNNING dau tien neu khong chi loai).
export async function resolveVtcaioChannelName(channelParam) {
  const ch = await fetchVtcaioChannels();
  if (!ch.ok) return ch;
  const running = ch.items.filter((c) => c.status === "RUNNING" || !c.status);
  if (channelParam && !["tv", "radio"].includes(channelParam)) {
    const found = running.find((c) => c.name.toUpperCase() === String(channelParam).toUpperCase());
    if (found) return { ok: true, items: ch.items, channel: found };
    return { ok: false, reason: "channel_not_found", items: ch.items };
  }
  const kind = channelParam || null;
  const found = running.find((c) => !kind || c.kind === kind) || running[0];
  if (!found) return { ok: false, reason: "no_running_channel", items: ch.items };
  return { ok: true, items: ch.items, channel: found };
}

export async function fetchVtcaioToken(channelName) {
  if (!vtcaioConfigured()) return { ok: false, reason: "not_configured" };
  // Chi cap token cho kenh RUNNING, lay tu danh muc moi nhat (tai lieu muc 8:
  // kenh STOPPED/ERROR hoac sai ten -> khong cap).
  const ch = await fetchVtcaioChannels();
  if (!ch.ok) return ch;
  const found = ch.items.find((c) => c.name.toUpperCase() === String(channelName).toUpperCase());
  if (!found) return { ok: false, reason: "channel_not_found" };
  if (found.status && found.status !== "RUNNING") return { ok: false, reason: "channel_not_running", status: found.status };
  try {
    const json = await fetchVtcaio("/api/hls-tokens", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ channel: found.name, ttlMinutes: 240 }),
    });
    if (!json || !json.token || !json.exp) return { ok: false, reason: "empty_or_unrecognized_format" };
    const token = String(json.token);
    const exp = Number(json.exp);
    // Master la dang khuyen nghi (mot URL, player tu chon muc). Token+exp
    // nam trong chinh URL (chu ky cua link), khong phai partner key.
    const url = `${BASE}/api/hls/${encodeURIComponent(found.name)}/master.m3u8?token=${encodeURIComponent(token)}&exp=${encodeURIComponent(String(exp))}`;
    const originalUrl = joinVtcaioUrl(json.url);
    return { ok: true, channel: found.name, url, exp, originalUrl };
  } catch (e) {
    if (e instanceof VtcaioError) return { ok: false, reason: `http_${e.status}`, error: e.message };
    return { ok: false, reason: "fetch_failed", error: e.message };
  }
}
