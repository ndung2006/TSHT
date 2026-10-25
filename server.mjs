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
import { hashPassword, verifyPassword, createSession, destroySession, userFromRequest, sessionCookie, isStaff, isAdmin, canReview } from "./lib/auth.mjs";
import { pdfPageCount, renderIssuePages } from "./lib/worker.mjs";

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

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, "http://localhost");
    const user = userFromRequest(req);
    // Public reader (bao public): chi GET list/detail/cover/pdf-web/flip/thumb
    // moi khong can login; canView ben duoi van chi cho so da xuat ban.
    // Moi route khac (CMS, download PDF goc, audit, jobs, users...) van can login.
    const isPublicRead = req.method === "GET" && (
      u.pathname === "/api/v1/issues" ||
      /^\/api\/v1\/issues\/\d+$/.test(u.pathname) ||
      /^\/api\/v1\/issues\/\d+\/(cover|pdf)$/.test(u.pathname) ||
      /^\/api\/v1\/issues\/\d+\/pages\/\d+\/(flip|thumb)$/.test(u.pathname) ||
      u.pathname === "/api/v1/auth/me"
    );
    const needAuth = u.pathname.startsWith("/api/v1/") && !u.pathname.startsWith("/api/v1/auth/login") && !isPublicRead;
    if (needAuth && !user) return err(res, 401, "chua dang nhap");

    // ---- Auth ----
    if (req.method === "POST" && u.pathname === "/api/v1/auth/login") {
      const body = await readJson(req);
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
    const im = u.pathname.match(/^\/api\/v1\/issues\/(\d+)(?:\/(cover|pdf|download|audit|jobs|submit|reject|publish|unpublish|checklist|retry-processing|pages\/(\d+)\/(flip|thumb)))?$/);
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
    if (u.pathname === "/" || u.pathname === "/bao-in") return serveFile(res, path.join(PUBLIC, "index.html"));
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

async function patchIssue(client, user, issue, b, res) {
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
server.listen(PORT, () => console.log(`E-paper Stage 2 (DB + CMS): http://localhost:${PORT}/bao-in  | CMS: /admin.html`));
