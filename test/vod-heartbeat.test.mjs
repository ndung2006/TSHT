// Tests for the 3c VOD first-heartbeat fix (portal only): startHeartbeat()
// sends the first beat immediately, but beat() in telemetry.js skips it
// while the media is still paused — and at call time the video has not
// started playing yet. So every VOD view under 60s left zero beats and
// the rollup never counted it. The fix (same pattern as the B1d
// timeshift fix in tv.js) waits for the 'playing' event once, or starts
// at once when the video is already playing, guarded by the click seq
// so a stale listener cannot start a beat for a replaced video.
// - tv.js playCategoryVideo + multimedia.js playCatalogVideo: tested
//   functionally via the vm stub-DOM harness (same pattern as
//   replay-immediate.test.mjs); cards are pre-populated real nodes
//   because the stub DOM does not parse innerHTML into nodes.
// - multimedia.js onReplay (timeshift): same harness, driven by a
//   schedule-row click.
// - public/nen-tang-so.html (inline script, no node harness — same as
//   nen-tang-so-cards.test.mjs): pinned at source level; functional
//   verification is the live check (short ~30s -> 1 row in
//   channel_heartbeats).
// Run: node --test test/vod-heartbeat.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const tvSrc = fs.readFileSync(path.join(root, "public/js/tv.js"), "utf8");
const mmSrc = fs.readFileSync(path.join(root, "public/js/multimedia.js"), "utf8");
const ntsHtml = fs.readFileSync(path.join(root, "public/nen-tang-so.html"), "utf8");

// ---- Minimal DOM stub (copied from test/replay-immediate.test.mjs,
// plus removeEventListener + scrollIntoView, needed by the heartbeat
// 'playing' listeners) ----
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
    // Chup nhanh danh sach listener nhu DOM that: listener tu xoa
    // minh trong luc dispatch (vd once 'playing') khong duoc lam
    // mat listener dang sau no trong cung luot dispatch.
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

// Stub DOM khong parse innerHTML thanh node that, va innerHTML moi
// khong xoa node cu — nen listener gan o lan render truoc van con.
// Helper nay dedupe ve 1 listener truoc khi bam, de mo phong hanh vi
// DOM that (node cu da bi thay the).
function clickOnce(el) {
  const l = el.listeners["click"] || [];
  if (l.length > 1) el.listeners["click"] = [l[0]];
  el.dispatch("click");
}

// ================= tv.js: playCategoryVideo =================
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
  const liveSection = el("section", { id: "live-section" });
  doc.appendChild(liveSection);
  const badge = el("span", { class: "live-badge" });
  badge.textContent = "● TRỰC TIẾP";
  doc.appendChild(badge);
  const subnav = el("nav", { class: "tv-subnav" });
  const links = {};
  TV_SECTIONS.forEach((s) => {
    const a = el("a", { href: "#" + s.section });
    a.textContent = s.slug;
    subnav.appendChild(a);
    links[s.section] = a;
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
  // The video that: stub DOM khong parse innerHTML nen the that se
  // khong bao gio la node that — dat san 2 node the that vao box
  // 'thoi-su' de renderCategorySection gan listener bam cho chung.
  const cards = {};
  ["vid-1", "vid-2"].forEach((id, i) => {
    const card = el("button", { class: "tv-cat-card", "data-id": id, "aria-label": "Video " + (i + 1) });
    card.textContent = "Video " + (i + 1);
    sections["chuong-trinh-thoi-su"].box.appendChild(card);
    cards[id] = card;
  });
  return { doc, byId, liveSection, badge, sections, links, emptyEl, cards };
}

function loadTvVod(fixture) {
  const fetchCalls = [];
  const playCalls = [];
  const hbCalls = [];
  const hbStopCalls = [];
  const sandbox = {
    console,
    document: fixture.doc,
    location: { pathname: "/truyen-hinh", href: "/truyen-hinh" },
    innerWidth: 1280,
    fetch: async (url) => {
      fetchCalls.push(url);
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
    AbortController,
    addEventListener: () => {},
    CustomEvent: function (type, opts) { this.type = type; this.detail = (opts && opts.detail) || {}; },
    playDirect: (media, url) => { playCalls.push({ media, url }); return { stop() {} }; },
    LiveEpg: {
      saigonToday: () => "2026-11-06",
      esc: (s) => String(s == null ? "" : s),
      replayKey: (p) => (p.startTime || p.start_time || "") + "|" + (p.title || ""),
      renderSchedule: () => null,
    },
    TshtTelemetry: {
      startHeartbeat: (opts) => { hbCalls.push(opts); },
      stopHeartbeat: () => { hbStopCalls.push(1); },
      setHeartbeatType: () => {},
      sendPageview: () => {},
    },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(tvSrc, sandbox, { filename: "tv.js" });
  return { sandbox, fetchCalls, playCalls, hbCalls, hbStopCalls };
}

test("tv.js VOD: bam video khi video con paused -> chua goi startHeartbeat (beat dau se mat neu goi ngay)", async () => {
  const f = buildTvFixture();
  const { playCalls, hbCalls } = loadTvVod(f);
  await tick();
  clickOnce(f.cards["vid-1"]);
  await tick();
  assert.equal(playCalls.length, 1, "playDirect phai duoc goi 1 lan cho vid-1");
  assert.equal(playCalls[0].url, "https://example.test/play.m3u8");
  assert.equal(hbCalls.length, 0, "video con paused thi chua duoc startHeartbeat");
});

test("tv.js VOD: video bat dau phat (playing) -> startHeartbeat 1 lan, type vod, dung contentId", async () => {
  const f = buildTvFixture();
  const { playCalls, hbCalls } = loadTvVod(f);
  await tick();
  clickOnce(f.cards["vid-1"]);
  await tick();
  assert.equal(playCalls.length, 1);
  assert.equal(hbCalls.length, 0, "truoc playing chua co heartbeat");
  f.byId["player"].paused = false;
  f.byId["player"].dispatch("playing");
  assert.equal(hbCalls.length, 1, "su kien playing phai kich hoat heartbeat");
  assert.equal(hbCalls[0].type, "vod");
  assert.equal(hbCalls[0].contentId, "vid-1");
  assert.equal(hbCalls[0].media, f.byId["player"]);
});

test("tv.js VOD: bam nhanh sang video 2 truoc khi video 1 phat -> listener cu khong bat beat cho video 1", async () => {
  const f = buildTvFixture();
  const { playCalls, hbCalls } = loadTvVod(f);
  await tick();
  clickOnce(f.cards["vid-1"]);
  await tick();
  assert.equal(playCalls.length, 1);
  assert.equal(hbCalls.length, 0);
  clickOnce(f.cards["vid-2"]);
  await tick();
  assert.equal(playCalls.length, 2, "video 2 phai duoc goi playDirect");
  assert.equal(hbCalls.length, 0, "truoc playing van chua co heartbeat");
  f.byId["player"].paused = false;
  f.byId["player"].dispatch("playing");
  assert.equal(hbCalls.length, 1, "chi video 2 duoc bat heartbeat");
  assert.equal(hbCalls[0].type, "vod");
  assert.equal(hbCalls[0].contentId, "vid-2");
});

test("tv.js VOD: video da chay san khi link ve -> startHeartbeat ngay, khong doi playing", async () => {
  const f = buildTvFixture();
  const { hbCalls } = loadTvVod(f);
  await tick();
  f.byId["player"].paused = false;
  clickOnce(f.cards["vid-1"]);
  await tick();
  assert.equal(hbCalls.length, 1, "video da chay thi bat heartbeat ngay");
  assert.equal(hbCalls[0].type, "vod");
  assert.equal(hbCalls[0].contentId, "vid-1");
});

// ================= multimedia.js: playCatalogVideo =================
const MM_REPLAY_0 = {
  title: "Thoi su toi",
  startTime: "2026-11-06T22:23:00.000+07:00",
  endTime: "2026-11-06T23:29:00.000+07:00",
  start_time: "22:23",
  end_time: "23:29",
  replay_url: "/api/v1/timeshift?channel=TUYENQUANG&start=2026-11-06T22%3A23%3A00.000%2B07%3A00&end=2026-11-06T23%3A29%3A00.000%2B07%3A00",
  thumbnail: "",
};
const MM_REPLAY_1 = {
  title: "Du bao thoi tiet",
  startTime: "2026-11-06T23:29:00.000+07:00",
  endTime: "2026-11-06T23:59:00.000+07:00",
  start_time: "23:29",
  end_time: "23:59",
  replay_url: "/api/v1/timeshift?channel=TUYENQUANG&start=2026-11-06T23%3A29%3A00.000%2B07%3A00&end=2026-11-06T23%3A59%3A00.000%2B07%3A00",
  thumbnail: "",
};
const MM_LIVE = {
  title: "Chuong trinh dang phat",
  startTime: "2026-11-06T08:00:00.000+07:00",
  endTime: "2026-11-06T10:00:00.000+07:00",
  start_time: "08:00",
  end_time: "10:00",
  thumbnail: "",
};

function buildMmFixture() {
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
  const rootEl = el("div", { id: "multimedia" });
  doc.appendChild(rootEl);
  ["mm-channels-tv", "mm-channels-radio", "mm-apps", "mm-video", "mm-audio", "mm-radio-art", "mm-radio-name", "mm-badge-text", "mm-live-btn", "mm-msg", "mm-sched-date", "mm-sched-list", "mm-videos", "lc-mount"].forEach((id) => rootEl.appendChild(el("div", { id })));
  byId["mm-video"].paused = true;
  byId["mm-audio"].paused = true;
  // The video that (nhu tv.js): stub DOM khong parse innerHTML nen
  // dat san 2 node the that vao #mm-videos de loadVideos gan listener.
  const cards = {};
  ["vid-1", "vid-2"].forEach((id, i) => {
    const card = el("button", { class: "mm-video-card", "data-id": id, "aria-label": "Video " + (i + 1) });
    card.textContent = "Video " + (i + 1);
    byId["mm-videos"].appendChild(card);
    cards[id] = card;
  });
  // Hang lich that cho onReplay: button .mm-row[data-i].
  const rows = {};
  [0, 1].forEach((i) => {
    const row = el("button", { class: "mm-row", "data-i": String(i) });
    row.textContent = "Row " + i;
    byId["mm-sched-list"].appendChild(row);
    rows[i] = row;
  });
  return { doc, byId, rootEl, cards, rows };
}

function loadMm(fixture) {
  const fetchCalls = [];
  const playCalls = [];
  const tsCalls = [];
  const hbCalls = [];
  const sandbox = {
    console,
    document: fixture.doc,
    location: { pathname: "/", href: "/" },
    innerWidth: 1280,
    fetch: async (url) => {
      fetchCalls.push(url);
      const u = new URL(url, "https://example.test");
      if (u.pathname === "/api/v1/channels") return { ok: true, status: 200, json: async () => ({ items: [{ name: "TUYENQUANG", kind: "tv", status: "RUNNING" }, { name: "TUYENQUANGRadio", kind: "radio", status: "RUNNING" }] }) };
      if (u.pathname === "/api/v1/schedule") return { ok: true, status: 200, json: async () => ({ items: [MM_REPLAY_0, MM_REPLAY_1, MM_LIVE], date: "2026-11-06", timeshift_available: true }) };
      if (u.pathname === "/api/v2/catalog-videos") return { ok: true, status: 200, json: async () => ({ items: [{ publicId: "vid-1", title: "Video 1", thumbnail: "" }, { publicId: "vid-2", title: "Video 2", thumbnail: "" }] }) };
      if (u.pathname.startsWith("/api/v2/vod/video/")) return { ok: true, status: 200, json: async () => ({ url: "https://example.test/play.m3u8" }) };
      if (u.pathname === "/api/v1/timeshift") return { ok: true, status: 200 };
      return { ok: true, status: 200, json: async () => ({}) };
    },
    setTimeout,
    clearTimeout,
    AbortController,
    addEventListener: () => {},
    CustomEvent: function (type, opts) { this.type = type; this.detail = (opts && opts.detail) || {}; },
    playVtcanyLive: (media, name) => { playCalls.push({ kind: "live", media, name }); return { stop() {} }; },
    playRotating: (media, name) => { playCalls.push({ kind: "live-rot", media, name }); return { stop() {} }; },
    playDirect: (media, url) => { playCalls.push({ kind: "vod", media, url }); return { stop() {} }; },
    playTimeshift: (media, url) => { tsCalls.push({ media, url }); return { stop() {} }; },
    LiveEpg: {
      saigonToday: () => "2026-11-06",
      esc: (s) => String(s == null ? "" : s),
      computeStatus: (p) => (p && p.replay_url ? "REPLAY" : "LIVE"),
      replayKey: (p) => (p.startTime || p.start_time || "") + "|" + (p.title || ""),
      renderSchedule: () => null,
    },
    TshtTelemetry: {
      startHeartbeat: (opts) => { hbCalls.push(opts); },
      stopHeartbeat: () => {},
      setHeartbeatType: () => {},
      sendPageview: () => {},
    },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(mmSrc, sandbox, { filename: "multimedia.js" });
  const vodBeats = () => hbCalls.filter((c) => c.type === "vod");
  const tsBeats = () => hbCalls.filter((c) => c.type === "timeshift");
  return { sandbox, fetchCalls, playCalls, tsCalls, hbCalls, vodBeats, tsBeats };
}

test("multimedia.js VOD: bam video khi video con paused -> chua goi startHeartbeat", async () => {
  const f = buildMmFixture();
  const { playCalls, vodBeats } = loadMm(f);
  await tick();
  clickOnce(f.cards["vid-1"]);
  await tick();
  assert.equal(playCalls.filter((c) => c.kind === "vod").length, 1, "playDirect phai duoc goi 1 lan cho vid-1");
  assert.equal(vodBeats().length, 0, "video con paused thi chua duoc startHeartbeat");
});

test("multimedia.js VOD: video bat dau phat (playing) -> startHeartbeat 1 lan, type vod, dung contentId", async () => {
  const f = buildMmFixture();
  const { vodBeats } = loadMm(f);
  await tick();
  clickOnce(f.cards["vid-1"]);
  await tick();
  assert.equal(vodBeats().length, 0, "truoc playing chua co heartbeat VOD");
  f.byId["mm-video"].paused = false;
  f.byId["mm-video"].dispatch("playing");
  assert.equal(vodBeats().length, 1, "su kien playing phai kich hoat heartbeat");
  assert.equal(vodBeats()[0].type, "vod");
  assert.equal(vodBeats()[0].contentId, "vid-1");
  assert.equal(vodBeats()[0].media, f.byId["mm-video"]);
});

test("multimedia.js VOD: bam nhanh sang video 2 truoc khi video 1 phat -> listener cu khong bat beat cho video 1", async () => {
  const f = buildMmFixture();
  const { vodBeats } = loadMm(f);
  await tick();
  clickOnce(f.cards["vid-1"]);
  await tick();
  assert.equal(vodBeats().length, 0);
  clickOnce(f.cards["vid-2"]);
  await tick();
  assert.equal(vodBeats().length, 0, "truoc playing van chua co heartbeat VOD");
  f.byId["mm-video"].paused = false;
  f.byId["mm-video"].dispatch("playing");
  assert.equal(vodBeats().length, 1, "chi video 2 duoc bat heartbeat");
  assert.equal(vodBeats()[0].type, "vod");
  assert.equal(vodBeats()[0].contentId, "vid-2");
});

test("multimedia.js VOD: video da chay san khi link ve -> startHeartbeat ngay, khong doi playing", async () => {
  const f = buildMmFixture();
  const { vodBeats } = loadMm(f);
  await tick();
  f.byId["mm-video"].paused = false;
  clickOnce(f.cards["vid-1"]);
  await tick();
  assert.equal(vodBeats().length, 1, "video da chay thi bat heartbeat ngay");
  assert.equal(vodBeats()[0].type, "vod");
  assert.equal(vodBeats()[0].contentId, "vid-1");
});

test("multimedia.js timeshift: bam xem lai khi media con paused -> chua goi startHeartbeat", async () => {
  const f = buildMmFixture();
  const { tsCalls, tsBeats } = loadMm(f);
  await tick();
  clickOnce(f.rows[0]);
  await tick();
  assert.equal(tsCalls.length, 1, "playTimeshift phai duoc goi 1 lan");
  assert.equal(tsCalls[0].url, MM_REPLAY_0.replay_url);
  assert.equal(tsBeats().length, 0, "media con paused thi chua duoc startHeartbeat");
});

test("multimedia.js timeshift: media bat dau phat (playing) -> startHeartbeat 1 lan, type timeshift", async () => {
  const f = buildMmFixture();
  const { tsBeats } = loadMm(f);
  await tick();
  clickOnce(f.rows[0]);
  await tick();
  assert.equal(tsBeats().length, 0, "truoc playing chua co heartbeat timeshift");
  f.byId["mm-video"].paused = false;
  f.byId["mm-video"].dispatch("playing");
  assert.equal(tsBeats().length, 1, "su kien playing phai kich hoat heartbeat");
  assert.equal(tsBeats()[0].type, "timeshift");
  assert.equal(tsBeats()[0].media, f.byId["mm-video"]);
});

test("multimedia.js timeshift: bam xem lai thu 2 truoc khi ban 1 phat -> listener cu khong bat beat", async () => {
  const f = buildMmFixture();
  const { tsCalls, tsBeats } = loadMm(f);
  await tick();
  clickOnce(f.rows[0]);
  await tick();
  assert.equal(tsCalls.length, 1);
  assert.equal(tsBeats().length, 0);
  clickOnce(f.rows[1]);
  await tick();
  assert.equal(tsCalls.length, 2, "ban 2 phai duoc goi playTimeshift");
  assert.equal(tsBeats().length, 0, "truoc playing van chua co heartbeat timeshift");
  f.byId["mm-video"].paused = false;
  f.byId["mm-video"].dispatch("playing");
  assert.equal(tsBeats().length, 1, "chi 1 heartbeat timeshift duoc bat");
  assert.equal(tsBeats()[0].type, "timeshift");
});

// ================= public/nen-tang-so.html (source-level) =================
// Inline script cua trang nay khong co harness vm nhu tv.js /
// multimedia.js (xem nen-tang-so-cards.test.mjs): ghim o muc source,
// kiem chuc nang bang kiem live (short ~30s -> 1 row channel_heartbeats).
test("nen-tang-so: openPlayer khong goi startHeartbeat ngay nua", () => {
  const start = ntsHtml.indexOf("function openPlayer(");
  assert.ok(start > 0, "thieu ham openPlayer");
  const end = ntsHtml.indexOf("player.addEventListener('click'", start);
  assert.ok(end > start, "khong tim duoc cuoi ham openPlayer");
  const body = ntsHtml.slice(start, end);
  const helperAt = body.indexOf("var startVodHeartbeat");
  assert.ok(helperAt > 0, "thieu helper startVodHeartbeat trong openPlayer");
  // Truoc dinh nghia helper khong duoc co lenh goi that (chi kiem
  // TshtTelemetry.startHeartbeat(, chu khong phai tu 'startHeartbeat'
  // trong comment giai thich).
  assert.doesNotMatch(body.slice(0, helperAt), /TshtTelemetry\.startHeartbeat\(/, "openPlayer khong duoc goi startHeartbeat truoc khi dinh nghia helper");
  assert.doesNotMatch(ntsHtml, /gui ngay 1 nhip/, "comment cu 'gui ngay 1 nhip' phai bi xoa");
  assert.match(body, /startHeartbeat\(\{ channel: '', type: 'vod', contentId: shortId, media: video \}\)/, "helper phai goi startHeartbeat type vod voi shortId");
});

test("nen-tang-so: heartbeat VOD chi bat dau sau su kien playing, stopPlayer go listener", () => {
  assert.match(ntsHtml, /var vodPlayingHandler = null;/, "thieu bien luu handler playing");
  assert.match(ntsHtml, /video\.addEventListener\('playing', vodPlayingHandler\)/, "phai dang ky listener playing 1 lan");
  assert.match(ntsHtml, /video\.removeEventListener\('playing', vodPlayingHandler\)/, "stopPlayer phai go listener playing");
  const arms = ntsHtml.match(/armVodHeartbeat\(\);/g) || [];
  assert.equal(arms.length, 2, "armVodHeartbeat phai duoc goi o ca nhanh HLS va nhanh native, hien " + arms.length);
});
