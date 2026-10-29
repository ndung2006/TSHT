// TSHT public app — Pha B (2026-10-28): KHONG CON DB.
// App chi phuc vu trang cong khai + proxy sang backend VTCANY (bao in /
// tin bai he moi) va nguon vtcaio (kenh / lich / live / timeshift).
// He cu (so bao, user, kenh/lich noi bo trong PostgreSQL) da go;
// 4 so cu khong migrate sang backend (quyet user 2026-10-28), du lieu
// giu trong DB da stop de khoi phuc khi can. Khong co link file truc
// tiep (A3): PDF/anh bao in moi di qua proxy /api/v2/epaper.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { STORAGE_DIR } from "./lib/db.mjs";
import { createVtcanySession, sessionEntryFromRequest, destroySession, userFromRequest, sessionCookie } from "./lib/auth.mjs";
import { vtcanyAuthEnabled, loginToVtcany, fetchVtcanyMe, mapVtcanyToTshtRole, verifyVtcanySession } from "./lib/vtcany-auth.mjs";
import { fetchVtcaioChannels, fetchVtcaioSchedule, fetchVtcaioToken, resolveVtcaioChannelName, vtcaioConfigured, getAioTimeshiftCoverage, findAioCoverageEntry, fetchAioTimeshiftPlaylist } from "./lib/vtcaio.mjs";
import { fetchVtcanyEpg, fetchVtcanyTimeshift, mapVtcanyTimeline, resolveVtcanyChannelName, vtcanyConfigured, vtcanyApiBase, computeEpgStatus } from "./lib/vtcany.mjs";
import { stitchTimeshiftPlaylists, TIMESHIFT_MAX_MS } from "./lib/timeshift.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, "public");
const VENDOR = {
  "/vendor/page-flip.js": "node_modules/page-flip/dist/js/page-flip.browser.js",
  "/vendor/pdfjs.mjs": "node_modules/pdfjs-dist/build/pdf.mjs",
  "/vendor/pdf.worker.mjs": "node_modules/pdfjs-dist/build/pdf.worker.mjs",
};
const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".pdf": "application/pdf", ".json": "application/json" };


function send(res, code, body, type = "text/plain", extra = {}) {
  res.writeHead(code, { "Content-Type": `${type}; charset=utf-8`, ...extra }); res.end(body);
}
const json = (res, code, obj, extra) => send(res, code, JSON.stringify(obj), "application/json", extra);
const err = (res, code, message) => json(res, code, { error: message });
function serveFile(res, file, downloadName) {
  if (!file) return err(res, 404, "not found");
  fs.readFile(file, (e, data) => {
    if (e) return err(res, 404, "not found");
    const h = downloadName ? { "Content-Disposition": `attachment; filename="${downloadName}"` } : {};
    // Cache: HTML/JS/CSS phai revalidate moi lan mo, neu khong trinh duyet giu
    // ban cu sau redeploy va HTML moi + JS/CSS cu lan nhau se vo trang doc
    // (vi du JS cu crash khi khong tim thay nut mode-flip cua HTML moi).
    if (!downloadName && [".html", ".js", ".mjs", ".css"].includes(path.extname(file))) h["Cache-Control"] = "no-cache, must-revalidate";
    send(res, 200, data, MIME[path.extname(file)] || "application/octet-stream", h);
  });
}
async function readBody(req, limit = 2 * 1024 * 1024) {
  const chunks = []; let n = 0;
  for await (const c of req) { n += c.length; if (n > limit) throw new Error("body qua lon"); chunks.push(c); }
  return Buffer.concat(chunks);
}
async function readJson(req) { return JSON.parse((await readBody(req)).toString("utf8") || "{}"); }
// ---- Doc cong khai bao in he moi (chi so moi tu CMS moi) ----
// TSHT server lam proxy sang backend VTCANY (giong cach trang TV lay
// EPG qua lib/vtcany.mjs): trinh duyet khong bao gio goi thang backend
// moi. Chi so da xuat ban moi duoc backend tra; TSHT chi doi hinh dang
// ve dang cu cua trang /bao-in + trinh doc (khong lo thong tin noi bo).
async function fetchVtcanyEpaperJson(path) {
  const base = vtcanyApiBase();
  if (!base) return { ok: false, reason: "not_configured" };
  try {
    const r = await fetch(base + path, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) });
    const text = await r.text();
    if (!r.ok) return { ok: false, reason: `http_${r.status}`, status: r.status };
    return { ok: true, data: JSON.parse(text) };
  } catch (e) { return { ok: false, reason: "fetch_failed" }; }
}
// Anh bia luu dang duong dan tuong doi (/images/...) thuoc backend: khi
// hien thi phai ghep voi origin cua backend, giong fix ImagePicker ben CMS.
function resolveVtcanyImageUrl(p) {
  if (!p) return "";
  if (/^(https?:)?\/\//.test(p) || p.startsWith("data:")) return p;
  if (!p.startsWith("/")) return p;
  try { return new URL(vtcanyApiBase()).origin + p; } catch { return p; }
}
function newEpaperListItem(it) {
  return {
    issue_number: it.issueNumber, issue_type: it.issueType,
    publish_date: it.publishDate, title: it.title,
    page_count: it.pageCount, status: "published",
    // Anh bia mac dinh = anh trang 1 cua PDF: chi khi so khong co anh
    // bia rieng (coverPath rong) moi tro toi route /cover ben duoi;
    // anh bia do bien tap chon (neu co) luon duoc uu tien.
    cover: it.coverPath ? resolveVtcanyImageUrl(it.coverPath) : `/api/v2/epaper/${it.publicId}/cover`,
    url: `/bao-in/${it.slug}`,
  };
}
function saigonToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
}
function isValidDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || "")) return false;
  const d = new Date(s + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
// Enrich direct-AIO schedule items with timeline status + timeshift
// availability from AIO coverage (cached 60s in lib/vtcaio.mjs). A program
// is replayable only when its channel has coverage AND its start is not
// older than oldestAvailable AND it has already ended. When coverage
// cannot be fetched, replay_available stays false and timeshift_unknown
// is true, so the frontend shows no "no recording" claim it cannot back.
async function enrichDirectAioItems(items, channelName) {
  const cov = await getAioTimeshiftCoverage();
  const coverage = cov.ok ? cov.coverage : null;
  const now = Date.now();
  const out = (items || []).map((p) => {
    const status = computeEpgStatus(p.startTime || null, p.endTime || null, now);
    let replay_available = false;
    if (status === "REPLAY" && coverage) {
      // normalizeProgram does not carry the channel name on the item, so
      // the caller supplies the resolved channel name for coverage lookup.
      const entry = channelName ? findAioCoverageEntry(coverage, channelName) : null;
      const oldest = entry ? new Date(entry.oldestAvailable).getTime() : NaN;
      const s = p.startTime ? new Date(p.startTime).getTime() : NaN;
      replay_available = Boolean(entry) && (!Number.isFinite(oldest) || (Number.isFinite(s) && s >= oldest));
    }
    return {
      ...p,
      status,
      replay_available,
      replay_url: replay_available && p.startTime && p.endTime
        ? `/api/v1/timeshift?channel=${encodeURIComponent(channelName || "")}&start=${encodeURIComponent(p.startTime)}&end=${encodeURIComponent(p.endTime)}`
        : "",
    };
  });
  return { items: out, timeshift_available: out.some((p) => p.replay_available), timeshift_unknown: coverage === null };
}

const NO_RECORDING_MSG = "khoảng giờ này không có bản ghi";

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, "http://localhost");
    let user = userFromRequest(req);
    // Cutover switch, enforced on EVERY route (not just CMS writes):
    // when VTCANY auth is off, a session created by VTCANY login is
    // rejected immediately instead of lingering until its 8h expiry.
    // This makes flag-off an immediate kill-switch
    // and complete: no VTCANY session, old or new, is accepted while
    // the flag is off, including for draft preview via public routes.
    if (user && user.auth_source === "vtcany" && !vtcanyAuthEnabled()) { destroySession(req); user = null; }
    // Public reader: cac GET cong khai (kenh, lich, live, timeshift,
    // bao in / tin bai he moi qua proxy) khong can login. Moi route
    // khac van can login.
    const isPublicRead = (req.method === "GET" && (
      u.pathname === "/api/v1/channels" ||
      u.pathname === "/api/v1/schedule" ||
      u.pathname === "/api/v1/live" ||
      u.pathname === "/api/v1/timeshift" ||
      u.pathname === "/api/v1/timeshift-coverage" ||
      u.pathname === "/api/v2/epaper" ||
      /^\/api\/v2\/epaper\/[0-9a-f]{24}(\/pdf|\/cover|\/pages\/\d+)?$/.test(u.pathname) ||
      u.pathname === "/api/v2/news" ||
      /^\/api\/v2\/news\/[a-z0-9-]+$/.test(u.pathname) ||
      u.pathname === "/api/v2/news-categories" ||
      u.pathname === "/api/v2/distribution" ||
      u.pathname === "/api/v1/auth/me"
    )) || (req.method === "POST" && u.pathname === "/api/v1/stream-token");
    // POST /api/v1/stream-token la public co chu dich: no chi tra link master
    // da ky theo kenh (token+exp trong URL), KHONG BAO GIO tra partner key,
    // va server tu kiem tra kenh RUNNING truoc khi cap.
    const needAuth = u.pathname.startsWith("/api/v1/") && !u.pathname.startsWith("/api/v1/auth/login") && !isPublicRead;
    if (needAuth && !user) return err(res, 401, "chua dang nhap");
    // ---- VTCANY session verification (only for CMS API calls) ----
    // Runs on every needAuth route when the session came from VTCANY,
    // with a 5-minute cache inside verifyVtcanySession(). Public reads
    // are NOT verified here (they must keep working when the backend
    // is down); /api/v1/auth/me returns local session info only.
    // Deny paths, never grant: reauth -> 401 + session destroyed;
    // backend_unreachable -> 503, session kept for retry; forbidden
    // (permissions revoked) -> 403, session kept so a re-grant works.
    // Per-action VTCANY permission checks below (vtcanyDeny) run AFTER
    // this, on top of the existing TSHT role checks — never instead.
    if (needAuth && user && user.auth_source === "vtcany") {
      const entry = sessionEntryFromRequest(req);
      if (!entry) return err(res, 401, "phien VTCANY da het han, vui long dang nhap lai");
      const v = await verifyVtcanySession(entry);
      if (!v.ok && v.reason === "reauth") { destroySession(req); return err(res, 401, "phien VTCANY da het han, vui long dang nhap lai"); }
      if (!v.ok && v.reason === "backend_unreachable") return err(res, 503, "backend VTCANY khong truy cap duoc, khong the xac minh quyen — vui long thu lai sau");
      if (!v.ok && v.reason === "forbidden") return err(res, 403, "tai khoan VTCANY nay khong con quyen bao in");
      if (!v.ok) return err(res, 503, "backend VTCANY khong truy cap duoc, khong the xac minh quyen — vui long thu lai sau");
      user = v.user;
    }
    // VTCANY per-action permission gate (CMS writes only). Returns an
    // error response when the session is VTCANY-backed and lacks the
    // required VTCANY module x action permission; returns null when
    // the check passes OR when the session is old TSHT login (whose
    // role checks below still apply unchanged). This never weakens
    // an existing TSHT check: both gates must pass.

    // ---- Auth (Pha B: chi con dang nhap VTCANY) ----
    // Duong scrypt cu + bang users noi bo da go cung he cu. Co
    // VTCANY_AUTH_ENABLED=0 thi tra 503 thay vi roi ve scrypt.
    // Phien TSHT khong con localId/can_download_pdf tu bang cu:
    // tai PDF goc so MOI do backend phan quyen qua /api/v2/epaper.
    if (req.method === "POST" && u.pathname === "/api/v1/auth/login") {
      const body = await readJson(req);
      if (!vtcanyAuthEnabled()) return err(res, 503, "dang nhap VTCANY chua bat");
      const loginId = String(body.email || body.username || "").trim();
      const password = body.password || "";
      if (!loginId || !password) return err(res, 401, "tai khoan VTCANY khong dung");
      const logged = await loginToVtcany(loginId, password);
      if (!logged.ok && logged.reason === "invalid_credentials") return err(res, 401, "tai khoan VTCANY khong dung");
      if (!logged.ok) return err(res, 503, "backend VTCANY khong truy cap duoc, vui long thu lai sau");
      const me = await fetchVtcanyMe(logged.access_token);
      if (!me.ok && me.reason === "unauthorized") return err(res, 401, "tai khoan VTCANY khong dung");
      if (!me.ok) return err(res, 503, "backend VTCANY khong truy cap duoc, vui long thu lai sau");
      if (me.kind !== "cms") return err(res, 403, "tai khoan nay khong phai tai khoan CMS VTCANY");
      const mappedRole = mapVtcanyToTshtRole(me.kind, me.permissions);
      if (mappedRole === null) return err(res, 403, "tai khoan VTCANY nay chua duoc cap quyen bao in (can cap articles:view tro len trong VTCANY)");
      const { token, user: pub } = createVtcanySession({
        localId: null, username: me.user.username || loginId,
        displayName: me.user.fullName || me.user.username || loginId,
        email: me.user.email || null, mappedRole, canDownloadPdf: false,
        vtcanyUserId: me.user.id || null, vtcanyRole: me.user.role || logged.role || null,
        permissions: me.permissions, accessToken: logged.access_token, refreshToken: logged.refresh_token,
      });
      return json(res, 200, { user: pub }, { "Set-Cookie": sessionCookie(token) });
    }
    if (req.method === "GET" && u.pathname === "/api/v1/auth/me") return json(res, 200, { user });
    if (req.method === "POST" && u.pathname === "/api/v1/auth/logout") {
      destroySession(req);
      return json(res, 200, { ok: true }, { "Set-Cookie": "epaper_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0" });
    }

    // ---- Channels (public list, vtcaio only) ----
    if (u.pathname === "/api/v1/channels") {
      if (req.method === "GET") {
        // Pha B (quyet 2026-10-28: bo han chan DB, loi thi bao loi):
        // nguon duy nhat la vtcaio; loi thi tra danh sach rong kem
        // thong bao loi ro rang, khong tra kenh du phong cu.
        const ext = await fetchVtcaioChannels();
        if (ext.ok) return json(res, 200, { items: ext.items, source: "vtcaio" });
        return json(res, 200, { items: [], source: "none", vtcaio_error: `Nguồn vtcaio hiện không truy cập được (${ext.reason || "fetch_failed"}), vui lòng thử lại sau.` });
      }
    }
    // ---- Phase 2: Stream token (public, xoay link — tai lieu v1.0 muc 4) ----
    // Tra CHI {channel, url (master day du), exp}. Khong tra partner key,
    // khong tra token rieng (token nam trong chinh URL da ky). Server tu
    // kiem tra kenh RUNNING trong danh muc moi nhat truoc khi cap.
    if (req.method === "POST" && u.pathname === "/api/v1/stream-token") {
      const b = await readJson(req).catch(() => ({}));
      const channel = String(b.channel || "").trim().toUpperCase();
      if (!channel || !/^[A-Z0-9_-]+$/.test(channel)) return err(res, 400, "channel khong hop le (ten kenh viet hoa, khong dau)");
      if (!vtcaioConfigured()) return err(res, 503, "vtcaio chua cau hinh (thieu VTCAIO_API_KEY)");
      const t = await fetchVtcaioToken(channel);
      if (!t.ok) {
        if (t.reason === "channel_not_found") return err(res, 404, "kenh khong ton tai trong danh muc vtcaio");
        if (t.reason === "channel_not_running") return err(res, 409, `kenh khong dang phat (status: ${t.status || "?"})`);
        if (t.reason && t.reason.startsWith("http_")) return err(res, Number(t.reason.slice(5)) || 502, "vtcaio tra loi loi khi xin link");
        return err(res, 502, "khong xin duoc link tu vtcaio");
      }
      return json(res, 200, { channel: t.channel, url: t.url, exp: t.exp });
    }

    // ---- Port VTCANY TV: live link, timeshift, coverage (public) ----
    // Live: TSHT tries the VTCANY backend EPG endpoint first (scan-only
    // rotating master link + exp, no JWT needed for the public 24-hex
    // route). ok:false is NOT an error: the frontend then falls back to
    // the existing stream-token (direct AIO mint) / direct flow.
    if (req.method === "GET" && u.pathname === "/api/v1/live") {
      const channel = String(u.searchParams.get("channel") || "").trim().toUpperCase();
      if (!channel || !/^[A-Z0-9_-]+$/.test(channel)) return err(res, 400, "channel khong hop le (ten kenh viet hoa, khong dau)");
      if (vtcanyConfigured()) {
        const epg = await fetchVtcanyEpg(channel, saigonToday());
        if (epg.ok && epg.channel.hls_url) {
          return json(res, 200, { ok: true, source: "vtcany", channel, public_id: epg.public_id, url: epg.channel.hls_url, exp: epg.channel.hls_exp || null });
        }
      }
      return json(res, 200, { ok: false, source: "fallback", channel });
    }

    // Timeshift proxy: VTCANY backend first (it stitches <=6h chunks
    // server-side), direct-AIO fallback second (TSHT stitches here).
    // The browser only ever sees this TSHT URL; segment URLs inside the
    // playlist are absolutised server-side by whichever backend served it.
    if (req.method === "GET" && u.pathname === "/api/v1/timeshift") {
      const channel = String(u.searchParams.get("channel") || "").trim().toUpperCase();
      const startIso = u.searchParams.get("start") || "", endIso = u.searchParams.get("end") || "";
      if (!channel || !/^[A-Z0-9_-]+$/.test(channel)) return err(res, 400, "channel khong hop le (ten kenh viet hoa, khong dau)");
      const start = new Date(startIso).getTime(), end = new Date(endIso).getTime();
      if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) return err(res, 400, "khoang thoi gian khong hop le");
      const now = Date.now(), endClamped = Math.min(end, now);
      if (start >= endClamped) return err(res, 400, "khoang gio nay chua co ban ghi (thoi diem trong tuong lai)");
      if (vtcanyConfigured()) {
        const v = await fetchVtcanyTimeshift(channel, new Date(start).toISOString(), new Date(endClamped).toISOString());
        if (v.ok) return send(res, 200, v.playlist, "application/vnd.apple.mpegurl", { "Cache-Control": "no-store" });
      }
      if (!vtcaioConfigured()) return err(res, 404, NO_RECORDING_MSG);
      const cov = await getAioTimeshiftCoverage();
      const entry = cov.ok ? findAioCoverageEntry(cov.coverage, channel) : null;
      if (entry) {
        const oldest = new Date(entry.oldestAvailable).getTime();
        if (Number.isFinite(oldest) && start < oldest) return err(res, 400, `${NO_RECORDING_MSG} (kenh ${channel} chi co du lieu xem lai tu ${entry.oldestAvailable})`);
      }
      const src = entry && entry.kinds.includes("after") ? "after" : undefined;
      try {
        const chunks = [];
        for (let s = start; s < endClamped; s += TIMESHIFT_MAX_MS) {
          const e = Math.min(s + TIMESHIFT_MAX_MS, endClamped);
          const pl = await fetchAioTimeshiftPlaylist(channel, new Date(s).toISOString(), new Date(e).toISOString(), src);
          if (!pl.ok) {
            if (pl.status === 404 || pl.reason === "http_404") return err(res, 404, NO_RECORDING_MSG);
            return err(res, 502, "khong lay duoc ban ghi xem lai");
          }
          chunks.push({ playlist: pl.playlist, baseUrl: process.env.VTCAIO_API_BASE || "https://luuchieu1.vtcplay.vn" });
        }
        const stitched = stitchTimeshiftPlaylists(chunks);
        return send(res, 200, stitched, "application/vnd.apple.mpegurl", { "Cache-Control": "no-store" });
      } catch (e) {
        if (e && e.status === 404) return err(res, 404, NO_RECORDING_MSG);
        return err(res, 502, "khong lay duoc ban ghi xem lai");
      }
    }

    // Coverage (direct AIO only — the VTCANY backend exposes no public
    // coverage endpoint). available:null means "unknown", not "no".
    if (req.method === "GET" && u.pathname === "/api/v1/timeshift-coverage") {
      const channel = String(u.searchParams.get("channel") || "").trim().toUpperCase();
      if (!channel) return err(res, 400, "channel khong hop le");
      if (!vtcaioConfigured()) return json(res, 200, { channel, available: null, source: "aio", reason: "not_configured" });
      const cov = await getAioTimeshiftCoverage();
      if (!cov.ok) return json(res, 200, { channel, available: null, source: "aio", reason: cov.reason || "fetch_failed" });
      const entry = findAioCoverageEntry(cov.coverage, channel);
      return json(res, 200, { channel, available: Boolean(entry), oldestAvailable: entry ? entry.oldestAvailable : null, kinds: entry ? entry.kinds : [], source: "aio" });
    }

    // ---- Schedule (public list, backend VTCANY -> vtcaio) ----
    if (u.pathname === "/api/v1/schedule") {
      if (req.method === "GET") {
        const date = u.searchParams.get("date") || saigonToday();
        const channel = u.searchParams.get("channel") || "";
        if (!isValidDate(date)) return err(res, 400, "date khong hop le (YYYY-MM-DD)");
        // channel o day la TEN KENH vtcaio (vd PHUTHO) hoac "tv"/"radio"/rong
        // (chon kenh RUNNING dau tien cua loai do). Khong gioi han tv|radio
        // nua vi so kenh vtcaio co the nhieu hon 2.
        // Thu tu nguon lich: 1) backend VTCANY (EPG timeline
        // + replay_url that), 2) vtcaio truc tiep (EPG + coverage).
        // VTCANY tra timeline rong thi roi xuong nguon 2 thay vi
        // tra rong ngay, vi kenh co the chua co EPG trong VTCANY nhung co
        // tren AIO. Chi khi VTCANY loi fetch moi kem canh bao fallback.
        let vtcanyFailed = false;
        if (vtcanyConfigured()) {
          const resolvedV = await resolveVtcanyChannelName(channel);
          if (resolvedV.ok) {
            const epgV = await fetchVtcanyEpg(resolvedV.channel.name, date);
            if (epgV.ok) {
              const itemsV = mapVtcanyTimeline(epgV.timeline, resolvedV.channel.name);
              if (itemsV.length) {
                return json(res, 200, { date, channel: resolvedV.channel.name, channel_kind: resolvedV.channel.kind, items: itemsV, source: "vtcany", epg_source: epgV.epg_source, timeshift_available: itemsV.some((p) => p.replay_available), timeshift_unknown: false, epg_note: null, fallback_warning: null });
              }
            } else if (epgV.reason !== "not_configured") {
              vtcanyFailed = true;
            }
          } else if (resolvedV.reason !== "not_configured" && resolvedV.reason !== "channel_not_found") {
            vtcanyFailed = true;
          }
        }
        const fallbackWarning = vtcanyFailed ? "Backend VTCANY hiện không truy cập được, đang dùng nguồn trực tiếp / lịch dự phòng." : null;
        // Nguon 2: vtcaio EPG (neu da cau hinh); loi -> tra rong kem bao loi.
        if (vtcaioConfigured()) {
          const resolved = await resolveVtcaioChannelName(channel);
          if (resolved.ok) {
            const ext = await fetchVtcaioSchedule(date, resolved.channel.name);
            if (ext.ok) {
              const enriched = await enrichDirectAioItems(ext.items, resolved.channel.name);
              return json(res, 200, { date, channel: resolved.channel.name, channel_kind: resolved.channel.kind, items: enriched.items, source: "vtcaio", epg_note: ext.note || null, timeshift_available: enriched.timeshift_available, timeshift_unknown: enriched.timeshift_unknown, fallback_warning: fallbackWarning });
            }
            return json(res, 200, { date, channel: resolved.channel.name, items: [], source: "none", vtcaio_error: `Nguồn vtcaio hiện không truy cập được (${ext.reason}), vui lòng thử lại sau.`, fallback_warning: fallbackWarning, timeshift_available: false, timeshift_unknown: false });
          }
          if (resolved.reason === "channel_not_found") return err(res, 404, "kenh khong ton tai trong danh muc vtcaio");
          // no_running_channel / fetch loi: Pha B khong con DB noi bo
          // nen tra rong kem bao loi (quyet 2026-10-28).
          return json(res, 200, { date, channel: channel || null, items: [], source: "none", vtcaio_error: `Nguồn vtcaio hiện không truy cập được (${resolved.reason}), vui lòng thử lại sau.`, fallback_warning: fallbackWarning, timeshift_available: false, timeshift_unknown: false });
        }
        // Pha B: vtcaio chua cau hinh va khong con DB noi bo.
        return json(res, 200, { date, channel: channel || null, items: [], source: "none", vtcaio_error: "vtcaio chưa cấu hình, không lấy được lịch phát sóng.", fallback_warning: fallbackWarning, timeshift_available: false, timeshift_unknown: false });
      }
    }
    // ---- Doc cong khai bao in he moi qua proxy (chi so moi) ----
    // GET /api/v2/epaper?page&type&q&date — danh sach so da xuat ban
    // cua he moi, tra ve dang cu cua /bao-in (15 so/trang). Backend
    // moi khong co loc theo ngay, nen TSHT lay toi da 100 so roi loc
    // ngay + phan trang tai day (he moi hien chi co vai so, du dung).
    if (req.method === "GET" && u.pathname === "/api/v2/epaper") {
      const page = Math.max(1, Number(u.searchParams.get("page") || 1));
      const type = u.searchParams.get("type") || "";
      const q = (u.searchParams.get("q") || "").trim();
      const date = u.searchParams.get("date") || "";
      const bq = new URLSearchParams({ page: "1", limit: "100" });
      if (type === "thuong" || type === "vung_cao") bq.set("issueType", type);
      if (q) bq.set("q", q);
      const ext = await fetchVtcanyEpaperJson(`/epaper?${bq}`);
      if (!ext.ok) return err(res, ext.reason === "not_configured" ? 503 : 502, "khong lay duoc danh sach bao in he moi");
      let items = (ext.data.data || []).map(newEpaperListItem);
      if (date) items = items.filter((it) => it.publish_date === date);
      const per = 15, total = items.length;
      const total_pages = Math.max(1, Math.ceil(total / per));
      const p = Math.min(page, total_pages);
      return json(res, 200, { items: items.slice((p - 1) * per, p * per), total, page: p, total_pages });
    }
    const newEpaperMatch = u.pathname.match(/^\/api\/v2\/epaper\/([0-9a-f]{24})(\/pdf|\/cover|\/pages\/\d+)?$/);
    if (newEpaperMatch && req.method === "GET") {
      const publicId = newEpaperMatch[1];
      if (newEpaperMatch[2] === "/cover") {
        // Anh bia mac dinh: render trang 1 cua PDF bang pdftoppm (co
        // san trong container TSHT, giong cach he cu render trang).
        // CHI RENDER 1 LAN: anh render xong duoc luu vao
        // STORAGE_DIR/epaper-covers/<publicId>.jpg va phuc vu lai tu
        // disk cho cac lan sau, kem Cache-Control 1 ngay cho trinh
        // duyet/CDN. Truoc day moi lan goi deu tai lai PDF + render
        // lai (do thuc te 7-26s/anh, so 319 con timeout 30s) nen trang
        // /bao-in load rat cham. Cache co TTL 24h theo mtime: qua 24h
        // thi render lai 1 lan, de anh bia khong ket vinh vien neu PDF
        // cua so duoc thay sau. Loi render khong duoc cache. Neu thu
        // muc cache ghi khong duoc (storage chi doc), code tu roi ve
        // hanh vi cu (render moi lan) thay vi loi.
        const base = vtcanyApiBase();
        if (!base) return err(res, 503, "backend bao in moi chua cau hinh");
        const coverDir = path.join(STORAGE_DIR, "epaper-covers");
        const cachePath = path.join(coverDir, `${publicId}.jpg`);
        const COVER_TTL_MS = 24 * 60 * 60 * 1000;
        try {
          const st = fs.statSync(cachePath);
          if (st.size > 0 && Date.now() - st.mtimeMs < COVER_TTL_MS) {
            const buf = fs.readFileSync(cachePath);
            res.writeHead(200, { "Content-Type": "image/jpeg", "Content-Length": buf.length, "Cache-Control": "public, max-age=86400" });
            return res.end(buf);
          }
        } catch {}
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "epaper-cover-"));
        try {
          const r = await fetch(`${base}/epaper/${publicId}/pdf`, { signal: AbortSignal.timeout(30000) });
          if (!r.ok) return err(res, r.status === 404 ? 404 : 502, "khong lay duoc file PDF");
          const pdfPath = path.join(tmpDir, "issue.pdf");
          fs.writeFileSync(pdfPath, Buffer.from(await r.arrayBuffer()));
          await new Promise((resolve, reject) => execFile("pdftoppm", ["-jpeg", "-r", "100", "-f", "1", "-l", "1", pdfPath, path.join(tmpDir, "page")], (e) => e ? reject(e) : resolve()));
          const jpg = fs.readdirSync(tmpDir).filter((f) => f.endsWith(".jpg")).sort()[0];
          if (!jpg) return err(res, 502, "khong render duoc anh bia");
          const buf = fs.readFileSync(path.join(tmpDir, jpg));
          try {
            fs.mkdirSync(coverDir, { recursive: true });
            const tmpCache = path.join(coverDir, `.${publicId}.${process.pid}.tmp`);
            fs.writeFileSync(tmpCache, buf);
            fs.renameSync(tmpCache, cachePath);
          } catch {}
          res.writeHead(200, { "Content-Type": "image/jpeg", "Content-Length": buf.length, "Cache-Control": "public, max-age=86400" });
          return res.end(buf);
        } catch (e) { return err(res, 502, "khong render duoc anh bia"); }
        finally { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {} }
      }
      if (newEpaperMatch[2] && newEpaperMatch[2].startsWith("/pages/")) {
        // Anh trang render san phia server (Hybrid): proxy thang anh
        // JPEG tu backend (backend render lazy + cache tren storage
        // ben vung). Trang dau tai ve la doc duoc ngay, khong can
        // cho tai het PDF 10MB + dung bang PDF.js nhu truoc.
        const base = vtcanyApiBase();
        if (!base) return err(res, 503, "backend bao in moi chua cau hinh");
        const pn = newEpaperMatch[2].slice("/pages/".length);
        try {
          const r = await fetch(`${base}/epaper/${publicId}/pages/${pn}`, { signal: AbortSignal.timeout(30000) });
          if (!r.ok) return err(res, r.status === 404 ? 404 : 502, "khong lay duoc anh trang");
          const buf = Buffer.from(await r.arrayBuffer());
          res.writeHead(200, { "Content-Type": "image/jpeg", "Content-Length": buf.length, "Cache-Control": "public, max-age=86400" });
          return res.end(buf);
        } catch (e) { return err(res, 502, "khong lay duoc anh trang"); }
      }
      if (newEpaperMatch[2] === "/pdf") {
        // Stream PDF goc qua proxy (PDF.js doc truc tiep; khong co nut
        // tai PDF goc o trinh doc cong khai vi khong co login).
        const base = vtcanyApiBase();
        if (!base) return err(res, 503, "backend bao in moi chua cau hinh");
        try {
          const r = await fetch(`${base}/epaper/${publicId}/pdf`, { signal: AbortSignal.timeout(30000) });
          if (!r.ok) return err(res, r.status === 404 ? 404 : 502, "khong lay duoc file PDF");
          const buf = Buffer.from(await r.arrayBuffer());
          res.writeHead(200, { "Content-Type": "application/pdf", "Content-Length": buf.length });
          return res.end(buf);
        } catch (e) { return err(res, 502, "khong lay duoc file PDF"); }
      }
      const ext = await fetchVtcanyEpaperJson(`/epaper/${publicId}`);
      if (!ext.ok) return err(res, ext.status === 404 ? 404 : 502, "khong tim thay so bao");
      const it = ext.data;
      // Hybrid: neu backend dem duoc so trang that cua PDF thi tra danh
      // sach URL anh trang render san — trinh doc mo sach ngay tu anh
      // server, khong tai PDF, khong dung bang PDF.js o muc fit.
      // pages rong = backend chua co anh (hoac dem loi) => trinh doc
      // fallback ve PDF.js tien trinh nhu cu. Chan 200 de khoi tra mang
      // URL khong lo neu PDF loi bat thuong.
      const pdfCount = Number(it.pdfPageCount) || 0;
      const pages = [];
      if (pdfCount > 0) {
        const ver = it.pageVersion ? `?v=${encodeURIComponent(it.pageVersion)}` : "";
        const n = Math.min(pdfCount, 200);
        for (let pn = 1; pn <= n; pn++) {
          const url = `/api/v2/epaper/${publicId}/pages/${pn}${ver}`;
          pages.push({ page_number: pn, pdf_page_number: pn, is_cover: pn === 1, is_padding: false, flip: url, thumb: url });
        }
      }
      return json(res, 200, { ...newEpaperListItem(it), id: it.publicId, can_download: false, pdf_url: `/api/v2/epaper/${publicId}/pdf`, pages });
    }

    // ---- Tin bai he moi qua proxy (chi bai da xuat ban) ----
    // GET /api/v2/news?page&limit&category&q&featured — danh sach bai
    // da xuat ban cua he moi (backend tu loc publishAt <= now).
    // GET /api/v2/news/:slug — chi tiet + related cung chuyen muc.
    // GET /api/v2/news-categories — cay chuyen muc hien.
    // Anh bia tuong doi (/images/...) duoc ghep origin backend nhu bao in.
    function newsListItem(it) {
      return {
        slug: it.slug, title: it.title, sapo: it.sapo,
        cover: it.coverPath ? resolveVtcanyImageUrl(it.coverPath) : "",
        category: it.category || null, authors: it.authors || [], tags: it.tags || [],
        publishAt: it.publishAt, isFeatured: !!it.isFeatured,
        url: `/tin/${it.slug}`,
      };
    }
    if (req.method === "GET" && u.pathname === "/api/v2/news") {
      const bq = new URLSearchParams();
      for (const k of ["page", "limit", "category", "q", "featured"]) {
        const v = u.searchParams.get(k);
        if (v) bq.set(k, v);
      }
      const ext = await fetchVtcanyEpaperJson(`/news?${bq}`);
      if (!ext.ok) return err(res, ext.reason === "not_configured" ? 503 : 502, "khong lay duoc danh sach tin bai");
      const d = ext.data || {};
      const items = (d.data || []).map(newsListItem);
      const per = Math.max(1, Number(d.limit) || 20);
      return json(res, 200, { items, total: d.total || 0, page: d.page || 1, total_pages: Math.max(1, Math.ceil((d.total || 0) / per)) });
    }
    const newsSlugMatch = u.pathname.match(/^\/api\/v2\/news\/([a-z0-9-]+)$/);
    if (req.method === "GET" && newsSlugMatch) {
      const ext = await fetchVtcanyEpaperJson(`/news/${newsSlugMatch[1]}`);
      if (!ext.ok) return err(res, ext.status === 404 ? 404 : 502, "khong tim thay bai viet");
      const it = ext.data;
      return json(res, 200, { ...newsListItem(it), body: it.body || "", related: (it.related || []).map(newsListItem) });
    }
    if (req.method === "GET" && u.pathname === "/api/v2/news-categories") {
      const ext = await fetchVtcanyEpaperJson(`/news-categories`);
      if (!ext.ok) return err(res, ext.reason === "not_configured" ? 503 : 502, "khong lay duoc chuyen muc");
      return json(res, 200, { data: ext.data || [] });
    }

    // ---- Doc cong khai phan phoi da nen tang (giai doan 2) ----
    // GET /api/v2/distribution — chi bai published tu backend (backend tu
    // loc; proxy chi ghep origin backend cho media tuong doi nhu tin bai).
    if (req.method === "GET" && u.pathname === "/api/v2/distribution") {
      const bq = new URLSearchParams();
      for (const k of ["page", "limit", "platform"]) {
        const v = u.searchParams.get(k);
        if (v) bq.set(k, v);
      }
      const ext = await fetchVtcanyEpaperJson(`/distribution?${bq}`);
      if (!ext.ok) return err(res, ext.reason === "not_configured" ? 503 : 502, "khong lay duoc danh sach phan phoi");
      const d = ext.data || {};
      const items = (d.data || []).map((it) => ({
        publicId: it.publicId, title: it.title, caption: it.caption || "",
        media: it.mediaUrl ? resolveVtcanyImageUrl(it.mediaUrl) : "",
        mediaType: it.mediaType || "image", publishedAt: it.publishedAt,
        targets: (it.targets || []).map((t) => ({ platform: t.platform, status: t.status, url: t.url || null })),
      }));
      return json(res, 200, { items, total: d.total || 0, page: d.page || 1, limit: d.limit || 20 });
    }

    // ---- Health check (Coolify/Docker): khong can DB, khong can login.
    if (u.pathname === "/health") return json(res, 200, { ok: true, service: "epaper-phase1" });

    // ---- Static ----
    if (VENDOR[u.pathname]) return serveFile(res, path.join(ROOT, VENDOR[u.pathname]));
    // Homepage frame (public/home.html) at /, e-paper list stays at /bao-in
    // (public/index.html, unchanged). All other routes below are untouched.
    if (u.pathname === "/") return serveFile(res, path.join(PUBLIC, "home.html"));
    if (u.pathname === "/bao-in") return serveFile(res, path.join(PUBLIC, "index.html"));
    if (u.pathname === "/truyen-hinh") return serveFile(res, path.join(PUBLIC, "tv.html"));
    if (u.pathname === "/phat-thanh") return serveFile(res, path.join(PUBLIC, "radio.html"));
    if (u.pathname === "/lich-phat-song") return serveFile(res, path.join(PUBLIC, "schedule.html"));
    if (u.pathname === "/nen-tang-so") return serveFile(res, path.join(PUBLIC, "nen-tang-so.html"));
    if (u.pathname === "/login.html" || u.pathname === "/admin.html") return serveFile(res, path.join(PUBLIC, u.pathname.slice(1)));
    if (/^\/bao-.*\.html$/.test(u.pathname)) return serveFile(res, path.join(PUBLIC, "reader.html"));
    if (/^\/bao-in\/bao-tuyen-quang-so-\d+-[0-9a-f]{24}$/.test(u.pathname)) return serveFile(res, path.join(PUBLIC, "reader.html"));
    if (/^\/tin\/[a-z0-9-]+$/.test(u.pathname)) return serveFile(res, path.join(PUBLIC, "article.html"));
    if (/^\/chuyen-muc\/[a-z0-9-]+$/.test(u.pathname)) return serveFile(res, path.join(PUBLIC, "category.html"));
    // A3: never serve sample assets or storage directly; content only via /api routes above.
    if (u.pathname.startsWith("/assets/") || u.pathname.startsWith("/storage/")) return err(res, 404, "not found");
    const file = path.join(PUBLIC, decodeURIComponent(u.pathname));
    if (!file.startsWith(PUBLIC)) return err(res, 403, "Forbidden");
    return serveFile(res, file);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) err(res, 500, e.message || "loi server");
  }
});

const PORT = Number(process.env.PORT || 3000);
// Pha B (2026-10-28): app khong con DB, khoi dong thang, khong migration.
server.listen(PORT, () => console.log(`TSHT (khong DB): http://localhost:${PORT}/bao-in`));
