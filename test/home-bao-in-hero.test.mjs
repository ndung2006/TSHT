// Tests for the BÁO IN hero block on the homepage (user decision
// 2026-11-07 13:22): middle of the page, after the main news blocks,
// before Multimedia; merged sort of both publications by publish_date;
// "SỐ MỚI" on the newest issue of EACH publication; "VÙNG CAO" label on
// highland covers; ~400px thumb + srcset 800px, lazy; fix the old
// items.slice(1) bug that skipped the newest issue; hide the whole block
// when there are no issues.
// Ten hien thi cua the lay tu title do CMS nhap (2026-11-07: khong ghi
// cung "Báo Điện Biên Phủ" de dung duoc cho tinh khac); title trong thi
// fallback ve ten mac dinh theo loai so + so hieu.
// - home.js block logic is tested functionally via the vm stub-DOM harness
//   (same pattern as replay-immediate.test.mjs): real home.js runs against
//   stubbed fetch + DOM, assertions read the rendered innerHTML.
// - server.mjs thumb derivation + home.html/home.css wiring are pinned at
//   source level (server cannot run in node --test here).
// Run: node --test test/home-bao-in-hero.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const homeJs = fs.readFileSync(path.join(root, "public/js/home.js"), "utf8");
const homeCss = fs.readFileSync(path.join(root, "public/css/home.css"), "utf8");
const homeHtml = fs.readFileSync(path.join(root, "public/home.html"), "utf8");
const server = fs.readFileSync(path.join(root, "server.mjs"), "utf8");

// ---- Minimal DOM stub (same shape as test/replay-immediate.test.mjs) ----
class El {
  constructor(tag, attrs = {}) {
    this.tagName = (tag || "div").toUpperCase();
    this.attrs = { ...attrs };
    this.children = [];
    this.parentNode = null;
    this.listeners = {};
    this.hidden = false;
    this.disabled = false;
    this.value = "";
    this.textContent = "";
    this.innerHTML = "";
    this.style = {};
    this.scrollLeft = 0;
    this.scrollWidth = 0;
    this.clientWidth = 0;
    this.scrollHeight = 0;
    this.clientHeight = 0;
    this.offsetTop = 0;
    this.offsetHeight = 0;
    this._classes = new Set((attrs.class || "").split(/\s+/).filter(Boolean));
    this.classList = {
      add: (c) => this._classes.add(c),
      remove: (c) => this._classes.delete(c),
      toggle: (c, force) => { const on = force === undefined ? !this._classes.has(c) : !!force; if (on) this._classes.add(c); else this._classes.delete(c); },
      contains: (c) => this._classes.has(c),
    };
  }
  getAttribute(name) { return name in this.attrs ? this.attrs[name] : null; }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  removeAttribute(name) { delete this.attrs[name]; }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  remove() { if (this.parentNode) { const i = this.parentNode.children.indexOf(this); if (i >= 0) this.parentNode.children.splice(i, 1); this.parentNode = null; } }
  addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
  removeEventListener(type, fn) {
    const l = this.listeners[type] || [];
    const i = l.indexOf(fn);
    if (i >= 0) l.splice(i, 1);
  }
  dispatch(type, event = {}) {
    const ev = { type, ...event, preventDefault() {}, target: this };
    (this.listeners[type] || []).slice().forEach((fn) => fn(ev));
    return ev;
  }
  scrollIntoView() {}
  focus() {}
  scrollBy(opts) {
    const dx = (opts && typeof opts.left === "number") ? opts.left : 0;
    const max = Math.max(0, (this.scrollWidth || 0) - (this.clientWidth || 0));
    this.scrollLeft = Math.min(max, Math.max(0, (this.scrollLeft || 0) + dx));
  }
  getBoundingClientRect() { return { width: 272, height: 0, top: 0, left: 0 }; }
  closest(sel) {
    let el = this;
    while (el) { if (matches(el, sel)) return el; el = el.parentNode; }
    return null;
  }
  querySelector(sel) { return querySelectorAll(this, sel)[0] || null; }
  querySelectorAll(sel) { return querySelectorAll(this, sel); }
}

function matches(el, sel) {
  if (!sel || !el || !el.tagName) return false;
  const m = sel.match(/^([a-zA-Z][a-zA-Z0-9]*)?(\.[a-zA-Z0-9_-]+)?(\[([^\]=]+)(?:='([^']*)')?\])?$/);
  if (!m) return false;
  const [, tag, cls, , attr, val] = m;
  if (tag && el.tagName.toLowerCase() !== tag.toLowerCase()) return false;
  if (cls && !el._classes.has(cls.slice(1))) return false;
  if (attr) {
    if (!(attr in el.attrs)) return false;
    if (val !== undefined && el.attrs[attr] !== val) return false;
  }
  return true;
}
function querySelectorAll(rootEl, sel) {
  const out = [];
  (function walk(el) {
    if (matches(el, sel)) out.push(el);
    (el.children || []).forEach(walk);
  })(rootEl);
  return out;
}

// ---- Fixture: 5 live issues as GET /api/v2/epaper returns them
// (server-mapped shape, with coverThumb/coverSrcset from newEpaperListItem).
// Deliberately SCRAMBLED input order to prove the client-side sort.
// title = ten that trong CMS nhu live (lay tu API that ngay 2026-11-07).
function epaperItem(n, type, date, id, title) {
  return {
    issue_number: n, issue_type: type, publish_date: date,
    title: title || ("TQ " + n), page_count: type === "vung_cao" ? 4 : 12, status: "published",
    cover: "/api/v2/epaper/" + id + "/cover",
    coverThumb: "/api/v2/epaper/" + id + "/cover-thumb",
    coverSrcset: "/api/v2/epaper/" + id + "/cover-thumb 400w, /api/v2/epaper/" + id + "/cover-thumb?size=800 800w",
    url: "/bao-in/bao-tuyen-quang-so-" + n + "-" + id,
  };
}
const LIVE5 = [
  epaperItem(318, "thuong", "2026-10-20", "6e8fe8f176bcd664521cf58b", "Tuyên Quang 318"),
  epaperItem(559, "vung_cao", "2026-10-27", "4bbdb72c2fd9115efd05ea10", "bao_tuyen_quang_vung_cao_so_559"),
  epaperItem(319, "thuong", "2026-10-21", "b62e16d4e2f8331a6df51ef4", "TQ 319"),
  epaperItem(320, "thuong", "2026-10-26", "014ab17ef75433437d62e473", "Tuyên Quang 320"),
  epaperItem(558, "vung_cao", "2026-10-26", "971e9a91cc68d27463971ef1", "Tuyên Quang vùng cao 558"),
];

function buildFixture(epaperResponder, railOverflow = true) {
  const byId = {};
  function el(tag, attrs = {}) {
    const e = new El(tag, attrs);
    if (attrs.id) byId[attrs.id] = e;
    return e;
  }
  const doc = {
    children: [],
    createElement: (tag) => new El(tag),
    getElementById: (id) => byId[id] || (byId[id] = new El("div", { id })),
    querySelector: (sel) => querySelectorAll(doc, sel)[0] || null,
    querySelectorAll: (sel) => querySelectorAll(doc, sel),
    addEventListener: () => {},
  };
  doc.appendChild = (e) => { e.parentNode = doc; doc.children.push(e); return e; };
  const flow = el("div", { id: "home-flow" });
  doc.appendChild(flow);
  const hero = el("section", { id: "block-hero" });
  const newsFeatured = el("div", { id: "news-featured" });
  hero.appendChild(newsFeatured);
  flow.appendChild(hero);
  const mm = el("section", { id: "multimedia" });
  flow.appendChild(mm);
  const body = el("div", { id: "home-body" });
  flow.appendChild(body);
  const leftCol = el("div", { id: "home-cat-left" });
  body.appendChild(leftCol);
  const weather = el("div", { id: "home-weather-slot" });
  body.appendChild(weather);
  // Static epaper hero markup from public/home.html.
  const sec = el("section", { id: "block-epaper" });
  const prev = el("button", { class: "epaper-arrow epaper-arrow-prev" });
  const next = el("button", { class: "epaper-arrow epaper-arrow-next" });
  const rail = el("div", { id: "epaper-more", class: "epaper-strip" });
  rail.scrollWidth = railOverflow ? 2000 : 1200;
  rail.clientWidth = 1200;
  sec.appendChild(prev);
  sec.appendChild(rail);
  sec.appendChild(next);
  flow.appendChild(sec);
  doc.appendChild(el("div", { id: "hotlink-strip" }));
  return { doc, byId, sec, rail, prev, next };
}

function loadHome(fixture, epaperResponder) {
  const fetchCalls = [];
  const sandbox = {
    console,
    document: fixture.doc,
    location: { pathname: "/", href: "/" },
    innerWidth: 1280,
    fetch: async (url, init) => {
      fetchCalls.push(url);
      const u = new URL(url, "https://example.test");
      if (u.pathname === "/api/v2/epaper") return epaperResponder();
      if (u.pathname === "/api/v2/home-blocks") return { ok: true, status: 200, json: async () => ({ blocks: [] }) };
      if (u.pathname === "/api/v2/site-interface") return { ok: false, status: 404, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => ({ items: [] }) };
    },
    setTimeout,
    clearTimeout,
    AbortController,
    addEventListener: () => {},
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(homeJs, sandbox, { filename: "home.js" });
  return { sandbox, fetchCalls };
}
const tick = async (n = 15) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };
const epaperOk = (items) => async () => ({ ok: true, status: 200, json: async () => ({ items, total: items.length, page: 1, total_pages: 1 }) });

function cardNames(html) {
  return [...html.matchAll(/<h3>([^<]+)<\/h3>/g)].map((m) => m[1]);
}

test("hien thi: ten the lay tu title CMS + ngay VN dung thu", async () => {
  const f = buildFixture();
  loadHome(f, epaperOk(LIVE5));
  await tick();
  const html = f.byId["epaper-more"].innerHTML;
  assert.ok(html.includes("Tuyên Quang 320"), "thieu ten so thuong 320 lay tu title");
  assert.ok(html.includes("bao_tuyen_quang_vung_cao_so_559"), "thieu ten so vung cao 559 lay tu title");
  assert.ok(html.includes('alt="Bìa Tuyên Quang 320"'), "alt anh bia phai dung ten theo title");
  assert.ok(!html.includes("Báo Điện Biên Phủ số 320") && !html.includes("Báo Điện Biên Phủ vùng cao số 559"), "khong duoc ghi cung ten an pham khi da co title");
  assert.ok(html.includes("Thứ Ba, 27/10/2026"), "ngay 559 phai la Thu Ba 27/10/2026");
  assert.ok(html.includes("Thứ Hai, 26/10/2026"), "ngay 558/320 phai la Thu Hai 26/10/2026");
  assert.ok(html.includes("Thứ Tư, 21/10/2026"), "ngay 319 phai la Thu Tu 21/10/2026");
  assert.ok(html.includes("Thứ Ba, 20/10/2026"), "ngay 318 phai la Thu Ba 20/10/2026");
});

test("ten hien thi: title trong/thieu/chi khoang trang thi fallback ve ten mac dinh theo loai so", async () => {
  const items = [
    { ...epaperItem(321, "thuong", "2026-10-28", "aaaaaaaaaaaaaaaaaaaaaaaa"), title: undefined },
    epaperItem(560, "vung_cao", "2026-10-28", "bbbbbbbbbbbbbbbbbbbbbbbb", "   "),
  ];
  const f = buildFixture();
  loadHome(f, epaperOk(items));
  await tick();
  const html = f.byId["epaper-more"].innerHTML;
  assert.ok(html.includes("Báo Điện Biên Phủ số 321"), "title thieu thi fallback ten mac dinh so thuong");
  assert.ok(html.includes("Báo Điện Biên Phủ vùng cao số 560"), "title chi khoang trang thi fallback ten mac dinh so vung cao");
  assert.ok(html.includes('alt="Bìa Báo Điện Biên Phủ số 321"'), "alt cung phai dung ten fallback");
});

test("ten hien thi: title da dung dang 'Báo Điện Biên Phủ số 320' thi hien dung nhu da luu, khong gan them tien to", async () => {
  const items = [epaperItem(320, "thuong", "2026-10-26", "014ab17ef75433437d62e473", "Báo Điện Biên Phủ số 320")];
  const f = buildFixture();
  loadHome(f, epaperOk(items));
  await tick();
  const html = f.byId["epaper-more"].innerHTML;
  assert.ok(html.includes("Báo Điện Biên Phủ số 320"), "title sach phai hien dung nhu da luu");
  assert.ok(!html.includes("Báo Điện Biên Phủ Báo Điện Biên Phủ"), "khong duoc gan them tien to vao title");
  assert.ok(!html.includes("Báo Điện Biên Phủ số Báo"), "khong duoc long ten cu vao title");
});

test("sap xep: chung 2 an pham theo ngay phat hanh, moi nhat dau; so moi nhat KHONG bi bo qua", async () => {
  const f = buildFixture();
  loadHome(f, epaperOk(LIVE5));
  await tick();
  const names = cardNames(f.byId["epaper-more"].innerHTML);
  assert.deepEqual(names, [
    "bao_tuyen_quang_vung_cao_so_559",
    "Tuyên Quang vùng cao 558",
    "Tuyên Quang 320",
    "TQ 319",
    "Tuyên Quang 318",
  ]);
});

test("nhan SO MOI cho so moi nhat cua MOI an pham; nhan VUNG CAO chi o bia vung cao", async () => {
  const f = buildFixture();
  loadHome(f, epaperOk(LIVE5));
  await tick();
  const html = f.byId["epaper-more"].innerHTML;
  const newCount = (html.match(/SỐ MỚI/g) || []).length;
  assert.equal(newCount, 2, "phai co dung 2 nhan SO MOI (559 vung cao + 320 thuong)");
  const hlCount = (html.match(/VÙNG CAO/g) || []).length;
  assert.equal(hlCount, 2, "phai co 2 nhan VUNG CAO (559 + 558)");
  // Nhan SO MOI phai nam trong the cua dung so: 559 co ca 2 nhan, 320 chi SO MOI.
  const card559 = html.split("bao-tuyen-quang-so-559-")[1].split("bi-card")[0];
  assert.ok(card559.includes("SỐ MỚI") && card559.includes("VÙNG CAO"), "559 phai co ca SO MOI va VUNG CAO");
  const card320 = html.split("bao-tuyen-quang-so-320-")[1].split("bi-card")[0];
  assert.ok(card320.includes("SỐ MỚI") && !card320.includes("VÙNG CAO"), "320 chi co SO MOI, khong co VUNG CAO");
});

test("anh bia: srcset thumb 400w + cover 800w, loading lazy; bam bia/mo ten mo dung trang doc", async () => {
  const f = buildFixture();
  loadHome(f, epaperOk(LIVE5));
  await tick();
  const html = f.byId["epaper-more"].innerHTML;
  assert.ok(html.includes("/api/v2/epaper/4bbdb72c2fd9115efd05ea10/cover-thumb 400w, /api/v2/epaper/4bbdb72c2fd9115efd05ea10/cover-thumb?size=800 800w"), "thieu srcset 400w/800w cho 559");
  assert.ok(html.includes('loading="lazy"'), "anh bia phai loading lazy");
  assert.ok(html.includes('href="/bao-in/bao-tuyen-quang-so-559-4bbdb72c2fd9115efd05ea10"'), "bia/ten 559 phai link dung trang doc");
});

test("anh bia khong co coverSrcset (bia bien tap chon) thi dung anh goc, khong srcset", async () => {
  const plain = [{ ...LIVE5[1], coverSrcset: "", coverThumb: "" }];
  const f = buildFixture();
  loadHome(f, epaperOk(plain));
  await tick();
  const html = f.byId["epaper-more"].innerHTML;
  assert.ok(!html.includes("srcset="), "khong co coverSrcset thi khong duoc render srcset");
  assert.ok(html.includes('src="/api/v2/epaper/4bbdb72c2fd9115efd05ea10/cover"'), "van phai co anh goc");
});

test("gioi han 10 so moi nhat", async () => {
  const extra = [];
  for (let n = 300; n <= 306; n++) extra.push(epaperItem(n, "thuong", "2026-10-0" + ((n % 9) + 1), "aaaaaaaaaaaaaaaaaaaaaa" + String(n).slice(-2)));
  const f = buildFixture();
  loadHome(f, epaperOk([...LIVE5, ...extra]));
  await tick();
  const count = (f.byId["epaper-more"].innerHTML.match(/bi-card/g) || []).length;
  assert.equal(count, 10, "chi hien toi da 10 the");
});

test("rong: an toan bo khoi (display none + co danh dau)", async () => {
  const f = buildFixture();
  loadHome(f, epaperOk([]));
  await tick();
  assert.equal(f.sec.style.display, "none", "khong co so nao thi an khoi");
  assert.equal(f.sec.getAttribute("data-epaper-empty"), "1", "phai danh dau khoi rong");
  assert.equal(f.byId["epaper-more"].innerHTML, "", "khong render the nao khi rong");
});

test("loi tai: giu khoi + ghi chu, khong an", async () => {
  const f = buildFixture();
  loadHome(f, async () => ({ ok: false, status: 500, json: async () => ({}) }));
  await tick();
  assert.notEqual(f.sec.style.display, "none", "loi tai thi khong an khoi");
  assert.ok(f.byId["epaper-more"].innerHTML.includes("Chưa tải được"), "loi tai phai co ghi chu");
});

test("mui ten: an o dau, hien o cuoi khi cuon; khong tran thi an ca 2", async () => {
  const f = buildFixture();
  loadHome(f, epaperOk(LIVE5));
  await tick();
  assert.ok(f.prev.classList.contains("is-hidden"), "o dau trai thi nut truoc phai an");
  assert.ok(!f.next.classList.contains("is-hidden"), "con truot duoc thi nut sau phai hien");
  f.next.dispatch("click");
  assert.equal(f.rail.scrollLeft, 288, "bam nut sau truot dung 1 the (272 + gap 16)");
  f.rail.dispatch("scroll");
  assert.ok(!f.prev.classList.contains("is-hidden"), "da truot thi nut truoc phai hien");
  f.next.dispatch("click");
  f.next.dispatch("click");
  assert.equal(f.rail.scrollLeft, 800, "truot toi cuoi (max = scrollWidth - clientWidth)");
  f.rail.dispatch("scroll");
  assert.ok(f.next.classList.contains("is-hidden"), "o cuoi phai thi nut sau phai an");
  f.prev.dispatch("click");
  assert.equal(f.rail.scrollLeft, 512, "bam nut truoc lui dung 1 the");
  // Khong tran -> an ca 2 nut.
  const f2 = buildFixture(null, false);
  loadHome(f2, epaperOk(LIVE5.slice(0, 1)));
  await tick();
  assert.ok(f2.prev.classList.contains("is-hidden") && f2.next.classList.contains("is-hidden"), "khong tran thi an ca 2 nut");
});

test("source: khong con slice(1) bo qua so moi nhat; co cap 10 + co bao ve khoi rong khi applyBlocks", () => {
  assert.ok(!homeJs.includes("items.slice(1)"), "home.js khong duoc con items.slice(1)");
  assert.ok(homeJs.includes("slice(0, 10)"), "epaper phai cap 10 so");
  assert.ok(homeJs.includes('data-epaper-empty'), "phai co co danh dau khoi rong");
  assert.ok(homeJs.includes("syncEpaperArrows"), "phai co dong bo trang thai mui ten");
});

test("server: cover-thumb route + thumb/srcset trong newEpaperListItem", () => {
  assert.ok(server.includes("cover-thumb"), "thieu route cover-thumb");
  assert.ok(server.includes('`/api/v2/epaper/${it.publicId}/cover-thumb`'), "newEpaperListItem phai tra coverThumb");
  assert.ok(server.includes("coverSrcset:"), "newEpaperListItem phai tra coverSrcset");
  assert.ok(server.includes("400w"), "coverSrcset phai co muc 400w");
  assert.ok(server.includes("800w"), "coverSrcset phai co muc 800w");
  assert.ok(server.includes("function serveEpaperCover"), "phai co helper serveEpaperCover dung chung cho cover + thumb");
  assert.ok(server.includes('"-r", String(dpi)'), "serveEpaperCover phai truyen dpi vao pdftoppm");
  assert.ok(server.includes("-400.jpg"), "thumb phai cache rieng <publicId>-400.jpg");
  assert.ok(server.includes("\\/cover-thumb"), "regex public-read phai cho phep /cover-thumb");
  assert.ok(server.includes('newEpaperMatch[2] === "/cover-thumb"'), "route phai co nhanh /cover-thumb");
});

test("home.html: tieu de BÁO IN + link Xem tat ca + strip + mui ten; ?v= moi", () => {
  assert.ok(homeHtml.includes('<div class="cat-block-head"><h2>BÁO IN</h2>'), "thieu tieu de khoi BÁO IN kieu cat-block-head");
  assert.ok(homeHtml.includes('<a href="/bao-in">Xem tất cả →</a>'), "thieu link Xem tat ca -> /bao-in");
  assert.ok(homeHtml.includes('id="epaper-more" class="epaper-strip"'), "thieu strip epaper-strip");
  assert.ok(homeHtml.includes("epaper-arrow-prev") && homeHtml.includes("epaper-arrow-next"), "thieu 2 nut mui ten");
  assert.ok(homeHtml.includes("/js/home.js?v=20261107-5"), "home.js ?v= phai la 20261107-5");
  assert.ok(homeHtml.includes("/css/home.css?v=20261107-3"), "home.css ?v= phai la 20261107-3");
  assert.ok(!homeHtml.includes("Báo in mới nhất"), "khong con tieu de cu 'Báo in mới nhất'");
});

test("home.css: nen kem + hoa tiet tu ve, strip truot ngang, the 272px, mobile 2 bia/luot, badge", () => {
  assert.ok(homeCss.includes("#block-epaper {"), "thieu style khoi #block-epaper");
  assert.ok(homeCss.includes("background-color: #fdf6ea;"), "nen khoi phai la kem #fdf6ea");
  assert.ok(homeCss.includes("data:image/svg+xml"), "hoa tiet phai la SVG tu ve, khong copy mau TQ");
  assert.ok(homeCss.includes(".epaper-strip {"), "thieu style strip");
  assert.ok(homeCss.includes("overflow-x: auto;"), "strip phai truot ngang trong khoi");
  assert.ok(homeCss.includes("scroll-snap-type: x mandatory;"), "strip phai co scroll-snap");
  assert.ok(homeCss.includes(".bi-card {"), "thieu style the");
  assert.ok(homeCss.includes("width: 272px;"), "the PC phai rong 272px (4 bia/luot + he bia 5)");
  assert.ok(homeCss.includes("width: calc((100% - 0.75rem) / 2);"), "mobile phai 2 bia/luot");
  assert.ok(homeCss.includes(".bi-badge-new"), "thieu badge SO MOI");
  assert.ok(homeCss.includes(".bi-badge-hl"), "thieu badge VUNG CAO");
  assert.ok(homeCss.includes(".epaper-arrow {"), "thieu style mui ten tron");
  assert.ok(homeCss.includes("aspect-ratio: 800 / 1167;"), "bia phai giu dung ti le trang 800/1167");
  assert.ok(!homeCss.includes(".epaper-grid"), "khong con luoi cu .epaper-grid");
  assert.ok(!homeCss.includes(".issue-small"), "khong con style the cu .issue-small");
});
