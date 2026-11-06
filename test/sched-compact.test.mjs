// Tests for B3 — compact schedule (mobile) on the TV page + the
// /lich-phat-song page (portal only):
// - Collapsed by default: LIVE program + next 4 (COMPACT_ROWS = 5 rows).
// - One-line rows: title clamped to 1 line (CSS, pinned at source level).
// - "Xem cả ngày" button under the list (OUTSIDE the scroll frame) ->
//   expands to the full day; becomes "Thu gọn" to collapse back.
// - Auto-scroll to the live program (in collapsed mode the live program
//   is the first row, so scrollTop = 0); expanded mode keeps the old
//   scrollBoxToRow behaviour.
// - No live program / no schedule for the day: old empty behaviour.
// - Radio + home schedule + desktop are unchanged (no compact flag, or
//   matchMedia says desktop): full list, no toggle.
// The TV page goes through LiveEpg.renderSchedule (compact: true);
// the schedule page has its own table renderer (schedule.js) sharing
// LiveEpg.COMPACT_ROWS. Both are tested here via a vm stub-DOM harness
// (same pattern as thumb-fallback.test.mjs / latest-min-duration).
// Run: node --test test/sched-compact.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const liveEpgSrc = fs.readFileSync(path.join(root, "public/js/live-epg.js"), "utf8");
const scheduleSrc = fs.readFileSync(path.join(root, "public/js/schedule.js"), "utf8");
const styleCss = fs.readFileSync(path.join(root, "public/css/style.css"), "utf8");
const tvPageCss = fs.readFileSync(path.join(root, "public/css/tv-page.css"), "utf8");
const tvHtml = fs.readFileSync(path.join(root, "public/tv.html"), "utf8");
const scheduleHtml = fs.readFileSync(path.join(root, "public/schedule.html"), "utf8");
const radioHtml = fs.readFileSync(path.join(root, "public/radio.html"), "utf8");
const homeHtml = fs.readFileSync(path.join(root, "public/home.html"), "utf8");

// ---- Minimal DOM stub: enough for renderSchedule + schedule.js ----
// innerHTML is parsed back into element objects (rows / table rows /
// empty message) so tests can count rows, read classes/titles and click
// buttons — a plain string stub cannot do that.
class El {
  constructor(tag) {
    this.tagName = (tag || "div").toUpperCase();
    this.children = [];
    this.parentNode = null;
    this._class = new Set();
    this.attributes = {};
    this.dataset = {};
    this.style = {};
    this._listeners = {};
    this._html = "";
    this.textContent = "";
    this.value = "";
    this.type = "";
    this.scrollTop = 0;
    this.scrollHeight = 0;
    this.clientHeight = 0;
    this._top = 0;
    this.hidden = false;
    this._parsed = [];
    this._titleText = "";
    this._inTbody = false;
    this._scrolledIntoView = false;
  }
  get className() { return [...this._class].join(" "); }
  set className(v) { this._class = new Set(String(v || "").split(/\s+/).filter(Boolean)); }
  get classList() {
    const el = this;
    return {
      add(...c) { c.forEach((x) => el._class.add(x)); },
      remove(...c) { c.forEach((x) => el._class.delete(x)); },
      contains(c) { return el._class.has(c); },
      toggle(c, force) {
        const on = force !== undefined ? !!force : !el._class.has(c);
        if (on) el._class.add(c); else el._class.delete(c);
        return on;
      },
    };
  }
  get nextSibling() {
    if (!this.parentNode) return null;
    const sibs = this.parentNode.children;
    const i = sibs.indexOf(this);
    return i >= 0 && i + 1 < sibs.length ? sibs[i + 1] : null;
  }
  get innerHTML() { return this._html; }
  set innerHTML(html) {
    this._html = String(html == null ? "" : html);
    this._parsed = parseInnerHTML(this._html);
    this._parsed.forEach((el) => { el.parentNode = this; });
  }
  getAttribute(n) { return n in this.attributes ? this.attributes[n] : null; }
  setAttribute(n, v) { this.attributes[n] = String(v); }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  insertBefore(node, ref) {
    node.parentNode = this;
    const i = ref ? this.children.indexOf(ref) : -1;
    if (i < 0) this.children.push(node); else this.children.splice(i, 0, node);
    return node;
  }
  removeChild(node) {
    const i = this.children.indexOf(node);
    if (i >= 0) this.children.splice(i, 1);
    node.parentNode = null;
    return node;
  }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); }
  dispatchEvent(ev) { (this._listeners[ev.type] || []).forEach((fn) => fn(ev)); return true; }
  click() { this.dispatchEvent({ type: "click", target: this }); }
  closest() { return null; }
  getBoundingClientRect() { return { top: this._top, left: 0, height: 36, width: 100, bottom: this._top + 36, right: 100 }; }
  scrollIntoView() { this._scrolledIntoView = true; }
  querySelector(sel) { return queryAll(this._parsed, sel)[0] || null; }
  querySelectorAll(sel) { return queryAll(this._parsed, sel); }
}

// Parses only the markup renderSchedule / renderTable produce:
//  <div class='sched-row ...'>…<span class='sched-title-text'>T</span>…
//  <button … data-replay='key'>…</button> (inside a row)
//  <p class='sched-empty'>…</p>
//  <table>…<thead><tr>…</tr></thead><tbody><tr …>…</tr>…</tbody></table>
function parseInnerHTML(html) {
  const out = [];
  if (html.includes("sched-row")) {
    const rowRe = /<div class='([^']*)'>([\s\S]*?)<\/div>/g;
    let m, idx = 0;
    while ((m = rowRe.exec(html)) !== null) {
      const row = new El("div");
      row.className = m[1];
      row._top = idx * 36;
      const title = /<span class='sched-title-text'[^>]*>([^<]*)</.exec(m[2]);
      row._titleText = title ? title[1] : "";
      const btnRe = /<button[^>]*data-replay='([^']*)'[^>]*>/g;
      let b;
      while ((b = btnRe.exec(m[2])) !== null) {
        const btn = new El("button");
        btn.setAttribute("data-replay", b[1]);
        btn.parentNode = row;
        row._parsed.push(btn);
      }
      out.push(row);
      idx++;
    }
    return out;
  }
  if (html.includes("<tr")) {
    const tbodyAt = html.indexOf("<tbody>");
    const trRe = /<tr([^>]*)>([\s\S]*?)<\/tr>/g;
    let m;
    while ((m = trRe.exec(html)) !== null) {
      const tr = new El("tr");
      const cls = /class="([^"]*)"/.exec(m[1]);
      if (cls) tr.className = cls[1];
      tr._inTbody = tbodyAt >= 0 && trRe.lastIndex > tbodyAt;
      const title = /<span class="sched-title-text"[^>]*>([^<]*)</.exec(m[2]);
      tr._titleText = title ? title[1] : "";
      out.push(tr);
    }
    return out;
  }
  const empty = /<p class='sched-empty'>([\s\S]*?)<\/p>/.exec(html);
  if (empty) {
    const p = new El("p");
    p.className = "sched-empty";
    p.textContent = empty[1];
    out.push(p);
  }
  return out;
}

function queryAll(parsed, sel) {
  const rows = parsed.filter((el) => el.tagName === "DIV");
  const trs = parsed.filter((el) => el.tagName === "TR");
  const btns = parsed.flatMap((el) => el._parsed || []);
  if (sel === ".sched-row") return rows;
  if (sel === ".sched-row.is-now") return rows.filter((r) => r.classList.contains("is-now"));
  if (sel === "[data-replay]") return btns.filter((b) => b.getAttribute("data-replay") !== null);
  if (sel === "tbody tr") return trs.filter((t) => t._inTbody);
  if (sel === "tr.sched-now") return trs.filter((t) => t.classList.contains("sched-now"));
  return [];
}

function makeDocument(ids) {
  return {
    addEventListener: () => {},
    getElementById: (id) => ids[id] || null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: (tag) => new El(tag),
  };
}

// Builds a sandbox with window/document/matchMedia; mobile=true means
// matchMedia("(max-width: 800px)").matches === true.
function makeSandbox({ mobile, ids }) {
  const sandbox = {
    console,
    Intl,
    Date,
    setTimeout,
    clearTimeout,
    innerWidth: mobile ? 390 : 1280,
    scrollY: 0,
    location: { hash: "" },
    matchMedia: (q) => ({ matches: mobile && q === "(max-width: 800px)", media: q, addEventListener() {}, removeEventListener() {} }),
    scrollTo: () => {},
    document: makeDocument(ids),
    addEventListener: () => {},
    CustomEvent: function (type, opts) { this.type = type; this.detail = (opts && opts.detail) || {}; },
    Event: function (type) { this.type = type; },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  return sandbox;
}

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
function saigonHHMM(mins) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", hour12: false })
    .format(new Date(Date.now() + mins * 60000));
}
// Program: ISO bounds (computeStatus uses them) + HH:MM Saigon strings
// (display + the schedule-page live check) + replay_url + description.
function prog(title, startMin, endMin) {
  return {
    title,
    start_time: saigonHHMM(startMin),
    end_time: saigonHHMM(endMin),
    startTime: new Date(Date.now() + startMin * 60000).toISOString(),
    endTime: new Date(Date.now() + endMin * 60000).toISOString(),
    replay_url: "/x/timeshift.m3u8",
    description: "Mô tả " + title,
  };
}
// 8 programs, live = #3 (index 2): 2 already played, 5 to come.
function dayItems() {
  return [
    prog("Thời sự sáng", -150, -120),
    prog("Phim truyện dài tập buổi sáng", -120, -30),
    prog("Thời sự trưa đang phát", -30, 30),
    prog("Ca nhạc trưa", 30, 75),
    prog("Phim chiều", 75, 135),
    prog("Thời sự chiều", 135, 165),
    prog("Thể thao tối", 165, 210),
    prog("Phim tối", 210, 270),
  ];
}

function loadLiveEpg(mobile) {
  const box = new El("div");
  box.scrollHeight = 1000;
  box.clientHeight = 200;
  const parent = new El("div");
  parent.appendChild(box);
  const sandbox = makeSandbox({ mobile, ids: {} });
  vm.runInContext(liveEpgSrc, sandbox, { filename: "live-epg.js" });
  return { sandbox, box, parent, LiveEpg: sandbox.LiveEpg };
}
function render(box, LiveEpg, items, extra) {
  return LiveEpg.renderSchedule({ box, items, date: today, compact: true, ...(extra || {}) });
}
function rows(box) { return box.querySelectorAll(".sched-row"); }
function toggleCount(parent) {
  return parent.children.filter((c) => c.className && c.className.includes("sched-compact-toggle")).length;
}

test("COMPACT_ROWS = 5 (dang phat + 4 ke tiep)", () => {
  const { LiveEpg } = loadLiveEpg(true);
  assert.equal(LiveEpg.COMPACT_ROWS, 5);
});

test("renderSchedule mobile + compact: mac dinh 5 dong, dong dau la dang phat, co nut Xem ca ngay, scrollTop ve 0", () => {
  const { box, parent, LiveEpg } = loadLiveEpg(true);
  box.scrollTop = 500; // khung dang cuon o dau do -> render phai dua ve dong live
  const live = render(box, LiveEpg, dayItems());
  assert.equal(live && live.title, "Thời sự trưa đang phát");
  assert.equal(rows(box).length, 5, "chi 5 dong: dang phat + 4 ke tiep");
  assert.equal(rows(box)[0]._titleText, "Thời sự trưa đang phát", "dong dau phai la chuong trinh dang phat");
  assert.ok(rows(box)[0].classList.contains("is-now"), "dong dau co class is-now");
  assert.equal(rows(box)[4]._titleText, "Thể thao tối", "dong thu 5 la chuong trinh ke tiep thu 4");
  assert.ok(box.classList.contains("is-compact"), "box co class is-compact");
  assert.ok(box.classList.contains("is-collapsed"), "box co class is-collapsed");
  assert.equal(box.scrollTop, 0, "tu cuon ve dong dang phat (dong dau khung)");
  const btn = box._schedCompactToggle;
  assert.ok(btn, "co nut mo rong");
  assert.equal(btn.textContent, "Xem cả ngày");
  assert.equal(btn.className, "sched-compact-toggle");
  assert.equal(toggleCount(parent), 1, "chi 1 nut");
  assert.equal(parent.children[1], btn, "nut nam ngay sau box (ngoai khung cuon)");
});

test("renderSchedule: bam Xem ca ngay -> du 8 dong + nut Thu gon; bam lai -> ve 5 dong, khong bao gio 2 nut", () => {
  const { box, parent, LiveEpg } = loadLiveEpg(true);
  render(box, LiveEpg, dayItems());
  let btn = box._schedCompactToggle;
  btn.click();
  assert.equal(rows(box).length, 8, "mo rong: hien du ca ngay");
  assert.equal(box._schedCompactToggle.textContent, "Thu gọn");
  assert.ok(!box.classList.contains("is-collapsed"), "mo rong: het class is-collapsed");
  assert.ok(box.classList.contains("is-compact"), "mo rong: van is-compact (tieu de 1 dong)");
  assert.equal(toggleCount(parent), 1, "sau mo rong van chi 1 nut");
  btn = box._schedCompactToggle;
  btn.click();
  assert.equal(rows(box).length, 5, "thu gon lai: ve 5 dong");
  assert.equal(box._schedCompactToggle.textContent, "Xem cả ngày");
  assert.ok(box.classList.contains("is-collapsed"));
  assert.equal(toggleCount(parent), 1, "sau thu gon van chi 1 nut");
});

test("renderSchedule: khong co chuong trinh dang phat -> 5 dong dau ngay + nut, khong co dong is-now", () => {
  const { box, parent, LiveEpg } = loadLiveEpg(true);
  const items = dayItems().map((p, i) => (i === 2 ? prog("Thời sự trưa (da het)", -90, -30) : p));
  render(box, LiveEpg, items);
  assert.equal(rows(box).length, 5);
  assert.equal(rows(box)[0]._titleText, "Thời sự sáng", "khong co live thi cua so bat dau tu dau ngay");
  assert.equal(box.querySelector(".sched-row.is-now"), null, "khong co dong is-now");
  assert.equal(box._schedCompactToggle.textContent, "Xem cả ngày");
  assert.equal(toggleCount(parent), 1);
});

test("renderSchedule: live la chuong trinh dau tien, tong <= 5 -> hien het, khong co nut", () => {
  const { box, parent, LiveEpg } = loadLiveEpg(true);
  const items = [prog("Đang phát đầu ngày", -30, 30), prog("Kế tiếp 1", 30, 75), prog("Kế tiếp 2", 75, 135)];
  render(box, LiveEpg, items);
  assert.equal(rows(box).length, 3, "3 chuong trinh thi hien het");
  assert.ok(!box._schedCompactToggle, "khong an dong nao thi khong co nut");
  assert.equal(toggleCount(parent), 0);
});

test("renderSchedule: live o giua, tong <= 5 nhung co dong truoc live bi an -> van co nut", () => {
  const { box, parent, LiveEpg } = loadLiveEpg(true);
  const items = [prog("Đã phát trước đó", -120, -30), prog("Đang phát", -30, 30), prog("Kế tiếp", 30, 75)];
  render(box, LiveEpg, items);
  assert.equal(rows(box).length, 2, "chi hien live + ke tiep, dong truoc live bi an");
  assert.equal(rows(box)[0]._titleText, "Đang phát");
  assert.ok(box._schedCompactToggle, "co dong bi an thi co nut Xem ca ngay");
  box._schedCompactToggle.click();
  assert.equal(rows(box).length, 3, "mo rong thi thay ca dong truoc live");
});

test("renderSchedule: khong co lich -> thong bao trong nhu cu, khong nut, khong class thu gon", () => {
  const { box, parent, LiveEpg } = loadLiveEpg(true);
  const ret = render(box, LiveEpg, []);
  assert.equal(ret, null);
  assert.ok(box.innerHTML.includes("sched-empty"), "hien thong bao trong");
  assert.ok(box.innerHTML.includes("Chưa có lịch phát sóng"), "giu nguyen cau thong bao cu");
  assert.ok(!box._schedCompactToggle, "khong co nut khi khong co lich");
  assert.equal(toggleCount(parent), 0);
  assert.ok(!box.classList.contains("is-compact"));
  assert.ok(!box.classList.contains("is-collapsed"));
});

test("renderSchedule desktop + compact: true -> hien du, khong nut, khong class thu gon", () => {
  const { box, parent, LiveEpg } = loadLiveEpg(false);
  render(box, LiveEpg, dayItems());
  assert.equal(rows(box).length, 8, "desktop giu danh sach day du");
  assert.ok(!box._schedCompactToggle);
  assert.equal(toggleCount(parent), 0);
  assert.ok(!box.classList.contains("is-compact"));
});

test("renderSchedule mobile, KHONG truyen compact (radio) -> hien du, khong nut", () => {
  const { box, parent, LiveEpg } = loadLiveEpg(true);
  LiveEpg.renderSchedule({ box, items: dayItems(), date: today });
  assert.equal(rows(box).length, 8, "radio khong doi: hien du");
  assert.ok(!box._schedCompactToggle);
  assert.equal(toggleCount(parent), 0);
  assert.ok(!box.classList.contains("is-compact"));
});

test("renderSchedule dang xem lai (replayingKey) -> mac dinh mo rong de dong Dang xem khong bi an", () => {
  const { box, parent, LiveEpg } = loadLiveEpg(true);
  const items = dayItems();
  const key = LiveEpg.replayKey(items[0]); // dang xem lai chuong trinh dau (da phat)
  render(box, LiveEpg, items, { replayingKey: key });
  assert.equal(rows(box).length, 8, "dang xem lai thi mo rong mac dinh");
  assert.equal(box._schedCompactToggle.textContent, "Thu gọn");
  assert.ok(box.classList.contains("is-compact"));
  assert.ok(!box.classList.contains("is-collapsed"));
  assert.equal(toggleCount(parent), 1);
});

// ---- Trang Lich phat song (schedule.js): bang rieng, vm day du ----

function loadSchedulePage({ mobile, scheduleItems }) {
  const box = new El("div");
  box.scrollHeight = 1000;
  box.clientHeight = 200;
  const parent = new El("div");
  parent.appendChild(box);
  const dateInput = new El("input");
  const chanSel = new El("select");
  const sandbox = makeSandbox({ mobile, ids: { "sched-date": dateInput, "sched-channel": chanSel, schedule: box } });
  sandbox.fetch = (url) => {
    if (url === "/api/v1/channels") {
      return Promise.resolve({ json: () => Promise.resolve({ items: [
        { name: "TUYENQUANG", kind: "tv", status: "RUNNING" },
        { name: "TUYENQUANGRadio", kind: "radio", status: "RUNNING" },
      ] }) });
    }
    if (url.startsWith("/api/v1/schedule")) {
      return Promise.resolve({ status: 200, json: () => Promise.resolve({ items: scheduleItems, date: today }) });
    }
    throw new Error("unexpected fetch: " + url);
  };
  vm.runInContext(liveEpgSrc, sandbox, { filename: "live-epg.js" });
  box.scrollTop = 500;
  vm.runInContext(scheduleSrc, sandbox, { filename: "schedule.js" });
  return { sandbox, box, parent, dateInput, chanSel };
}
async function flush() { await new Promise((r) => setTimeout(r, 20)); }
function tableRows(box) { return box.querySelectorAll("tbody tr"); }

test("schedule.js mobile: mac dinh 5 dong, dong dau la dang phat, co nut Xem ca ngay, scrollTop ve 0", async () => {
  const { box, parent, chanSel } = loadSchedulePage({ mobile: true, scheduleItems: dayItems() });
  await flush();
  assert.equal(chanSel.value, "TUYENQUANG", "mac dinh chon kenh TV dau tien");
  assert.equal(tableRows(box).length, 5, "chi 5 dong: dang phat + 4 ke tiep");
  assert.equal(tableRows(box)[0]._titleText, "Thời sự trưa đang phát");
  assert.ok(tableRows(box)[0].classList.contains("sched-now"), "dong dau co class sched-now");
  assert.ok(box.classList.contains("is-compact"));
  assert.ok(box.classList.contains("is-collapsed"));
  assert.equal(box.scrollTop, 0, "tu cuon ve dong dang phat");
  assert.equal(box._schedCompactToggle.textContent, "Xem cả ngày");
  assert.equal(toggleCount(parent), 1);
});

test("schedule.js mobile: bam Xem ca ngay -> du 8 dong + Thu gon; bam lai -> ve 5 dong", async () => {
  const { box, parent } = loadSchedulePage({ mobile: true, scheduleItems: dayItems() });
  await flush();
  box._schedCompactToggle.click();
  assert.equal(tableRows(box).length, 8, "mo rong: du ca ngay");
  assert.equal(box._schedCompactToggle.textContent, "Thu gọn");
  assert.ok(!box.classList.contains("is-collapsed"));
  assert.equal(toggleCount(parent), 1);
  box._schedCompactToggle.click();
  assert.equal(tableRows(box).length, 5);
  assert.equal(box._schedCompactToggle.textContent, "Xem cả ngày");
  assert.equal(toggleCount(parent), 1);
});

test("schedule.js desktop: hien du 8 dong, khong nut", async () => {
  const { box, parent } = loadSchedulePage({ mobile: false, scheduleItems: dayItems() });
  await flush();
  assert.equal(tableRows(box).length, 8, "desktop giu day du");
  assert.ok(!box._schedCompactToggle);
  assert.equal(toggleCount(parent), 0);
  assert.ok(!box.classList.contains("is-compact"));
});

test("schedule.js: ngay khong co lich -> giu thong bao trong, khong nut", async () => {
  const { box, parent } = loadSchedulePage({ mobile: true, scheduleItems: [] });
  await flush();
  assert.ok(box.innerHTML.includes("Chưa có lịch phát sóng"), "giu thong bao trong cu");
  assert.equal(tableRows(box).length, 0);
  assert.ok(!box._schedCompactToggle);
  assert.equal(toggleCount(parent), 0);
});

// ---- CSS + ?v= pins ----

test("CSS: tieu de lich thu gon 1 dong + khung thu gon + style nut", () => {
  // style.css @800: 1 dong chi khi is-compact (radio/trang chu khong doi).
  assert.match(styleCss, /#schedule\.is-compact \.sched-title-text \{[^}]*-webkit-line-clamp: 1;/);
  // Dong da mo rong (click-to-expand) van hien du ten.
  assert.ok(styleCss.includes("#schedule.is-compact .sched-row.is-expanded .sched-title-text,"));
  assert.ok(styleCss.includes("#schedule.is-compact tr.is-expanded .sched-title-text { -webkit-line-clamp: unset; display: block; }"));
  // Khung thu gon: trang Lich ~5 dong (gom thead), can ca min-height: 0
  // vi .sched-list co min-height: 240px o live.css.
  assert.match(styleCss, /#schedule\.is-compact\.is-collapsed \{ max-height: 225px; min-height: 0; \}/);
  // Nut nam ngoai khung cuon, style global (khong nam trong @800).
  assert.ok(styleCss.includes(".sched-compact-toggle {"));
  assert.ok(styleCss.includes("color: #d61f2f;"));
  // tv-page.css @900: khung thu gon trang TV ~5 dong (khong co thead).
  assert.match(tvPageCss, /\.live-section #schedule\.is-compact\.is-collapsed \{ max-height: 190px; min-height: 0; \}/);
});

test("?v= moi cho 3 file da doi (tranh Cloudflare giu ban cu)", () => {
  assert.ok(tvHtml.includes("/js/live-epg.js?v=20261107-1"), "tv.html phai tro live-epg.js?v=20261107-1");
  assert.ok(scheduleHtml.includes("/js/live-epg.js?v=20261107-1"), "schedule.html phai tro live-epg.js?v=20261107-1");
  assert.ok(radioHtml.includes("/js/live-epg.js?v=20261107-1"), "radio.html phai tro live-epg.js?v=20261107-1");
  assert.ok(homeHtml.includes("/js/live-epg.js?v=20261107-1"), "home.html phai tro live-epg.js?v=20261107-1");
  assert.ok(scheduleHtml.includes("/js/schedule.js?v=20261107-1"), "schedule.html phai tro schedule.js?v=20261107-1");
  for (const f of ["admin.html", "index.html", "login.html", "radio.html", "reader.html", "schedule.html", "tv.html"]) {
    const html = fs.readFileSync(path.join(root, "public", f), "utf8");
    assert.ok(html.includes("/css/style.css?v=20261107-1"), `${f} phai tro style.css?v=20261107-1`);
  }
});
