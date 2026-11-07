// Tests for the 3c-final-beat (frontend): the final beat records the
// ACTUAL seconds played per VOD session. The normal beat is 1 minute
// per tick and knows no real seconds; the tracker in telemetry.js
// accumulates wall-clock time while the media is in the 'playing'
// state and sends ONE final beat (final:true) with watchedSeconds +
// durationSec when the video ends, when it stays paused >= 30s, when
// the session stops (stopHeartbeat), or on pagehide. The backend
// dedupes final beats of one session by MAX, so a later final beat
// after a resume carries the new cumulative total.
// - Part A: telemetry.js in isolation (fake media/fetch/timers/Date),
//   so the second counts are deterministic.
// - Part B: tv.js + the REAL telemetry.js in one vm context (same
//   harness shape as vod-heartbeat.test.mjs): clicking a VOD card,
//   'playing', then 'ended' must produce a final-beat POST.
//   multimedia.js / nen-tang-so.html share the same startHeartbeat
//   call (already pinned by vod-heartbeat.test.mjs), so the tracker
//   is armed there too; the live check covers them.
// Run: node --test test/vod-final-beat.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const telemetrySrc = fs.readFileSync(path.join(root, "public/js/telemetry.js"), "utf8");
const tvSrc = fs.readFileSync(path.join(root, "public/js/tv.js"), "utf8");

// ================= Part A: telemetry.js in isolation =================
class MediaStub {
  constructor() {
    this.paused = true;
    this.duration = NaN;
    this.listeners = {};
  }
  addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
  removeEventListener(type, fn) {
    const l = this.listeners[type] || [];
    const i = l.indexOf(fn);
    if (i >= 0) l.splice(i, 1);
  }
  dispatch(type) { (this.listeners[type] || []).slice().forEach((fn) => fn({ type })); }
  play() { this.paused = false; this.dispatch("playing"); }
  pause() { this.paused = true; this.dispatch("pause"); }
  end() { this.paused = true; this.dispatch("ended"); }
}

function loadTelemetry() {
  const posts = [];
  const timers = [];
  let nowMs = 1_700_000_000_000;
  const listeners = {};
  const sandbox = {
    console,
    localStorage: {
      _store: {},
      getItem(k) { return this._store[k] ?? null; },
      setItem(k, v) { this._store[k] = String(v); },
    },
    fetch: async (url, opts) => {
      let body = null;
      try { body = JSON.parse(opts && opts.body ? opts.body : "null"); } catch { body = null; }
      posts.push({ url, body, keepalive: !!(opts && opts.keepalive) });
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    },
    setTimeout: (fn, ms) => {
      // Tra id bat dau tu 1 nhu trinh duyet (id 0 la falsy, code
      // kiem tra timer bang != null nhung harness cu tra 0 gay nham).
      timers.push({ fn, ms, cleared: false, ran: false });
      return timers.length;
    },
    clearTimeout: (id) => { if (timers[id - 1]) timers[id - 1].cleared = true; },
    setInterval: () => 0,
    clearInterval: () => {},
    Date: { now: () => nowMs },
    addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(telemetrySrc, sandbox, { filename: "telemetry.js" });
  const telemetryPosts = () => posts.filter((p) => p.url === "/api/v2/channel-telemetry");
  const finalBeats = () => telemetryPosts().filter((p) => p.body && p.body.final === true);
  const normalBeats = () => telemetryPosts().filter((p) => p.body && p.body.final !== true);
  const runTimers = () => {
    timers.filter((t) => !t.cleared && !t.ran).forEach((t) => { t.ran = true; t.fn(); });
  };
  const firePagehide = () => { (listeners.pagehide || []).slice().forEach((fn) => fn({ type: "pagehide" })); };
  return {
    sandbox, posts, timers, telemetryPosts, finalBeats, normalBeats, runTimers, firePagehide,
    setNow: (ms) => { nowMs = ms; },
    advance: (ms) => { nowMs += ms; },
    now: () => nowMs,
  };
}

function startVod(t, media, contentId = "vid-1") {
  t.sandbox.window.TshtTelemetry.startHeartbeat({ channel: "", type: "vod", contentId, media });
}

test("telemetry: VOD ket thuc (ended) -> 1 beat cuoi, watchedSeconds = so giay thuc phat, co durationSec", () => {
  const t = loadTelemetry();
  const media = new MediaStub();
  media.duration = 111;
  startVod(t, media);
  assert.equal(t.normalBeats().length, 0, "media con paused thi beat thuong bi bo qua");
  media.play(); // playing, bat dau tinh gio
  t.advance(30_000);
  media.end();
  assert.equal(t.finalBeats().length, 1, "ended phai gui dung 1 beat cuoi");
  const b = t.finalBeats()[0].body;
  assert.equal(b.type, "vod");
  assert.equal(b.contentId, "vid-1");
  assert.equal(b.final, true);
  assert.equal(b.watchedSeconds, 30);
  assert.equal(b.durationSec, 111);
  assert.equal(t.finalBeats()[0].keepalive, true, "beat cuoi gui bang keepalive");
});

test("telemetry: pause lau 30 giay -> beat cuoi; pause roi phat lai trong 30 giay thi chua gui", () => {
  const t = loadTelemetry();
  const media = new MediaStub();
  media.duration = 60;
  startVod(t, media);
  media.play();
  t.advance(10_000);
  media.pause();
  t.runTimers(); // het 30 giay pause -> gui beat cuoi
  assert.equal(t.finalBeats().length, 1, "pause lau 30 giay phai gui beat cuoi");
  assert.equal(t.finalBeats()[0].body.watchedSeconds, 10);

  // Phien moi: pause roi phat lai trong 30 giay thi chua gui.
  const t2 = loadTelemetry();
  const m2 = new MediaStub();
  m2.duration = 60;
  startVod(t2, m2);
  m2.play();
  t2.advance(10_000);
  m2.pause();
  // Chua het 30 giay: khong chay timer, phat lai.
  m2.play();
  t2.runTimers(); // timer cu da bi huy khi phat lai -> khong gui
  assert.equal(t2.finalBeats().length, 0, "phat lai truoc 30 giay thi chua gui beat cuoi");
  t2.advance(20_000);
  m2.end();
  assert.equal(t2.finalBeats().length, 1, "ended sau do gui beat cuoi");
  assert.equal(t2.finalBeats()[0].body.watchedSeconds, 30, "giay cong don ca 2 doan phat (10 + 20)");
});

test("telemetry: pagehide -> beat cuoi; ended + pagehide chi gui 1 lan", () => {
  const t = loadTelemetry();
  const media = new MediaStub();
  media.duration = 90;
  startVod(t, media);
  media.play();
  t.advance(46_000);
  t.firePagehide();
  assert.equal(t.finalBeats().length, 1, "pagehide phai gui beat cuoi");
  assert.equal(t.finalBeats()[0].body.watchedSeconds, 46);
  t.firePagehide();
  assert.equal(t.finalBeats().length, 1, "pagehide lan 2 khong gui trung");

  const t2 = loadTelemetry();
  const m2 = new MediaStub();
  m2.duration = 90;
  startVod(t2, m2);
  m2.play();
  t2.advance(20_000);
  m2.end(); // ended gui beat cuoi
  assert.equal(t2.finalBeats().length, 1);
  t2.firePagehide(); // pagehide sau ended khong gui them
  assert.equal(t2.finalBeats().length, 1, "ended + pagehide chi gui 1 beat cuoi");
});

test("telemetry: phat lai sau beat cuoi (pause lau) -> beat cuoi sau mang tong cong don moi", () => {
  const t = loadTelemetry();
  const media = new MediaStub();
  media.duration = 300;
  startVod(t, media);
  media.play();
  t.advance(45_000);
  media.pause();
  t.runTimers(); // beat cuoi 1: 45 giay
  assert.equal(t.finalBeats().length, 1);
  assert.equal(t.finalBeats()[0].body.watchedSeconds, 45);
  media.play(); // phat lai sau pause lau
  t.advance(20_000);
  media.end(); // beat cuoi 2: tong cong don 65 giay (backend lay MAX)
  assert.equal(t.finalBeats().length, 2);
  assert.equal(t.finalBeats()[1].body.watchedSeconds, 65);
});

test("telemetry: doi video (stopHeartbeat) gui beat cuoi cho video cu", () => {
  const t = loadTelemetry();
  const m1 = new MediaStub();
  m1.duration = 120;
  startVod(t, m1, "vid-1");
  m1.play();
  t.advance(15_000);
  const m2 = new MediaStub();
  m2.duration = 60;
  startVod(t, m2, "vid-2"); // startHeartbeat goi stopHeartbeat truoc
  assert.equal(t.finalBeats().length, 1, "doi video phai gui beat cuoi cho video cu");
  assert.equal(t.finalBeats()[0].body.contentId, "vid-1");
  assert.equal(t.finalBeats()[0].body.watchedSeconds, 15);
  assert.equal(t.finalBeats()[0].body.final, true);
  m2.play();
  t.advance(5_000);
  m2.end();
  assert.equal(t.finalBeats().length, 2);
  assert.equal(t.finalBeats()[1].body.contentId, "vid-2");
  assert.equal(t.finalBeats()[1].body.watchedSeconds, 5);
});

test("telemetry: live/timeshift khong co beat cuoi", () => {
  const t = loadTelemetry();
  const media = new MediaStub();
  media.duration = Infinity; // live khong co thoi luong huu han
  t.sandbox.window.TshtTelemetry.startHeartbeat({ channel: "TUYENQUANG", type: "live", media });
  media.play();
  t.advance(60_000);
  media.end();
  t.firePagehide();
  assert.equal(t.finalBeats().length, 0, "live khong gui beat cuoi");
  t.sandbox.window.TshtTelemetry.stopHeartbeat();
  assert.equal(t.finalBeats().length, 0);
});

test("telemetry: durationSec bo qua khi duration khong huu han / <= 0", () => {
  const t = loadTelemetry();
  const media = new MediaStub();
  media.duration = NaN;
  startVod(t, media);
  media.play();
  t.advance(12_000);
  media.end();
  assert.equal(t.finalBeats().length, 1);
  assert.equal(t.finalBeats()[0].body.watchedSeconds, 12);
  assert.equal("durationSec" in t.finalBeats()[0].body, false, "duration NaN thi khong gui durationSec");
});

// ================= Part B: tv.js + REAL telemetry.js =================
// Tai lai harness toi thieu tu vod-heartbeat.test.mjs (stub DOM + fetch
// API), nhung nap telemetry.js THAT thay vi stub TshtTelemetry, de
// kiem chung day du: bam the VOD -> playing -> ended -> POST beat cuoi.
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
    this.scrollHeight = 0;
    this.clientHeight = 0;
    this.scrollTop = 0;
    this.paused = true;
    this.duration = NaN;
    this._scrolledIntoView = 0;
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
  scrollIntoView() { this._scrolledIntoView += 1; }
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
const tick = async (n = 12) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };
function clickOnce(el) {
  const l = el.listeners["click"] || [];
  if (l.length > 1) el.listeners["click"] = [l[0]];
  el.dispatch("click");
}

const TV_SECTIONS = [
  { section: "chuong-trinh-thoi-su", slug: "thoi-su" },
  { section: "chuong-trinh-kinh-te-van-hoa-xa-hoi", slug: "kinh-te-van-hoa-xa-hoi" },
  { section: "chuong-trinh-van-nghe", slug: "van-nghe" },
  { section: "chuong-trinh-tieng-dan-toc", slug: "tieng-dan-toc" },
  { section: "chuong-trinh-chuyen-doi-so", slug: "chuyen-doi-so" },
  { section: "chuong-trinh-quoc-phong-an-ninh", slug: "quoc-phong-an-ninh" },
  { section: "chuong-trinh-xay-dung-dang", slug: "xay-dung-dang" },
  { section: "chuong-trinh-tap-chi-toa-dam", slug: "tap-chi-toa-dam" },
];

function buildTvFixture() {
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
  ["player-msg", "now-playing", "sched-date", "schedule", "replay-bar", "replay-title", "back-live", "player", "channel-desc"].forEach((id) => doc.appendChild(el("div", { id })));
  byId["replay-bar"].style.display = "none";
  byId["player"].paused = true;
  byId["player"].duration = 111;
  const liveSection = el("section", { id: "live-section" });
  doc.appendChild(liveSection);
  const badge = el("span", { class: "live-badge" });
  badge.textContent = "● TRỰC TIẾP";
  doc.appendChild(badge);
  const subnav = el("nav", { class: "tv-subnav" });
  TV_SECTIONS.forEach((s) => {
    const a = el("a", { href: "#" + s.section });
    a.textContent = s.slug;
    subnav.appendChild(a);
  });
  doc.appendChild(subnav);
  const sections = {};
  TV_SECTIONS.forEach((s) => {
    const sec = el("section", { id: s.section });
    const box = el("div", { class: "cat-placeholder" });
    sec.appendChild(box);
    doc.appendChild(sec);
    sections[s.section] = { section: sec, box };
  });
  const emptyEl = el("p", { id: "tv-cats-empty", class: "tv-cats-empty" });
  emptyEl.hidden = true;
  doc.appendChild(emptyEl);
  const cards = {};
  ["vid-1", "vid-2"].forEach((id, i) => {
    const card = el("button", { class: "tv-cat-card", "data-id": id, "aria-label": "Video " + (i + 1) });
    card.textContent = "Video " + (i + 1);
    sections["chuong-trinh-thoi-su"].box.appendChild(card);
    cards[id] = card;
  });
  return { doc, byId, liveSection, badge, sections, emptyEl, cards };
}

function loadTvRealTelemetry(fixture) {
  const posts = [];
  const playCalls = [];
  const pagehideHandlers = [];
  const sandbox = {
    console,
    document: fixture.doc,
    location: { pathname: "/truyen-hinh", href: "/truyen-hinh" },
    innerWidth: 1280,
    localStorage: {
      _store: {},
      getItem(k) { return this._store[k] ?? null; },
      setItem(k, v) { this._store[k] = String(v); },
    },
    fetch: async (url, opts) => {
      if (typeof url === "string" && url.startsWith("/api/v2/channel-telemetry")) {
        let body = null;
        try { body = JSON.parse(opts && opts.body ? opts.body : "null"); } catch { body = null; }
        posts.push({ url, body });
        return { ok: true, status: 200, json: async () => ({ ok: true }) };
      }
      const u = new URL(url, "https://example.test");
      if (u.pathname === "/api/v2/catalog-categories") return { ok: true, status: 200, json: async () => ({ items: [{ slug: "thoi-su", id: "cat-0" }] }) };
      if (u.pathname === "/api/v2/catalog-videos") {
        const id = u.searchParams.get("categoryId");
        if (id === "cat-0") return { ok: true, status: 200, json: async () => ({ items: [{ publicId: "vid-1", title: "Video 1", thumbnail: "" }, { publicId: "vid-2", title: "Video 2", thumbnail: "" }] }) };
        return { ok: true, status: 200, json: async () => ({ items: [] }) };
      }
      if (u.pathname.startsWith("/api/v2/vod/video/")) return { ok: true, status: 200, json: async () => ({ url: "https://example.test/play.m3u8" }) };
      if (u.pathname === "/api/v1/channels") return { ok: true, status: 200, json: async () => ({ items: [] }) };
      if (u.pathname === "/api/v1/schedule") return { ok: true, status: 200, json: async () => ({ items: [], date: "2026-11-06" }) };
      return { ok: true, status: 200, json: async () => ({}) };
    },
    setTimeout,
    clearTimeout,
    // setInterval that: nhip heartbeat 60s se giu process test khong
    // thoat; test nay khong doi nhip lap nen stub thanh no-op (ghi
    // nhan, khong chay). setTimeout that giu nguyen cho tv.js.
    setInterval: () => 0,
    clearInterval: () => {},
    AbortController,
    addEventListener: (type, fn) => { if (type === "pagehide") pagehideHandlers.push(fn); },
    CustomEvent: function (type, opts) { this.type = type; this.detail = (opts && opts.detail) || {}; },
    playDirect: (media, url) => { playCalls.push({ media, url }); return { stop() {} }; },
    LiveEpg: {
      saigonToday: () => "2026-11-06",
      esc: (s) => String(s == null ? "" : s),
      replayKey: (p) => (p.startTime || p.start_time || "") + "|" + (p.title || ""),
      renderSchedule: () => null,
    },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  // Nap telemetry.js THAT truoc: no dat window.TshtTelemetry that,
  // tv.js se dung luon (khong stub).
  vm.runInContext(telemetrySrc, sandbox, { filename: "telemetry.js" });
  vm.runInContext(tvSrc, sandbox, { filename: "tv.js" });
  const finalBeats = () => posts.filter((p) => p.body && p.body.final === true);
  const normalBeats = () => posts.filter((p) => p.body && p.body.final !== true);
  return { sandbox, posts, playCalls, pagehideHandlers, finalBeats, normalBeats };
}

test("tv.js + telemetry that: VOD phat roi ket thuc -> POST beat cuoi final:true, dung contentId", async () => {
  const f = buildTvFixture();
  const { playCalls, finalBeats, normalBeats } = loadTvRealTelemetry(f);
  await tick();
  clickOnce(f.cards["vid-1"]);
  await tick();
  assert.equal(playCalls.length, 1, "playDirect phai duoc goi 1 lan cho vid-1");
  assert.equal(normalBeats().length, 0, "video con paused thi chua co beat thuong");
  assert.equal(finalBeats().length, 0);
  f.byId["player"].paused = false;
  f.byId["player"].dispatch("playing");
  assert.equal(normalBeats().length, 1, "playing phai gui beat thuong dau tien");
  assert.equal(normalBeats()[0].body.type, "vod");
  assert.equal(normalBeats()[0].body.contentId, "vid-1");
  assert.equal(finalBeats().length, 0, "dang phat thi chua co beat cuoi");
  f.byId["player"].paused = true;
  f.byId["player"].dispatch("ended");
  assert.equal(finalBeats().length, 1, "ended phai gui 1 beat cuoi");
  const b = finalBeats()[0].body;
  assert.equal(b.type, "vod");
  assert.equal(b.contentId, "vid-1");
  assert.equal(b.final, true);
  assert.equal(typeof b.watchedSeconds, "number");
  assert.ok(b.watchedSeconds >= 0, "watchedSeconds la so giay >= 0");
  assert.equal(b.durationSec, 111, "durationSec lay tu media.duration");
});
