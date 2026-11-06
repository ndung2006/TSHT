// Tests for the back-to-top button (portal only): the square button in
// the shared footer shows only after scrolling past 1 viewport and
// smooth-scrolls to the top on click. The visibility rule is a pure
// helper (window.TSHTHeader.shouldShowBackToTop) tested directly; the
// scroll/click wiring is tested by evaluating the real header.js with a
// stub DOM (same harness style as reader-auth.test.mjs).
// Run: node --test test/back-to-top.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const headerSrc = fs.readFileSync(path.join(root, "public/js/header.js"), "utf8");

class El {
  constructor(id) {
    this.id = id || "";
    this._classes = new Set();
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
    this.listeners = {};
    this.hidden = false;
    this.src = "";
  }
  addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
  fire(type, event = {}) {
    (this.listeners[type] || []).forEach((fn) => fn({ type, ...event, preventDefault() {} }));
  }
}

function makeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

function loadHeader() {
  const topBtn = new El("to-top");
  const windowListeners = {};
  const scrollToCalls = [];
  const store = makeStorage();
  const sandbox = {
    window: null,
    document: {
      querySelector: () => null,
      querySelectorAll: () => [],
      getElementById: (id) => (id === "to-top" ? topBtn : null),
      addEventListener: () => {},
    },
    sessionStorage: store,
    localStorage: store,
    fetch: () => Promise.resolve({ ok: false }),
    location: { href: "https://tsht.vtctech.xyz/" },
    console,
  };
  sandbox.window = {
    matchMedia: () => ({ matches: false, addListener() {}, addEventListener() {} }),
    addEventListener: (type, fn) => { (windowListeners[type] = windowListeners[type] || []).push(fn); },
    scrollTo: (opts) => scrollToCalls.push(opts),
    scrollY: 0,
    pageYOffset: 0,
    innerHeight: 800,
    localStorage: store,
  };
  sandbox.window.window = sandbox.window;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(headerSrc, ctx, { filename: "header.js" });
  const fireWindow = (type) => (windowListeners[type] || []).forEach((fn) => fn({ type }));
  const setScroll = (y) => {
    sandbox.window.scrollY = y;
    sandbox.window.pageYOffset = y;
  };
  return { topBtn, scrollToCalls, fireWindow, setScroll, TSHTHeader: ctx.TSHTHeader || sandbox.window.TSHTHeader };
}

test("shouldShowBackToTop: chi hien khi cuon QUA 1 man hinh", () => {
  const { TSHTHeader } = loadHeader();
  assert.ok(TSHTHeader, "header.js phai expose window.TSHTHeader");
  const f = TSHTHeader.shouldShowBackToTop;
  assert.equal(f(0, 800), false);
  assert.equal(f(799, 800), false);
  assert.equal(f(800, 800), false);
  assert.equal(f(801, 800), true);
  assert.equal(f(2000, 800), true);
  assert.equal(f(0, 0), false);
});

test("nut Ve dau trang: an luc dau, hien khi cuon qua 1 man hinh, an lai khi cuon len; bam thi cuon muot len dau", () => {
  const { topBtn, scrollToCalls, fireWindow, setScroll } = loadHeader();
  assert.equal(topBtn.classList.contains("is-visible"), false);
  setScroll(900);
  fireWindow("scroll");
  assert.equal(topBtn.classList.contains("is-visible"), true);
  setScroll(100);
  fireWindow("scroll");
  assert.equal(topBtn.classList.contains("is-visible"), false);
  setScroll(1500);
  fireWindow("scroll");
  assert.equal(topBtn.classList.contains("is-visible"), true);
  topBtn.fire("click");
  assert.equal(scrollToCalls.length, 1);
  // Doi tuong tao trong vm sandbox co prototype khac realm chu — spread
  // ve object chu truoc khi deepEqual (cung gotcha nhu live-epg test).
  assert.deepEqual({ ...scrollToCalls[0] }, { top: 0, behavior: "smooth" });
});
