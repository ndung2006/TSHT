// Anh bia thu nho bao in — route /api/v2/epaper/<id>/cover-thumb.
// Siet 2026-11-07 (truoc khi deploy khoi BAO IN):
//  1. Chi id cua so da XUAT BAN (doi chieu danh sach published cua
//     backend — dung nguon /epaper?page=1&limit=100 ma route
//     /api/v2/epaper dang dung; id khac -> 404) va chi 2 kich thuoc
//     400/800 (?size, mac dinh 400; khac -> 400, KHONG dong den
//     backend hay render). Phong thu sau: endpoint chi tiet cua backend
//     cung 404 neu chua xuat ban, va fetch PDF cung 404 — nen du list
//     cache 60s con hoi cu thi ket qua xau nhat van la anh du phong,
//     khong bao gio lo anh cua so chua xuat ban.
//  2. Render gioi han: toi da 2 dong thoi (hang doi FIFO, toi da 8 cho,
//     cho toi da 15s) + gioi han tan suat theo IP: toi da 30 luot XIN
//     RENDER / 60s / IP (chi tinh luot cache-miss — anh da cache phuc
//     vu thang, khong ton CPU). Qua nguong / het hang / het gio cho /
//     loi render -> tra ANH DU PHONG (200 + header X-Cover-Fallback),
//     KHONG tra 429: the <img> trang chu khong co onerror nen 429 se
//     hien anh vo; anh du phong giu bo cuc nguyen trong khi van chan
//     duoc viec dot CPU (render moi la phan ton kem).
//  3. Khoa cache theo id + phien ban PDF: backend tra pageVersion =
//     "<size>-<mtimeMs>" cua file PDF (xem publishedPdfInfo ben
//     backend — cung cach backend dung cho cache anh trang); thay PDF
//     thi fingerprint doi -> ten file cache doi -> tu render lai.
//     Khong dung hash noi dung: phai tai het PDF moi hash duoc, mat
//     het tac dung cua cache. File cache cu cung id+size duoc don
//     best-effort sau khi ghi file moi (khong bao gio lam hong request).
//  4. Warmup luc khoi dong (server.mjs): render san 2 size cho 10 so
//     moi nhat, chay nen, loi chi log.
//  5. Dung cu render: pdftoppm (poppler-utils) — Dockerfile cua portal
//     cai san; do that tren PDF mau (xem bao cao): dpi 50 ~32-50ms,
//     peak RSS ~17 MiB; dpi 100 ~47ms, ~21 MiB.
// Luu y: day la module thuan (khong phu thuoc http) de test truc tiep
// bang node --test; server.mjs chi noi cac dep that vao.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";

export const COVER_THUMB_SIZES = { 400: 50, 800: 100 };
export const COVER_THUMB_MAX_CONCURRENT = 2;
export const COVER_THUMB_MAX_QUEUE = 8;
export const COVER_THUMB_QUEUE_WAIT_MS = 15 * 1000;
export const COVER_THUMB_RENDER_TIMEOUT_MS = 20 * 1000;
export const COVER_THUMB_PDF_TIMEOUT_MS = 30 * 1000;
export const COVER_THUMB_RATE_MAX = 30;
export const COVER_THUMB_RATE_WINDOW_MS = 60 * 1000;
export const COVER_THUMB_META_TTL_MS = 60 * 1000;
export const COVER_THUMB_ID_RE = /^[0-9a-f]{24}$/;

function jsonBody(obj) { return Buffer.from(JSON.stringify(obj)); }
function errResult(status, message) {
  return { status, contentType: "application/json", body: jsonBody({ error: message }), headers: {} };
}

// IP client cho rate limit: lay so dau cua X-Forwarded-For (Coolify
// proxy dat header nay) roi moi den socket. Luu y: client noi truc
// tiep co the gia mao X-Forwarded-For, nhung hau qua chi la tu gioi
// han luot render anh bia cua chinh minh — chap nhan duoc.
export function coverThumbClientIp(req) {
  const xff = (req && req.headers && req.headers["x-forwarded-for"]) || "";
  const first = String(xff).split(",")[0].trim();
  if (first) return first;
  return (req && req.socket && req.socket.remoteAddress) || "unknown";
}

// Render that trang 1 cua PDF thanh JPEG bang pdftoppm (poppler-utils).
// Co timeout rieng: qua 20s thi kill tien trinh, khong bao gio treo.
export async function renderPdfPageToJpeg(pdfBuffer, dpi, { timeoutMs = COVER_THUMB_RENDER_TIMEOUT_MS } = {}) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "epaper-cover-"));
  try {
    const pdfPath = path.join(tmpDir, "issue.pdf");
    fs.writeFileSync(pdfPath, pdfBuffer);
    await new Promise((resolve, reject) => {
      execFile("pdftoppm", ["-jpeg", "-r", String(dpi), "-f", "1", "-l", "1", pdfPath, path.join(tmpDir, "page")],
        { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 },
        (e) => (e ? reject(e) : resolve()));
    });
    const jpg = fs.readdirSync(tmpDir).filter((f) => f.endsWith(".jpg")).sort()[0];
    if (!jpg) throw new Error("pdftoppm khong tao file jpg");
    return fs.readFileSync(path.join(tmpDir, jpg));
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

// Cong render: toi da N dong thoi, hang doi FIFO co gioi han + timeout.
// acquire() -> "ok" | "full" (hang doi day) | "timeout" (cho qua lau).
function createRenderGate(maxConcurrent, maxQueue, waitMs) {
  let running = 0;
  const queue = [];
  function pump() {
    while (running < maxConcurrent && queue.length) {
      const w = queue.shift();
      if (w.dead) continue;
      clearTimeout(w.timer);
      running++;
      w.resolve("ok");
    }
  }
  return {
    acquire() {
      if (running < maxConcurrent) { running++; return Promise.resolve("ok"); }
      if (queue.length >= maxQueue) return Promise.resolve("full");
      return new Promise((resolve) => {
        const w = { resolve, dead: false, timer: null };
        w.timer = setTimeout(() => {
          w.dead = true;
          const i = queue.indexOf(w);
          if (i >= 0) queue.splice(i, 1);
          resolve("timeout");
        }, waitMs);
        queue.push(w);
      });
    },
    release() { running = Math.max(0, running - 1); pump(); },
  };
}

function createRateLimiter(max, windowMs) {
  const hits = new Map(); // ip -> { count, start }
  return {
    allow(ip) {
      const now = Date.now();
      const e = hits.get(ip);
      if (!e || now - e.start >= windowMs) { hits.set(ip, { count: 1, start: now }); return true; }
      if (e.count >= max) return false;
      e.count++;
      return true;
    },
    prune() {
      if (hits.size <= 1000) return;
      const now = Date.now();
      for (const [ip, e] of hits) if (now - e.start >= windowMs) hits.delete(ip);
    },
  };
}

function sanitizeFingerprint(v) {
  return String(v || "").replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "").slice(0, 64);
}

export function createCoverThumbService(deps) {
  const {
    coverDir,
    fetchPublishedList, // async () => { ok, items: [{ publicId, publishDate, issueNumber }] }
    fetchIssueVersion, // async (id) => { ok, version, status? } (version = backend pageVersion)
    fetchPdf, // async (id) => Buffer (throw khi loi)
    renderPdf, // async (pdfBuffer, dpi) => Buffer JPEG (throw khi loi)
    readFallback, // () => { contentType, body } | null
    log = () => {},
    maxConcurrent = COVER_THUMB_MAX_CONCURRENT,
    maxQueue = COVER_THUMB_MAX_QUEUE,
    queueWaitMs = COVER_THUMB_QUEUE_WAIT_MS,
    rateMax = COVER_THUMB_RATE_MAX,
    rateWindowMs = COVER_THUMB_RATE_WINDOW_MS,
    metaTtlMs = COVER_THUMB_META_TTL_MS,
  } = deps;

  const gate = createRenderGate(maxConcurrent, maxQueue, queueWaitMs);
  const rateLimiter = createRateLimiter(rateMax, rateWindowMs);

  // Danh sach so da xuat ban (cache RAM 60s, lam moi dedupe: nhieu
  // request cung luc chi gay 1 fetch). Fetch loi thi dung du lieu cu
  // neu co; chua co gi thi bao loi de route tra 502.
  let published = { ids: new Set(), items: [], fetchedAt: 0 };
  let refreshPromise = null;
  async function ensurePublishedList({ force = false } = {}) {
    const now = Date.now();
    if (!force && published.fetchedAt !== 0 && now - published.fetchedAt < metaTtlMs) return { ok: true, stale: false };
    if (refreshPromise) return refreshPromise;
    refreshPromise = (async () => {
      try {
        const r = await fetchPublishedList();
        if (r && r.ok && Array.isArray(r.items)) {
          published = { ids: new Set(r.items.map((it) => it.publicId)), items: r.items, fetchedAt: Date.now() };
          return { ok: true, stale: false };
        }
        if (published.fetchedAt !== 0) return { ok: true, stale: true };
        return { ok: false };
      } catch {
        if (published.fetchedAt !== 0) return { ok: true, stale: true };
        return { ok: false };
      } finally { refreshPromise = null; }
    })();
    return refreshPromise;
  }

  // Fingerprint PDF theo id (cache RAM 60s). Tra { fp } hoac
  // { notFound: true } khi backend noi ro 404 (chua xuat ban / khong
  // co so). Loi mang thi dung fp cu neu co, khong thi fp "" (ten file
  // khong version — che do suy giam, van render duoc).
  const versions = new Map(); // id -> { fp, fetchedAt }
  async function issueFingerprint(id) {
    const now = Date.now();
    const hit = versions.get(id);
    if (hit && now - hit.fetchedAt < metaTtlMs) return { fp: hit.fp };
    try {
      const r = await fetchIssueVersion(id);
      if (r && r.ok) {
        const fp = sanitizeFingerprint(r.version || "");
        versions.set(id, { fp, fetchedAt: Date.now() });
        return { fp };
      }
      if (r && r.status === 404) return { notFound: true };
      if (hit) return { fp: hit.fp };
      return { fp: "" };
    } catch {
      if (hit) return { fp: hit.fp };
      return { fp: "" };
    }
  }

  function cacheNameFor(publicId, size, fp) {
    return fp ? `${publicId}-${size}-${fp}.jpg` : `${publicId}-${size}.jpg`;
  }
  function readCache(cachePath) {
    try {
      const st = fs.statSync(cachePath);
      if (st.size > 0) return fs.readFileSync(cachePath);
    } catch {}
    return null;
  }
  // Don file cache cu cung id+size (phien ban PDF truoc) + file thumb
  // cu kieu <id>-400.jpg. Best-effort, khong bao gio nem loi.
  // KHONG xoa <id>.jpg (route /cover van dung).
  function cleanupOldVersions(publicId, size, keepName) {
    try {
      for (const f of fs.readdirSync(coverDir)) {
        if (f === keepName) continue;
        const oldVersioned = f.startsWith(`${publicId}-${size}-`) && f.endsWith(".jpg");
        const legacyThumb = size === 400 && f === `${publicId}-400.jpg`;
        if (oldVersioned || legacyThumb) {
          try { fs.unlinkSync(path.join(coverDir, f)); } catch {}
        }
      }
    } catch {}
  }
  function jpegResult(buf) {
    // URL on dinh nhung noi dung doi theo PDF -> browser cache 1h
    // (khong 24h nhu truoc) de bia moi khong ket qua lau.
    return { status: 200, contentType: "image/jpeg", body: buf, headers: { "Cache-Control": "public, max-age=3600" } };
  }
  function fallbackResult(reason) {
    const fb = readFallback ? readFallback() : null;
    if (!fb) return errResult(502, "khong render duoc anh bia");
    return { status: 200, contentType: fb.contentType, body: fb.body, headers: { "X-Cover-Fallback": reason, "Cache-Control": "no-store" } };
  }

  // Dam bao co anh bia cho 1 so + 1 size: doc cache, neu chua co thi
  // render (qua cong + rate limit, tru khi skipRateLimit nhu warmup).
  // Tra { status, contentType, body, headers } + _origin de test/warmup
  // biet ket qua la "cached" | "rendered" | "fallback".
  async function ensureCover(publicId, size, { ip = "unknown", applyRateLimit = true } = {}) {
    const dpi = COVER_THUMB_SIZES[size];
    const { fp, notFound } = await issueFingerprint(publicId);
    if (notFound) return { ...errResult(404, "khong tim thay so bao"), _origin: "not-found" };
    const cacheName = cacheNameFor(publicId, size, fp);
    const cachePath = path.join(coverDir, cacheName);
    const hit = readCache(cachePath);
    if (hit) return { ...jpegResult(hit), _origin: "cached" };
    if (applyRateLimit) {
      rateLimiter.prune();
      if (!rateLimiter.allow(ip)) return { ...fallbackResult("rate-limited"), _origin: "fallback" };
    }
    const slot = await gate.acquire();
    if (slot !== "ok") return { ...fallbackResult(slot === "full" ? "queue-full" : "queue-timeout"), _origin: "fallback" };
    try {
      // Kiem tra lai cache: request khac co the vua render xong trong
      // luc cho slot.
      const hit2 = readCache(cachePath);
      if (hit2) return { ...jpegResult(hit2), _origin: "cached" };
      const pdf = await fetchPdf(publicId);
      const jpg = await renderPdf(pdf, dpi);
      if (!jpg || jpg.length === 0) throw new Error("render rong");
      try {
        fs.mkdirSync(coverDir, { recursive: true });
        const tmp = path.join(coverDir, `.${cacheName}.${process.pid}.tmp`);
        fs.writeFileSync(tmp, jpg);
        fs.renameSync(tmp, cachePath);
      } catch {}
      cleanupOldVersions(publicId, size, cacheName);
      return { ...jpegResult(jpg), _origin: "rendered" };
    } catch (e) {
      log(`[cover-thumb] render loi ${publicId}/${size}: ${e && e.message ? e.message : e}`);
      return { ...fallbackResult("render-error"), _origin: "fallback" };
    } finally {
      gate.release();
    }
  }

  // Route GET /api/v2/epaper/<id>/cover-thumb?size=400|800.
  async function serveCoverThumb({ publicId, sizeRaw, ip }) {
    let size;
    if (sizeRaw === undefined || sizeRaw === null || sizeRaw === "") size = 400;
    else if (sizeRaw === "400") size = 400;
    else if (sizeRaw === "800") size = 800;
    else return { ...errResult(400, "size chi nhan 400 hoac 800"), _origin: "bad-size" };
    if (!COVER_THUMB_ID_RE.test(publicId || "")) return { ...errResult(404, "khong tim thay so bao"), _origin: "not-found" };
    const list = await ensurePublishedList();
    if (!list.ok) return { ...errResult(502, "khong lay duoc danh sach bao in"), _origin: "list-error" };
    if (!published.ids.has(publicId)) return { ...errResult(404, "khong tim thay so bao"), _origin: "not-found" };
    return ensureCover(publicId, size, { ip: ip || "unknown", applyRateLimit: true });
  }

  // Warmup luc khoi dong: render san 2 size cho N so moi nhat (sap
  // xep giong home.js: ngay phat hanh giam dan, cung ngay thi so lon
  // truoc). Chay nen, khong nem loi, chi log tong ket.
  async function warmupCovers(limit = 10) {
    const started = Date.now();
    let rendered = 0, cached = 0, failed = 0;
    const failures = [];
    try {
      const list = await ensurePublishedList({ force: true });
      if (!list.ok) {
        log("[cover-warmup] khong lay duoc danh sach so bao");
        return { ok: false, rendered, cached, failed };
      }
      const items = [...published.items].sort((a, b) => {
        const da = String(a.publishDate || ""), db = String(b.publishDate || "");
        if (db !== da) return db < da ? -1 : 1;
        return (Number(b.issueNumber) || 0) - (Number(a.issueNumber) || 0);
      }).slice(0, limit);
      for (const it of items) {
        for (const size of [400, 800]) {
          try {
            const r = await ensureCover(it.publicId, size, { applyRateLimit: false });
            if (r._origin === "rendered") rendered++;
            else if (r._origin === "cached") cached++;
            else { failed++; failures.push(`${it.publicId}/${size}`); }
          } catch (e) {
            failed++;
            failures.push(`${it.publicId}/${size}`);
          }
        }
      }
    } catch (e) {
      log(`[cover-warmup] loi: ${e && e.message ? e.message : e}`);
    }
    log(`[cover-warmup] ${rendered} render moi, ${cached} co san, ${failed} loi (${Date.now() - started}ms)${failures.length ? " — loi: " + failures.join(", ") : ""}`);
    return { ok: failed === 0, rendered, cached, failed };
  }

  return { serveCoverThumb, warmupCovers, ensureCover, cacheNameFor };
}
