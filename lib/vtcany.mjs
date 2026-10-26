// Port (translated, not copied) of VTCANY backend TV/playback logic for TSHT.
// Sources in ~/workspace/vtcany (read-only):
//   backend/src/modules/tv/tv.controller.ts — public routes:
//     GET  /api/v1/channels
//     GET  /api/v1/channels/{publicId}/epg?date=YYYY-MM-DD
//     GET  /api/v1/channels/{publicId}/timeshift.m3u8?start=ISO&end=ISO
//   backend/src/modules/tv/tv.service.ts — epg(): scan-only hls_url + hls_exp,
//     timeline with LIVE/UPCOMING/REPLAY status, replay_url only for REPLAY
//     items when timeshift is enabled / coverage exists.
//   backend/src/modules/tv/tv.catalog.ts — channelPublicId():
//     sha256("tv-channel:" + NAME.toUpperCase()).hex.slice(0, 24)
//   backend/src/modules/playback/aio-client.ts — mapEpgSchedule() status rule
//     and refreshEpgStatus() in tv.service.ts (same rule, recomputed at read
//     time, never trusted from a cached timeline).
//   backend/src/modules/playback/playback.controller.ts — POST /api/v1/playback/token
//     and GET /api/v1/playback/channels are JWT-guarded and are therefore NOT
//     used here: TSHT readers are anonymous, so only the public routes above
//     are used. There is NO public coverage endpoint on the VTCANY backend;
//     coverage is only available via the direct-AIO fallback (lib/vtcaio.mjs).
//
// Config (env only, no secret in code — the VTCANY backend holds its own
// AIO partner key; TSHT never sends or receives one for this backend):
//   VTCANY_API_BASE — default https://vtcany-api.vtctech.xyz (trailing slash
//     and an optional trailing "/api/v1" are stripped/normalised).
//   Set VTCANY_API_BASE="" to disable the VTCANY-first attempt entirely
//   (TSHT then uses only the direct-AIO adapter, as before).
// Browser NEVER calls this backend directly; all calls go through TSHT server.

import { createHash } from "node:crypto";

export function vtcanyApiBase() {
  const raw = (process.env.VTCANY_API_BASE || "https://vtcany-api.vtctech.xyz").trim();
  if (!raw) return "";
  const noSlash = raw.replace(/\/+$/, "");
  return noSlash.endsWith("/api/v1") ? noSlash : noSlash + "/api/v1";
}

export function vtcanyConfigured() { return Boolean(vtcanyApiBase()); }

// Port of channelPublicId() (tv.catalog.ts). TSHT identifies channels by
// uppercase NAME; VTCANY public routes identify them by this 24-hex id.
export function channelPublicId(name) {
  return createHash("sha256").update(`tv-channel:${String(name || "").toUpperCase()}`).digest("hex").slice(0, 24);
}

// EPG status rule, identical in mapEpgSchedule() and refreshEpgStatus():
// start in the future -> UPCOMING; end in the past -> REPLAY; otherwise LIVE.
// An item without a parseable start is treated as LIVE (it is on now, or
// its bounds are unknown) rather than dropped.
export function computeEpgStatus(startIso, endIso, nowMs = Date.now()) {
  const s = startIso ? new Date(startIso).getTime() : NaN;
  const e = endIso ? new Date(endIso).getTime() : NaN;
  if (Number.isFinite(s) && s > nowMs) return "UPCOMING";
  if (Number.isFinite(e) && e < nowMs) return "REPLAY";
  return "LIVE";
}

const saigonTimeFmt = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Ho_Chi_Minh",
});
export function saigonHHMM(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return String(iso).slice(11, 16) || "";
  return saigonTimeFmt.format(d);
}

async function fetchVtcany(path, { timeoutMs = 8000, accept = "application/json" } = {}) {
  const base = vtcanyApiBase();
  if (!base) return { ok: false, reason: "not_configured" };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(base + path, { headers: { Accept: accept }, signal: ctrl.signal });
    const text = await r.text();
    if (!r.ok) return { ok: false, reason: `http_${r.status}`, status: r.status, body: text.slice(0, 300) };
    return { ok: true, status: r.status, text };
  } catch (e) {
    return { ok: false, reason: "fetch_failed", error: e.message };
  } finally { clearTimeout(timer); }
}

function parseJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

// GET /api/v1/channels -> { groups: [{ name, channels: [{ public_id, name,
// logo, audio_only, banner_url }] }] }. Flattened to TSHT channel shape.
export async function fetchVtcanyGroups() {
  const res = await fetchVtcany("/channels");
  if (!res.ok) return res;
  const json = parseJson(res.text);
  const groups = json && Array.isArray(json.groups) ? json.groups : [];
  const items = [];
  for (const g of groups) {
    for (const c of (g.channels || [])) {
      if (!c || !c.name) continue;
      items.push({
        name: String(c.name),
        public_id: c.public_id || channelPublicId(c.name),
        kind: c.audio_only ? "radio" : "tv",
        status: "RUNNING",
        live: true,
        logo: c.logo || null,
        banner_url: c.banner_url || null,
      });
    }
  }
  return { ok: true, items, groups: groups.map((g) => g.name) };
}

// Resolve a TSHT schedule channel param to a VTCANY channel name:
// explicit NAME -> itself; "tv"/"radio"/"" -> first channel of that kind
// from the VTCANY groups (same rule TSHT already uses for direct AIO).
export async function resolveVtcanyChannelName(channelParam) {
  const groups = await fetchVtcanyGroups();
  if (!groups.ok) return groups;
  const param = String(channelParam || "").trim();
  if (param && !["tv", "radio"].includes(param.toLowerCase())) {
    const found = groups.items.find((c) => c.name.toUpperCase() === param.toUpperCase());
    if (!found) return { ok: false, reason: "channel_not_found", items: groups.items };
    return { ok: true, channel: found, items: groups.items };
  }
  const kind = param ? param.toLowerCase() : null;
  const found = groups.items.find((c) => !kind || c.kind === kind) || groups.items[0];
  if (!found) return { ok: false, reason: "no_running_channel", items: groups.items };
  return { ok: true, channel: found, items: groups.items };
}

// GET /api/v1/channels/{publicId}/epg?date= — public for a 24-hex id.
// Returns the raw VTCANY payload pieces TSHT needs, unmodified except for
// a recomputed status (see mapVtcanyTimeline).
export async function fetchVtcanyEpg(channelName, date) {
  const publicId = channelPublicId(channelName);
  const res = await fetchVtcany(`/channels/${publicId}/epg?date=${encodeURIComponent(date)}`);
  if (!res.ok) return res;
  const json = parseJson(res.text);
  if (!json || !json.channel) return { ok: false, reason: "empty_or_unrecognized_format" };
  return {
    ok: true,
    public_id: publicId,
    channel: json.channel,
    epg_source: json.epg_source || null,
    timeline: Array.isArray(json.timeline) ? json.timeline : [],
  };
}

// Map a VTCANY timeline to TSHT schedule items (same shape as
// lib/vtcaio.mjs normalizeProgram, plus status + replay fields).
// replay_url from VTCANY is relative to the VTCANY API base
// ("/channels/{id}/timeshift.m3u8?..."); TSHT rewrites it to its own
// proxy "/api/v1/timeshift?channel=NAME&start=ISO&end=ISO" so the browser
// never learns the VTCANY backend layout or any key, and so the TSHT
// server can fall back to direct AIO if the VTCANY timeshift call fails.
export function mapVtcanyTimeline(timeline, channelName, nowMs = Date.now()) {
  const items = [];
  for (const it of timeline || []) {
    if (!it || !it.title) continue;
    const startIso = it.startIso || null;
    const endIso = it.endIso || null;
    const status = computeEpgStatus(startIso, endIso, nowMs);
    const replayable = Boolean(it.replay_url) && status === "REPLAY";
    items.push({
      title: String(it.title),
      start_time: it.time || saigonHHMM(startIso),
      end_time: saigonHHMM(endIso),
      startTime: startIso,
      endTime: endIso,
      status,
      replay_url: replayable
        ? `/api/v1/timeshift?channel=${encodeURIComponent(channelName)}&start=${encodeURIComponent(startIso)}&end=${encodeURIComponent(endIso)}`
        : "",
      replay_available: replayable,
      description: "",
    });
  }
  items.sort((a, b) => (a.startTime || "") < (b.startTime || "") ? -1 : 1);
  return items;
}

// GET /api/v1/channels/{publicId}/timeshift.m3u8?start=ISO&end=ISO — public,
// VOD playlist, segments already absolutised by the VTCANY backend.
// Returns { ok, playlist } or { ok:false, reason, status }.
export async function fetchVtcanyTimeshift(channelName, startIso, endIso) {
  const publicId = channelPublicId(channelName);
  const q = `start=${encodeURIComponent(startIso)}&end=${encodeURIComponent(endIso)}`;
  const res = await fetchVtcany(`/channels/${publicId}/timeshift.m3u8?${q}`, { timeoutMs: 30000, accept: "application/vnd.apple.mpegurl" });
  if (!res.ok) return res;
  if (!res.text.includes("#EXTM3U")) return { ok: false, reason: "not_a_playlist" };
  return { ok: true, playlist: res.text };
}
