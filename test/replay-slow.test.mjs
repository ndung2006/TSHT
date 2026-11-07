// Tests cho B1a "xem lai cham" + B1c chu tai xem lai (portal only,
// LiveControls — thanh dieu khien phu trong khung video).
//
// - B1a: watchdog o che do xem lai phai doi 25s (khong phai 15s) roi moi
//   hien "Bản xem lại đang tải chậm" + nut Thu lai (da noi san qua
//   setRetry); live/VOD giu 15s + chu loi mac dinh "Không phát được
//   kênh này"; onStart() tra chu loi ve mac dinh de chu cham khong ro
//   sang luot phat sau. 25s dem tu onStart (luc bat dau tai nguon xem
//   lai, ~1s sau khi bam PHAT LAI).
// - B1c: luc tai, che do xem lai hien "Đang tải bản xem lại, có thể
//   mất khoảng 10–15 giây…" o ca overlay tren khung video lan thanh
//   tai trong bar (kem vong xoay, class is-replay tren overlay); live
//   giu "Đang tải…". 'playing' tat trang thai tai nhu cu.
// - Harness stub-DOM cho LiveControls.create (cung mau nhu
//   replay-immediate.test.mjs): setTimeout/clearTimeout chay bang dong
//   ho tay de khong phai cho 25s that.
// Run: node --test test/replay-slow.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const lcSrc = fs.readFileSync(path.join(root, "public/js/live-controls.js"), "utf8");

const SLOW_TEXT = "Bản xem lại đang tải chậm";
const ERROR_DEFAULT = "Không phát được kênh này";
const REPLAY_LOADING_TEXT = "Đang tải bản xem lại, có thể mất khoảng 10–15 giây…";
const LOADING_DEFAULT = "Đang tải…";

// ---- Minimal DOM stub (cung mau El o test/replay-immediate.test.mjs,
// them removeChild/lastChild/contains/createTextNode ma LiveControls can) ----
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
    this._classes = new Set();
    this.className = attrs.class || "";
    this.classList = {
      add: (c) => this._classes.add(c),
      remove: (c) => this._classes.delete(c),
      toggle: (c, force) => { const on = force === undefined ? !this._classes.has(c) : !!force; if (on) this._classes.add(c); else this._classes.delete(c); return on; },
      contains: (c) => this._classes.has(c),
    };
  }
  get className() { return [...this._classes].join(" "); }
  set className(v) { this._classes = new Set(String(v || "").split(/\s+/).filter(Boolean)); }
  get lastChild() { return this.children.length ? this.children[this.children.length - 1] : null; }
  getAttribute(name) { return name in this.attrs ? this.attrs[name] : null; }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  removeAttribute(name) { delete this.attrs[name]; }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  removeChild(child) {
    const i = this.children.indexOf(child);
    if (i >= 0) this.children.splice(i, 1);
    child.parentNode = null;
    return child;
  }
  addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
  removeEventListener(type, fn) {
    const l = this.listeners[type] || [];
    const i = l.indexOf(fn);
    if (i >= 0) l.splice(i, 1);
  }
  dispatch(type, event = {}) {
    const ev = { type, ...event, preventDefault() {}, target: this };
    (this.listeners[type] || []).forEach((fn) => fn(ev));
    return ev;
  }
  contains(node) {
    let el = node;
    while (el) { if (el === this) return true; el = el.parentNode; }
    return false;
  }
  getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 100 }; }
  focus() {}
}

class MediaEl extends El {
  constructor() {
    super("video", { id: "player" });
    this.paused = true;
    this.readyState = 0;
    this.currentTime = 0;
    this.duration = NaN;
    this.volume = 1;
    this.muted = true;
    this.seekable = { length: 0 };
    this.buffered = { length: 0 };
  }
  play() { return Promise.resolve(); }
  pause() {}
}

// Dong ho tay cho setTimeout/clearTimeout (watchdog); setInterval chi
// ghi nhan, khong chay tick 500ms trong test.
function makeClock() {
  let now = 0, nextId = 1;
  let timers = [];
  return {
    setTimeout: (fn, ms) => { const id = nextId++; timers.push({ id, due: now + (ms || 0), fn }); return id; },
    clearTimeout: (id) => { timers = timers.filter((t) => t.id !== id); },
    setInterval: () => nextId++,
    clearInterval: () => {},
    advance: (ms) => {
      const target = now + ms;
      for (;;) {
        let next = null;
        for (const t of timers) if (t.due <= target && (!next || t.due < next.due)) next = t;
        if (!next) break;
        now = next.due;
        timers = timers.filter((t) => t !== next);
        next.fn();
      }
      now = target;
    },
  };
}

function findByClass(rootEl, cls) {
  let found = null;
  (function walk(el) {
    if (found || !el) return;
    if ((el.className || "").split(/\s+/).includes(cls)) { found = el; return; }
    (el.children || []).forEach(walk);
  })(rootEl);
  return found;
}

function buildFixture() {
  const clock = makeClock();
  const doc = {
    children: [],
    createElement: (tag) => new El(tag),
    createTextNode: (text) => ({ textContent: text, nodeType: 3, parentNode: null }),
    addEventListener: () => {},
    pictureInPictureEnabled: false,
    fullscreenElement: null,
  };
  doc.appendChild = (e) => { e.parentNode = doc; doc.children.push(e); return e; };
  const wrap = new El("div", { class: "live-player-wrap" });
  const mount = new El("div", { id: "lc-mount" });
  const playerRoot = new El("div", { class: "live-player-col" });
  const media = new MediaEl();
  media.parentNode = wrap;
  wrap.appendChild(media);
  const stored = {};
  const sandbox = {
    console,
    document: doc,
    matchMedia: () => ({ matches: false }),
    localStorage: {
      getItem: (k) => (k in stored ? stored[k] : null),
      setItem: (k, v) => { stored[k] = String(v); },
    },
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    setInterval: clock.setInterval,
    clearInterval: clock.clearInterval,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(lcSrc, sandbox, { filename: "live-controls.js" });
  const ctrl = sandbox.LiveControls.create({
    media,
    isVideo: true,
    mount,
    frame: wrap,
    playerRoot,
    fullscreenTarget: playerRoot,
    getLiveEdge: () => null,
    onBackToLive: () => {},
    getProgramAt: () => null,
    onViewState: () => {},
  });
  return {
    clock, doc, media, mount, frame: wrap, ctrl,
    errorEl: () => findByClass(wrap, "lc-error"),
    errorText: () => findByClass(wrap, "lc-error").children[0],
    retryBtn: () => findByClass(wrap, "lc-retry"),
    loadingEl: () => findByClass(wrap, "lc-loading"),
    overlay: () => findByClass(wrap, "lc-overlay-loading"),
    overlayText: () => findByClass(wrap, "lc-overlay-loading").children[0],
  };
}

// Mo phong video dang tai (chua co hinh): da goi play() nhung chua
// buffer du de phat — dung dieu kien watchdog (started && !paused &&
// readyState < 3).
function startLoading(f) {
  f.media.paused = false;
  f.media.readyState = 1;
}

test("xem lai: 15s va 20s chua hien loi, 25s hien 'Bản xem lại đang tải chậm' + nut Thu lai", () => {
  const f = buildFixture();
  f.ctrl.setMode("replay");
  f.ctrl.setRetry(() => {});
  f.ctrl.onStart();
  startLoading(f);
  f.clock.advance(15000);
  assert.equal(f.errorEl().style.display, "none", "15s chua duoc hien loi o che do xem lai");
  f.clock.advance(5000);
  assert.equal(f.errorEl().style.display, "none", "20s van chua duoc hien loi o che do xem lai");
  f.clock.advance(5000);
  assert.equal(f.errorEl().style.display, "flex", "25s phai hien panel loi/cham");
  assert.equal(f.errorText().textContent, SLOW_TEXT);
  assert.equal(f.retryBtn().style.display !== "none", true, "nut Thu lai phai thay duoc cung panel");
});

test("live: 15s hien loi mac dinh 'Không phát được kênh này'", () => {
  const f = buildFixture();
  f.ctrl.setMode("live");
  f.ctrl.onStart();
  startLoading(f);
  f.clock.advance(15000);
  assert.equal(f.errorEl().style.display, "flex", "live phai hien panel loi sau 15s");
  assert.equal(f.errorText().textContent, ERROR_DEFAULT);
});

test("vod: 15s hien loi mac dinh (khong doi theo che do xem lai)", () => {
  const f = buildFixture();
  f.ctrl.setMode("vod");
  f.ctrl.onStart();
  startLoading(f);
  f.clock.advance(15000);
  assert.equal(f.errorEl().style.display, "flex");
  assert.equal(f.errorText().textContent, ERROR_DEFAULT);
});

test("'playing' truoc 25s -> watchdog huy, khong hien chu cham", () => {
  const f = buildFixture();
  f.ctrl.setMode("replay");
  f.ctrl.onStart();
  startLoading(f);
  f.clock.advance(10000);
  f.media.dispatch("playing");
  f.clock.advance(20000);
  assert.equal(f.errorEl().style.display, "none", "da phat thi khong duoc hien chu cham");
});

test("bam nut Thu lai khi dang cham -> goi lai retryFn va an panel", () => {
  const f = buildFixture();
  let calls = 0;
  f.ctrl.setMode("replay");
  f.ctrl.setRetry(() => { calls += 1; });
  f.ctrl.onStart();
  startLoading(f);
  f.clock.advance(25000);
  assert.equal(f.errorEl().style.display, "flex", "25s phai hien panel truoc khi bam Thu lai");
  f.retryBtn().dispatch("click");
  assert.equal(calls, 1, "bam Thu lai phai goi retryFn 1 lan");
  assert.equal(f.errorEl().style.display, "none", "bam Thu lai phai an panel");
});

test("onStart moi -> chu loi tra ve mac dinh, khong ro chu cham sang luot sau", () => {
  const f = buildFixture();
  f.ctrl.setMode("replay");
  f.ctrl.onStart();
  startLoading(f);
  f.clock.advance(25000);
  assert.equal(f.errorText().textContent, SLOW_TEXT, "luot xem lai phai hien chu cham");
  f.ctrl.onStart();
  assert.equal(f.errorText().textContent, ERROR_DEFAULT, "luot moi phai tra chu loi ve mac dinh");
  assert.equal(f.errorEl().style.display, "none");
  // Luot sau la live: 15s phai hien chu loi mac dinh, khong phai chu cham.
  f.ctrl.setMode("live");
  f.ctrl.onStart();
  startLoading(f);
  f.clock.advance(15000);
  assert.equal(f.errorText().textContent, ERROR_DEFAULT);
});

test("B1c xem lai: luc tai hien dong dai o ca overlay lan thanh tai + vong xoay", () => {
  const f = buildFixture();
  f.ctrl.setMode("replay");
  assert.equal(f.loadingEl().textContent, REPLAY_LOADING_TEXT, "setMode replay phai doi chu tai thanh dong dai");
  f.ctrl.onStart();
  assert.equal(f.loadingEl().textContent, REPLAY_LOADING_TEXT);
  assert.equal(f.loadingEl().style.display, "block", "thanh tai phai hien khi bat dau tai");
  assert.equal(f.overlayText().textContent, REPLAY_LOADING_TEXT, "overlay phai hien cung dong dai");
  assert.equal(f.overlay().style.display, "flex", "overlay tai phai hien khi bat dau tai");
  assert.equal(f.overlay().classList.contains("is-replay"), true, "overlay xem lai phai co class is-replay de hien vong xoay");
});

test("B1c live: luc tai van 'Đang tải…' o ca overlay lan thanh tai, khong vong xoay", () => {
  const f = buildFixture();
  f.ctrl.setMode("replay");
  f.ctrl.onStart();
  assert.equal(f.loadingEl().textContent, REPLAY_LOADING_TEXT, "xem lai phai hien dong dai truoc");
  f.ctrl.setMode("live");
  assert.equal(f.loadingEl().textContent, LOADING_DEFAULT, "doi sang live phai tra chu tai ve mac dinh");
  assert.equal(f.overlayText().textContent, LOADING_DEFAULT);
  assert.equal(f.overlay().classList.contains("is-replay"), false, "live khong duoc co class is-replay");
  f.ctrl.onStart();
  assert.equal(f.loadingEl().textContent, LOADING_DEFAULT);
  assert.equal(f.loadingEl().style.display, "block");
});

test("B1c: 'playing' tat trang thai tai (overlay + thanh tai) o che do xem lai", () => {
  const f = buildFixture();
  f.ctrl.setMode("replay");
  f.ctrl.onStart();
  startLoading(f);
  assert.equal(f.overlay().style.display, "flex");
  assert.equal(f.loadingEl().style.display, "block");
  f.media.dispatch("playing");
  assert.equal(f.overlay().style.display, "none", "da phat thi overlay tai phai an");
  assert.equal(f.loadingEl().style.display, "none", "da phat thi thanh tai phai an");
});
