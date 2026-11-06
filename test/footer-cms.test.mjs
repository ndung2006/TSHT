// Tests for the CMS-driven footer (portal only): footer content comes
// from CMS (footer.description/copyright), sanitized + auto-linked;
// footer logo has a text fallback and a ?v= version; the header logo
// no longer uses localStorage. Run: node --test test/footer-cms.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FOOTER_CONTENT, renderFooter, renderFooterFromCms } from "../lib/footer-content.mjs";
import { sanitizeFooterHtml, linkifyFooterHtml, renderFooterCopyright, renderFooterDescription } from "../lib/sanitize-html.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const partial = fs.readFileSync(path.join(root, "public/partials/footer.html"), "utf8");
const headerJs = fs.readFileSync(path.join(root, "public/js/header.js"), "utf8");
// Quill thay khoang trang bang &nbsp; nen so sanh ten thi chuan hoa truoc.
const norm = (s) => String(s || "").replace(/&nbsp;/g, " ");

// Mo ta CMS that (3 P.TBT, khong co NGUYEN HUNG CUONG), dung dang
// Quill tra ve: <p> + &nbsp; + so dien thoai dang text thuong.
const CMS_DESC =
  "<p>TỔNG&nbsp;BIÊN&nbsp;TẬP:&nbsp;VŨ&nbsp;VĂN&nbsp;THƯỢNG</p>" +
  "<p>PHÓ&nbsp;TỔNG&nbsp;BIÊN&nbsp;TẬP:&nbsp;TRẦN&nbsp;VĂN&nbsp;TOẠI,&nbsp;NGUYỄN&nbsp;THỊ&nbsp;TƯƠI,&nbsp;</p>" +
  "<p>ĐẶNG&nbsp;HẢI&nbsp;TRIỀU</p>" +
  "<p>Điện&nbsp;thoại:&nbsp;(0215)3824624;&nbsp;(0215)&nbsp;3835300;&nbsp;(0215)&nbsp;3825357</p>" +
  "<p>Email:&nbsp;baodientudbp@gmail.com</p>" +
  "<p>Trụ&nbsp;sở&nbsp;chính:&nbsp;Số&nbsp;829,&nbsp;đường&nbsp;Võ&nbsp;Nguyên&nbsp;Giáp,&nbsp;phường&nbsp;Điện&nbsp;Biên&nbsp;Phủ,&nbsp;tỉnh&nbsp;Điện&nbsp;Biên</p>" +
  "<p>Cơ&nbsp;sở&nbsp;2:&nbsp;Số&nbsp;27A,&nbsp;đường&nbsp;Quyết&nbsp;Tiến,&nbsp;phường&nbsp;Điện&nbsp;Biên&nbsp;Phủ,&nbsp;tỉnh&nbsp;Điện&nbsp;Biên.</p>";
const CMS_COPYRIGHT =
  "Giấy phép hoạt động số: 725/GP-BTTTT do Bộ Thông tin và Truyền thông cấp ngày 09/11/2021\n" +
  "© Bản quyền thuộc về Báo và Phát thanh, Truyền hình Điện Biên.\n" +
  "Cấm sao chép dưới mọi hình thức nếu không có sự chấp thuận bằng văn bản.";

// ---- sanitizeFooterHtml ----

test("sanitize: script/iframe/style bi xoa ca the lan noi dung con", () => {
  const out = sanitizeFooterHtml("<p>ok</p><script>alert(1)</script><p>xong</p>");
  assert.doesNotMatch(out, /script|alert/);
  assert.match(out, /<p>ok<\/p>/);
  assert.match(out, /<p>xong<\/p>/);
  assert.doesNotMatch(sanitizeFooterHtml('<iframe src="https://x.vn"></iframe>hello'), /iframe|https/);
  assert.match(sanitizeFooterHtml('<iframe src="https://x.vn"></iframe>hello'), /hello/);
  assert.doesNotMatch(sanitizeFooterHtml("<style>p{color:red}</style>giu"), /style|color/);
  assert.match(sanitizeFooterHtml("<style>p{color:red}</style>giu"), /giu/);
});

test("sanitize: javascript: href + onclick + thuoc tinh la bi loai", () => {
  assert.equal(sanitizeFooterHtml('<a href="javascript:alert(1)">bam</a>'), "<a>bam</a>");
  assert.equal(sanitizeFooterHtml('<a href="JaVaScRiPt:alert(1)">bam</a>'), "<a>bam</a>");
  assert.equal(sanitizeFooterHtml('<a href="&#106;avascript:alert(1)">bam</a>'), "<a>bam</a>");
  assert.equal(sanitizeFooterHtml('<a href="data:text/html,<script>">bam</a>'), "<a>bam</a>");
  assert.equal(sanitizeFooterHtml('<p onclick="x()" class="a">hi</p>'), "<p>hi</p>");
  assert.equal(sanitizeFooterHtml('<a href="https://x.vn" target="_blank" rel="x">ok</a>'), '<a href="https://x.vn">ok</a>');
});

test("sanitize: the dinh dang co ban duoc giu, &nbsp; duoc giu, the la bi xoa nhung giu chu", () => {
  const src = '<p><strong>dam</strong> <em>nghieng</em> <a href="https://x.vn">link</a></p>';
  assert.equal(sanitizeFooterHtml(src), src);
  assert.match(sanitizeFooterHtml("<p>TỔNG&nbsp;BIÊN&nbsp;TẬP</p>"), /&nbsp;/);
  assert.equal(sanitizeFooterHtml("<div>hello</div>"), "hello");
  assert.equal(sanitizeFooterHtml("<h2>tieu de</h2>"), "tieu de");
  assert.equal(sanitizeFooterHtml('<img src="https://x.vn/a.jpg">sau'), "sau");
  assert.equal(sanitizeFooterHtml("a <!-- ghi chu --> b"), "a  b");
  assert.equal(sanitizeFooterHtml("a <!-- khong dong"), "a ");
  assert.equal(sanitizeFooterHtml('<a href="mailto:a@b.vn">a@b.vn</a>'), '<a href="mailto:a@b.vn">a@b.vn</a>');
  assert.equal(sanitizeFooterHtml('<a href="tel:+84123">goi</a>'), '<a href="tel:+84123">goi</a>');
  assert.equal(sanitizeFooterHtml("<p><br></p>"), "<p><br></p>");
});

// ---- linkifyFooterHtml ----

test("linkify: 3 dang so dien thoai + email thanh tel:/mailto:, giu nguyen chu hien thi", () => {
  assert.equal(
    linkifyFooterHtml("<p>(0215)3824624</p>"),
    '<p><a href="tel:+842153824624">(0215)3824624</a></p>'
  );
  assert.equal(
    linkifyFooterHtml("<p>(0215) 3835300</p>"),
    '<p><a href="tel:+842153835300">(0215) 3835300</a></p>'
  );
  assert.equal(
    linkifyFooterHtml("<p>(0215)&nbsp;3825357</p>"),
    '<p><a href="tel:+842153825357">(0215)&nbsp;3825357</a></p>'
  );
  assert.equal(
    linkifyFooterHtml("<p>0901234567</p>"),
    '<p><a href="tel:+84901234567">0901234567</a></p>'
  );
  assert.equal(
    linkifyFooterHtml("<p>+84 215 382 4624</p>"),
    '<p><a href="tel:+842153824624">+84 215 382 4624</a></p>'
  );
  assert.equal(
    linkifyFooterHtml("<p>baodientudbp@gmail.com</p>"),
    '<p><a href="mailto:baodientudbp@gmail.com">baodientudbp@gmail.com</a></p>'
  );
  // Nam/thang va so giay phep khong phai so dien thoai.
  assert.equal(linkifyFooterHtml("<p>09/11/2021</p>"), "<p>09/11/2021</p>");
  assert.equal(linkifyFooterHtml("<p>725/GP-BTTTT</p>"), "<p>725/GP-BTTTT</p>");
});

test("linkify: khong gan lai link trong <a> co san, khong dung vao thuoc tinh href", () => {
  const inside = '<a href="tel:+842153824624">(0215)3824624</a>';
  assert.equal(linkifyFooterHtml(`<p>${inside}</p>`), `<p>${inside}</p>`);
  const attr = '<a href="https://x.vn/02153824624">xem</a>';
  assert.equal(linkifyFooterHtml(`<p>${attr}</p>`), `<p>${attr}</p>`);
  assert.equal(
    linkifyFooterHtml("<p>goi (0215)3824624 hoac <a href=\"mailto:a@b.vn\">a@b.vn</a></p>"),
    "<p>goi <a href=\"tel:+842153824624\">(0215)3824624</a> hoac <a href=\"mailto:a@b.vn\">a@b.vn</a></p>"
  );
});

// ---- renderFooterCopyright / renderFooterDescription ----

test("renderFooterCopyright: text thuong xuong dong -> <p>, rong -> chuoi rong", () => {
  const out = renderFooterCopyright(CMS_COPYRIGHT);
  assert.equal((out.match(/<p>/g) || []).length, 3);
  assert.match(out, /725\/GP-BTTTT/);
  assert.match(out, /Bản quyền thuộc về/);
  assert.equal(renderFooterCopyright(""), "");
  assert.equal(renderFooterCopyright("  \n\n  "), "");
  assert.equal(renderFooterCopyright("<script>x</script>"), "<p>&lt;script&gt;x&lt;/script&gt;</p>");
});

test("renderFooterDescription: Editor rong -> chuoi rong; co chu -> giu HTML da loc", () => {
  assert.equal(renderFooterDescription(""), "");
  assert.equal(renderFooterDescription("<p><br></p>"), "");
  assert.equal(renderFooterDescription("<p>&nbsp;</p>"), "");
  const out = renderFooterDescription(CMS_DESC);
  assert.match(norm(out), /TRẦN VĂN TOẠI/);
  assert.match(out, /tel:\+842153824624/);
  assert.match(out, /mailto:baodientudbp@gmail.com/);
});

// ---- renderFooterFromCms ----

test("renderFooterFromCms: noi dung CMS len cot phai (3 P.TBT) + cot trai (giay phep)", () => {
  const html = renderFooterFromCms(partial, { description: CMS_DESC, copyright: CMS_COPYRIGHT });
  assert.match(norm(html), /TRẦN VĂN TOẠI/);
  assert.match(norm(html), /NGUYỄN THỊ TƯƠI/);
  assert.match(norm(html), /ĐẶNG HẢI TRIỀU/);
  assert.doesNotMatch(norm(html), /NGUYỄN HÙNG CƯỜNG/);
  assert.match(html, /tel:\+842153824624/);
  assert.match(html, /tel:\+842153835300/);
  assert.match(html, /tel:\+842153825357/);
  assert.match(html, /mailto:baodientudbp@gmail.com/);
  assert.match(html, /725\/GP-BTTTT/);
  assert.doesNotMatch(html, /@FOOTER_LICENSE|@FOOTER_CONTACT/);
});

test("renderFooterFromCms: mo ta rong -> cot phai du phong (4 P.TBT); copyright rong -> cot trai du phong", () => {
  const noDesc = renderFooterFromCms(partial, { description: "", copyright: CMS_COPYRIGHT });
  assert.match(norm(noDesc), /NGUYỄN HÙNG CƯỜNG/);
  assert.match(noDesc, /tel:\+842153824624/);
  assert.match(noDesc, /725\/GP-BTTTT/);
  const noCopy = renderFooterFromCms(partial, { description: CMS_DESC, copyright: "" });
  assert.doesNotMatch(norm(noCopy), /NGUYỄN HÙNG CƯỜNG/);
  assert.match(noCopy, /725\/GP-BTTTT/);
  assert.match(noCopy, /Cấm sao chép/);
});

test("renderFooterFromCms: ca hai rong hoac null -> toan bo du phong, bang renderFooter", () => {
  assert.equal(renderFooterFromCms(partial, { description: "", copyright: "" }), renderFooter(partial));
  assert.equal(renderFooterFromCms(partial, null), renderFooter(partial));
  assert.equal(renderFooterFromCms(partial, undefined), renderFooter(partial));
});

test("renderFooterFromCms: <script> trong mo ta bi loai, chu thuong van con", () => {
  const html = renderFooterFromCms(partial, {
    description: "<p>ok</p><script>alert(1)</script>",
    copyright: CMS_COPYRIGHT,
  });
  assert.doesNotMatch(html, /<script>|alert\(1\)/);
  assert.match(html, /<p>ok<\/p>/);
});

test("partial chan trang: co o logo + chu du phong", () => {
  assert.match(partial, /id="footer-logo-box"/);
  assert.match(partial, /id="footer-logo"/);
  assert.match(partial, /id="footer-logo-text"/);
  assert.match(partial, /Điện Biên Phủ Online/);
});

// ---- Stub DOM cho header.js (theo mau test/reader-auth.test.mjs) ----

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
    this.src = "";
    this.onerror = null;
    this.style = {};
    this._classes = new Set((attrs.class || "").split(/\s+/).filter(Boolean));
    this.classList = {
      add: (c) => this._classes.add(c),
      remove: (c) => this._classes.delete(c),
      toggle: (c, force) => {
        const on = force === undefined ? !this._classes.has(c) : !!force;
        if (on) this._classes.add(c);
        else this._classes.delete(c);
      },
      contains: (c) => this._classes.has(c),
    };
  }
  getAttribute(name) {
    if (name === "src" && this.src) return this.src;
    return name in this.attrs ? this.attrs[name] : null;
  }
  setAttribute(name, value) {
    this.attrs[name] = String(value);
  }
  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  addEventListener(type, fn) {
    (this.listeners[type] = this.listeners[type] || []).push(fn);
  }
  dispatch(type, event = {}) {
    const ev = { type, ...event, preventDefault() {}, target: this };
    (this.listeners[type] || []).forEach((fn) => fn(ev));
    return ev;
  }
  focus() {}
  closest(sel) {
    let el = this;
    while (el) {
      if (matches(el, sel)) return el;
      el = el.parentNode;
    }
    return null;
  }
  querySelector(sel) {
    return querySelectorAll(this, sel)[0] || null;
  }
  querySelectorAll(sel) {
    return querySelectorAll(this, sel);
  }
  getElementsByTagName(tag) {
    return querySelectorAll(this, tag);
  }
}

function matchesSimple(el, sel) {
  if (!el || !el.tagName) return false;
  if (sel.startsWith("#")) return el.attrs.id === sel.slice(1);
  const m = sel.match(/^([a-zA-Z][a-zA-Z0-9]*)?((?:\.[a-zA-Z0-9_-]+)*)?(\[([^\]=]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\]]+)))?\])?$/);
  if (!m) return false;
  const [, tag, clsPart, , attr, v1, v2, v3] = m;
  if (tag && el.tagName.toLowerCase() !== tag.toLowerCase()) return false;
  if (clsPart) {
    for (const c of clsPart.split(".").filter(Boolean)) {
      if (!el._classes.has(c)) return false;
    }
  }
  if (attr) {
    const val = v1 !== undefined ? v1 : v2 !== undefined ? v2 : v3;
    if (!(attr in el.attrs)) return false;
    if (val !== undefined && el.attrs[attr] !== val) return false;
  }
  return true;
}

function matches(el, sel) {
  const parts = sel.trim().split(/\s+/);
  if (parts.length === 1) return matchesSimple(el, parts[0]);
  if (!matchesSimple(el, parts[parts.length - 1])) return false;
  let node = el.parentNode;
  for (let i = parts.length - 2; i >= 0; i--) {
    let found = false;
    while (node) {
      if (matchesSimple(node, parts[i])) {
        found = true;
        node = node.parentNode;
        break;
      }
      node = node.parentNode;
    }
    if (!found) return false;
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

function buildHeaderFixture() {
  const docListeners = {};
  const doc = {
    readyState: "complete",
    body: new El("body"),
    children: [],
    createElement: (tag) => new El(tag),
    addEventListener: (type, fn) => {
      (docListeners[type] = docListeners[type] || []).push(fn);
    },
    querySelector: (sel) => querySelectorAll(doc, sel)[0] || null,
    querySelectorAll: (sel) => querySelectorAll(doc, sel),
    getElementById: (id) => querySelectorAll(doc, `#${id}`)[0] || null,
  };
  const add = (el) => {
    el.parentNode = doc;
    doc.children.push(el);
    return el;
  };
  const dateEl = add(new El("span", { "data-topline-date": "" }));
  const topBtn = add(new El("button", { id: "to-top" }));
  const brand = add(new El("div", { class: "brand" }));
  const logoEl = new El("img", { id: "brand-logo" });
  logoEl.hidden = true;
  const nameEl = new El("span", { class: "brand-name" });
  nameEl.hidden = false;
  brand.appendChild(logoEl);
  brand.appendChild(nameEl);
  const socialEl = add(new El("div", { id: "utility-social" }));
  socialEl.hidden = true;
  const strip = add(new El("div", { id: "hotlink-strip" }));
  strip.hidden = true;
  const footerBox = add(new El("div", { id: "footer-logo-box" }));
  footerBox.hidden = true;
  const footerImg = new El("img", { id: "footer-logo" });
  footerImg.hidden = true;
  const footerText = new El("span", { id: "footer-logo-text" });
  footerText.hidden = true;
  footerText.textContent = "Điện Biên Phủ Online";
  footerBox.appendChild(footerImg);
  footerBox.appendChild(footerText);
  const searchBtn = add(new El("button", { class: "catnav-search-btn" }));
  const searchPanel = add(new El("div", { id: "catnav-search" }));
  searchPanel.hidden = true;
  const megaPanel = add(new El("div", { id: "catnav-mega" }));
  megaPanel.hidden = true;
  const megaBtn = add(new El("button", { class: "catnav-menu-btn" }));
  const drawer = add(new El("div", { id: "site-drawer" }));
  drawer.hidden = true;
  const nav = add(new El("div", { class: "catnav" }));
  return {
    doc, dateEl, topBtn, logoEl, nameEl, socialEl, strip,
    footerBox, footerImg, footerText, searchBtn, searchPanel,
    megaPanel, megaBtn, drawer, nav,
  };
}

function loadHeader(fixture, outcomes, seedCache) {
  const fetchCalls = [];
  const timers = [];
  const storage = new Map();
  if (seedCache) storage.set("tsht_site_interface", JSON.stringify({ t: Date.now(), v: seedCache }));
  const sandbox = {
    console,
    document: fixture.doc,
    location: { pathname: "/", href: "https://tsht.vtctech.xyz/" },
    scrollY: 0,
    pageYOffset: 0,
    innerHeight: 800,
    matchMedia: () => ({ matches: false, addListener: () => {}, addEventListener: () => {} }),
    sessionStorage: {
      getItem: (k) => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: (k) => storage.delete(k),
    },
    fetch: async (url) => {
      fetchCalls.push(url);
      const next = outcomes[Math.min(fetchCalls.length - 1, outcomes.length - 1)];
      if (!next) throw new Error("het fetch outcome");
      if (next instanceof Error) throw next;
      return { ok: next.ok !== false, status: next.status || 200, json: async () => next.body || {} };
    },
    setTimeout: (fn, ms) => {
      timers.push({ fn, ms });
      return timers.length;
    },
    clearTimeout: () => {},
    addEventListener: () => {},
    scrollTo: () => {},
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, "public/js/header.js"), "utf8"), sandbox, { filename: "header.js" });
  return { sandbox, fetchCalls, timers, storage };
}

const tick = async (n = 6) => {
  for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r));
};
async function flushTimers(timers) {
  for (let i = 0; i < 10 && timers.length; i++) {
    const batch = timers.splice(0, timers.length);
    for (const t of batch) t.fn();
    await tick(2);
  }
}

const SI_OK = {
  header: { image: "https://x.vn/brand.jpg" },
  footer: { logo: "https://x.vn/logo.jpg" },
  hotLinks: [],
};
const siOk = (over = {}) => ({ ok: true, body: { ...SI_OK, ...over } });

test("header.js: fetch ok lan dau — logo chan trang co ?v=, o hien; logo dau trang hien anh", async () => {
  const f = buildHeaderFixture();
  const { sandbox, fetchCalls } = loadHeader(f, [siOk()]);
  await tick();
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0], "/api/v2/site-interface");
  assert.match(f.footerImg.src, /logo\.jpg\?v=20261106-1$/);
  assert.equal(f.footerImg.hidden, false);
  assert.equal(f.footerBox.hidden, false);
  assert.equal(f.footerText.hidden, true);
  assert.equal(f.logoEl.src, "https://x.vn/brand.jpg");
  assert.doesNotMatch(f.logoEl.src, /\?v=/);
  assert.equal(f.logoEl.hidden, false);
  assert.equal(f.nameEl.hidden, true);
  const si = await sandbox.__tshtSiteInterface;
  // So sanh qua JSON (object tu vm sandbox co prototype khac realm host).
  assert.equal(JSON.stringify(si), JSON.stringify(SI_OK));
});

test("header.js: fetch hut lan dau, thu lai thanh cong — goi fetch 2 lan, logo van hien", async () => {
  const f = buildHeaderFixture();
  const { fetchCalls, timers } = loadHeader(f, [new Error("mang loi"), siOk()]);
  await tick();
  assert.equal(fetchCalls.length, 1);
  assert.equal(timers.length, 1);
  assert.equal(timers[0].ms, 500);
  await flushTimers(timers);
  assert.equal(fetchCalls.length, 2);
  assert.match(f.footerImg.src, /logo\.jpg\?v=20261106-1$/);
  assert.equal(f.footerBox.hidden, false);
  assert.equal(f.footerText.hidden, true);
});

test("header.js: fetch hut ca 2 lan — hien chu du phong, o khong trong", async () => {
  const f = buildHeaderFixture();
  const { fetchCalls, timers } = loadHeader(f, [new Error("mang loi"), new Error("mang loi")]);
  await tick();
  assert.equal(fetchCalls.length, 1);
  await flushTimers(timers);
  assert.equal(fetchCalls.length, 2);
  assert.equal(f.footerText.hidden, false);
  assert.equal(f.footerText.textContent, "Điện Biên Phủ Online");
  assert.equal(f.footerImg.hidden, true);
  assert.equal(f.footerBox.hidden, false);
  // Logo dau trang cung ve chu ten khi API loi.
  assert.equal(f.nameEl.hidden, false);
  assert.equal(f.logoEl.hidden, true);
});

test("header.js: si null + co hotlink-strip — khong vo, hien chu du phong", async () => {
  const f = buildHeaderFixture();
  const { timers } = loadHeader(f, [new Error("mang loi"), new Error("mang loi")]);
  await tick();
  await flushTimers(timers);
  assert.equal(f.strip.hidden, true);
  assert.equal(f.strip.innerHTML, "");
  assert.equal(f.footerText.hidden, false);
  assert.equal(f.footerBox.hidden, false);
});

test("header.js: anh logo loi (onerror) — hien chu du phong", async () => {
  const f = buildHeaderFixture();
  loadHeader(f, [siOk()]);
  await tick();
  assert.match(f.footerImg.src, /logo\.jpg\?v=20261106-1$/);
  assert.equal(typeof f.footerImg.onerror, "function");
  f.footerImg.onerror();
  assert.equal(f.footerText.hidden, false);
  assert.equal(f.footerImg.hidden, true);
  assert.equal(f.footerBox.hidden, false);
});

test("header.js: logo URL da co ? thi dung &v=; CMS chua dat logo thi hien chu", async () => {
  const f = buildHeaderFixture();
  loadHeader(f, [siOk({ footer: { logo: "https://x.vn/logo.jpg?foo=1" } })]);
  await tick();
  assert.equal(f.footerImg.src, "https://x.vn/logo.jpg?foo=1&v=20261106-1");
  assert.equal(f.footerBox.hidden, false);

  const f2 = buildHeaderFixture();
  loadHeader(f2, [siOk({ footer: {} })]);
  await tick();
  assert.equal(f2.footerText.hidden, false);
  assert.equal(f2.footerImg.hidden, true);
  assert.equal(f2.footerBox.hidden, false);
});

test("header.js: logo dau trang khong dung localStorage; khong co anh thi hien chu ten", async () => {
  // Khong con goi API localStorage nao (chu "localStorage" van duoc
  // phep xuat hien trong comment giai thich viec go bo dem).
  assert.doesNotMatch(headerJs, /localStorage\.(getItem|setItem|removeItem)/);
  assert.doesNotMatch(headerJs, /window\.localStorage/);
  assert.doesNotMatch(headerJs, /tsht_header_image/);
  const f = buildHeaderFixture();
  loadHeader(f, [siOk({ header: {} })]);
  await tick();
  assert.equal(f.nameEl.hidden, false);
  assert.equal(f.logoEl.hidden, true);
});

test("header.js: co cache sessionStorage thi khong fetch, logo van hien", async () => {
  const f = buildHeaderFixture();
  const { fetchCalls } = loadHeader(f, [], SI_OK);
  await tick();
  assert.equal(fetchCalls.length, 0);
  assert.match(f.footerImg.src, /logo\.jpg\?v=20261106-1$/);
  assert.equal(f.footerBox.hidden, false);
});
