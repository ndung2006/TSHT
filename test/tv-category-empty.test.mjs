// Tests for the TV category sections (portal only): a category with no
// published videos is hidden entirely (section + subnav link); only
// when the WHOLE page has no category with content does one line
// "Kho video dang duoc xay dung" + a live-TV link appear. A category
// whose fetch fails keeps its placeholder (unknown state, not empty).
// Run: node --test test/tv-category-empty.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const SECTIONS = [
  { section: "chuong-trinh-thoi-su", slug: "thoi-su" },
  { section: "chuong-trinh-kinh-te-van-hoa-xa-hoi", slug: "kinh-te-van-hoa-xa-hoi" },
  { section: "chuong-trinh-van-nghe", slug: "van-nghe" },
  { section: "chuong-trinh-tieng-dan-toc", slug: "tieng-dan-toc" },
  { section: "chuong-trinh-chuyen-doi-so", slug: "chuyen-doi-so" },
  { section: "chuong-trinh-quoc-phong-an-ninh", slug: "quoc-phong-an-ninh" },
  { section: "chuong-trinh-xay-dung-dang", slug: "xay-dung-dang" },
  { section: "chuong-trinh-tap-chi-toa-dam", slug: "tap-chi-toa-dam" },
];

// ---- Minimal DOM stub (same shape as test/reader-auth.test.mjs) ----
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
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
  dispatch(type, event = {}) {
    const ev = { type, ...event, preventDefault() {}, target: this };
    (this.listeners[type] || []).forEach((fn) => fn(ev));
    return ev;
  }
  focus() {}
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

function buildFixture() {
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
  // Ids the script touches at load (player-msg is written by showMsg
  // on the no-channel path; sched-date gets an onchange handler).
  ["player-msg", "now-playing", "sched-date", "schedule", "replay-bar", "replay-title", "back-live", "player"].forEach((id) => doc.appendChild(el("div", { id })));
  const subnav = el("nav", { class: "tv-subnav" });
  const links = {};
  SECTIONS.forEach((s) => {
    const a = el("a", { href: "#" + s.section });
    a.textContent = s.slug;
    subnav.appendChild(a);
    links[s.section] = a;
  });
  doc.appendChild(subnav);
  const sections = {};
  SECTIONS.forEach((s) => {
    const sec = el("section", { id: s.section });
    const box = el("div", { class: "cat-placeholder" });
    sec.appendChild(box);
    doc.appendChild(sec);
    sections[s.section] = { section: sec, box };
  });
  const emptyEl = el("p", { id: "tv-cats-empty", class: "tv-cats-empty" });
  emptyEl.hidden = true;
  doc.appendChild(emptyEl);
  return { doc, sections, links, emptyEl };
}

function loadTv(fixture, routes) {
  const fetchCalls = [];
  const sandbox = {
    console,
    document: fixture.doc,
    location: { pathname: "/truyen-hinh", href: "/truyen-hinh" },
    innerWidth: 1280,
    fetch: async (url) => {
      fetchCalls.push(url);
      const u = new URL(url, "https://example.test");
      if (u.pathname === "/api/v2/catalog-categories") {
        const res = routes.categories;
        if (res instanceof Error) throw res;
        return { ok: true, status: 200, json: async () => res };
      }
      if (u.pathname === "/api/v2/catalog-videos") {
        const id = u.searchParams.get("categoryId");
        const res = routes.videos && routes.videos[id];
        if (res instanceof Error) throw res;
        return { ok: true, status: 200, json: async () => res || { items: [] } };
      }
      if (u.pathname === "/api/v1/channels") return { ok: true, status: 200, json: async () => ({ items: [] }) };
      if (u.pathname.startsWith("/api/v2/vod/video/")) return { ok: true, status: 200, json: async () => ({ url: "https://example.test/play.m3u8" }) };
      return { ok: true, status: 200, json: async () => ({}) };
    },
    setTimeout,
    clearTimeout,
    addEventListener: () => {},
    // tv.js dung LiveEpg o khoi dong (ngay hien tai cho o chon lich)
    // va de escape tieu de the video; chi stub 2 ham can thiet.
    LiveEpg: {
      saigonToday: () => "2026-11-06",
      esc: (s) => String(s == null ? "" : s),
    },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, "public/js/tv.js"), "utf8"), sandbox, { filename: "tv.js" });
  return { sandbox, fetchCalls };
}
const tick = async (n = 12) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };

function allCategories() {
  return { items: SECTIONS.map((s, i) => ({ slug: s.slug, id: "cat-" + i })) };
}
function videoItems(n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push({ publicId: "vid-" + i, title: "Video " + i, thumbnail: "" });
  return { items: out };
}
function cardCount(box) {
  // Stub DOM khong parse innerHTML thanh node that: dem qua chuoi.
  return (box.innerHTML.match(/tv-cat-card/g) || []).length;
}

test("tat ca chuyen muc trong -> an het 8 khoi + hien 1 dong kho video dang xay dung", async () => {
  const f = buildFixture();
  loadTv(f, { categories: allCategories(), videos: {} });
  await tick();
  SECTIONS.forEach((s) => {
    assert.equal(f.sections[s.section].section.hidden, true, s.section + " phai an");
    assert.equal(f.links[s.section].hidden, true, "link subnav " + s.section + " phai an");
  });
  assert.equal(f.emptyEl.hidden, false);
});

test("mot so chuyen muc co video -> chi an khoi trong, khong hien dong kho video", async () => {
  const f = buildFixture();
  loadTv(f, { categories: allCategories(), videos: { "cat-0": videoItems(2), "cat-3": videoItems(1) } });
  await tick();
  assert.equal(f.sections["chuong-trinh-thoi-su"].section.hidden, false);
  assert.equal(cardCount(f.sections["chuong-trinh-thoi-su"].box), 2);
  assert.equal(f.sections["chuong-trinh-thoi-su"].box.classList.contains("tv-cat-grid"), true);
  assert.equal(f.sections["chuong-trinh-tieng-dan-toc"].section.hidden, false);
  assert.equal(cardCount(f.sections["chuong-trinh-tieng-dan-toc"].box), 1);
  assert.equal(f.sections["chuong-trinh-van-nghe"].section.hidden, true);
  assert.equal(f.links["chuong-trinh-van-nghe"].hidden, true);
  assert.equal(f.links["chuong-trinh-thoi-su"].hidden, false);
  assert.equal(f.emptyEl.hidden, true);
});

test("mot chuyen muc loi tai -> giu khung cho, khong hien dong kho video", async () => {
  const f = buildFixture();
  loadTv(f, { categories: allCategories(), videos: { "cat-0": new Error("mang loi") } });
  await tick();
  assert.equal(f.sections["chuong-trinh-thoi-su"].section.hidden, false);
  assert.equal(f.sections["chuong-trinh-thoi-su"].box.classList.contains("cat-placeholder"), true);
  SECTIONS.slice(1).forEach((s) => assert.equal(f.sections[s.section].section.hidden, true, s.section + " phai an"));
  assert.equal(f.emptyEl.hidden, true);
});

test("danh muc catalog thieu slug -> an khoi do; danh muc rong -> an het + hien dong kho video", async () => {
  const f = buildFixture();
  loadTv(f, { categories: { items: [{ slug: "thoi-su", id: "cat-0" }] }, videos: { "cat-0": videoItems(1) } });
  await tick();
  assert.equal(f.sections["chuong-trinh-thoi-su"].section.hidden, false);
  SECTIONS.slice(1).forEach((s) => assert.equal(f.sections[s.section].section.hidden, true, s.section + " phai an"));
  assert.equal(f.emptyEl.hidden, true);

  const f2 = buildFixture();
  loadTv(f2, { categories: { items: [] }, videos: {} });
  await tick();
  SECTIONS.forEach((s) => assert.equal(f2.sections[s.section].section.hidden, true, s.section + " phai an"));
  assert.equal(f2.emptyEl.hidden, false);
});
