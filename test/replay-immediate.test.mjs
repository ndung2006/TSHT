// Tests for the B1 replay feedback + prefetch (portal only): clicking
// "PHÁT LẠI" in "Chương trình mới nhất" took ~10s to first motion and
// gave no feedback where the user clicked (no scroll to the player, no
// loading state), so users thought it did not play. The playlist was
// also fetched twice per click (pre-check fetch, then hls.js loadSource).
// - tv.js onReplay: tested functionally via the vm stub-DOM harness
//   (same pattern as tv-category-empty.test.mjs): immediate feedback
//   (scroll to player + "Đang tải bản xem lại…" + button loading state)
//   must appear BEFORE the pre-check fetch resolves; on error the UI
//   restores and live keeps playing; the timeshift heartbeat must only
//   start after the video is actually playing.
// - tv.js schedule hover-prefetch + tv-extra.js card hover-prefetch:
//   schedule buttons are tested functionally (delegation on schedBox);
//   tv-extra.js has no node-level harness (cards render via innerHTML
//   string), so its wiring is pinned at source level like the B2
//   source tests in thumb-fallback.test.mjs.
// Run: node --test test/replay-immediate.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const tvSrc = fs.readFileSync(path.join(root, "public/js/tv.js"), "utf8");
const tvExtraSrc = fs.readFileSync(path.join(root, "public/js/tv-extra.js"), "utf8");

// ---- Minimal DOM stub (copied from test/tv-category-empty.test.mjs,
// plus removeEventListener + scrollIntoView, needed by onReplay) ----
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

const PROGRAM = {
  title: "Thoi su toi",
  start_time: "22:23",
  end_time: "23:29",
  startTime: "2026-11-06T22:23:00.000+07:00",
  endTime: "2026-11-06T23:29:00.000+07:00",
  replay_url: "/api/v1/timeshift?channel=TUYENQUANG&start=2026-11-06T22%3A23%3A00.000%2B07%3A00&end=2026-11-06T23%3A29%3A00.000%2B07%3A00",
  thumbnail: "https://example.test/poster-1280.jpg",
  status: "REPLAY",
};
const REPLAY_KEY = PROGRAM.startTime + "|" + PROGRAM.title;
const PROGRAM2 = {
  title: "Du bao thoi tiet",
  start_time: "23:29",
  end_time: "23:59",
  startTime: "2026-11-06T23:29:00.000+07:00",
  endTime: "2026-11-06T23:59:00.000+07:00",
  replay_url: "/api/v1/timeshift?channel=TUYENQUANG&start=2026-11-06T23%3A29%3A00.000%2B07%3A00&end=2026-11-06T23%3A59%3A00.000%2B07%3A00",
  thumbnail: "https://example.test/poster-weather.jpg",
  status: "REPLAY",
};
const REPLAY_KEY2 = PROGRAM2.startTime + "|" + PROGRAM2.title;

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
  ["player-msg", "now-playing", "sched-date", "schedule", "replay-bar", "replay-title", "back-live", "player"].forEach((id) => doc.appendChild(el("div", { id })));
  // Trang that: replay-bar an san (style display:none), player paused.
  byId["replay-bar"].style.display = "none";
  byId["player"].paused = true;
  const liveSection = el("section", { id: "live-section" });
  doc.appendChild(liveSection);
  const badge = el("span", { class: "live-badge" });
  badge.textContent = "● TRỰC TIẾP";
  doc.appendChild(badge);
  return { doc, byId, liveSection, badge };
}

function loadTv(fixture) {
  const fetchCalls = [];
  const fetchInits = [];
  let timeshiftResponder = null;
  const dispatched = [];
  const sandbox = {
    console,
    document: fixture.doc,
    location: { pathname: "/truyen-hinh", href: "/truyen-hinh" },
    innerWidth: 1280,
    fetch: async (url, init) => {
      fetchCalls.push(url);
      fetchInits.push({ url, init: init || {} });
      const u = new URL(url, "https://example.test");
      if (u.pathname === "/api/v1/channels") return { ok: true, status: 200, json: async () => ({ items: [{ name: "TUYENQUANG", kind: "tv", status: "RUNNING", description: "Kenh TUYENQUANG" }] }) };
      if (u.pathname === "/api/v2/catalog-categories") return { ok: true, status: 200, json: async () => ({ items: [] }) };
      if (u.pathname === "/api/v1/schedule") {
        return { ok: true, status: 200, json: async () => ({ items: [PROGRAM], date: "2026-11-06", timeshift_available: true, timeshift_unknown: false }) };
      }
      if (u.pathname === "/api/v1/timeshift") {
        if (timeshiftResponder) return timeshiftResponder();
        return { ok: true, status: 200, text: async () => "#EXTM3U\n" };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    },
    setTimeout,
    clearTimeout,
    // Trinh duyet that luon co AbortController; dua vao sandbox de
    // onReplay tao duoc controller that + truyen signal vao fetch
    // (khong co no, tv.js roi ve khong-co-signal nhu tren trinh duyet
    // cu, va test B1d khong thay duoc abort).
    AbortController,
    addEventListener: () => {},
    dispatchEvent: (ev) => { dispatched.push(ev.type); return true; },
    CustomEvent: function (type, opts) { this.type = type; this.detail = (opts && opts.detail) || {}; },
    // startLive() o khoi dong goi playDirect (channelSource rong);
    // stub de init chay het toi loadSchedule() -> lastItems co du lieu.
    playDirect: () => ({ stop() {} }),
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
  vm.runInContext(tvSrc, sandbox, { filename: "tv.js" });
  return {
    sandbox,
    fetchCalls,
    fetchInits,
    dispatched,
    setTimeshiftResponder: (fn) => { timeshiftResponder = fn; },
  };
}
const tick = async (n = 12) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };

function replayButton(fixture) {
  const btn = new El("button", { "data-replay": REPLAY_KEY });
  btn.textContent = "PHÁT LẠI";
  fixture.doc.appendChild(btn);
  return btn;
}

test("bam PHAT LAI -> phan hoi ngay truoc khi fetch kiem tra xong (cuon player + 'Dang tai ban xem lai…' + nut dang tai)", async () => {
  const f = buildFixture();
  const { sandbox, fetchCalls, setTimeshiftResponder } = loadTv(f);
  await tick();
  const btn = replayButton(f);
  const playCalls = [];
  sandbox.playTimeshift = (media, url) => { playCalls.push({ media, url }); return { stop() {} }; };
  let resolveTs;
  const tsPromise = new Promise((r) => { resolveTs = r; });
  setTimeshiftResponder(() => tsPromise);
  sandbox.playScheduleReplay(PROGRAM);
  // Dong bo, ngay sau khi goi — fetch kiem tra chua xong.
  assert.equal(f.liveSection._scrolledIntoView >= 1, true, "phai cuon trinh phat vao tam nhin ngay khi bam");
  assert.equal(f.byId["replay-bar"].style.display, "block");
  assert.equal(f.byId["replay-title"].textContent, "Đang tải bản xem lại…");
  assert.equal(btn.disabled, true);
  assert.equal(btn.textContent, "Đang tải…");
  assert.ok(fetchCalls.some((u) => u === PROGRAM.replay_url), "phai fetch kiem tra replay_url");
  resolveTs({ ok: true, status: 200 });
  await tick();
  assert.equal(f.badge.textContent, "XEM LẠI");
  assert.equal(f.byId["replay-title"].textContent, PROGRAM.title);
  assert.equal(playCalls.length, 1, "playTimeshift phai duoc goi 1 lan voi dung replay_url");
  assert.equal(playCalls[0].url, PROGRAM.replay_url);
});

test("phat lai thanh cong -> heartbeat timeshift CHI bat dau sau khi video thuc su phat (su kien playing)", async () => {
  const f = buildFixture();
  const { sandbox, setTimeshiftResponder } = loadTv(f);
  await tick();
  replayButton(f);
  const playCalls = [];
  sandbox.playTimeshift = (media, url) => {
    playCalls.push({ media, url });
    return { stop() {} };
  };
  const hbCalls = [];
  sandbox.TshtTelemetry = {
    startHeartbeat: (opts) => { hbCalls.push(opts); },
    stopHeartbeat: () => {},
    setHeartbeatType: () => {},
  };
  let resolveTs;
  setTimeshiftResponder(() => new Promise((r) => { resolveTs = r; }));
  sandbox.playScheduleReplay(PROGRAM);
  resolveTs({ ok: true, status: 200 });
  await tick();
  assert.equal(playCalls.length, 1, "playTimeshift phai duoc goi 1 lan");
  assert.equal(playCalls[0].url, PROGRAM.replay_url);
  assert.equal(hbCalls.length, 0, "video con paused thi chua duoc startHeartbeat (beat dau se mat)");
  // Video bat dau phat -> heartbeat moi bat dau.
  f.byId["player"].paused = false;
  f.byId["player"].dispatch("playing");
  assert.equal(hbCalls.length, 1, "su kien playing phai kich hoat heartbeat");
  assert.equal(hbCalls[0].type, "timeshift");
  assert.equal(hbCalls[0].media, f.byId["player"]);
});

test("fetch kiem tra loi -> khoi phuc trang thai cu + bao ro, live tiep tuc (khong goi playTimeshift)", async () => {
  const f = buildFixture();
  const { sandbox, setTimeshiftResponder } = loadTv(f);
  await tick();
  const btn = replayButton(f);
  const playCalls = [];
  sandbox.playTimeshift = () => { playCalls.push(1); return { stop() {} }; };
  sandbox.TshtTelemetry = { startHeartbeat: () => {}, stopHeartbeat: () => {}, setHeartbeatType: () => {} };
  let resolveTs;
  setTimeshiftResponder(() => new Promise((r) => { resolveTs = r; }));
  sandbox.playScheduleReplay(PROGRAM);
  resolveTs({ ok: false, status: 404, json: async () => ({ error: "khong co ban ghi" }) });
  await tick();
  assert.equal(f.byId["replay-bar"].style.display, "none", "replay-bar phai tro ve an nhu truoc khi bam");
  assert.equal(f.byId["replay-title"].textContent, "", "tieu de phai tro ve rong nhu truoc khi bam");
  assert.equal(btn.disabled, false);
  assert.equal(btn.textContent, "PHÁT LẠI");
  assert.ok(f.byId["player-msg"].textContent.includes("Không xem lại được"), "phai bao ro ly do, live tiep tuc phat");
  assert.equal(playCalls.length, 0, "loi thi khong duoc goi playTimeshift");
});

test("hover/focus nut phat lai tren lich -> prefetch replay_url (fire-and-forget, khong doi fetch)", async () => {
  const f = buildFixture();
  const { sandbox, fetchCalls } = loadTv(f);
  await tick();
  // Nut phat lai nam trong khung lich (schedBox); stub DOM khong bubble
  // su kien len cha nen goi truc tiep listener da gan tren schedBox.
  const schedBox = f.byId["schedule"];
  const btn = new El("button", { "data-replay": REPLAY_KEY });
  btn.textContent = "PHÁT LẠI";
  schedBox.appendChild(btn);
  const mouseover = (schedBox.listeners["mouseover"] || [])[0];
  const focusin = (schedBox.listeners["focusin"] || [])[0];
  assert.ok(mouseover, "tv.js phai gan mouseover tren schedBox de prefetch");
  assert.ok(focusin, "tv.js phai gan focusin tren schedBox de prefetch");
  mouseover({ target: btn });
  mouseover({ target: btn });
  focusin({ target: btn });
  await tick();
  const prefetches = fetchCalls.filter((u) => u === PROGRAM.replay_url);
  assert.equal(prefetches.length, 1, "hover/focus lap lai chi fetch prefetch 1 lan trong 45s, hien " + prefetches.length);
});

test("tv-extra: hover/focus nut PHAT LAI tren the 'Moi nhat' -> prefetch qua helper chung cua tv.js", () => {
  assert.ok(tvExtraSrc.includes('addEventListener("mouseenter"'), "tv-extra.js phai gan mouseenter cho nut PHAT LAI");
  assert.ok(tvExtraSrc.includes('addEventListener("focus"'), "tv-extra.js phai gan focus cho nut PHAT LAI");
  assert.ok(tvExtraSrc.includes("window.__tshtPrefetchReplayUrl"), "tv-extra.js phai dung helper prefetch chung cua tv.js");
  assert.ok(tvSrc.includes("window.__tshtPrefetchReplayUrl = "), "tv.js phai expose helper prefetch cho tv-extra.js");
});

test("B1c: bam PHAT LAI -> poster = thumbnail chuong trinh NGAY khi bam (truoc ca fetch kiem tra)", async () => {
  const f = buildFixture();
  const { sandbox, setTimeshiftResponder } = loadTv(f);
  await tick();
  replayButton(f);
  sandbox.playTimeshift = () => ({ stop() {} });
  sandbox.TshtTelemetry = { startHeartbeat: () => {}, stopHeartbeat: () => {}, setHeartbeatType: () => {} };
  let resolveTs;
  setTimeshiftResponder(() => new Promise((r) => { resolveTs = r; }));
  sandbox.playScheduleReplay(PROGRAM);
  // Dong bo, ngay sau khi goi — fetch kiem tra chua xong.
  assert.equal(f.byId["player"].getAttribute("poster"), PROGRAM.thumbnail, "poster phai la thumbnail chuong trinh ngay khi bam, de lam nen suot luc tai");
  resolveTs({ ok: true, status: 200 });
  await tick();
  assert.equal(f.byId["player"].getAttribute("poster"), PROGRAM.thumbnail, "sau khi fetch xong poster van la thumbnail");
});

test("B1d: bam xem lai thu 2 khi fetch kiem tra thu 1 chua xong -> abort fetch 1, ket qua muon cua fetch 1 bi bo qua", async () => {
  const f = buildFixture();
  const { sandbox, fetchInits, setTimeshiftResponder } = loadTv(f);
  await tick();
  replayButton(f);
  const playCalls = [];
  sandbox.playTimeshift = (media, url) => { playCalls.push(url); return { stop() {} }; };
  sandbox.TshtTelemetry = { startHeartbeat: () => {}, stopHeartbeat: () => {}, setHeartbeatType: () => {} };
  const deferreds = [];
  setTimeshiftResponder(() => new Promise((r) => { deferreds.push(r); }));
  sandbox.playScheduleReplay(PROGRAM);
  sandbox.playScheduleReplay(PROGRAM2);
  const sig1 = (((fetchInits.find((x) => x.url === PROGRAM.replay_url) || {}).init) || {}).signal;
  assert.ok(sig1, "fetch kiem tra 1 phai truyen signal");
  assert.equal(sig1.aborted, true, "fetch kiem tra 1 phai bi abort khi bam chuong trinh 2");
  // Giai quyet MUON fetch 1 (da bi abort): ket qua phai bi bo qua.
  deferreds[0]({ ok: true, status: 200 });
  await tick();
  assert.equal(playCalls.length, 0, "ket qua muon cua fetch 1 khong duoc goi playTimeshift");
  deferreds[1]({ ok: true, status: 200 });
  await tick();
  assert.equal(playCalls.length, 1, "chi chuong trinh 2 duoc phat");
  assert.equal(playCalls[0], PROGRAM2.replay_url);
});

test("B1d: bam xem lai thu 2 khi ban thu 1 dang tai (chua len hinh) -> huy handle 1 ngay", async () => {
  const f = buildFixture();
  const { sandbox, setTimeshiftResponder } = loadTv(f);
  await tick();
  replayButton(f);
  const handles = [];
  sandbox.playTimeshift = (media, url) => {
    const h = { url, stopped: false, stop() { h.stopped = true; } };
    handles.push(h);
    return h;
  };
  sandbox.TshtTelemetry = { startHeartbeat: () => {}, stopHeartbeat: () => {}, setHeartbeatType: () => {} };
  const deferreds = [];
  setTimeshiftResponder(() => new Promise((r) => { deferreds.push(r); }));
  sandbox.playScheduleReplay(PROGRAM);
  deferreds[0]({ ok: true, status: 200 });
  await tick();
  assert.equal(handles.length, 1, "ban 1 phai bat dau phat (handle tao)");
  assert.equal(handles[0].stopped, false);
  // Chua co su kien playing (video van paused) -> ban 1 dang tai.
  sandbox.playScheduleReplay(PROGRAM2);
  assert.equal(handles[0].stopped, true, "bam chuong trinh 2 phai huy handle 1 dang tai ngay, khong doi fetch 2");
  deferreds[1]({ ok: true, status: 200 });
  await tick();
  assert.equal(handles.length, 2, "ban 2 phai tao handle moi");
  assert.equal(handles[1].stopped, false);
});

test("B1d: bam xem lai thu 2 khi ban thu 1 DA phat -> khong huy handle 1 cho toi khi fetch kiem tra 2 xong", async () => {
  const f = buildFixture();
  const { sandbox, setTimeshiftResponder } = loadTv(f);
  await tick();
  replayButton(f);
  const handles = [];
  sandbox.playTimeshift = (media, url) => {
    const h = { url, stopped: false, stop() { h.stopped = true; } };
    handles.push(h);
    return h;
  };
  sandbox.TshtTelemetry = { startHeartbeat: () => {}, stopHeartbeat: () => {}, setHeartbeatType: () => {} };
  const deferreds = [];
  setTimeshiftResponder(() => new Promise((r) => { deferreds.push(r); }));
  sandbox.playScheduleReplay(PROGRAM);
  deferreds[0]({ ok: true, status: 200 });
  await tick();
  assert.equal(handles.length, 1);
  // Ban 1 len hinh: mo phong su kien playing.
  f.byId["player"].paused = false;
  f.byId["player"].dispatch("playing");
  sandbox.playScheduleReplay(PROGRAM2);
  assert.equal(handles[0].stopped, false, "ban 1 dang phat thi chua duoc huy khi bam chuong trinh 2");
  deferreds[1]({ ok: true, status: 200 });
  await tick();
  assert.equal(handles[0].stopped, true, "fetch kiem tra 2 xong thi handle 1 moi duoc huy");
  assert.equal(handles.length, 2, "ban 2 phai tao handle moi");
});

test("B1d: fetch kiem tra 2 loi khi ban 1 dang tai da bi huy -> ve live (khong de player chet)", async () => {
  const f = buildFixture();
  const { sandbox, setTimeshiftResponder } = loadTv(f);
  await tick();
  replayButton(f);
  const handles = [];
  sandbox.playTimeshift = (media, url) => {
    const h = { url, stopped: false, stop() { h.stopped = true; } };
    handles.push(h);
    return h;
  };
  const playDirectCalls = [];
  sandbox.playDirect = (...args) => { playDirectCalls.push(args); return { stop() {} }; };
  sandbox.TshtTelemetry = { startHeartbeat: () => {}, stopHeartbeat: () => {}, setHeartbeatType: () => {} };
  const deferreds = [];
  setTimeshiftResponder(() => new Promise((r) => { deferreds.push(r); }));
  sandbox.playScheduleReplay(PROGRAM);
  deferreds[0]({ ok: true, status: 200 });
  await tick();
  assert.equal(handles.length, 1);
  sandbox.playScheduleReplay(PROGRAM2);
  assert.equal(handles[0].stopped, true, "ban 1 dang tai phai bi huy khi bam chuong trinh 2");
  deferreds[1]({ ok: false, status: 404, json: async () => ({ error: "khong co ban ghi" }) });
  await tick();
  assert.ok(f.byId["player-msg"].textContent.includes("Không xem lại được"), "phai bao ro ly do");
  assert.equal(f.badge.textContent, "● TRỰC TIẾP", "phai ve live (nhan live)");
  assert.equal(f.byId["replay-bar"].style.display, "none", "ve live thi an replay-bar");
  assert.ok(playDirectCalls.length >= 1, "phai goi lai playDirect de phat live");
});
