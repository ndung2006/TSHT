// Stage 2 server: DB that (B3/B4) + CMS dang/duyet (B2/D1-D6) + auth (H1/H2).
// Stage 1 prototype data is GONE: every issue now comes from PostgreSQL
// epaper_phase1. Sample-only issue 321 is therefore NOT listed (it was
// never in the DB); its 9-page sample PDF is still the upload test file.
// Node stdlib HTTP + pg only. No public direct file links (A3): every
// page image / PDF goes through an /api/v1/issues/:id/... route that
// checks login + visibility first. The original PDF path is never sent
// to readers (B4); only its authenticated download route exists (B5).
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { pool, STORAGE_DIR, resolveStoragePath, storageRelForIssue } from "./lib/db.mjs";
import { hashPassword, verifyPassword, createSession, createVtcanySession, sessionEntryFromRequest, destroySession, userFromRequest, sessionCookie, isStaff, isAdmin, canReview } from "./lib/auth.mjs";
import { vtcanyAuthEnabled, loginToVtcany, fetchVtcanyMe, mapVtcanyToTshtRole, hasVtcanyPermission, verifyVtcanySession } from "./lib/vtcany-auth.mjs";
import { pdfPageCount, renderIssuePages } from "./lib/worker.mjs";
import { fetchVtcaioChannels, fetchVtcaioSchedule, fetchVtcaioToken, resolveVtcaioChannelName, vtcaioConfigured, getAioTimeshiftCoverage, findAioCoverageEntry, fetchAioTimeshiftPlaylist } from "./lib/vtcaio.mjs";
import { fetchVtcanyEpg, fetchVtcanyTimeshift, mapVtcanyTimeline, resolveVtcanyChannelName, vtcanyConfigured, computeEpgStatus } from "./lib/vtcany.mjs";
import { stitchTimeshiftPlaylists, TIMESHIFT_MAX_MS } from "./lib/timeshift.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, "public");
const VENDOR = {
  "/vendor/page-flip.js": "node_modules/page-flip/dist/js/page-flip.browser.js",
  "/vendor/pdfjs.mjs": "node_modules/pdfjs-dist/build/pdf.mjs",
  "/vendor/pdf.worker.mjs": "node_modules/pdfjs-dist/build/pdf.worker.mjs",
};
const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".pdf": "application/pdf", ".json": "application/json" };
const ISSUE_TYPES = ["thuong", "vung_cao"];
const CHECK_FIELDS = ["check_number_date", "check_open_fast", "check_flip_all_pages", "check_zoom_title_clear", "check_thumbnails_full", "check_mobile_ok"];

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
function splitBuffer(buf, sep) {
  const out = []; let start = 0, i;
  while ((i = buf.indexOf(sep, start)) !== -1) { out.push(buf.subarray(start, i)); start = i + sep.length; }
  out.push(buf.subarray(start)); return out;
}
// Minimal multipart parser (one PDF file + text fields). Good enough for
// the CMS upload form; it is NOT a general-purpose parser.
async function readMultipart(req) {
  const ct = req.headers["content-type"] || "";
  const m = ct.match(/boundary=(.+)/);
  if (!m) throw new Error("thieu multipart boundary");
  const boundary = Buffer.from("--" + m[1].trim());
  const parts = splitBuffer(await readBody(req, 300 * 1024 * 1024), boundary);
  const fields = {}, files = {};
  for (const part of parts) {
    if (part.length < 4 || part.subarray(0, 2).toString() !== "\r\n") continue;
    const headEnd = part.indexOf("\r\n\r\n");
    if (headEnd === -1) continue;
    const head = part.subarray(2, headEnd).toString("utf8");
    const name = (head.match(/name="([^"]+)"/) || [])[1];
    const filename = (head.match(/filename="([^"]*)"/) || [])[1];
    if (!name) continue;
    const body = part.subarray(headEnd + 4, part.length - 2); // strip trailing CRLF
    if (filename) files[name] = { filename, data: Buffer.from(body) };
    else fields[name] = body.toString("utf8");
  }
  return { fields, files };
}
async function audit(client, actorId, entityType, entityId, action, details = {}) {
  await client.query("INSERT INTO audit_logs (actor_id, entity_type, entity_id, action, details) VALUES ($1,$2,$3,$4,$5)",
    [actorId, entityType, entityId, action, details]);
}
function slugFor(number, id) { return `bao-tuyen-quang-so-${number}-${id}.html`; }
function coverUrl(it) { return `/api/v1/issues/${it.id}/cover`; }
function pageUrls(issueId, p) {
  return { flip: `/api/v1/issues/${issueId}/pages/${p.page_number}/flip`, thumb: `/api/v1/issues/${issueId}/pages/${p.page_number}/thumb` };
}
async function issuePages(client, issueId) {
  const r = await client.query("SELECT * FROM issue_pages WHERE issue_id=$1 ORDER BY page_number", [issueId]);
  return r.rows.map((p) => ({ page_number: p.page_number, pdf_page_number: p.pdf_page_number, is_cover: p.is_cover, is_padding: p.is_padding, ...pageUrls(issueId, p) }));
}
async function checklist(client, issueId) {
  const r = await client.query("SELECT * FROM publication_checklists WHERE issue_id=$1", [issueId]);
  return r.rows[0] || null;
}
async function latestJob(client, issueId) {
  const r = await client.query("SELECT * FROM processing_jobs WHERE issue_id=$1 ORDER BY created_at DESC LIMIT 1", [issueId]);
  return r.rows[0] || null;
}
function canView(user, issue) {
  if (issue.status === "published") return true;
  if (!user) return false; // public chi duoc xem so da xuat ban; nhap/cho duyet can login + quyen
  if (isAdmin(user) || user.role === "reviewer") return true;
  return user.role === "publisher" && issue.created_by === user.id; // B6: preview own drafts only
}
async function loadIssue(client, id) {
  const r = await client.query("SELECT * FROM issues WHERE id=$1", [id]);
  return r.rows[0] || null;
}
function toListItem(it) {
  return { id: it.id, issue_number: it.issue_number, issue_type: it.issue_type, publish_date: it.publish_date instanceof Date ? it.publish_date.toISOString().slice(0, 10) : it.publish_date, title: it.title, page_count: it.page_count, status: it.status, published_at: it.published_at, scheduled_publish_at: it.scheduled_publish_at, cover: coverUrl(it), url: `/${it.slug}` };
}
async function doPublish(client, issue, actorId) {
  await client.query("UPDATE issues SET status='published', published_at=now(), unpublished_at=NULL WHERE id=$1", [issue.id]);
  await audit(client, actorId, "issue", issue.id, "publish", { from: issue.status, to: "published" });
}
// D3 scheduler: pending_review + scheduled time reached + checklist done -> publish.
async function runScheduled() {
  const client = await pool.connect();
  try {
    const r = await client.query("SELECT * FROM issues WHERE status='pending_review' AND scheduled_publish_at IS NOT NULL AND scheduled_publish_at <= now()");
    for (const issue of r.rows) {
      const cl = await checklist(client, issue.id);
      if (cl && cl.all_checked && issue.page_count > 0) {
        await client.query("BEGIN");
        try { await doPublish(client, issue, null); await client.query("COMMIT"); }
        catch (e) { await client.query("ROLLBACK"); console.error("scheduled publish failed", issue.id, e.message); }
      }
    }
  } finally { client.release(); }
}
setInterval(runScheduled, 60 * 1000).unref();
runScheduled().catch((e) => console.error("scheduled init", e.message));

// ---- Phase 2: TV/Radio + Lich phat song ----
// Auto-migration idempotent: chay moi lan khoi dong, an toan khi bang da co.
// Khong seed chuong trinh mau; lich bat dau rong de admin nhap trong CMS.
async function migratePhase2() {
  await pool.query(`CREATE TABLE IF NOT EXISTS channels (
    id SERIAL PRIMARY KEY, slug TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('tv','radio')),
    stream_url TEXT NOT NULL, stream_kind TEXT NOT NULL DEFAULT 'hls'
      CHECK (stream_kind IN ('hls','youtube','audio')),
    description TEXT DEFAULT '', is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INT NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await pool.query(`CREATE TABLE IF NOT EXISTS programs (
    id SERIAL PRIMARY KEY, channel_slug TEXT NOT NULL, program_date DATE NOT NULL,
    start_time TIME NOT NULL, end_time TIME NOT NULL, title TEXT NOT NULL,
    description TEXT DEFAULT '', replay_url TEXT DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (channel_slug, program_date, start_time, title))`);
  // Spec change: KHONG seed stream Tuyen Quang TV mac dinh. Nguon chinh la
  // API vtcaio (xem lib/vtcaio.mjs); bang channels chi la lop du phong de
  // admin nhap/sua khi API loi. DB moi se bat dau voi channels rong.
}
function saigonToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
}
function isValidDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || "")) return false;
  const d = new Date(s + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
function isValidTime(s) {
  return /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(s || "");
}
function channelRow(r) {
  // Lop du phong noi bo: them cac truong giong dang vtcaio de frontend
  // dung chung mot dang (status/live/epgNow/presets), khong can nhanh rieng.
  return { id: r.id, slug: r.slug, name: r.name, kind: r.kind, status: r.is_active ? "RUNNING" : "STOPPED", live: null, epgNow: null, stream_url: r.stream_url, stream_kind: r.stream_kind, presets: [], epg_schedule: null, description: r.description, is_active: r.is_active, sort_order: r.sort_order };
}
function programRow(r) {
  const date = r.program_date instanceof Date ? r.program_date.toISOString().slice(0, 10) : r.program_date;
  const start_time = String(r.start_time).slice(0, 5), end_time = String(r.end_time).slice(0, 5);
  // Status for internal (CMS) programs, same LIVE/UPCOMING/REPLAY rule as
  // VTCANY: compare the Saigon date+time bounds against now.
  let status = "LIVE";
  try {
    const s = new Date(`${date}T${start_time}:00+07:00`).getTime();
    const e = new Date(`${date}T${end_time}:00+07:00`).getTime();
    const now = Date.now();
    status = Number.isFinite(s) && s > now ? "UPCOMING" : Number.isFinite(e) && e < now ? "REPLAY" : "LIVE";
  } catch { /* keep LIVE */ }
  return { id: r.id, channel_slug: r.channel_slug, channel_name: r.channel_name || null, program_date: date, start_time, end_time, title: r.title, description: r.description, replay_url: r.replay_url, status, replay_available: Boolean(r.replay_url) };
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
    // This makes rollback (VTCANY_AUTH_ENABLED=0 + redeploy) immediate
    // and complete: no VTCANY session, old or new, is accepted while
    // the flag is off, including for draft preview via public routes.
    if (user && user.auth_source === "vtcany" && !vtcanyAuthEnabled()) { destroySession(req); user = null; }
    // Public reader (bao public): chi GET list/detail/cover/pdf-web/flip/thumb
    // moi khong can login; canView ben duoi van chi cho so da xuat ban.
    // Moi route khac (CMS, download PDF goc, audit, jobs, users...) van can login.
    const isPublicRead = (req.method === "GET" && (
      u.pathname === "/api/v1/channels" ||
      u.pathname === "/api/v1/schedule" ||
      u.pathname === "/api/v1/live" ||
      u.pathname === "/api/v1/timeshift" ||
      u.pathname === "/api/v1/timeshift-coverage" ||
      u.pathname === "/api/v1/issues" ||
      /^\/api\/v1\/issues\/\d+$/.test(u.pathname) ||
      /^\/api\/v1\/issues\/\d+\/(cover|pdf)$/.test(u.pathname) ||
      /^\/api\/v1\/issues\/\d+\/pages\/\d+\/(flip|thumb)$/.test(u.pathname) ||
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
    const vtcanyDeny = (required) => {
      if (!user || user.auth_source !== "vtcany") return null;
      if (hasVtcanyPermission(user.vtcany_permissions || [], required)) return null;
      return err(res, 403, `tai khoan VTCANY khong co quyen ${required} cho hanh dong nay`);
    };

    // ---- Auth ----
    if (req.method === "POST" && u.pathname === "/api/v1/auth/login") {
      const body = await readJson(req);
      // VTCANY path (only when VTCANY_AUTH_ENABLED=1). The login form
      // posts {username, password}; when enabled, `username` is read as
      // an email (preferred, /auth/admin/login) or a username (legacy
      // /auth/login) — both are VTCANY-side. A VTCANY 401 returns the
      // exact message below and NEVER falls back to the old TSHT login
      // and NEVER creates a TSHT account. A backend error returns 503
      // and also does not fall back: the emergency rollback is to set
      // VTCANY_AUTH_ENABLED=0 and restart/redeploy, not a silent
      // automatic fallback (see docs/auth-mapping-vtcany.md).
      if (vtcanyAuthEnabled()) {
        const loginId = String(body.email || body.username || "").trim();
        const password = body.password || "";
        if (!loginId || !password) return err(res, 401, "tai khoan VTCANY khong dung");
        const logged = await loginToVtcany(loginId, password);
        if (!logged.ok && logged.reason === "invalid_credentials") return err(res, 401, "tai khoan VTCANY khong dung");
        if (!logged.ok) return err(res, 503, "backend VTCANY khong truy cap duoc, vui long thu lai sau");
        // Canonical identity from /auth/me, not from the login reply
        // alone: this is what rejects end-user (app) accounts, whose
        // kind is 'enduser' and which must never get a CMS session.
        const me = await fetchVtcanyMe(logged.access_token);
        if (!me.ok && me.reason === "unauthorized") return err(res, 401, "tai khoan VTCANY khong dung");
        if (!me.ok) return err(res, 503, "backend VTCANY khong truy cap duoc, vui long thu lai sau");
        if (me.kind !== "cms") return err(res, 403, "tai khoan nay khong phai tai khoan CMS VTCANY");
        const mappedRole = mapVtcanyToTshtRole(me.kind, me.permissions);
        if (mappedRole === null) return err(res, 403, "tai khoan VTCANY nay chua duoc cap quyen bao in (can cap articles:view tro len trong VTCANY)");
        // Link to a local TSHT user row by email (for created_by /
        // audit actor id and can_download_pdf). No row is created here:
        // an unlinked VTCANY account gets localId null, can_download_pdf
        // false, and cannot upload issues (see POST /api/v1/issues).
        let localId = null, localDisplay = null, localCanDownload = false;
        if (me.user.email) {
          const lr = await pool.query("SELECT id, display_name, can_download_pdf FROM users WHERE lower(email)=lower($1) AND is_active", [me.user.email]);
          if (lr.rows[0]) { localId = lr.rows[0].id; localDisplay = lr.rows[0].display_name; localCanDownload = !!lr.rows[0].can_download_pdf; }
        }
        const { token, user: pub } = createVtcanySession({
          localId, username: me.user.username || loginId,
          displayName: localDisplay || me.user.fullName || me.user.username || loginId,
          email: me.user.email || null, mappedRole, canDownloadPdf: localCanDownload,
          vtcanyUserId: me.user.id || null, vtcanyRole: me.user.role || logged.role || null,
          permissions: me.permissions, accessToken: logged.access_token, refreshToken: logged.refresh_token,
        });
        return json(res, 200, { user: pub }, { "Set-Cookie": sessionCookie(token) });
      }
      // Old TSHT scrypt login (unchanged; this is the whole behaviour
      // while VTCANY_AUTH_ENABLED is not '1').
      const r = await pool.query("SELECT * FROM users WHERE username=$1 AND is_active", [body.username]);
      const dbUser = r.rows[0];
      if (!dbUser || !verifyPassword(body.password || "", dbUser.password_hash)) return err(res, 401, "sai tai khoan hoac mat khau");
      await pool.query("UPDATE users SET last_login_at=now() WHERE id=$1", [dbUser.id]);
      const { token, user: pub } = createSession(dbUser);
      return json(res, 200, { user: pub }, { "Set-Cookie": sessionCookie(token) });
    }
    if (req.method === "GET" && u.pathname === "/api/v1/auth/me") return json(res, 200, { user });
    if (req.method === "POST" && u.pathname === "/api/v1/auth/logout") {
      destroySession(req);
      return json(res, 200, { ok: true }, { "Set-Cookie": "epaper_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0" });
    }

    // ---- Users (admin only, D5) ----
    if (u.pathname === "/api/v1/users") {
      if (!isAdmin(user)) return err(res, 403, "chi admin");
      if (req.method === "GET") {
        const r = await pool.query("SELECT id, username, display_name, email, role, can_download_pdf, is_active, last_login_at FROM users ORDER BY id");
        return json(res, 200, { items: r.rows });
      }
      if (req.method === "POST") {
        { const d = vtcanyDeny("users:create"); if (d) return d; }
        const b = await readJson(req);
        if (!b.username || !b.password || !b.display_name) return err(res, 400, "thieu truong");
        if (!["admin", "publisher", "reviewer", "reader"].includes(b.role)) return err(res, 400, "role khong hop le");
        const r = await pool.query("INSERT INTO users (username, display_name, email, password_hash, role, can_download_pdf) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
          [b.username, b.display_name, b.email || null, hashPassword(b.password), b.role, !!b.can_download_pdf]);
        await audit(pool, user.id, "user", r.rows[0].id, "create", { username: b.username, role: b.role });
        return json(res, 201, { id: r.rows[0].id });
      }
    }
    const userMatch = u.pathname.match(/^\/api\/v1\/users\/(\d+)(?:\/(reset-password))?$/);
    if (userMatch && isAdmin(user)) {
      { const d = vtcanyDeny("users:update"); if (d) return d; }
      const uid = Number(userMatch[1]);
      if (req.method === "PATCH" && !userMatch[2]) {
        const b = await readJson(req);
        const r = await pool.query("UPDATE users SET display_name=COALESCE($2,display_name), role=COALESCE($3,role), can_download_pdf=COALESCE($4,can_download_pdf), is_active=COALESCE($5,is_active) WHERE id=$1 RETURNING id",
          [uid, b.display_name || null, b.role || null, b.can_download_pdf ?? null, b.is_active ?? null]);
        if (!r.rows.length) return err(res, 404, "not found");
        await audit(pool, user.id, "user", uid, "update", b);
        return json(res, 200, { ok: true });
      }
      if (req.method === "POST" && userMatch[2]) {
        const b = await readJson(req);
        if (!b.password) return err(res, 400, "thieu mat khau moi");
        await pool.query("UPDATE users SET password_hash=$2 WHERE id=$1", [uid, hashPassword(b.password)]);
        await audit(pool, user.id, "user", uid, "reset_password", {});
        return json(res, 200, { ok: true });
      }
    }

    // ---- Phase 2: Channels (public list, admin write) ----
    if (u.pathname === "/api/v1/channels") {
      if (req.method === "GET") {
        // Nguon chinh: vtcaio (neu da cau hinh); loi/thieu cau hinh -> DB noi bo.
        const ext = await fetchVtcaioChannels();
        if (ext.ok) return json(res, 200, { items: ext.items, source: "vtcaio" });
        const r = await pool.query("SELECT * FROM channels WHERE is_active ORDER BY sort_order, id");
        const out = { items: r.rows.map(channelRow), source: "internal" };
        if (ext.reason !== "not_configured") out.vtcaio_error = `Nguồn vtcaio hiện không truy cập được (${ext.reason}), đang dùng kênh dự phòng trong CMS.`;
        return json(res, 200, out);
      }
      if (req.method === "POST") {
        if (!isAdmin(user)) return err(res, 403, "chi admin");
        { const d = vtcanyDeny("tv:create"); if (d) return d; }
        const b = await readJson(req);
        if (!b.slug || !/^[a-z0-9-]+$/.test(b.slug) || !b.name?.trim() || !["tv", "radio"].includes(b.kind) || !b.stream_url?.trim()) return err(res, 400, "thieu truong hoac slug/loai/stream khong hop le");
        if (b.stream_kind && !["hls", "youtube", "audio"].includes(b.stream_kind)) return err(res, 400, "stream_kind khong hop le");
        try {
          const r = await pool.query("INSERT INTO channels (slug, name, kind, stream_url, stream_kind, description, sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *",
            [b.slug, b.name.trim(), b.kind, b.stream_url.trim(), b.stream_kind || "hls", b.description || "", Number.isInteger(b.sort_order) ? b.sort_order : 0]);
          return json(res, 201, channelRow(r.rows[0]));
        } catch (e) { if (e.code === "23505") return err(res, 409, "slug kenh da ton tai"); throw e; }
      }
    }
    const channelMatch = u.pathname.match(/^\/api\/v1\/channels\/(\d+)$/);
    if (channelMatch && req.method === "PATCH") {
      if (!isAdmin(user)) return err(res, 403, "chi admin");
      { const d = vtcanyDeny("tv:update"); if (d) return d; }
      const b = await readJson(req);
      if (b.stream_kind && !["hls", "youtube", "audio"].includes(b.stream_kind)) return err(res, 400, "stream_kind khong hop le");
      const r = await pool.query("UPDATE channels SET name=COALESCE($2,name), stream_url=COALESCE($3,stream_url), stream_kind=COALESCE($4,stream_kind), description=COALESCE($5,description), is_active=COALESCE($6,is_active), sort_order=COALESCE($7,sort_order) WHERE id=$1 RETURNING *",
        [Number(channelMatch[1]), b.name || null, b.stream_url || null, b.stream_kind || null, b.description ?? null, b.is_active ?? null, Number.isInteger(b.sort_order) ? b.sort_order : null]);
      if (!r.rows.length) return err(res, 404, "not found");
      return json(res, 200, channelRow(r.rows[0]));
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

    // ---- Phase 2: Schedule (public list, admin write) ----
    if (u.pathname === "/api/v1/schedule") {
      if (req.method === "GET") {
        const date = u.searchParams.get("date") || saigonToday();
        const channel = u.searchParams.get("channel") || "";
        if (!isValidDate(date)) return err(res, 400, "date khong hop le (YYYY-MM-DD)");
        // channel o day la TEN KENH vtcaio (vd PHUTHO) hoac "tv"/"radio"/rong
        // (chon kenh RUNNING dau tien cua loai do). Khong gioi han tv|radio
        // nua vi so kenh vtcaio co the nhieu hon 2.
        // Thu tu nguon lich (port VTCANY): 1) backend VTCANY (EPG timeline
        // + replay_url that), 2) vtcaio truc tiep (EPG + coverage), 3) DB
        // noi bo. VTCANY tra timeline rong thi roi xuong nguon 2/3 thay vi
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
        // Nguon 2: vtcaio EPG (neu da cau hinh); loi/thieu cau hinh -> DB noi bo.
        if (vtcaioConfigured()) {
          const resolved = await resolveVtcaioChannelName(channel);
          if (resolved.ok) {
            const ext = await fetchVtcaioSchedule(date, resolved.channel.name);
            if (ext.ok) {
              const enriched = await enrichDirectAioItems(ext.items, resolved.channel.name);
              return json(res, 200, { date, channel: resolved.channel.name, channel_kind: resolved.channel.kind, items: enriched.items, source: "vtcaio", epg_note: ext.note || null, timeshift_available: enriched.timeshift_available, timeshift_unknown: enriched.timeshift_unknown, fallback_warning: fallbackWarning });
            }
            const out0 = { date, channel: resolved.channel.name, items: [], source: "internal", vtcaio_error: `Nguồn vtcaio hiện không truy cập được (${ext.reason}), đang dùng lịch dự phòng trong CMS.`, fallback_warning: fallbackWarning, timeshift_available: false, timeshift_unknown: false };
            const r0 = await pool.query(`SELECT p.*, c.name AS channel_name FROM programs p LEFT JOIN channels c ON c.slug=p.channel_slug WHERE p.program_date=$1 AND p.channel_slug=$2 ORDER BY p.start_time, p.id`, [date, resolved.channel.slug]);
            out0.items = r0.rows.map(programRow);
            return json(res, 200, out0);
          }
          if (resolved.reason === "channel_not_found") return err(res, 404, "kenh khong ton tai trong danh muc vtcaio");
          // no_running_channel / fetch loi: roi ve DB noi bo kem canh bao.
          const rF = await pool.query(`SELECT p.*, c.name AS channel_name FROM programs p LEFT JOIN channels c ON c.slug=p.channel_slug WHERE p.program_date=$1 ORDER BY p.start_time, p.id`, [date]);
          return json(res, 200, { date, channel: channel || null, items: rF.rows.map(programRow), source: "internal", vtcaio_error: `Nguồn vtcaio hiện không truy cập được (${resolved.reason}), đang dùng lịch dự phòng trong CMS.`, fallback_warning: fallbackWarning, timeshift_available: rF.rows.some((r) => r.replay_url), timeshift_unknown: false });
        }
        const args = [date], conds = ["p.program_date=$1"];
        if (channel) {
          if (["tv", "radio"].includes(channel)) { args.push(channel); conds.push(`(p.channel_slug=$${args.length} OR c.kind=$${args.length})`); }
          else { args.push(channel.toLowerCase()); conds.push(`p.channel_slug=$${args.length}`); }
        }
        const r = await pool.query(`SELECT p.*, c.name AS channel_name FROM programs p LEFT JOIN channels c ON c.slug=p.channel_slug WHERE ${conds.join(" AND ")} ORDER BY p.start_time, p.id`, args);
        const out = { date, channel: channel || null, items: r.rows.map(programRow), source: "internal", fallback_warning: fallbackWarning, timeshift_available: r.rows.some((x) => x.replay_url), timeshift_unknown: false };
        return json(res, 200, out);
      }
      if (req.method === "POST") {
        if (!isAdmin(user)) return err(res, 403, "chi admin");
        { const d = vtcanyDeny("epg:create"); if (d) return d; }
        const b = await readJson(req);
        if (!b.channel_slug || !isValidDate(b.program_date) || !isValidTime(b.start_time) || !isValidTime(b.end_time) || !b.title?.trim()) return err(res, 400, "thieu truong hoac ngay/gio/tieu de khong hop le");
        if (String(b.end_time).slice(0, 5) <= String(b.start_time).slice(0, 5)) return err(res, 400, "gio ket thuc phai sau gio bat dau");
        const ch = await pool.query("SELECT id FROM channels WHERE slug=$1", [b.channel_slug]);
        if (!ch.rows.length) return err(res, 400, "kenh khong ton tai");
        try {
          const r = await pool.query("INSERT INTO programs (channel_slug, program_date, start_time, end_time, title, description, replay_url) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *",
            [b.channel_slug, b.program_date, b.start_time, b.end_time, b.title.trim(), b.description || "", b.replay_url || ""]);
          return json(res, 201, programRow(r.rows[0]));
        } catch (e) { if (e.code === "23505") return err(res, 409, "chuong trinh da ton tai (cung kenh, ngay, gio, tieu de)"); throw e; }
      }
    }
    const scheduleMatch = u.pathname.match(/^\/api\/v1\/schedule\/(\d+)$/);
    if (scheduleMatch && req.method === "DELETE") {
      if (!isAdmin(user)) return err(res, 403, "chi admin");
      { const d = vtcanyDeny("epg:delete"); if (d) return d; }
      const r = await pool.query("DELETE FROM programs WHERE id=$1 RETURNING id", [Number(scheduleMatch[1])]);
      if (!r.rows.length) return err(res, 404, "not found");
      return json(res, 200, { ok: true });
    }

    // ---- Issues list (B3) ----
    if (req.method === "GET" && u.pathname === "/api/v1/issues") {
      const page = Math.max(1, Number(u.searchParams.get("page") || 1));
      const per = 15;
      const type = u.searchParams.get("type") || "";
      const q = (u.searchParams.get("q") || "").trim();
      const date = u.searchParams.get("date") || "";
      let status = "published";
      if (isStaff(user)) {
        const s = u.searchParams.get("status") || "";
        if (s === "all") status = null; else if (["draft", "pending_review", "published", "unpublished"].includes(s)) status = s;
      }
      const conds = [], args = [];
      if (status) { conds.push(`status=$${args.length + 1}`); args.push(status); }
      if (type) { conds.push(`issue_type=$${args.length + 1}`); args.push(type); }
      if (/^\d+$/.test(q)) { conds.push(`issue_number=$${args.length + 1}`); args.push(Number(q)); }
      else if (q) { conds.push(`title ILIKE $${args.length + 1}`); args.push(`%${q}%`); }
      if (date) { conds.push(`publish_date=$${args.length + 1}`); args.push(date); }
      const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
      const total = await pool.query(`SELECT count(*)::int AS n FROM issues ${where}`, args);
      const rows = await pool.query(`SELECT * FROM issues ${where} ORDER BY publish_date DESC, id DESC LIMIT ${per} OFFSET ${(page - 1) * per}`, args);
      return json(res, 200, { items: rows.rows.map(toListItem), total: total.rows[0].n, page, total_pages: Math.max(1, Math.ceil(total.rows[0].n / per)) });
    }

    // ---- Create issue + upload PDF (D1 + C1/C2/C4/C6) ----
    if (req.method === "POST" && u.pathname === "/api/v1/issues") {
      if (!isStaff(user) || user.role === "reviewer") return err(res, 403, "chi nguoi dang / admin duoc dang so");
      { const d = vtcanyDeny("articles:create"); if (d) return d; }
      // VTCANY sessions without a linked local TSHT user row cannot
      // create issues: issues.created_by is NOT NULL + REFERENCES
      // users(id). Fail here, before parsing the PDF, with a message
      // that tells the admin exactly what to link — do NOT insert a
      // row with a made-up id and do NOT auto-create a local account.
      if (user.auth_source === "vtcany" && (user.id === null || user.id === undefined)) return err(res, 403, "tai khoan VTCANY nay chua lien ket voi tai khoan TSHT noi bo theo email — can admin tao/liên kết user TSHT cùng email trước khi đăng số");
      const { fields, files } = await readMultipart(req);
      const number = Number(fields.issue_number), type = fields.issue_type || "thuong";
      if (!Number.isInteger(number) || number <= 0 || !ISSUE_TYPES.includes(type) || !fields.publish_date || !fields.title?.trim()) return err(res, 400, "truong ngay/so/loai/tieu de khong hop le");
      const pdf = files.pdf || files.file;
      if (!pdf || pdf.data.subarray(0, 5).toString() !== "%PDF-") return err(res, 400, "file tai len khong phai PDF");
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "epaper-"));
      const tmpPdf = path.join(tmpDir, "upload.pdf");
      fs.writeFileSync(tmpPdf, pdf.data);
      let pageCount;
      try { pageCount = await pdfPageCount(tmpPdf); } catch (e) { return err(res, 400, `PDF loi: ${e.message}`); }
      const client = await pool.connect();
      let issue;
      try {
        await client.query("BEGIN");
        const ins = await client.query(
          "INSERT INTO issues (issue_number, issue_type, publish_date, title, slug, status, pdf_original_path, pdf_original_size, pdf_sha256, page_count, created_by, scheduled_publish_at) VALUES ($1,$2,$3,$4,$5,'draft','', $6, $7, $8, $9, $10) RETURNING *",
          [number, type, fields.publish_date, fields.title.trim(), `pending-${crypto.randomUUID()}`, pdf.data.length, crypto.createHash("sha256").update(pdf.data).digest("hex"), pageCount, user.id, fields.scheduled_publish_at || null]);
        issue = ins.rows[0];
        const dirRel = storageRelForIssue(issue.id, fields.publish_date, "");
        const origRel = storageRelForIssue(issue.id, fields.publish_date, "original.pdf");
        const webRel = storageRelForIssue(issue.id, fields.publish_date, "web.pdf");
        await client.query("UPDATE issues SET slug=$2, pdf_original_path=$3, pdf_web_path=$4 WHERE id=$1", [issue.id, slugFor(number, issue.id), origRel, webRel]);
        await client.query("INSERT INTO processing_jobs (issue_id, status, current_step) VALUES ($1,'pending','validate')", [issue.id]);
        await client.query("COMMIT");
        issue.slug = slugFor(number, issue.id); issue.pdf_original_path = origRel; issue.pdf_web_path = webRel;
      } catch (e) {
        await client.query("ROLLBACK");
        if (e.code === "23505") return err(res, 409, "da co so bao nay cho loai so do (UNIQUE issue_type, issue_number) — xem bang viec J2 truoc khi nhap kho cu");
        throw e;
      } finally { client.release(); }
      // File + render outside the transaction; failure leaves a draft with a failed job (C6), retryable.
      const issueDir = path.join(STORAGE_DIR, "epaper", new Date(fields.publish_date).getFullYear().toString(), String(new Date(fields.publish_date).getMonth() + 1).padStart(2, "0"), String(issue.id));
      fs.mkdirSync(issueDir, { recursive: true });
      fs.copyFileSync(tmpPdf, path.join(issueDir, "original.pdf"));
      fs.copyFileSync(tmpPdf, path.join(issueDir, "web.pdf")); // C5: chua nen web.pdf — bang goc hien tai, nen sau
      fs.rmSync(tmpDir, { recursive: true, force: true });
      const jobClient = await pool.connect();
      try {
        await jobClient.query("UPDATE processing_jobs SET status='processing', current_step='render_flip' WHERE issue_id=$1 AND status='pending'", [issue.id]);
        const rendered = await renderIssuePages(path.join(issueDir, "original.pdf"), issueDir, pageCount);
        const dirRel = (f) => storageRelForIssue(issue.id, fields.publish_date, f);
        for (let n = 1; n <= pageCount; n++) {
          await jobClient.query("INSERT INTO issue_pages (issue_id, page_number, pdf_page_number, is_cover, flip_image_path, thumbnail_path) VALUES ($1,$2,$2,$3,$4,$5) ON CONFLICT (issue_id, page_number) DO NOTHING",
            [issue.id, n, n === 1, dirRel(`pages/flip/p${String(n).padStart(3, "0")}.jpg`), dirRel(`pages/thumb/p${String(n).padStart(3, "0")}.jpg`)]);
        }
        await jobClient.query("UPDATE issues SET cover_image_path=$2, cover_thumbnail_path=$3 WHERE id=$1", [issue.id, dirRel("cover.jpg"), dirRel("pages/thumb/p001.jpg")]);
        await jobClient.query("UPDATE processing_jobs SET status='done', current_step='done', finished_at=now() WHERE issue_id=$1 AND status='processing'", [issue.id]);
        await audit(jobClient, user.id, "issue", issue.id, "create", { pages: rendered });
      } catch (e) {
        await jobClient.query("UPDATE processing_jobs SET status='failed', error_message=$2, finished_at=now() WHERE issue_id=$1", [issue.id, e.message]);
        console.error("render failed", issue.id, e.message);
      } finally { jobClient.release(); }
      const detail = await detailOf(issue.id, user);
      return json(res, 201, detail);
    }

    // ---- Issue sub-routes ----
    const im = u.pathname.match(/^\/api\/v1\/issues\/(\d+)(?:\/(cover|pdf|download|audit|jobs|submit|reject|publish|unpublish|checklist|retry-processing|replace-pdf|pages\/(\d+)\/(flip|thumb)))?$/);
    if (im) {
      const id = Number(im[1]), action = im[2];
      const client = await pool.connect();
      try {
        const issue = await loadIssue(client, id);
        if (!issue) return err(res, 404, "not found");
        // File routes check visibility first (A3).
        if (action === "cover" || action === "pdf" || action === "download" || (im[3] && im[4])) {
          if (!canView(user, issue)) return err(res, 403, "khong co quyen xem so nay");
          if (action === "cover") return serveFile(res, resolveStoragePath(issue.cover_image_path));
          if (action === "pdf") return serveFile(res, resolveStoragePath(issue.pdf_web_path || issue.pdf_original_path));
          if (action === "download") {
            if (!user || !user.can_download_pdf) return err(res, 403, "tai khoan khong co quyen tai PDF goc");
            await audit(client, user.id, "issue", id, "download_pdf", { file: "original.pdf" });
            return serveFile(res, resolveStoragePath(issue.pdf_original_path), `bao-so-${issue.issue_number}.pdf`);
          }
          // pages/:n/flip|thumb
          const pr = await client.query("SELECT * FROM issue_pages WHERE issue_id=$1 AND page_number=$2", [id, Number(im[3])]);
          if (!pr.rows.length) return err(res, 404, "not found");
          return serveFile(res, resolveStoragePath(im[4] === "flip" ? pr.rows[0].flip_image_path : pr.rows[0].thumbnail_path));
        }
        if (req.method === "GET" && !action) {
          if (!canView(user, issue)) return err(res, 403, "khong co quyen xem so nay");
          return json(res, 200, await detailOf(id, user, client));
        }
        if (req.method === "GET" && action === "audit" && isStaff(user)) {
          const r = await client.query("SELECT a.*, u.username FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id WHERE entity_type='issue' AND entity_id=$1 ORDER BY created_at DESC LIMIT 100", [id]);
          return json(res, 200, { items: r.rows });
        }
        if (req.method === "GET" && action === "jobs" && isStaff(user)) {
          const r = await client.query("SELECT * FROM processing_jobs WHERE issue_id=$1 ORDER BY created_at DESC", [id]);
          return json(res, 200, { items: r.rows });
        }
        if (req.method === "PATCH" && !action) return patchIssue(client, user, issue, await readJson(req), res);
        if (req.method === "POST" && action === "replace-pdf") return replacePdf(client, user, issue, req, res);
        if (req.method === "POST" && ["submit", "reject", "publish", "unpublish", "checklist", "retry-processing"].includes(action)) {
          return transition(client, user, issue, action, await readJson(req).catch(() => ({})), res);
        }
        return err(res, 405, "method khong ho tro");
      } finally { client.release(); }
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
    if (u.pathname === "/login.html" || u.pathname === "/admin.html") return serveFile(res, path.join(PUBLIC, u.pathname.slice(1)));
    if (/^\/bao-.*\.html$/.test(u.pathname)) return serveFile(res, path.join(PUBLIC, "reader.html"));
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

async function detailOf(id, user, client) {
  const c = client || await pool.connect();
  const own = client ? false : true;
  try {
    const issue = await loadIssue(c, id);
    const pages = await issuePages(c, id);
    const out = { ...toListItem(issue), can_download: !!user?.can_download_pdf, pdf_url: `/api/v1/issues/${id}/pdf`, pages };
    if (isStaff(user)) {
      out.checklist = await checklist(c, id);
      out.processing = await latestJob(c, id);
      out.created_by = issue.created_by; out.reviewed_by = issue.reviewed_by;
    }
    return out;
  } finally { if (own) c.release(); }
}

// Thay PDF cho mot so da co (chi admin). Giu nguyen so bao, loai so, ngay,
// slug/URL va trang thai (ke ca da xuat ban: ban doc mo cung link cu se thay
// ngay noi dung moi). Bat buoc change_reason; neu so da xuat ban thi luu
// revision snapshot nhu patchIssue (B2). File moi duoc render lai flip+thumb
// nhu luc tao so; so trang moi co the khac so cu, issue_pages duoc thay toan bo.
async function replacePdf(client, user, issue, req, res) {
  if (!isAdmin(user)) return err(res, 403, "chi admin duoc thay PDF");
  // VTCANY gate (in addition to the admin gate): articles:update.
  // A VTCANY role with articles:update but a non-admin mapped role
  // still fails the admin gate above, so replace stays admin-only.
  if (user && user.auth_source === "vtcany" && !hasVtcanyPermission(user.vtcany_permissions || [], "articles:update")) return err(res, 403, "tai khoan VTCANY khong co quyen articles:update cho hanh dong nay");
  const { fields, files } = await readMultipart(req);
  const changeReason = (fields.change_reason || "").trim();
  if (!changeReason) return err(res, 400, "thay PDF bat buoc nhap change_reason");
  const pdf = files.pdf || files.file;
  if (!pdf || pdf.data.subarray(0, 5).toString() !== "%PDF-") return err(res, 400, "file tai len khong phai PDF");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "epaper-replace-"));
  const tmpPdf = path.join(tmpDir, "replace.pdf");
  fs.writeFileSync(tmpPdf, pdf.data);
  let pageCount;
  try { pageCount = await pdfPageCount(tmpPdf); } catch (e) { fs.rmSync(tmpDir, { recursive: true, force: true }); return err(res, 400, `PDF loi: ${e.message}`); }
  const origAbs = resolveStoragePath(issue.pdf_original_path);
  const webAbs = resolveStoragePath(issue.pdf_web_path);
  const issueDir = origAbs ? path.dirname(origAbs) : path.join(STORAGE_DIR, "epaper", new Date(issue.publish_date).getFullYear().toString(), String(new Date(issue.publish_date).getMonth() + 1).padStart(2, "0"), String(issue.id));
  const sha256 = crypto.createHash("sha256").update(pdf.data).digest("hex");
  const newTitle = (fields.title || "").trim();
  try {
    if (issue.published_at) {
      const rn = await client.query("SELECT COALESCE(max(revision_no),0)+1 AS n FROM issue_revisions WHERE issue_id=$1", [issue.id]);
      await client.query("INSERT INTO issue_revisions (issue_id, revision_no, changed_by, change_reason, snapshot) VALUES ($1,$2,$3,$4,$5)",
        [issue.id, rn.rows[0].n, user.id, changeReason, { title: issue.title, issue_number: issue.issue_number, issue_type: issue.issue_type, publish_date: issue.publish_date, pdf_original_path: issue.pdf_original_path, pdf_web_path: issue.pdf_web_path, page_count: issue.page_count, pdf_original_size: issue.pdf_original_size }]);
    }
    await client.query("INSERT INTO processing_jobs (issue_id, status, current_step) VALUES ($1,'processing','render_flip')", [issue.id]);
    fs.mkdirSync(issueDir, { recursive: true });
    fs.copyFileSync(tmpPdf, path.join(issueDir, "original.pdf"));
    fs.copyFileSync(tmpPdf, path.join(issueDir, "web.pdf"));
    const rendered = await renderIssuePages(path.join(issueDir, "original.pdf"), issueDir, pageCount);
    const dirRel = (f) => storageRelForIssue(issue.id, issue.publish_date, f);
    await client.query("DELETE FROM issue_pages WHERE issue_id=$1", [issue.id]);
    for (let n = 1; n <= pageCount; n++) {
      await client.query("INSERT INTO issue_pages (issue_id, page_number, pdf_page_number, is_cover, flip_image_path, thumbnail_path) VALUES ($1,$2,$2,$3,$4,$5)",
        [issue.id, n, n === 1, dirRel(`pages/flip/p${String(n).padStart(3, "0")}.jpg`), dirRel(`pages/thumb/p${String(n).padStart(3, "0")}.jpg`)]);
    }
    await client.query("UPDATE issues SET cover_image_path=$2, cover_thumbnail_path=$3, page_count=$4, pdf_original_size=$5, pdf_sha256=$6, title=COALESCE($7,title) WHERE id=$1",
      [issue.id, dirRel("cover.jpg"), dirRel("pages/thumb/p001.jpg"), pageCount, pdf.data.length, sha256, newTitle || null]);
    await client.query("UPDATE processing_jobs SET status='done', current_step='done', finished_at=now() WHERE issue_id=$1 AND status='processing'", [issue.id]);
    await audit(client, user.id, "issue", issue.id, "replace_pdf", { pages: rendered, old_page_count: issue.page_count, new_page_count: pageCount, change_reason: changeReason });
  } catch (e) {
    try { await client.query("UPDATE processing_jobs SET status='failed', error_message=$2, finished_at=now() WHERE issue_id=$1 AND status='processing'", [issue.id, e.message]); } catch {}
    console.error("replace-pdf failed", issue.id, e.message);
    return err(res, 500, `thay PDF loi: ${e.message}`);
  } finally { fs.rmSync(tmpDir, { recursive: true, force: true }); }
  return json(res, 200, await detailOf(issue.id, user, client));
}

async function patchIssue(client, user, issue, b, res) {
  // VTCANY gate (in addition to canEdit below): articles:update.
  if (user && user.auth_source === "vtcany" && !hasVtcanyPermission(user.vtcany_permissions || [], "articles:update")) return err(res, 403, "tai khoan VTCANY khong co quyen articles:update cho hanh dong nay");
  const wasPublished = !!issue.published_at;
  if (wasPublished && (b.issue_number !== undefined || b.issue_type !== undefined)) {
    return err(res, 409, "so da xuat ban: khong doi so bao/loai so vi slug da khoa (trigger DB cung chan doi slug)");
  }
  if (b.slug !== undefined) return err(res, 403, "slug khong duoc doi qua API");
  const canEdit = isAdmin(user) || (user.role === "publisher" && ["draft", "pending_review"].includes(issue.status) && issue.created_by === user.id);
  if (!canEdit) return err(res, 403, "khong co quyen sua so nay");
  await client.query("BEGIN");
  try {
    if (wasPublished) {
      if (!b.change_reason) { await client.query("ROLLBACK"); return err(res, 400, "sua so da xuat ban bat buoc nhap change_reason (B2)"); }
      const rn = await client.query("SELECT COALESCE(max(revision_no),0)+1 AS n FROM issue_revisions WHERE issue_id=$1", [issue.id]);
      await client.query("INSERT INTO issue_revisions (issue_id, revision_no, changed_by, change_reason, snapshot) VALUES ($1,$2,$3,$4,$5)",
        [issue.id, rn.rows[0].n, user.id, b.change_reason, { title: issue.title, issue_number: issue.issue_number, issue_type: issue.issue_type, publish_date: issue.publish_date, pdf_original_path: issue.pdf_original_path, pdf_web_path: issue.pdf_web_path, page_count: issue.page_count }]);
    }
    const number = b.issue_number ?? issue.issue_number;
    const type = b.issue_type ?? issue.issue_type;
    const slug = wasPublished ? issue.slug : slugFor(number, issue.id);
    await client.query("UPDATE issues SET title=COALESCE($2,title), publish_date=COALESCE($3,publish_date), issue_number=$4, issue_type=$5, slug=$6, scheduled_publish_at=COALESCE($7,scheduled_publish_at) WHERE id=$1",
      [issue.id, b.title || null, b.publish_date || null, number, type, slug, b.scheduled_publish_at || null]);
    await audit(client, user.id, "issue", issue.id, "update", { fields: Object.keys(b), change_reason: b.change_reason || null });
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    if (e.code === "23505") return err(res, 409, "trung (issue_type, issue_number)");
    throw e;
  }
  return json(res, 200, await detailOf(issue.id, user, client));
}

async function transition(client, user, issue, action, b, res) {
  const fail = (code, msg) => err(res, code, msg);
  // VTCANY gate, one required permission per workflow action, checked
  // BEFORE the existing TSHT role/status checks (both must pass):
  // submit/reject/checklist/retry = articles:update (a state update),
  // publish/unpublish = articles:publish. VTCANY has no separate
  // unpublish action; publish covers the published/unpublished state.
  if (user && user.auth_source === "vtcany") {
    const required = ["publish", "unpublish"].includes(action) ? "articles:publish" : "articles:update";
    if (!hasVtcanyPermission(user.vtcany_permissions || [], required)) return fail(403, `tai khoan VTCANY khong co quyen ${required} cho hanh dong nay`);
  }
  if (action === "submit") {
    if (!(isAdmin(user) || (user.role === "publisher" && issue.created_by === user.id))) return fail(403, "chi nguoi dang so do / admin");
    if (issue.status !== "draft") return fail(409, "chi nhap moi gui duyet duoc");
    await client.query("UPDATE issues SET status='pending_review' WHERE id=$1", [issue.id]);
    await audit(client, user.id, "issue", issue.id, "submit_review", { from: "draft", to: "pending_review" });
  } else if (action === "reject") {
    if (!canReview(user)) return fail(403, "chi nguoi duyet / admin");
    if (issue.status !== "pending_review") return fail(409, "chi so cho duyet moi tra lai duoc");
    await client.query("UPDATE issues SET status='draft' WHERE id=$1", [issue.id]);
    await audit(client, user.id, "issue", issue.id, "reject", { reason: b.reason || null });
  } else if (action === "publish") {
    if (!canReview(user)) return fail(403, "chi nguoi duyet / admin");
    if (!["pending_review", "unpublished"].includes(issue.status)) return fail(409, "chi so cho duyet / da go moi xuat ban duoc");
    if (issue.page_count <= 0) return fail(409, "so chua render xong trang (kiem tra processing job)");
    const cl = await checklist(client, issue.id);
    if (!cl || !cl.all_checked) return fail(409, "chua tick du 6 muc checklist D6 — khong xuat ban duoc");
    if (issue.scheduled_publish_at && new Date(issue.scheduled_publish_at) > new Date() && !b.force) {
      return fail(409, `so da hen gio ${issue.scheduled_publish_at.toISOString()} — doi scheduler tu xuat ban hoac gui force:true`);
    }
    await client.query("BEGIN");
    try { await doPublish(client, issue, user.id); await client.query("UPDATE issues SET reviewed_by=$2 WHERE id=$1", [issue.id, user.id]); await client.query("COMMIT"); }
    catch (e) { await client.query("ROLLBACK"); throw e; }
  } else if (action === "unpublish") {
    if (!canReview(user)) return fail(403, "chi nguoi duyet / admin");
    if (issue.status !== "published") return fail(409, "chi so dang xuat ban moi go xuong duoc");
    await client.query("UPDATE issues SET status='unpublished', unpublished_at=now() WHERE id=$1", [issue.id]);
    await audit(client, user.id, "issue", issue.id, "unpublish", { from: "published", to: "unpublished" });
  } else if (action === "checklist") {
    if (!canReview(user)) return fail(403, "chi nguoi duyet / admin tick checklist");
    const vals = CHECK_FIELDS.map((f) => !!b[f]);
    await client.query(`INSERT INTO publication_checklists (issue_id, ${CHECK_FIELDS.join(",")}, checked_by, checked_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now())
      ON CONFLICT (issue_id) DO UPDATE SET ${CHECK_FIELDS.map((f, i) => `${f}=$${i + 2}`).join(",")}, checked_by=$8, checked_at=now()`,
      [issue.id, ...vals, user.id]);
    await audit(client, user.id, "issue", issue.id, "checklist", Object.fromEntries(CHECK_FIELDS.map((f, i) => [f, vals[i]])));
  } else if (action === "retry-processing") {
    if (!isAdmin(user) && user.role !== "publisher") return fail(403, "chi nguoi dang / admin");
    const orig = resolveStoragePath(issue.pdf_original_path);
    if (!orig || !fs.existsSync(orig)) return fail(409, "khong tim thay PDF goc de render lai");
    const dir = path.dirname(orig);
    try {
      await client.query("INSERT INTO processing_jobs (issue_id, status, current_step) VALUES ($1,'processing','render_flip')", [issue.id]);
      await renderIssuePages(orig, dir, issue.page_count);
      const dirRel = (f) => storageRelForIssue(issue.id, issue.publish_date, f);
      await client.query("DELETE FROM issue_pages WHERE issue_id=$1", [issue.id]);
      for (let n = 1; n <= issue.page_count; n++) {
        await client.query("INSERT INTO issue_pages (issue_id, page_number, pdf_page_number, is_cover, flip_image_path, thumbnail_path) VALUES ($1,$2,$2,$3,$4,$5)",
          [issue.id, n, n === 1, dirRel(`pages/flip/p${String(n).padStart(3, "0")}.jpg`), dirRel(`pages/thumb/p${String(n).padStart(3, "0")}.jpg`)]);
      }
      await client.query("UPDATE issues SET cover_image_path=$2, cover_thumbnail_path=$3 WHERE id=$1", [issue.id, dirRel("cover.jpg"), dirRel("pages/thumb/p001.jpg")]);
      await client.query("UPDATE processing_jobs SET status='done', current_step='done', finished_at=now() WHERE issue_id=$1 AND status='processing'", [issue.id]);
    } catch (e) {
      await client.query("UPDATE processing_jobs SET status='failed', error_message=$2, finished_at=now() WHERE issue_id=$1 AND status='processing'", [issue.id, e.message]);
      return fail(500, `render lai loi: ${e.message}`);
    }
  }
  return json(res, 200, await detailOf(issue.id, user, client));
}

const PORT = Number(process.env.PORT || 3000);
// Phase 2 migration chay truoc khi nhan request; neu migration loi, van
// khoi dong de /health hoat dong va loi hien ro trong log (API Phase 2 se 500).
migratePhase2()
  .then(() => console.log("Phase 2 migration ok: channels + programs"))
  .catch((e) => console.error("Phase 2 migration failed", e.message))
  .finally(() => server.listen(PORT, () => console.log(`E-paper Stage 2 (DB + CMS): http://localhost:${PORT}/bao-in  | CMS: /admin.html`)));
