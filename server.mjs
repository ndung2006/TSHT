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
import { Readable } from "node:stream";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { STORAGE_DIR } from "./lib/db.mjs";
import { createVtcanySession, sessionEntryFromRequest, destroySession, userFromRequest, sessionCookie } from "./lib/auth.mjs";
import { vtcanyAuthEnabled, loginToVtcany, fetchVtcanyMe, mapVtcanyToTshtRole, verifyVtcanySession } from "./lib/vtcany-auth.mjs";
import { fetchVtcaioChannels, fetchVtcaioSchedule, fetchVtcaioToken, resolveVtcaioChannelName, vtcaioConfigured, getAioTimeshiftCoverage, findAioCoverageEntry, fetchAioTimeshiftPlaylist } from "./lib/vtcaio.mjs";
import { fetchVtcanyEpg, fetchVtcanyTimeshift, fetchVtcanyGroups, mapVtcanyTimeline, resolveVtcanyChannelName, vtcanyConfigured, vtcanyApiBase, computeEpgStatus } from "./lib/vtcany.mjs";
import { createThumbMemoryStore, mergeThumbMemory } from "./lib/epg-thumb-memory.mjs";
import { adDisplayItem, sanitizePlacement } from "./lib/ads.mjs";
import { stitchTimeshiftPlaylists, TIMESHIFT_MAX_MS } from "./lib/timeshift.mjs";
import { escapeXml, truncateDescription, publicOrigin, buildArticleMeta, buildCategoryMeta, decideCategoryRoute, buildSitemapXml, buildRobotsTxt, flattenCategorySlugs } from "./lib/seo.mjs";
import { clearReaderSessionCookie, jwtExpiryMs, readReaderSession, readerAuthConfigured, readerSessionCookie } from "./lib/reader-session.mjs";
import { renderFooter } from "./lib/footer-content.mjs";

// ---- Cache link live + master manifest (rut ngan khoi dong player) ----
// Do truoc (2026-11-05, curl tu VM): /api/v1/live fetch EPG tu VTCANY
// mat ~1,9s, trinh duyet lai fetch master manifest tu AIO ~1,4s, media
// playlist ~1,3s, segment dau 360p ~2,0s — noi tiep nhau ~7s moi co
// frame dau (khop quan sat 10–12s tren trinh duyet). Cache o day giu
// san URL + noi dung master (TTL 10 phut, lam moi nen moi 5 phut) de
// lan mo sau chi con: live (local) + master proxy (local) + media
// playlist + segment dau (~3,5s). Master van giu nguyen noi dung goc
// (URL bien the tuyet doi kem token) nen hls.js van tu chon muc + ABR
// binh thuong; het han thi lam moi, loi thi roi ve URL truc tiep.
const LIVE_LINK_TTL_MS = 10 * 60 * 1000;
const liveLinkCache = new Map(); // channel -> { masterText, hlsUrl, exp, publicId, fetchedAt }
// Bo nho anh dai dien EPG (chi RAM, mat khi restart — xem lib/epg-thumb-memory.mjs):
// AIO gan anh sau khi chuong trinh ket thuc ~1-2 phut, anh co the tra rong
// tam thoi o lan fetch sau; bo nho giu anh da thay de the khong mat anh.
const epgThumbStore = createThumbMemoryStore();
async function fetchLiveLink(channel, { force = false } = {}) {
  const now = Date.now();
  const hit = liveLinkCache.get(channel);
  if (!force && hit && now - hit.fetchedAt < LIVE_LINK_TTL_MS && (hit.exp == null || hit.exp > now + 5 * 60 * 1000)) return hit;
  if (!vtcanyConfigured()) return hit || null;
  const epg = await fetchVtcanyEpg(channel, saigonToday());
  if (!epg.ok || !epg.channel.hls_url) return hit || null;
  const entry = { masterText: hit && hit.hlsUrl === epg.channel.hls_url ? hit.masterText : null, hlsUrl: epg.channel.hls_url, exp: epg.channel.hls_exp || null, publicId: epg.public_id, fetchedAt: now };
  try {
    const ac = new AbortController();
    const to = setTimeout(() => ac.abort(), 8000);
    const r = await fetch(entry.hlsUrl, { signal: ac.signal });
    clearTimeout(to);
    if (r.ok) entry.masterText = await r.text();
  } catch (e) { /* giu hlsUrl truc tiep, client tu fetch master */ }
  entry.fetchedAt = Date.now();
  liveLinkCache.set(channel, entry);
  return entry;
}
setInterval(() => {
  for (const ch of [...liveLinkCache.keys()]) fetchLiveLink(ch, { force: true }).catch(() => {});
}, 5 * 60 * 1000);

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, "public");
const VENDOR = {
  "/vendor/page-flip.js": "node_modules/page-flip/dist/js/page-flip.browser.js",
  "/vendor/pdfjs.mjs": "node_modules/pdfjs-dist/build/pdf.mjs",
  "/vendor/pdf.worker.mjs": "node_modules/pdfjs-dist/build/pdf.worker.mjs",
};
const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json", ".pdf": "application/pdf", ".json": "application/json" };


function send(res, code, body, type = "text/plain", extra = {}) {
  res.writeHead(code, { "Content-Type": `${type}; charset=utf-8`, ...extra }); res.end(body);
}
const json = (res, code, obj, extra) => send(res, code, JSON.stringify(obj), "application/json", extra);
const err = (res, code, message) => json(res, code, { error: message });
function serveFile(res, file, downloadName, pathname) {
  if (!file) return err(res, 404, "not found");
  fs.readFile(file, async (e, data) => {
    if (e) return err(res, 404, "not found");
    const h = downloadName ? { "Content-Disposition": `attachment; filename="${downloadName}"` } : {};
    // Cache: HTML/JS/CSS phai revalidate moi lan mo, neu khong trinh duyet giu
    // ban cu sau redeploy va HTML moi + JS/CSS cu lan nhau se vo trang doc
    // (vi du JS cu crash khi khong tim thay nut mode-flip cua HTML moi).
    if (!downloadName && [".html", ".js", ".mjs", ".css"].includes(path.extname(file))) h["Cache-Control"] = "no-cache, must-revalidate";
    // Trang HTML: chen header/footer chung (partial) truoc khi tra.
    if (!downloadName && path.extname(file) === ".html") {
      let body = data.toString("utf8");
      try { body = await injectChrome(body, pathname || ""); } catch { /* loi chen: giu HTML goc */ }
      return send(res, 200, body, MIME[".html"], h);
    }
    send(res, 200, data, MIME[path.extname(file)] || "application/octet-stream", h);
  });
}
// ---- Header/footer chung (2026-11-05): server dung san + chen vao HTML ----
// Moi trang doc dung 1 partial header (public/partials/header.html) thay
// vi chep tay 3 khoi header o moi file HTML. Menu do + bang mega + ngan
// keo mobile duoc server dung san tu cau hinh CMS (menu Quan ly giao
// dien, fallback cay chuyen muc day du) nen co mat ngay trong HTML dau
// tien; JS (header.js) chi them hanh vi, khong build menu nua.
function readPartial(name) {
  try { return fs.readFileSync(path.join(PUBLIC, "partials", name), "utf8"); } catch { return ""; }
}
const HEADER_PARTIAL = readPartial("header.html");
const FOOTER_PARTIAL = readPartial("footer.html");
// Chan trang chung: noi dung (giay phep, ban bien tap, lien he) lay tu
// lib/footer-content.mjs chen san 1 lan luc khoi dong (noi dung tinh,
// doi nhan su thi sua file cau hinh + redeploy). Logo van do header.js
// dien tu CMS (footer.logo) luc chay, nhu cu.
const FOOTER_HTML = renderFooter(FOOTER_PARTIAL);

// Dem cau hinh giao dien + cay chuyen muc (60 giay): de moi lan tra trang
// khong phai goi backend 2 lan. Het han thi fetch lai; neu fetch loi thi
// giu du lieu cu (ke ca qua han) de menu khong bao gio rong; chi khi
// chua tung lay duoc gi thi menu de trong (lan khoi dong dau + backend
// chet cung luc — hiem, trang van tra binh thuong).
const CHROME_CACHE_TTL_MS = 60 * 1000;
const siteInterfaceCache = { data: null, expiresAt: 0 };
const categoriesCache = { data: null, expiresAt: 0 };
function siteInterfaceWhitelist(d) {
  const str = (v) => (typeof v === "string" ? v : "");
  const menuItem = (m) => (m && m.slug ? {
    name: str(m.name), slug: str(m.slug),
    children: (m.children || []).filter((k) => k && k.slug).map((k) => ({ name: str(k.name), slug: str(k.slug) })),
  } : null);
  return {
    menu: (d.menu || []).map(menuItem).filter(Boolean),
    homeSections: (d.homeSections || []).filter((s) => s && s.slug).map((s) => ({ name: str(s.name), slug: str(s.slug) })),
    hotLinks: (d.hotLinks || []).filter((h) => h && h.slug).map((h) => ({ title: str(h.title), slug: str(h.slug) })),
    header: {
      image: d.header && d.header.image ? resolveVtcanyImageUrl(d.header.image) : "",
      email: d.header ? str(d.header.email) : "", facebook: d.header ? str(d.header.facebook) : "",
      youtube: d.header ? str(d.header.youtube) : "", tiktok: d.header ? str(d.header.tiktok) : "",
      zalo: d.header ? str(d.header.zalo) : "", phone: d.header ? str(d.header.phone) : "",
      // Link ENGLISH: CMS dat trong Quan ly giao dien (header.englishUrl);
      // rong = chua dat -> server dung tam ban tieng Anh cua Dien Bien.
      englishUrl: d.header ? str(d.header.englishUrl) : "",
    },
    footer: {
      logo: d.footer && d.footer.logo ? resolveVtcanyImageUrl(d.footer.logo) : "",
      // description/copyright van tra qua API /api/v2/site-interface
      // (de CMS hien thi + de sau dua noi dung chan trang vao CMS),
      // nhung chan trang portal tu 2026-11-06 khong render 2 field nay
      // nua — noi dung lay tu lib/footer-content.mjs.
      description: d.footer ? str(d.footer.description) : "", copyright: d.footer ? str(d.footer.copyright) : "",
    },
    favicon: {
      image: d.favicon && d.favicon.image ? resolveVtcanyImageUrl(d.favicon.image) : "",
      name: d.favicon ? str(d.favicon.name) : "", description: d.favicon ? str(d.favicon.description) : "",
    },
  };
}
async function getSiteInterface() {
  const now = Date.now();
  if (siteInterfaceCache.data && now < siteInterfaceCache.expiresAt) return siteInterfaceCache.data;
  try {
    const ext = await fetchVtcanyEpaperJson(`/site-interface`);
    if (!ext.ok) throw new Error(ext.reason || "fetch_failed");
    const w = siteInterfaceWhitelist(ext.data || {});
    siteInterfaceCache.data = w;
    siteInterfaceCache.expiresAt = now + CHROME_CACHE_TTL_MS;
    return w;
  } catch {
    // Loi: tra du lieu cu (ke ca qua han) de menu khong rong; chua co gi thi null.
    return siteInterfaceCache.data;
  }
}
async function getCategories() {
  const now = Date.now();
  if (categoriesCache.data && now < categoriesCache.expiresAt) return categoriesCache.data;
  try {
    const ext = await fetchVtcanyEpaperJson(`/news-categories`);
    if (!ext.ok) throw new Error(ext.reason || "fetch_failed");
    const data = ext.data || [];
    categoriesCache.data = data;
    categoriesCache.expiresAt = now + CHROME_CACHE_TTL_MS;
    return data;
  } catch {
    return categoriesCache.data;
  }
}
function clearChromeCache() {
  siteInterfaceCache.data = null;
  siteInterfaceCache.expiresAt = 0;
  categoriesCache.data = null;
  categoriesCache.expiresAt = 0;
}
// Muc chuyen trang cua route hien tai (de to noi dai tren). /lich-phat-song
// khong co link tren dai tren nen tra ve chinh no nhung khong co link nao khop.
function sectionForPath(pathname) {
  const p = String(pathname || "");
  if (p === "/truyen-hinh" || p === "/phat-thanh" || p === "/bao-in" || p === "/nen-tang-so" || p === "/su-kien" || p === "/tuong-thuat" || p === "/lich-phat-song") return p;
  if (p.startsWith("/su-kien/")) return "/su-kien";
  if (p.startsWith("/tuong-thuat/")) return "/tuong-thuat";
  if (p.startsWith("/bao-in/")) return "/bao-in";
  return "";
}
// Slug muc cha dang xem tren thanh do: /chuyen-muc/<slug>; slug la muc con
// thi to noi muc cha cua no.
function activeCatSlug(pathname, cats) {
  const m = /^\/chuyen-muc\/([a-z0-9-]+)$/.exec(String(pathname || ""));
  if (!m) return "";
  const slug = m[1];
  const tree = cats || [];
  if (tree.some((c) => c && c.slug === slug)) return slug;
  for (const c of tree) {
    if ((c.children || []).some((k) => k && k.slug === slug)) return c.slug;
  }
  return "";
}
// Link ENGLISH tam thoi: dung gia tri CMS dat (header.englishUrl); neu
// CMS chua dat thi tam tro sang ban tieng Anh cua Bao Dien Bien Phu
// (cho CMS dat link chinh thuc cua toa soan sau).
const ENGLISH_FALLBACK_URL = "https://en.baodienbienphu.com.vn";
function englishUrlFor(si) {
  const v = si && si.header && typeof si.header.englishUrl === "string" ? si.header.englishUrl.trim() : "";
  return v || ENGLISH_FALLBACK_URL;
}
// Menu do: giong het DOM ma home.js/tv.js build bang JS truoc day (de sau
// khi JS chay, DOM giong het ban cu): muc cha la link /chuyen-muc/<slug>,
// muc con trong .catnav-drop (nut ▾ mo/dong).
function buildCatnavItems(displayCats, activeSlug) {
  return (displayCats || []).filter((c) => c && c.slug).map((c) => {
    const active = activeSlug && c.slug === activeSlug;
    const kids = (c.children || []).filter((k) => k && k.slug);
    let h = `<div class="catnav-item${active ? " is-active" : ""}"><a href="/chuyen-muc/${encodeURIComponent(c.slug)}"${active ? " aria-current=\"page\"" : ""}>${escapeXml(c.name)}</a>`;
    if (kids.length) {
      h += `<button type="button" class="catnav-caret" aria-label="Hiện mục con của ${escapeXml(c.name)}" aria-expanded="false">▾</button><div class="catnav-drop">`;
      h += kids.map((k) => `<a href="/chuyen-muc/${encodeURIComponent(k.slug)}">${escapeXml(k.name)}</a>`).join("");
      h += `</div>`;
    }
    return h + `</div>`;
  }).join("");
}
function buildMegaMenu(cats) {
  const cols = (cats || []).filter((c) => c && c.slug).map((c) => {
    const kids = (c.children || []).filter((k) => k && k.slug);
    let h = `<div class="mega-col"><a class="mega-parent" href="/chuyen-muc/${encodeURIComponent(c.slug)}">${escapeXml(c.name)}</a>`;
    h += kids.map((k) => `<a class="mega-child" href="/chuyen-muc/${encodeURIComponent(k.slug)}">${escapeXml(k.name)}</a>`).join("");
    return h + `</div>`;
  }).join("");
  if (!cols) return "";
  return `<button type="button" class="mega-close" aria-label="Đóng toàn bộ chuyên mục">✕</button><div class="mega-grid">${cols}</div>`;
}
// Link dai tren trong ngan keo (giong utilitybar) + cay chuyen muc.
const DRAWER_TOP_LINKS = [
  { href: "/truyen-hinh", label: "📺 TRUYỀN HÌNH" },
  { href: "/phat-thanh", label: "📻 PHÁT THANH" },
  { href: "/bao-in", label: "📰 BÁO IN" },
  { href: "/nen-tang-so", label: "▦ NỀN TẢNG SỐ" },
  { href: "/su-kien", label: "📅 SỰ KIỆN" },
  { href: "/tuong-thuat", label: "🎙️ TƯỜNG THUẬT" },
];
function buildDrawerContent(cats, pathname, englishUrl) {
  const section = sectionForPath(pathname);
  const top = DRAWER_TOP_LINKS.map((l) =>
    `<a href="${l.href}"${l.href === section ? " aria-current=\"page\"" : ""}>${l.label}</a>`).join("") +
    `<a class="lang-note" href="${escapeXml(englishUrl)}" target="_blank" rel="noopener" title="Bản tiếng Anh">🌐 ENGLISH</a>` +
    `<button type="button" class="reader-auth-open" data-reader-auth-open>👤 ĐĂNG NHẬP</button>` +
    `<span class="reader-account" data-reader-account hidden><button type="button" class="reader-account-btn" data-reader-account-btn><span class="reader-account-name" data-reader-account-name></span> ▾</button><span class="reader-account-menu" data-reader-account-menu hidden><a href="/tai-khoan">Tài khoản của tôi</a><button type="button" data-reader-logout>Đăng xuất</button></span></span>`;
  const catRows = (cats || []).filter((c) => c && c.slug).map((c) => {
    const kids = (c.children || []).filter((k) => k && k.slug);
    let h = `<div class="drawer-cat"><a class="drawer-cat-link" href="/chuyen-muc/${encodeURIComponent(c.slug)}">${escapeXml(c.name)}</a>`;
    if (kids.length) {
      h += `<button type="button" class="drawer-cat-toggle" aria-label="Hiện mục con của ${escapeXml(c.name)}" aria-expanded="false">▾</button><div class="drawer-cat-children">`;
      h += kids.map((k) => `<a href="/chuyen-muc/${encodeURIComponent(k.slug)}">${escapeXml(k.name)}</a>`).join("");
      h += `</div>`;
    }
    return h + `</div>`;
  }).join("");
  return `<nav class="site-drawer-top" aria-label="Chuyên trang">${top}</nav><nav class="site-drawer-cats" aria-label="Chuyên mục">${catRows}</nav>`;
}
async function buildHeaderHtml(pathname) {
  if (!HEADER_PARTIAL) return "";
  const [si, cats] = await Promise.all([getSiteInterface(), getCategories()]);
  const menu = si && si.menu && si.menu.length ? si.menu : (cats || []);
  const activeSlug = activeCatSlug(pathname, cats || []);
  const englishUrl = englishUrlFor(si);
  let h = HEADER_PARTIAL;
  h = h.replace("<!-- @ENGLISH_URL -->", escapeXml(englishUrl));
  // To noi dai tren + nut Trang chu theo route (lam truoc khi chen noi
  // dung ngan keo, luc nay trong header chi co link dai tren).
  const section = sectionForPath(pathname);
  if (section) h = h.replace(`<a href="${section}">`, `<a href="${section}" aria-current="page">`);
  if (pathname === "/") h = h.replace(`<a href="/" class="home-link"`, `<a href="/" class="home-link" aria-current="page"`);
  h = h.replace("<!-- @CATNAV_ITEMS -->", buildCatnavItems(menu, activeSlug));
  h = h.replace("<!-- @MEGA_MENU -->", buildMegaMenu(cats || []));
  h = h.replace("<!-- @DRAWER_CONTENT -->", buildDrawerContent(cats || [], pathname, englishUrl));
  return h;
}
async function injectChrome(html, pathname) {
  if (typeof html !== "string") return html;
  let out = html;
  if (out.includes("<!-- @HEADER -->")) {
    const header = await buildHeaderHtml(pathname);
    if (header) out = out.replace("<!-- @HEADER -->", header);
  }
  if (out.includes("<!-- @FOOTER -->") && FOOTER_HTML) {
    out = out.replace("<!-- @FOOTER -->", FOOTER_HTML);
  }
  return out;
}
function serve404(res, pathname) {
  fs.readFile(path.join(PUBLIC, "404.html"), "utf8", async (e, data) => {
    if (e) return err(res, 404, "not found");
    let body = data;
    try { body = await injectChrome(data, pathname || ""); } catch { /* giu HTML goc */ }
    send(res, 404, body, "text/html", { "Cache-Control": "no-cache, must-revalidate" });
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
      u.pathname === "/api/v1/live-master" ||
      u.pathname === "/api/v1/timeshift" ||
      u.pathname === "/api/v1/timeshift-coverage" ||
      u.pathname === "/api/v2/epaper" ||
      /^\/api\/v2\/epaper\/[0-9a-f]{24}(\/pdf|\/cover|\/pages\/\d+)?$/.test(u.pathname) ||
      u.pathname === "/api/v2/news" ||
      u.pathname === "/api/v2/news/search" ||
      /^\/api\/v2\/news\/[a-z0-9-]+$/.test(u.pathname) ||
      u.pathname === "/api/v2/news-categories" ||
      u.pathname === "/api/v2/site-interface" ||
      u.pathname === "/api/v2/home-blocks" ||
      /^\/api\/v2\/zones\/[a-z0-9-]+$/.test(u.pathname) ||
      /^\/api\/v2\/home-slots\/[a-z0-9-]+$/.test(u.pathname) ||
      u.pathname === "/api/v2/distribution" ||
      u.pathname === "/api/v2/events" ||
      /^\/api\/v2\/events\/[a-z0-9-]+$/.test(u.pathname) ||
      u.pathname === "/api/v2/liveblogs" ||
      /^\/api\/v2\/liveblogs\/[a-z0-9-]+$/.test(u.pathname) ||
      u.pathname === "/api/v2/ads" ||
      u.pathname === "/api/v2/catalog-videos" ||
      u.pathname === "/api/v2/catalog-categories" ||
      /^\/api\/v2\/vod\/(video|short|episode)\/[0-9a-f]{24}\/play$/.test(u.pathname) ||
      /^\/api\/v2\/media\/[A-Za-z0-9_-]{1,64}\/mp4$/.test(u.pathname) ||
      u.pathname === "/api/v1/auth/me"
    )) || (req.method === "POST" && (u.pathname === "/api/v1/stream-token" || u.pathname === "/api/v1/internal/invalidate-site-interface"));
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
      return json(res, 200, { ok: true }, { "Set-Cookie": "epaper_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0" });
    }
    // ---- Dang nhap / dang ky ban doc (Giai doan 1, 2026-11-06) ----
    // Portal lam proxy sang backend VTCANY (/api/v1/auth/user/*): trinh
    // duyet khong bao gio goi thang backend moi. Phien ban doc la cookie
    // tsht_reader ma hoa (lib/reader-session.mjs) — song qua restart
    // portal; refresh token luu DB ben backend nen song qua deploy.
    // Header x-webhook-secret (secret noi bo MEDIA_WEBHOOK_SECRET) danh
    // dau request di qua portal de backend bat captcha Turnstile khi da
    // cau hinh; chi lam tang yeu cau, khong bo qua kiem tra nao.
    if (u.pathname.startsWith("/api/v2/reader/")) {
      const portalHeaders = { "Content-Type": "application/json" };
      const webhookSecret = (process.env.MEDIA_WEBHOOK_SECRET || "").trim();
      if (webhookSecret) portalHeaders["x-webhook-secret"] = webhookSecret;
      const backendAuth = async (path, { method = "GET", body, token } = {}) => {
        const base = vtcanyApiBase();
        if (!base) return { ok: false, status: 503, data: { message: "backend chua cau hinh" } };
        try {
          const headers = { ...portalHeaders, Accept: "application/json" };
          if (token) headers.Authorization = `Bearer ${token}`;
          const r = await fetch(base + path, {
            method,
            headers,
            body: body === undefined ? undefined : JSON.stringify(body),
            signal: AbortSignal.timeout(10000),
          });
          const text = await r.text();
          let data = null;
          try { data = JSON.parse(text); } catch { data = null; }
          return { ok: r.ok, status: r.status, data };
        } catch {
          return { ok: false, status: 503, data: { message: "backend khong truy cap duoc, vui long thu lai sau" } };
        }
      };
      const readerError = (r) => {
        const raw = r.data && (r.data.message || r.data.error);
        const msg = Array.isArray(raw) ? raw.join("; ") : (raw || "co loi xay ra, vui long thu lai sau");
        return { error: String(msg) };
      };
      // Lay cap token ban doc tu cookie; access sap het (<60s) thi doi
      // refresh truoc (xoay vong — refresh cu chet ngay) va tra kem
      // cookie moi de endpoint ghi vao response.
      const getReaderSession = async () => {
        const sess = readReaderSession(req);
        if (!sess) return { session: null, cookie: null };
        if (jwtExpiryMs(sess.accessToken) > Date.now() + 60_000) return { session: sess, cookie: null };
        const r = await backendAuth("/auth/refresh", { method: "POST", body: { refresh_token: sess.refreshToken } });
        if (!r.ok || !r.data?.access_token || !r.data?.refresh_token) return { session: null, cookie: null };
        const session = { accessToken: r.data.access_token, refreshToken: r.data.refresh_token };
        return { session, cookie: readerSessionCookie(session.accessToken, session.refreshToken) };
      };
      // Goi backend voi access token; 401 thi doi refresh 1 lan roi goi
      // lai bang cap moi (doi mat khau o noi khac/bi khoa thi refresh cung
      // chet -> tra 401). Tra kem cookie moi neu co.
      const callWithReader = async (fn) => {
        let { session, cookie } = await getReaderSession();
        if (!session) return { result: { ok: false, status: 401, data: { message: "chua dang nhap" } }, cookie: null };
        let r = await fn(session.accessToken);
        if (r.status !== 401) return { result: r, cookie };
        const rr = await backendAuth("/auth/refresh", { method: "POST", body: { refresh_token: session.refreshToken } });
        if (!rr.ok || !rr.data?.access_token || !rr.data?.refresh_token) {
          return { result: { ok: false, status: 401, data: { message: "chua dang nhap" } }, cookie: null };
        }
        const fresh = { accessToken: rr.data.access_token, refreshToken: rr.data.refresh_token };
        return { result: await fn(fresh.accessToken), cookie: readerSessionCookie(fresh.accessToken, fresh.refreshToken) };
      };
      const withCookie = (cookie) => (cookie ? { "Set-Cookie": cookie } : undefined);
      if (req.method === "GET" && u.pathname === "/api/v2/reader/config") {
        return json(res, 200, {
          configured: readerAuthConfigured(),
          turnstileSiteKey: (process.env.TURNSTILE_SITE_KEY || "").trim() || null,
        });
      }
      if (!readerAuthConfigured()) return err(res, 503, "dang nhap ban doc chua cau hinh");
      if (req.method === "POST" && u.pathname === "/api/v2/reader/register") {
        const body = await readJson(req).catch(() => null);
        if (!body) return err(res, 400, "du lieu khong hop le");
        const r = await backendAuth("/auth/user/register", { method: "POST", body });
        if (!r.ok) return json(res, r.status, readerError(r));
        return json(res, 200, r.data);
      }
      if (req.method === "POST" && u.pathname === "/api/v2/reader/verify-email") {
        const body = await readJson(req).catch(() => null);
        if (!body) return err(res, 400, "du lieu khong hop le");
        const r = await backendAuth("/auth/user/verify-email", { method: "POST", body });
        if (!r.ok) return json(res, r.status, readerError(r));
        return json(res, 200, r.data);
      }
      if (req.method === "POST" && u.pathname === "/api/v2/reader/resend-verification") {
        const body = await readJson(req).catch(() => null);
        if (!body) return err(res, 400, "du lieu khong hop le");
        const r = await backendAuth("/auth/user/resend-verification", { method: "POST", body });
        if (!r.ok) return json(res, r.status, readerError(r));
        return json(res, 200, r.data);
      }
      if (req.method === "POST" && u.pathname === "/api/v2/reader/forgot-password") {
        const body = await readJson(req).catch(() => null);
        if (!body) return err(res, 400, "du lieu khong hop le");
        const r = await backendAuth("/auth/user/forgot-password", { method: "POST", body });
        if (!r.ok) return json(res, r.status, readerError(r));
        return json(res, 200, r.data);
      }
      if (req.method === "POST" && u.pathname === "/api/v2/reader/reset-password") {
        const body = await readJson(req).catch(() => null);
        if (!body) return err(res, 400, "du lieu khong hop le");
        const r = await backendAuth("/auth/user/reset-password", { method: "POST", body });
        if (!r.ok) return json(res, r.status, readerError(r));
        return json(res, 200, r.data);
      }
      if (req.method === "POST" && u.pathname === "/api/v2/reader/login") {
        const body = await readJson(req).catch(() => null);
        if (!body) return err(res, 400, "du lieu khong hop le");
        const r = await backendAuth("/auth/user/login", { method: "POST", body });
        if (!r.ok) return json(res, r.status, readerError(r));
        // Chi tra user ve trinh duyet; token nam trong cookie ma hoa.
        const cookie = readerSessionCookie(r.data.access_token, r.data.refresh_token);
        return json(res, 200, { user: r.data.user }, cookie ? { "Set-Cookie": cookie } : undefined);
      }
      if (req.method === "POST" && u.pathname === "/api/v2/reader/logout") {
        const sess = readReaderSession(req);
        if (sess) await backendAuth("/auth/user/logout", { method: "POST", body: { refresh_token: sess.refreshToken } }).catch(() => null);
        return json(res, 200, { ok: true }, { "Set-Cookie": clearReaderSessionCookie() });
      }
      if (req.method === "GET" && u.pathname === "/api/v2/reader/me") {
        const { result, cookie } = await callWithReader((token) => backendAuth("/auth/me", { token }));
        if (!result.ok) return json(res, result.status, readerError(result), withCookie(cookie));
        return json(res, 200, result.data, withCookie(cookie));
      }
      if (req.method === "PATCH" && u.pathname === "/api/v2/reader/me") {
        const body = await readJson(req).catch(() => null);
        if (!body) return err(res, 400, "du lieu khong hop le");
        const { result, cookie } = await callWithReader((token) => backendAuth("/auth/user/me", { method: "PATCH", body, token }));
        if (!result.ok) return json(res, result.status, readerError(result), withCookie(cookie));
        return json(res, 200, result.data, withCookie(cookie));
      }
      if (req.method === "POST" && u.pathname === "/api/v2/reader/change-password") {
        const body = await readJson(req).catch(() => null);
        if (!body) return err(res, 400, "du lieu khong hop le");
        const { result, cookie } = await callWithReader((token) => backendAuth("/auth/user/change-password", { method: "POST", body, token }));
        if (!result.ok) return json(res, result.status, readerError(result), withCookie(cookie));
        // Doi mat khau thu hoi toan bo refresh token -> phien hien tai
        // chet, buoc dang nhap lai bang mat khau moi.
        return json(res, 200, { ok: true, relogin: true }, { "Set-Cookie": clearReaderSessionCookie() });
      }
      if (req.method === "POST" && u.pathname === "/api/v2/reader/request-deletion") {
        const body = await readJson(req).catch(() => null);
        if (!body) return err(res, 400, "du lieu khong hop le");
        const { result, cookie } = await callWithReader((token) => backendAuth("/auth/user/request-deletion", { method: "POST", body, token }));
        if (!result.ok) return json(res, result.status, readerError(result), withCookie(cookie));
        return json(res, 200, { ok: true }, { "Set-Cookie": clearReaderSessionCookie() });
      }
      return err(res, 404, "not found");
    }
    // ---- Xoa dem header (CMS luu Giao dien) ----
    // POST /api/v1/internal/invalidate-site-interface — chi xoa dem
    // site-interface + news-categories o server portal (menu/header moi se
    // duoc dung lai o lan tra trang ke tiep). Bao ve bang x-webhook-secret
    // (cung secret + cach kiem nhu /internal/rollup-daily ben backend:
    // secret = MEDIA_WEBHOOK_SECRET). Khong can session CMS.
    if (req.method === "POST" && u.pathname === "/api/v1/internal/invalidate-site-interface") {
      const expected = process.env.MEDIA_WEBHOOK_SECRET || "";
      const secret = req.headers["x-webhook-secret"];
      if (!expected || secret !== expected) return err(res, 403, "forbidden");
      clearChromeCache();
      return json(res, 200, { ok: true });
    }

    // ---- Channels (public list, vtcaio only) ----
    if (u.pathname === "/api/v1/channels") {
      if (req.method === "GET") {
        // Pha B (quyet 2026-10-28: bo han chan DB, loi thi bao loi):
        // nguon duy nhat la vtcaio; loi thi tra danh sach rong kem
        // thong bao loi ro rang, khong tra kenh du phong cu.
        // Gan them logo/banner HIEN THI tu catalog backend (CMS
        // Truyen hinh -> Quan ly hien thi kenh) theo ten kenh, chay
        // song song de khong cham toc do tra kenh live. Catalog chi
        // la trang tri: loi, khong khop ten, hoac chua dat logo thi
        // FE giu the chu / gradient, khong lam hong danh sach live.
        const [ext, cat] = await Promise.all([
          fetchVtcaioChannels(),
          fetchVtcanyGroups().catch(() => ({ ok: false })),
        ]);
        if (ext.ok) {
          // Khop theo ten KHONG DAU, KHONG KHOANG TRANG: ten hien thi
          // trong CMS co the la 'Tuyen Quang'/'Tuyên Quang' dep (co dau,
          // co khoang trang) trong khi khoa vtcaio la TUYENQUANG;
          // chuan hoa ca 2 ve de ten dep van khop dung kenh. Luu y:
          // chu Đ khong bi tach dau nen khong gay khop nham voi D.
          const normKey = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]/gi, "").toUpperCase();
          let byName = null;
          if (cat && cat.ok && Array.isArray(cat.items)) {
            byName = new Map();
            for (const c of cat.items) if (c && c.name) byName.set(normKey(c.name), c);
          }
          const items = ext.items.map((it) => {
            const m = byName ? byName.get(normKey(it.name)) : null;
            if (!m) return it;
            return {
              ...it,
              logo: m.logo ? resolveVtcanyImageUrl(m.logo) : null,
              banner_url: m.banner_url ? resolveVtcanyImageUrl(m.banner_url) : null,
            };
          });
          return json(res, 200, { items, source: "vtcaio" });
        }
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
      const link = await fetchLiveLink(channel);
      if (link && link.hlsUrl) {
        return json(res, 200, { ok: true, source: "vtcany", channel, public_id: link.publicId, url: link.masterText ? `/api/v1/live-master?channel=${encodeURIComponent(channel)}` : link.hlsUrl, directUrl: link.hlsUrl, exp: link.exp || null });
      }
      return json(res, 200, { ok: false, source: "fallback", channel });
    }

    // Master manifest qua proxy portal (noi dung da cache o server):
    // trinh duyet lay master tu portal (local, nhanh) thay vi tu AIO
    // (~1,4s). Noi dung y nhu master goc nen hls.js van chon muc + ABR
    // binh thuong. Chua co cache thi fetch moi; khong co masterText thi
    // chuyen huong ve URL goc.
    if (req.method === "GET" && u.pathname === "/api/v1/live-master") {
      const channel = String(u.searchParams.get("channel") || "").trim().toUpperCase();
      if (!channel || !/^[A-Z0-9_-]+$/.test(channel)) return err(res, 400, "channel khong hop le (ten kenh viet hoa, khong dau)");
      const link = await fetchLiveLink(channel);
      if (link && link.masterText) return send(res, 200, link.masterText, "application/vnd.apple.mpegurl", { "Cache-Control": "no-store" });
      if (link && link.hlsUrl) { res.writeHead(302, { Location: link.hlsUrl }); res.end(); return; }
      return err(res, 404, "khong co link phat truc tiep");
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
                // Dien lai anh dai dien da tung thay neu lan nay AIO tra rong.
                mergeThumbMemory(epgThumbStore, resolvedV.channel.name, itemsV);
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
              // Cung bo nho anh nhu nguon VTCANY (duong fallback truc tiep AIO).
              mergeThumbMemory(epgThumbStore, resolved.channel.name, enriched.items);
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

    // ---- Proxy MP4 goc (DAM Proxy MP4) ----
    // GET /api/v2/media/<uploadId>/mp4 — stream file MP4 goc tu backend
    // (route /api/v1/media/<uploadId>/file.mp4), la URL on dinh ma ban
    // nhap video gan vao formatData.videoUrl. KHONG buffer nhu proxy PDF
    // (video dai, buffer se nut RAM): stream truc tiep + forward header
    // Range de tua (seek) hoat dong; status/header tra ve nguyen ven
    // (206 + Content-Range tu backend). Khong dat timeout cho fetch nay:
    // AbortSignal.timeout se cat stream giua chung khi phat video dai.
    // Cache no-store: quyen hien thi cua video goc co the doi bat ky luc
    // nao (backend gate theo isVisible), nen proxy khong cache.
    const mediaMp4Match = u.pathname.match(/^\/api\/v2\/media\/([A-Za-z0-9_-]{1,64})\/mp4$/);
    if (mediaMp4Match && req.method === "GET") {
      const base = vtcanyApiBase();
      if (!base) return err(res, 503, "backend media chua cau hinh");
      try {
        const headers = {};
        if (req.headers.range) headers.range = req.headers.range;
        const r = await fetch(`${base}/media/${mediaMp4Match[1]}/file.mp4`, { headers });
        if (!r.ok) return err(res, r.status === 404 ? 404 : 502, r.status === 404 ? "khong tim thay file media" : "khong lay duoc file media");
        const passthrough = {};
        for (const h of ["content-type", "content-length", "content-range", "accept-ranges", "cache-control"]) {
          const v = r.headers.get(h);
          if (v) passthrough[h] = v;
        }
        res.writeHead(r.status, passthrough);
        if (!r.body) return res.end();
        Readable.fromWeb(r.body).on("error", () => res.destroy()).pipe(res);
        return;
      } catch (e) { return err(res, 502, "khong lay duoc file media"); }
    }

    // ---- Tin bai he moi qua proxy (chi bai da xuat ban) ----
    // GET /api/v2/news?page&limit&category&q&featured&spotlight — danh sach bai
    // da xuat ban cua he moi (backend tu loc publishAt <= now).
    // GET /api/v2/news/:slug — chi tiet + related cung chuyen muc.
    // GET /api/v2/news-categories — cay chuyen muc hien.
    // Anh bia tuong doi (/images/...) duoc ghep origin backend nhu bao in.
    function newsListItem(it) {
      return {
        slug: it.slug, title: it.title, sapo: it.sapo,
        publicId: it.publicId || "",
        cover: it.coverPath ? resolveVtcanyImageUrl(it.coverPath) : "",
        category: it.category || null, authors: it.authors || [], tags: it.tags || [],
        publishAt: it.publishAt, isFeatured: !!it.isFeatured,
        contentType: it.contentType || "text",
        metaTitle: it.metaTitle || "", metaDescription: it.metaDescription || "",
        url: `/tin/${it.slug}`,
      };
    }
    // Goi 1B: formatData chi chua URL media; URL tuong doi duoc ghep origin
    // backend nhu anh bia, URL tuyet doi giu nguyen, key la bi loc bo.
    function resolveFormatData(fd) {
      if (!fd || typeof fd !== "object") return null;
      const out = {};
      for (const k of ["videoUrl", "audioUrl", "imageUrl"]) if (fd[k]) out[k] = resolveVtcanyImageUrl(fd[k]);
      if (Array.isArray(fd.images)) out.images = fd.images.filter(Boolean).map(resolveVtcanyImageUrl);
      return Object.keys(out).length ? out : null;
    }
    if (req.method === "GET" && u.pathname === "/api/v2/news") {
      const bq = new URLSearchParams();
      for (const k of ["page", "limit", "category", "q", "featured", "spotlight", "contentType"]) {
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
    // GET /api/v2/news/search — proxy sang backend GET /api/v1/news/search
    // (forward du tham so q,q2,scope,category,contentType,from,to,exact,
    // sort,page,limit); tra {data:[newsListItem], total, page, limit}.
    // Dat TRUOC newsSlugMatch ben duoi: "search" khop regex slug.
    if (req.method === "GET" && u.pathname === "/api/v2/news/search") {
      const bq = new URLSearchParams();
      for (const k of ["q", "q2", "scope", "category", "contentType", "from", "to", "exact", "sort", "page", "limit"]) {
        const v = u.searchParams.get(k);
        if (v) bq.set(k, v);
      }
      const ext = await fetchVtcanyEpaperJson(`/news/search?${bq}`);
      if (!ext.ok) return err(res, ext.reason === "not_configured" ? 503 : 502, "khong tim duoc tin bai");
      const d = ext.data || {};
      const items = (d.data || []).map(newsListItem);
      return json(res, 200, { data: items, total: d.total || 0, page: d.page || 1, limit: d.limit || 20 });
    }
    const newsSlugMatch = u.pathname.match(/^\/api\/v2\/news\/([a-z0-9-]+)$/);
    if (req.method === "GET" && newsSlugMatch) {
      const ext = await fetchVtcanyEpaperJson(`/news/${newsSlugMatch[1]}`);
      if (!ext.ok) return err(res, ext.status === 404 ? 404 : 502, "khong tim thay bai viet");
      const it = ext.data;
      return json(res, 200, { ...newsListItem(it), formatData: resolveFormatData(it.formatData), body: it.body || "", related: (it.related || []).map(newsListItem) });
    }
    // GET /api/v2/news-categories — cay chuyen muc hien (dem 60 giay
    // chung voi site-interface, de dung menu header).
    if (req.method === "GET" && u.pathname === "/api/v2/news-categories") {
      const cats = await getCategories();
      if (!cats) return err(res, vtcanyConfigured() ? 502 : 503, "khong lay duoc chuyen muc");
      return json(res, 200, { data: cats });
    }
    // ---- Thu thap GĐ3 nen (pageview + heartbeat kenh): proxy POST sang
    // backend, chi chuyen tiep body JSON nho (toi da 64KB) + UA that cua
    // trinh duyet (de backend loc bot) + X-Forwarded-For (de backend
    // gioi han tan suat theo IP that; giu nguyen XFF do proxy truoc
    // (Coolify) dat, neu khong co thi dung IP socket). Trinh duyet
    // khong bao gio goi thang backend.
    if (req.method === "POST" && (u.pathname === "/api/v2/pageviews" || u.pathname === "/api/v2/channel-telemetry")) {
      const base = vtcanyApiBase();
      if (!base) return err(res, 503, "backend chua cau hinh");
      let raw;
      try {
        raw = await readBody(req, 64 * 1024);
      } catch {
        return err(res, 413, "body qua lon");
      }
      const target = u.pathname === "/api/v2/pageviews" ? "/pageviews" : "/channel-telemetry/heartbeat";
      const incomingXff = req.headers["x-forwarded-for"] || "";
      const socketIp = (req.socket && req.socket.remoteAddress) || "";
      try {
        const r = await fetch(base + target, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": req.headers["user-agent"] || "",
            "X-Forwarded-For": incomingXff || socketIp,
          },
          body: raw,
          signal: AbortSignal.timeout(8000),
        });
        const text = await r.text();
        return send(res, r.status, text, "application/json");
      } catch {
        return err(res, 502, "khong goi duoc backend");
      }
    }

    // ---- Quan ly giao dien (Goi site-interface) ----
    // GET /api/v2/site-interface — cai dat hien thi portal do CMS quan ly:
    // menu, khoi trang chu, hot link, header, footer, favicon. Chi doi hinh
    // dang qua whitelist (khong lo truong noi bo) + ghep origin backend cho
    // anh tuong doi. Dem 60 giay o server (de dung menu header); CMS luu
    // Giao dien thi backend goi /api/v1/internal/invalidate-site-interface
    // de xoa dem. Tra ve van no-store de trinh duyet khong giu ban cu.
    if (req.method === "GET" && u.pathname === "/api/v2/site-interface") {
      const si = await getSiteInterface();
      if (!si) return err(res, vtcanyConfigured() ? 502 : 503, "khong lay duoc cai dat giao dien");
      return json(res, 200, si, { "Cache-Control": "no-store" });
    }

    // ---- Khoi trang chu do CMS quan ly (Layout blocks) ----
    // GET /api/v2/home-blocks — danh sach khoi trang chu dang bat do CMS
    // quan ly (thu tu + cot + chuyen muc nguon). Chi doi hinh dang qua
    // whitelist. Cache no-store: editor doi la portal phai doi theo.
    // Backend loi -> tra danh sach rong de home.js giu hanh vi cu
    // (hien cac khoi co dinh) thay vi vo trang.
    if (req.method === "GET" && u.pathname === "/api/v2/home-blocks") {
      const ext = await fetchVtcanyEpaperJson(`/home-blocks`);
      if (!ext.ok) return json(res, 200, { blocks: [] }, { "Cache-Control": "no-store" });
      const d = ext.data || {};
      const str = (v) => (typeof v === "string" ? v : "");
      const blocks = (d.blocks || []).filter((b) => b && b.type).map((b) => ({
        id: str(b.id), order: Number(b.order) || 0, type: str(b.type),
        title: str(b.title), column: ["full", "left", "right"].includes(b.column) ? b.column : "full",
        categorySlug: str(b.categorySlug) || null, isActive: b.isActive !== false,
      }));
      return json(res, 200, { blocks }, { "Cache-Control": "no-store" });
    }

    // ---- Vung hien thi trang chu — Goi 1A Zone/Widget Manager ----
    // GET /api/v2/zones/:key — khoi cong khai cua mot vung (bai ghim +
    // lap day tu nhien den du slot). Chi bai da xuat ban, anh bia ghep
    // origin backend nhu tin bai. Backend chua co zone (truoc deploy)
    // thi tra 502 de home.js roi ve URL tin cu.
    const zoneMatch = u.pathname.match(/^\/api\/v2\/zones\/([a-z0-9-]+)$/);
    if (req.method === "GET" && zoneMatch) {
      const ext = await fetchVtcanyEpaperJson(`/zones/${zoneMatch[1]}`);
      if (!ext.ok) return err(res, ext.status === 404 ? 404 : 502, "khong lay duoc vung hien thi");
      const d = ext.data || {};
      return json(res, 200, { key: d.key, name: d.name, slotLimit: d.slotLimit, items: (d.items || []).map(newsListItem) });
    }

    // ---- Sap xep Tin noi bat / Tin tieu diem (Buoc 0, phuong an A) ----
    // GET /api/v2/home-slots/:block — danh sach da sap (noi-bat |
    // tieu-diem), nguon duy nhat cho 2 khoi hero trang chu. Rong la hop
    // le (tra items rong, home.js hien "Chua co tin."); chi khi backend
    // chua co endpoint thi tra 502 de home.js roi ve duong cu.
    const homeSlotMatch = u.pathname.match(/^\/api\/v2\/home-slots\/([a-z0-9-]+)$/);
    if (req.method === "GET" && homeSlotMatch) {
      const ext = await fetchVtcanyEpaperJson(`/home-slots/${homeSlotMatch[1]}`);
      if (!ext.ok) return err(res, ext.status === 404 ? 404 : 502, "khong lay duoc danh sach sap xep");
      const d = ext.data || {};
      return json(res, 200, { key: d.key, name: d.name, slotLimit: d.slotLimit, items: (d.items || []).map(newsListItem) });
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
        mediaType: it.mediaType || "image",
        // Tham chieu short trong catalog (goi sua phat short 2026-11-05):
        // co thi trang /nen-tang-so goi /vod/short/:id/play phat HLS noi
        // tuyen; khong co thi giu hanh vi cu (link media / link ngoai).
        catalogPublicId: it.catalogPublicId || null,
        publishedAt: it.publishedAt,
        targets: (it.targets || []).map((t) => ({ platform: t.platform, status: t.status, url: t.url || null })),
      }));
      return json(res, 200, { items, total: d.total || 0, page: d.page || 1, limit: d.limit || 20 });
    }

    // ---- Goi 1E: hien thi cong khai su kien + tuong thuat (2A) ----
    // GET /api/v2/events?page&limit — danh sach su kien da xuat ban
    // (backend tu loc publishAt <= now). GET /api/v2/events/:slug —
    // chi tiet (cung truong nhu list). Anh bia tuong doi ghep origin
    // backend nhu tin bai. GET /api/v2/liveblogs — tuong tu; chi tiet
    // kem entries (backend tra san theo createdAt ASC, eventId
    // nullable: event null = tuong thuat doc lap). Chi bai published
    // moi duoc backend tra, TSHT khong lo truong noi bo (event chi
    // giu slug + title, entry chi giu id UUID + body + media + ghim).
    function eventListItem(it) {
      return {
        slug: it.slug, title: it.title, description: it.description || "",
        cover: it.coverPath ? resolveVtcanyImageUrl(it.coverPath) : "",
        category: it.category || null, startsAt: it.startsAt || null, endsAt: it.endsAt || null,
        publishAt: it.publishAt, url: `/su-kien/${it.slug}`,
      };
    }
    function liveblogListItem(it) {
      return {
        slug: it.slug, title: it.title, description: it.description || "",
        cover: it.coverPath ? resolveVtcanyImageUrl(it.coverPath) : "",
        event: (it.event && typeof it.event === "object") ? { slug: it.event.slug || null, title: it.event.title || "" } : null,
        publishAt: it.publishAt, url: `/tuong-thuat/${it.slug}`,
      };
    }
    if (req.method === "GET" && u.pathname === "/api/v2/events") {
      const bq = new URLSearchParams();
      for (const k of ["page", "limit"]) { const v = u.searchParams.get(k); if (v) bq.set(k, v); }
      const ext = await fetchVtcanyEpaperJson(`/events?${bq}`);
      if (!ext.ok) return err(res, ext.reason === "not_configured" ? 503 : 502, "khong lay duoc danh sach su kien");
      const d = ext.data || {};
      const items = (d.data || []).map(eventListItem);
      const per = Math.max(1, Number(d.limit) || 20);
      return json(res, 200, { items, total: d.total || 0, page: d.page || 1, total_pages: Math.max(1, Math.ceil((d.total || 0) / per)) });
    }
    const eventSlugMatch = u.pathname.match(/^\/api\/v2\/events\/([a-z0-9-]+)$/);
    if (req.method === "GET" && eventSlugMatch) {
      const ext = await fetchVtcanyEpaperJson(`/events/${eventSlugMatch[1]}`);
      if (!ext.ok) return err(res, ext.status === 404 ? 404 : 502, "khong tim thay su kien");
      return json(res, 200, eventListItem(ext.data));
    }
    if (req.method === "GET" && u.pathname === "/api/v2/liveblogs") {
      const bq = new URLSearchParams();
      for (const k of ["page", "limit"]) { const v = u.searchParams.get(k); if (v) bq.set(k, v); }
      const ext = await fetchVtcanyEpaperJson(`/liveblogs?${bq}`);
      if (!ext.ok) return err(res, ext.reason === "not_configured" ? 503 : 502, "khong lay duoc danh sach tuong thuat");
      const d = ext.data || {};
      const items = (d.data || []).map(liveblogListItem);
      const per = Math.max(1, Number(d.limit) || 20);
      return json(res, 200, { items, total: d.total || 0, page: d.page || 1, total_pages: Math.max(1, Math.ceil((d.total || 0) / per)) });
    }
    const liveblogSlugMatch = u.pathname.match(/^\/api\/v2\/liveblogs\/([a-z0-9-]+)$/);
    if (req.method === "GET" && liveblogSlugMatch) {
      const ext = await fetchVtcanyEpaperJson(`/liveblogs/${liveblogSlugMatch[1]}`);
      if (!ext.ok) return err(res, ext.status === 404 ? 404 : 502, "khong tim thay tuong thuat");
      const it = ext.data;
      return json(res, 200, { ...liveblogListItem(it), entries: (it.entries || []).map((e) => ({
        id: e.id || null, body: e.body || "",
        media: e.mediaPath ? resolveVtcanyImageUrl(e.mediaPath) : "",
        isPinned: !!e.isPinned, createdAt: e.createdAt || null,
      })) });
    }

    // ---- Hien thi quang cao (goi tiep noi 2B, kieu 1E) ----
    // GET /api/v2/ads?placement=... — proxy sang API cong khai cua
    // backend (chi quang cao dang chay, backend tu loc lich + sap xep
    // sortOrder ASC roi publishAt DESC). TSHT chi doi hinh dang qua
    // whitelist adDisplayItem (khong lo truong noi bo) + ghep origin
    // backend cho anh tuong doi, giong cach ghep anh bia su kien.
    // Cache no-store: quang cao co lich chay + co the go xuong bat ky
    // luc, danh sach cache co the phuc vu quang cao het han.
    if (req.method === "GET" && u.pathname === "/api/v2/ads") {
      const placement = sanitizePlacement(u.searchParams.get("placement"));
      if (placement === null) return err(res, 400, "placement khong hop le");
      const bq = new URLSearchParams({ limit: "50" });
      if (placement) bq.set("placement", placement);
      const ext = await fetchVtcanyEpaperJson(`/ads?${bq}`);
      if (!ext.ok) return err(res, ext.reason === "not_configured" ? 503 : 502, "khong lay duoc quang cao");
      const d = ext.data || {};
      const items = (d.data || []).map((it) => adDisplayItem(it, resolveVtcanyImageUrl)).filter(Boolean);
      return json(res, 200, { items, total: d.total || 0 }, { "Cache-Control": "no-store" });
    }

    // ---- Khoi Da phuong tien trang chu: video thu vien + link phat VOD ----
    // GET /api/v2/catalog-videos?limit=&categoryId= — video da xuat ban
    // tu backend (proxy map truong hien thi + loc: chi giu video co
    // publishedAt va khong phai bai test [P1]/[P2], vi list cong khai
    // cua backend van tra ca mau seed chua xuat ban). Lay du 24 roi loc
    // + cat ve limit yeu cau de bai test khong lam thieu slot.
    // categoryId NHAN ID NOI BO cua chuyen muc (dang cat-...), KHONG
    // nhan public_id (backend tra rong) — FE lay id noi bo tu
    // /api/v2/catalog-categories theo slug truoc khi goi (trang
    // truyen-hinh dung de nap video theo tung chuyen muc).
    // GET /api/v2/vod/:kind/:id/play — link phat VOD co ky han (15 phut)
    // tu backend; browser khong goi thang backend. Backend tra 404
    // (not_published / vod_not_ready) thi proxy giu nguyen 404 de FE
    // bao dung ly do thay vi loi chung.
    if (req.method === "GET" && u.pathname === "/api/v2/catalog-videos") {
      const limit = Math.max(1, Math.min(24, Number(u.searchParams.get("limit") || 4) || 4));
      const rawCat = u.searchParams.get("categoryId") || "";
      const categoryId = /^[A-Za-z0-9_-]{1,64}$/.test(rawCat) ? rawCat : "";
      if (rawCat && !categoryId) return err(res, 400, "categoryId khong hop le");
      const ext = await fetchVtcanyEpaperJson(`/catalog/videos?limit=24` + (categoryId ? `&categoryId=${encodeURIComponent(categoryId)}` : ""));
      if (!ext.ok) return err(res, ext.reason === "not_configured" ? 503 : 502, "khong lay duoc danh sach video");
      const d = ext.data || {};
      const items = (d.data || [])
        // Chi video that su da xuat ban: co ngay publishedAt + khong
        // phai bai test [P1]/[P2]. List cong khai cua backend van tra
        // ca mau seed KICK-OFF (chua co publishedAt, play bao
        // not_published) nen phai loc them o day, neu khong the video
        // se hien noi dung mau + bam vao la loi.
        .filter((it) => it && it.title && it.publishedAt && !/^\[P[12]\]/i.test(String(it.title).trim()))
        .slice(0, limit)
        .map((it) => ({
          publicId: it.publicId || it.public_id, title: it.title,
          thumbnail: (it.thumbnail || it.poster) ? resolveVtcanyImageUrl(it.thumbnail || it.poster) : "",
          duration: it.duration || null,
        }));
      return json(res, 200, { items, total: d.total || items.length }, { "Cache-Control": "no-store" });
    }
    // GET /api/v2/catalog-categories?type=video — danh muc video tu
    // backend (de FE map slug chuyen muc -> id noi bo; API videos chi
    // nhan categoryId dang id noi bo, khong nhan public_id).
    if (req.method === "GET" && u.pathname === "/api/v2/catalog-categories") {
      const type = u.searchParams.get("type") || "video";
      if (!/^[a-z0-9_-]{1,32}$/i.test(type)) return err(res, 400, "type khong hop le");
      const ext = await fetchVtcanyEpaperJson(`/catalog/categories?type=${encodeURIComponent(type)}`);
      if (!ext.ok) return err(res, ext.reason === "not_configured" ? 503 : 502, "khong lay duoc danh muc video");
      const d = ext.data || {};
      const items = (d.data || [])
        .map((it) => ({ id: it.id, publicId: it.public_id || it.publicId || "", slug: it.slug || "", name: it.name || "", type: it.type || "" }))
        .filter((it) => it.id && it.slug);
      return json(res, 200, { items, total: items.length }, { "Cache-Control": "no-store" });
    }
    const vodPlayMatch = u.pathname.match(/^\/api\/v2\/vod\/(video|short|episode)\/([0-9a-f]{24})\/play$/);
    if (req.method === "GET" && vodPlayMatch) {
      const ext = await fetchVtcanyEpaperJson(`/vod/${vodPlayMatch[1]}/${vodPlayMatch[2]}/play`);
      if (!ext.ok) return err(res, ext.status === 404 ? 404 : 502, "khong lay duoc link phat video");
      const hp = ext.data && ext.data.hls_path;
      if (!hp) return err(res, 502, "video chua san sang");
      const url = /^https?:\/\//i.test(hp) ? hp : resolveVtcanyImageUrl(hp);
      return json(res, 200, { url, title: (ext.data && ext.data.title) || "" }, { "Cache-Control": "no-store" });
    }

    // ---- SEO Goi 1D: robots.txt + sitemap.xml dong ----
    // Sitemap tu cap nhat theo du lieu cong khai: bai da xuat ban (phan
    // trang limit 50 vi backend chan tran), chuyen muc hien, so bao da
    // xuat ban (phan trang limit 100), + trang chu. Bai go xuong mat khoi
    // listPublic nen tu roi khoi sitemap; so bao in khong co sitemap rieng
    // (theo tai lieu 1D: khong dung sitemap cua bao in) nen chi lay URL
    // doc so hien co, khong doi cau truc URL nao. Upstream loi -> 502
    // (khong tra sitemap thieu, de crawler khong hieu lam bai da mat).
    // Cache no-cache de sitemap luon moi sau xuat ban/go bai.
    if (req.method === "GET" && u.pathname === "/robots.txt") {
      const origin = publicOrigin(req.headers, process.env.PUBLIC_ORIGIN);
      return send(res, 200, buildRobotsTxt(origin), "text/plain", { "Cache-Control": "no-cache, must-revalidate" });
    }
    if (req.method === "GET" && u.pathname === "/sitemap.xml") {
      const origin = publicOrigin(req.headers, process.env.PUBLIC_ORIGIN);
      const urls = [{ loc: origin + "/" }];
      // Goi 1D-2: them 7 trang tinh co dinh (chi URL, khong lastmod).
      // Khac quy uoc 1D/1E (khong dua trang danh sach cua bo suu tap
      // vao sitemap): day la trang co dinh cua site, khong phai trang
      // danh sach dong theo du lieu.
      for (const p of ["/truyen-hinh", "/phat-thanh", "/lich-phat-song", "/nen-tang-so", "/su-kien", "/tuong-thuat", "/bao-in"]) urls.push({ loc: origin + p });
      let page = 1;
      for (;;) {
        const ext = await fetchVtcanyEpaperJson(`/news?page=${page}&limit=50`);
        if (!ext.ok) return err(res, 502, "khong lay duoc sitemap");
        const items = ext.data.data || [];
        for (const it of items) urls.push({ loc: `${origin}/tin/${it.slug}`, lastmod: it.publishAt || null });
        if (items.length < 50 || page >= 200) break;
        page++;
      }
      const cats = await fetchVtcanyEpaperJson(`/news-categories`);
      if (!cats.ok) return err(res, 502, "khong lay duoc sitemap");
      for (const s of flattenCategorySlugs(cats.data || [])) urls.push({ loc: `${origin}/chuyen-muc/${s}` });
      let epage = 1;
      for (;;) {
        const ext = await fetchVtcanyEpaperJson(`/epaper?page=${epage}&limit=100`);
        if (!ext.ok) return err(res, 502, "khong lay duoc sitemap");
        const items = ext.data.data || [];
        for (const it of items) urls.push({ loc: `${origin}/bao-in/${it.slug}`, lastmod: it.publishDate || null });
        if (items.length < 100 || epage >= 20) break;
        epage++;
      }
      // Goi 1E: them su kien + tuong thuat da xuat ban vao sitemap
      // (chi URL chi tiet, khong them trang danh sach — giong quy
      // uoc 1D: /bao-in chi co URL doc so, khong co URL danh sach).
      let evpage = 1;
      for (;;) {
        const ext = await fetchVtcanyEpaperJson(`/events?page=${evpage}&limit=50`);
        if (!ext.ok) return err(res, 502, "khong lay duoc sitemap");
        const items = ext.data.data || [];
        for (const it of items) urls.push({ loc: `${origin}/su-kien/${it.slug}`, lastmod: it.publishAt || null });
        if (items.length < 50 || evpage >= 20) break;
        evpage++;
      }
      let lbpage = 1;
      for (;;) {
        const ext = await fetchVtcanyEpaperJson(`/liveblogs?page=${lbpage}&limit=50`);
        if (!ext.ok) return err(res, 502, "khong lay duoc sitemap");
        const items = ext.data.data || [];
        for (const it of items) urls.push({ loc: `${origin}/tuong-thuat/${it.slug}`, lastmod: it.publishAt || null });
        if (items.length < 50 || lbpage >= 20) break;
        lbpage++;
      }
      return send(res, 200, buildSitemapXml(urls), "application/xml", { "Cache-Control": "no-cache, must-revalidate" });
    }

    // ---- Health check (Coolify/Docker): khong can DB, khong can login.
    if (u.pathname === "/health") return json(res, 200, { ok: true, service: "epaper-phase1" });

    // ---- Static ----
    if (VENDOR[u.pathname]) return serveFile(res, path.join(ROOT, VENDOR[u.pathname]));
    // Homepage frame (public/home.html) at /, e-paper list stays at /bao-in
    // (public/index.html, unchanged). All other routes below are untouched.
    if (u.pathname === "/") return serveFile(res, path.join(PUBLIC, "home.html"), undefined, u.pathname);
    if (u.pathname === "/bao-in") return serveFile(res, path.join(PUBLIC, "index.html"), undefined, u.pathname);
    if (u.pathname === "/truyen-hinh") return serveFile(res, path.join(PUBLIC, "tv.html"), undefined, u.pathname);
    if (u.pathname === "/phat-thanh") return serveFile(res, path.join(PUBLIC, "radio.html"), undefined, u.pathname);
    if (u.pathname === "/lich-phat-song") return serveFile(res, path.join(PUBLIC, "schedule.html"), undefined, u.pathname);
    if (u.pathname === "/nen-tang-so") return serveFile(res, path.join(PUBLIC, "nen-tang-so.html"), undefined, u.pathname);
    if (u.pathname === "/su-kien") return serveFile(res, path.join(PUBLIC, "su-kien.html"), undefined, u.pathname);
    if (u.pathname === "/tuong-thuat") return serveFile(res, path.join(PUBLIC, "tuong-thuat.html"), undefined, u.pathname);
    if (u.pathname === "/tim-kiem") return serveFile(res, path.join(PUBLIC, "tim-kiem.html"), undefined, u.pathname);
    // Trang ban doc (Giai doan 1, 2026-11-06): tai khoan, xac nhan email,
    // dat lai mat khau, dieu khoan + chinh sach (du thao).
    if (u.pathname === "/tai-khoan") return serveFile(res, path.join(PUBLIC, "tai-khoan.html"), undefined, u.pathname);
    if (u.pathname === "/xac-nhan-email") return serveFile(res, path.join(PUBLIC, "xac-nhan-email.html"), undefined, u.pathname);
    if (u.pathname === "/dat-lai-mat-khau") return serveFile(res, path.join(PUBLIC, "dat-lai-mat-khau.html"), undefined, u.pathname);
    if (u.pathname === "/dieu-khoan-su-dung") return serveFile(res, path.join(PUBLIC, "dieu-khoan-su-dung.html"), undefined, u.pathname);
    if (u.pathname === "/chinh-sach-bao-mat") return serveFile(res, path.join(PUBLIC, "chinh-sach-bao-mat.html"), undefined, u.pathname);
    if (u.pathname === "/login.html" || u.pathname === "/admin.html") return serveFile(res, path.join(PUBLIC, u.pathname.slice(1)));
    // Dang nhap CMS: /login phuc vu trang login.html cu (trang dang nhap
    // noi bo cu, form username/password -> POST /api/v1/auth/login; khong
    // phai trang dang nhap CMS Nuxt o cms.vtctech.xyz).
    if (u.pathname === "/login") return serveFile(res, path.join(PUBLIC, "login.html"), undefined, u.pathname);
    if (/^\/bao-.*\.html$/.test(u.pathname)) return serveFile(res, path.join(PUBLIC, "reader.html"), undefined, u.pathname);
    if (/^\/bao-in\/bao-tuyen-quang-so-\d+-[0-9a-f]{24}$/.test(u.pathname)) return serveFile(res, path.join(PUBLIC, "reader.html"), undefined, u.pathname);
    // Goi 1D: trang bai viet kem meta SEO phia server (title, description,
    // canonical, Open Graph) de crawler doc duoc ngay tu HTML dau tien,
    // khong doi JS chay moi set title nhu truoc. Fail-open: backend loi
    // thi tra article.html tran nhu cu (trang van chay bang client fetch).
    // Slug cu (404) -> tra slug-redirects -> 301 ve slug hien tai; slug la
    // hoan toan khong ton tai thi van tra article.html tran (hanh vi cu).
    if (/^\/tin\/[a-z0-9-]+$/.test(u.pathname)) {
      const slug = u.pathname.slice(5);
      const ext = await fetchVtcanyEpaperJson(`/news/${slug}`);
      if (ext.ok) {
        try {
          const html = await fs.promises.readFile(path.join(PUBLIC, "article.html"), "utf8");
          const it = ext.data;
          const origin = publicOrigin(req.headers, process.env.PUBLIC_ORIGIN);
          const canonicalUrl = `${origin}/tin/${it.slug}`;
          const meta = buildArticleMeta({
            title: it.title, sapo: it.sapo,
            coverUrl: it.coverPath ? resolveVtcanyImageUrl(it.coverPath) : "",
            categoryName: it.category ? it.category.name : "",
            publishAt: it.publishAt || "",
            canonicalUrl,
            metaTitle: it.metaTitle || "",
            metaDescription: it.metaDescription || "",
          });
          // Thay the <title> bang regex (khong so sanh chuoi chinh xac)
          // vi tieu de goc trong HTML da doi theo nhan hieu "Toa soan
          // hoi tu" trong khi chuoi cu "— TSHT" khien replace thanh no-op.
          const out = html.replace(
            /<title>[^<]*<\/title>/,
            `<title>${escapeXml(it.metaTitle || it.title)} — Tòa soạn hội tụ</title>\n${meta}`,
          );
          return send(res, 200, await injectChrome(out, u.pathname), "text/html", { "Cache-Control": "no-cache, must-revalidate" });
        } catch {
          return serveFile(res, path.join(PUBLIC, "article.html"), undefined, u.pathname);
        }
      }
      if (ext.status === 404) {
        const redir = await fetchVtcanyEpaperJson(`/news/slug-redirects/${slug}`);
        if (redir.ok && redir.data && redir.data.slug && redir.data.slug !== slug) {
          return send(res, 301, "", "text/plain", { Location: `/tin/${redir.data.slug}` });
        }
      }
      return serveFile(res, path.join(PUBLIC, "article.html"), undefined, u.pathname);
    }
    // Goi 1E: trang chi tiet su kien / tuong thuat kem meta SEO phia
    // server (giong /tin/:slug). Fail-open: backend loi thi tra HTML
    // tran (trang van chay bang client fetch). Slug khong ton tai thi
    // van tra HTML tran (hanh vi giong /tin/:slug).
    if (/^\/su-kien\/[a-z0-9-]+$/.test(u.pathname)) {
      const slug = u.pathname.slice(9);
      const ext = await fetchVtcanyEpaperJson(`/events/${slug}`);
      if (ext.ok) {
        try {
          const html = await fs.promises.readFile(path.join(PUBLIC, "su-kien-detail.html"), "utf8");
          const it = ext.data;
          const origin = publicOrigin(req.headers, process.env.PUBLIC_ORIGIN);
          const canonicalUrl = `${origin}/su-kien/${it.slug}`;
          const meta = buildArticleMeta({
            title: it.title, sapo: it.description || "",
            coverUrl: it.coverPath ? resolveVtcanyImageUrl(it.coverPath) : "",
            categoryName: it.category ? it.category.name : "",
            publishAt: it.publishAt || "",
            canonicalUrl,
          });
          const out = html.replace(
            /<title>[^<]*<\/title>/,
            `<title>${escapeXml(it.title)} — Tòa soạn hội tụ</title>\n${meta}`,
          );
          return send(res, 200, await injectChrome(out, u.pathname), "text/html", { "Cache-Control": "no-cache, must-revalidate" });
        } catch {
          return serveFile(res, path.join(PUBLIC, "su-kien-detail.html"), undefined, u.pathname);
        }
      }
      return serveFile(res, path.join(PUBLIC, "su-kien-detail.html"), undefined, u.pathname);
    }
    if (/^\/tuong-thuat\/[a-z0-9-]+$/.test(u.pathname)) {
      const slug = u.pathname.slice(13);
      const ext = await fetchVtcanyEpaperJson(`/liveblogs/${slug}`);
      if (ext.ok) {
        try {
          const html = await fs.promises.readFile(path.join(PUBLIC, "tuong-thuat-detail.html"), "utf8");
          const it = ext.data;
          const origin = publicOrigin(req.headers, process.env.PUBLIC_ORIGIN);
          const canonicalUrl = `${origin}/tuong-thuat/${it.slug}`;
          const meta = buildArticleMeta({
            title: it.title, sapo: it.description || "",
            coverUrl: it.coverPath ? resolveVtcanyImageUrl(it.coverPath) : "",
            categoryName: "",
            publishAt: it.publishAt || "",
            canonicalUrl,
          });
          const out = html.replace(
            /<title>[^<]*<\/title>/,
            `<title>${escapeXml(it.title)} — Tòa soạn hội tụ</title>\n${meta}`,
          );
          return send(res, 200, await injectChrome(out, u.pathname), "text/html", { "Cache-Control": "no-cache, must-revalidate" });
        } catch {
          return serveFile(res, path.join(PUBLIC, "tuong-thuat-detail.html"), undefined, u.pathname);
        }
      }
      return serveFile(res, path.join(PUBLIC, "tuong-thuat-detail.html"), undefined, u.pathname);
    }
    // Goi 1D-2: trang chuyen muc kem meta SEO phia server (giong
    // /tin/:slug) + 301 slug cu -> slug hien tai. Slug song trong cay
    // hien thi meta; slug cu tra slug-redirects -> 301; slug la hoac
    // muc an thi van tra category.html tran (hanh vi cu). Redirect ap
    // dung bat ke muc dich an/hien vi route nay tra HTML cho moi slug.
    // Fail-open: backend loi thi tra HTML tran nhu cu.
    if (/^\/chuyen-muc\/[a-z0-9-]+$/.test(u.pathname)) {
      const slug = u.pathname.slice(12);
      const cats = await fetchVtcanyEpaperJson(`/news-categories`);
      let redirectSlug = null;
      if (cats.ok) {
        const decision = decideCategoryRoute({ tree: cats.data || [], slug, redirectSlug: null });
        if (decision.kind === "meta") {
          try {
            const html = await fs.promises.readFile(path.join(PUBLIC, "category.html"), "utf8");
            const origin = publicOrigin(req.headers, process.env.PUBLIC_ORIGIN);
            const canonicalUrl = `${origin}/chuyen-muc/${decision.node.slug}`;
            const meta = buildCategoryMeta({ name: decision.node.name, canonicalUrl, metaTitle: decision.node.metaTitle || "", metaDescription: decision.node.metaDescription || "" });
            const out = html.replace(
              /<title>[^<]*<\/title>/,
              `<title>${escapeXml(decision.node.metaTitle || decision.node.name)} — Tòa soạn hội tụ</title>\n${meta}`,
            );
            return send(res, 200, await injectChrome(out, u.pathname), "text/html", { "Cache-Control": "no-cache, must-revalidate" });
          } catch {
            return serveFile(res, path.join(PUBLIC, "category.html"), undefined, u.pathname);
          }
        }
      }
      const redir = await fetchVtcanyEpaperJson(`/news-categories/slug-redirects/${slug}`);
      if (redir.ok && redir.data) redirectSlug = redir.data.slug || null;
      const decision = decideCategoryRoute({ tree: cats.ok ? (cats.data || []) : [], slug, redirectSlug });
      if (decision.kind === "redirect") {
        return send(res, 301, "", "text/plain", { Location: `/chuyen-muc/${decision.slug}` });
      }
      return serveFile(res, path.join(PUBLIC, "category.html"), undefined, u.pathname);
    }
    // A3: never serve sample assets or storage directly; content only via /api routes above.
    if (u.pathname.startsWith("/assets/") || u.pathname.startsWith("/storage/")) return err(res, 404, "not found");
    const file = path.join(PUBLIC, decodeURIComponent(u.pathname));
    if (!file.startsWith(PUBLIC)) return err(res, 403, "Forbidden");
    // URL khong co phan mo rong o doan cuoi (khong phai file tinh) ma
    // khong khop route nao -> trang 404 (co header chung), thay vi
    // JSON {"error":"not found"} nhu truoc. File tinh thieu (co dau .)
    // van tra JSON 404 nhu cu.
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      const last = (u.pathname.split("/").pop() || "");
      if (!last.includes(".")) return serve404(res, u.pathname);
      return err(res, 404, "not found");
    }
    return serveFile(res, file, undefined, u.pathname);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) err(res, 500, e.message || "loi server");
  }
});

const PORT = Number(process.env.PORT || 3000);
// Pha B (2026-10-28): app khong con DB, khoi dong thang, khong migration.
server.listen(PORT, () => console.log(`TSHT (khong DB): http://localhost:${PORT}/bao-in`));
// Lam nong sau deploy (2026-11-05): portal vua restart co cache RAM
// trong (site-interface + categories) va backend co the chua san sang;
// lan tai dau cua nguoi xem phai cho toi da 8s/timeout. Goi 1 lan cac
// endpoint trang chu qua localhost ngay sau khi nghe de nap cache + mo
// ket noi toi backend truoc khi nhan nguoi xem. Chi log, khong bao gio
// lam crash server; neu backend chua len thi thu lai 1 lan sau 15s.
const WARMUP_URLS = ["/", "/api/v2/home-slots/noi-bat", "/api/v2/home-slots/tieu-diem", "/api/v2/news?limit=12", "/api/v2/site-interface"];
async function warmupOnce(tag) {
  const base = `http://127.0.0.1:${PORT}`;
  const results = await Promise.all(WARMUP_URLS.map(async (u) => {
    const t0 = Date.now();
    try {
      const r = await fetch(base + u, { signal: AbortSignal.timeout(10000) });
      await r.text();
      return { u, ok: r.ok, ms: Date.now() - t0, status: r.status };
    } catch { return { u, ok: false, ms: Date.now() - t0, status: 0 }; }
  }));
  const failed = results.filter((x) => !x.ok);
  console.log(`[warmup:${tag}] ${results.length - failed.length}/${results.length} ok (${results.map((x) => `${x.u}=${x.status}/${x.ms}ms`).join(" ")})`);
  return failed.length === 0;
}
warmupOnce("khoi-dong").then((ok) => { if (!ok) setTimeout(() => { warmupOnce("thu-lai").catch(() => {}); }, 15000); }).catch(() => {});
