// Tests for the B2 program/video-card image fallback (portal only):
// AIO deletes a program's thumbnail file after ~30 days, so the URL in
// the schedule/catalog can 404 even though it is still served. Every
// place that renders a program/video thumbnail must then swap to the
// branded fallback (gradient + title + time + "Điện Biên Phủ Online")
// instead of a broken image — and show the same fallback immediately
// when there is no thumbnail URL at all. The fallback is always
// rendered hidden next to the <img>; the img's inline onerror hides the
// img and unhides the fallback (same pattern as the channel-logo
// onerror already used in multimedia.js).
// - tv-extra.js ("Chương trình mới nhất"): tested functionally via the
//   vm stub-DOM harness (same pattern as latest-min-duration.test.mjs):
//   the exact onerror attribute from the real rendered HTML is executed
//   against stub elements to prove the swap.
// - multimedia.js (home), tv.js (category cards), nen-tang-so.html
//   (shorts grid): no vm harness exists for those IIFEs (they need the
//   whole page + fetch), so they are pinned at source level, like
//   nen-tang-so-cards.test.mjs does; the swap itself is covered by a
//   real browser after deploy.
// Run: node --test test/thumb-fallback.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const tvExtraSrc = fs.readFileSync(path.join(root, "public/js/tv-extra.js"), "utf8");
const tvSrc = fs.readFileSync(path.join(root, "public/js/tv.js"), "utf8");
const mmSrc = fs.readFileSync(path.join(root, "public/js/multimedia.js"), "utf8");
const svSrc = fs.readFileSync(path.join(root, "public/nen-tang-so.html"), "utf8");
const tvCss = fs.readFileSync(path.join(root, "public/css/tv-page.css"), "utf8");
const homeCss = fs.readFileSync(path.join(root, "public/css/home.css"), "utf8");
const tvHtml = fs.readFileSync(path.join(root, "public/tv.html"), "utf8");
const homeHtml = fs.readFileSync(path.join(root, "public/home.html"), "utf8");

const BRAND = "Điện Biên Phủ Online";
const ONERROR = "this.hidden=true;this.nextElementSibling.hidden=false";

// ---- Minimal browser stub: enough for live-epg.js + tv-extra.js to load
// and for the tv-schedule event to be dispatched by hand (copied from
// latest-min-duration.test.mjs). ----
function loadPortalScripts() {
  const listeners = {};
  const box = {
    innerHTML: "",
    scrollHeight: 0,
    clientHeight: 0,
    scrollTop: 0,
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  const sandbox = {
    console,
    Intl,
    Date,
    setTimeout: () => 0,
    clearTimeout: () => {},
    innerWidth: 1280,
    scrollY: 0,
    location: { hash: "" },
    matchMedia: undefined,
    scrollTo: () => {},
    document: {
      addEventListener: () => {},
      getElementById: (id) => (id === "latest-programs" ? box : null),
      querySelector: () => null,
    },
    addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); },
    dispatchEvent: (ev) => {
      (listeners[ev.type] || []).forEach((fn) => fn(ev));
      return true;
    },
    CustomEvent: function (type, opts) { this.type = type; this.detail = (opts && opts.detail) || {}; },
    Event: function (type) { this.type = type; },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, "public/js/live-epg.js"), "utf8"), sandbox, { filename: "live-epg.js" });
  vm.runInContext(tvExtraSrc, sandbox, { filename: "tv-extra.js" });
  return { box, dispatchSchedule: (detail) => sandbox.dispatchEvent(new sandbox.CustomEvent("tv-schedule", { detail })) };
}

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
function rel(title, startMin, endMin, extra) {
  const now = Date.now();
  const iso = (mins) => new Date(now + mins * 60000).toISOString();
  const hhmm = (mins) => {
    const d = new Date(now + mins * 60000);
    return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  };
  return {
    title,
    start_time: hhmm(startMin),
    startTime: iso(startMin),
    ...(endMin == null ? {} : { end_time: hhmm(endMin), endTime: iso(endMin) }),
    replay_url: "/x/timeshift.m3u8",
    ...(extra || {}),
  };
}
function renderDay(box, dispatchSchedule, items) {
  dispatchSchedule({ items, meta: { date: today }, replayingKey: null, channel: { name: "TUYENQUANG", logo: null } });
  return box.innerHTML;
}

// Extract the onerror handler from a rendered <img> and run it against
// stub elements — proves the exact attribute string from the real render
// swaps img -> fallback.
function runOnerror(html) {
  const m = /<img class='latest-poster-img'[^>]*onerror='([^']*)'/.exec(html);
  assert.ok(m, "the chua co onerror tren img");
  const fallback = { hidden: true };
  const img = { hidden: false, nextElementSibling: fallback };
  new Function(m[1]).call(img);
  return { img, fallback };
}

test("tv-extra: thumbnail chet (URL con nhung file 404) -> img co onerror + fallback an san co nhan dien, chay onerror thi fallback hien", () => {
  const { box, dispatchSchedule } = loadPortalScripts();
  const items = [
    rel("Thoi su toi", -40, -17, { thumbnailSmall: "https://example.invalid/thumb-chet.jpg" }),
    rel("Cung con khon lon", -70, -40),
    rel("Ca nhac", -100, -70),
    rel("Phim truyen", -160, -100),
  ];
  const html = renderDay(box, dispatchSchedule, items);
  // Img co dung URL chet + onerror; fallback nam NGAY SAU img (ke anh
  // em — onerror dung nextElementSibling) va dang an.
  assert.ok(html.includes("src='https://example.invalid/thumb-chet.jpg'"), "img phai giu URL goc");
  assert.ok(html.includes("onerror='" + ONERROR + "'"), "img phai co onerror doi sang fallback");
  assert.match(html, /<img class='latest-poster-img'[^>]*><span class='latest-poster-fallback' hidden>/);
  assert.ok(html.includes(BRAND), "fallback phai co dong thuong hieu");
  const { img, fallback } = runOnerror(html);
  assert.equal(img.hidden, true, "sau onerror: img an");
  assert.equal(fallback.hidden, false, "sau onerror: fallback hien");
});

test("tv-extra: thumbnailSmall rong -> khong co img, fallback hien ngay, co nhan dien", () => {
  const { box, dispatchSchedule } = loadPortalScripts();
  const items = [
    rel("Thoi su toi", -40, -17, { thumbnailSmall: "" }),
    rel("Cung con khon lon", -70, -40),
    rel("Ca nhac", -100, -70),
    rel("Phim truyen", -160, -100),
  ];
  const html = renderDay(box, dispatchSchedule, items);
  assert.ok(!html.includes("latest-poster-img"), "khong co thumbnail thi khong render img");
  assert.ok(html.includes("latest-poster-fallback'>"), "fallback hien ngay (khong co hidden)");
  assert.ok(!html.includes("latest-poster-fallback' hidden"), "fallback cua the khong anh khong duoc an");
  assert.ok(html.includes(BRAND), "fallback phai co dong thuong hieu");
  assert.ok(html.includes("Thoi su toi"), "fallback van co ten chuong trinh");
});

test("tv-extra: co anh -> img hien, fallback an san co nhan dien", () => {
  const { box, dispatchSchedule } = loadPortalScripts();
  const items = [
    rel("Thoi su toi", -40, -17, { thumbnailSmall: "https://cdn.example/thumb.jpg" }),
    rel("Cung con khon lon", -70, -40),
    rel("Ca nhac", -100, -70),
    rel("Phim truyen", -160, -100),
  ];
  const html = renderDay(box, dispatchSchedule, items);
  assert.ok(html.includes("<img class='latest-poster-img' src='https://cdn.example/thumb.jpg'"), "img hien voi dung URL");
  assert.ok(html.includes("<span class='latest-poster-fallback' hidden>"), "fallback an san ben canh img");
  assert.ok(html.includes(BRAND), "fallback an san van co dong thuong hieu");
});

test("tv-extra: fallback khong con la khung trong — co ten + gio + thuong hieu", () => {
  const { box, dispatchSchedule } = loadPortalScripts();
  const items = [rel("Thoi su toi", -40, -17), rel("Cung con khon lon", -70, -40)];
  const html = renderDay(box, dispatchSchedule, items);
  assert.ok(html.includes("latest-fallback-title'>Thoi su toi<"), "fallback co ten");
  assert.ok(html.includes("latest-fallback-time'>"), "fallback co gio");
  assert.ok(html.includes("latest-fallback-brand'>" + BRAND + "<"), "fallback co dong thuong hieu");
});

// ---- Source-level pins for the three places with no vm harness ----

test("multimedia.js: mm-thumb img co onerror doi sang fallback co nhan dien (khong con ▶ don doc)", () => {
  assert.ok(mmSrc.includes('onerror=\\"this.hidden=true;this.nextElementSibling.hidden=false\\"'), "img phai co onerror");
  assert.ok(mmSrc.includes('(it.thumbnail ? " hidden" : "")'), "fallback an san ben canh img khi co URL");
  assert.ok(mmSrc.includes('mm-fallback-brand\\">' + BRAND), "fallback co dong thuong hieu");
  assert.ok(mmSrc.includes('mm-fallback-title'), "fallback co ten video");
  assert.ok(mmSrc.includes('mm-fallback-time'), "fallback co thoi luong");
  assert.ok(!mmSrc.includes('mm-thumb-fallback\\">▶'), "khong con fallback chi la ky tu ▶");
});

test("tv.js: tv-cat-thumb img co onerror doi sang fallback co nhan dien (khong con ▶ don doc)", () => {
  assert.ok(tvSrc.includes('onerror=\\"this.hidden=true;this.nextElementSibling.hidden=false\\"'), "img phai co onerror");
  assert.ok(tvSrc.includes('(it.thumbnail ? " hidden" : "")'), "fallback an san ben canh img khi co URL");
  assert.ok(tvSrc.includes('tv-cat-fallback-brand\\">' + BRAND), "fallback co dong thuong hieu");
  assert.ok(tvSrc.includes('tv-cat-fallback-title'), "fallback co ten video");
  assert.ok(tvSrc.includes('tv-cat-fallback-time'), "fallback co thoi luong");
  assert.ok(!tvSrc.includes('tv-cat-thumb-fallback\\">▶'), "khong con fallback chi la ky tu ▶");
});

test("nen-tang-so.html: sv-thumb img co onerror; khong co media thi hien fallback thay vi o den", () => {
  assert.ok(svSrc.includes('onerror="this.hidden=true;this.nextElementSibling.hidden=false"'), "img phai co onerror");
  assert.ok(svSrc.includes("(it.media ? ' hidden' : '')"), "fallback an san ben canh img khi co media");
  assert.ok(svSrc.includes('sv-fallback-brand">' + BRAND), "fallback co dong thuong hieu");
  assert.ok(svSrc.includes('sv-fallback-title'), "fallback co ten video");
  assert.ok(svSrc.includes('sv-fallback-time'), "fallback co ngay dang");
  assert.ok(svSrc.includes('thumb = fallback;'), "khong co media thi thumb la fallback, khong phai o den");
  assert.ok(svSrc.includes('.sv-thumb-fallback {'), "co style cho fallback trong <style> cua trang");
  assert.ok(svSrc.includes('.sv-thumb img[hidden], .sv-thumb-fallback[hidden]'), "co luat [hidden] cho img + fallback");
});

test("CSS: luat [hidden] + dong thuong hieu + gradient cho fallback o ca 3 file", () => {
  const gradient = "linear-gradient(135deg, #0a2a6b 0%, #123a8a 45%, #0b1235 100%)";
  // tv-page.css: the "Moi nhat" + the video theo chuyen muc.
  assert.ok(tvCss.includes(".latest-poster-img[hidden], .latest-poster-fallback[hidden] { display: none; }"), "thieu luat [hidden] latest");
  assert.ok(tvCss.includes(".latest-fallback-brand {"), "thieu style dong thuong hieu latest");
  assert.ok(tvCss.includes(".tv-cat-thumb img[hidden], .tv-cat-thumb-fallback[hidden] { display: none; }"), "thieu luat [hidden] tv-cat");
  const catRule = /\.tv-cat-thumb-fallback \{([^}]*)\}/.exec(tvCss);
  assert.ok(catRule, "thieu quy tac .tv-cat-thumb-fallback");
  assert.match(catRule[1], /display:\s*flex/);
  assert.ok(catRule[1].includes(gradient), "fallback tv-cat phai co gradient nhu mau");
  assert.ok(tvCss.includes(".tv-cat-fallback-brand {"), "thieu style dong thuong hieu tv-cat");
  // home.css: khoi Da phuong tien trang chu.
  assert.ok(homeCss.includes(".mm-thumb img[hidden], .mm-thumb-fallback[hidden] { display: none; }"), "thieu luat [hidden] mm");
  const mmRule = /\.mm-thumb-fallback \{([^}]*)\}/.exec(homeCss);
  assert.ok(mmRule, "thieu quy tac .mm-thumb-fallback");
  assert.match(mmRule[1], /display:\s*flex/);
  assert.ok(mmRule[1].includes(gradient), "fallback mm phai co gradient nhu mau");
  assert.ok(homeCss.includes(".mm-fallback-brand {"), "thieu style dong thuong hieu mm");
});

test("?v= moi cho 5 file da doi (tranh Cloudflare giu ban cu)", () => {
  assert.ok(tvHtml.includes('/js/tv-extra.js?v=20261107-1'), "tv.html phai tro tv-extra.js?v=20261107-1");
  assert.ok(tvHtml.includes('/js/tv.js?v=20261107-2'), "tv.html phai tro tv.js?v=20261107-2");
  assert.ok(tvHtml.includes('/css/tv-page.css?v=20261107-1'), "tv.html phai tro tv-page.css?v=20261107-1");
  assert.ok(homeHtml.includes('/js/multimedia.js?v=20261107-1'), "home.html phai tro multimedia.js?v=20261107-1");
  assert.ok(homeHtml.includes('/css/home.css?v=20261107-1'), "home.html phai tro home.css?v=20261107-1");
  const pages = fs.readdirSync(path.join(root, "public")).filter((f) => f.endsWith(".html"));
  for (const f of pages) {
    const html = fs.readFileSync(path.join(root, "public", f), "utf8");
    for (const m of html.matchAll(/home\.css\?v=([0-9-]+)/g)) {
      assert.equal(m[1], "20261107-1", `${f} dung home.css cu ?v=${m[1]}`);
    }
  }
});
