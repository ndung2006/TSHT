// Tests for the "CHUONG TRINH MOI NHAT" min-duration rule (portal only):
// programs shorter than LATEST_MIN_DURATION_MIN (3) minutes are excluded
// from the latest-programs block (GT phim, nhac hieu, quang cao ngan...),
// older programs backfill so the block still shows 4 cards, and the EPG
// schedule list (renderSchedule) still shows every program.
// Run: node --test test/latest-min-duration.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// Minimal browser stub: enough for live-epg.js + tv-extra.js to load and
// for the tv-schedule event to be dispatched by hand.
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
  vm.runInContext(fs.readFileSync(path.join(root, "public/js/tv-extra.js"), "utf8"), sandbox, { filename: "tv-extra.js" });
  return { LiveEpg: sandbox.LiveEpg, box, dispatchSchedule: (detail) => sandbox.dispatchEvent(new sandbox.CustomEvent("tv-schedule", { detail })) };
}

// Fixed "now": 2026-11-06 10:30 +07 — mirrors the screenshot the user sent
// (live film 10:27, "Cung con khon lon" 10:15, two GT phim 10:14 + 10:13).
const NOW = new Date("2026-11-06T10:30:00+07:00").getTime();
const DATE = "2026-11-06";
function prog(title, startHHMM, endHHMM) {
  const p = { title, start_time: startHHMM, startTime: `${DATE}T${startHHMM}:00+07:00` };
  if (endHHMM) { p.end_time = endHHMM; p.endTime = `${DATE}T${endHHMM}:00+07:00`; }
  return p;
}
function screenshotDay() {
  return [
    prog("Phim truyen: Tam Quoc co mat - Tap 42", "10:27", "11:30"),
    prog("Cung con khon lon", "10:15", "10:27"),
    prog("GT phim: Yen son phai va Bach hoa mon - Tap 10", "10:14", "10:15"),
    prog("GT phim: Tam quoc co mat - Tap 42", "10:13", "10:14"),
    prog("Thoi su toi", "09:50", "10:13"),
    prog("Ca nhac", "09:20", "09:50"),
    prog("Phim truyen: Tam Quoc co mat - Tap 43", "11:30", "12:00"),
  ];
}

test("threshold constant exists and defaults to 3 minutes", () => {
  const { LiveEpg } = loadPortalScripts();
  assert.equal(LiveEpg.LATEST_MIN_DURATION_MIN, 3);
});

test("programDurationMin: end - start; missing end falls back to next start", () => {
  const { LiveEpg } = loadPortalScripts();
  assert.equal(LiveEpg.programDurationMin(prog("A", "10:15", "10:27"), DATE, null), 12);
  assert.equal(LiveEpg.programDurationMin(prog("GT", "10:14", "10:15"), DATE, null), 1);
  // No end_time: next program starts 10:07 -> 2 minutes.
  const noEnd = prog("Quang cao", "10:05", null);
  assert.equal(LiveEpg.programDurationMin(noEnd, DATE, new Date(`${DATE}T10:07:00+07:00`).getTime()), 2);
  // No end and no next program: unknown -> null (kept, per rule 4).
  assert.equal(LiveEpg.programDurationMin(prog("Dem", "23:00", null), DATE, null), null);
  // Cross-midnight: 23:55 -> 00:10 is 15 minutes, not -1425.
  assert.equal(LiveEpg.programDurationMin(prog("Khuya", "23:55", "00:10"), DATE, null), 15);
});

test("selectLatestPrograms: GT phim under 3 min dropped, older programs backfill to 4", () => {
  const { LiveEpg } = loadPortalScripts();
  const out = LiveEpg.selectLatestPrograms(screenshotDay(), DATE, LiveEpg.LATEST_MIN_DURATION_MIN, NOW);
  assert.deepEqual([...out.map((p) => p.title)], [
    "Phim truyen: Tam Quoc co mat - Tap 42", // LIVE
    "Cung con khon lon",
    "Thoi su toi",
    "Ca nhac",
  ]);
});

test("selectLatestPrograms: short LIVE program skipped, nearest long program shown", () => {
  const { LiveEpg } = loadPortalScripts();
  const items = [
    prog("GT phim ngan dang phat", "10:29", "10:31"), // LIVE, 2 min
    prog("Cung con khon lon", "10:15", "10:29"),
    prog("Thoi su toi", "09:50", "10:15"),
    prog("Ca nhac", "09:20", "09:50"),
  ];
  const out = LiveEpg.selectLatestPrograms(items, DATE, LiveEpg.LATEST_MIN_DURATION_MIN, NOW);
  assert.deepEqual([...out.map((p) => p.title)], ["Cung con khon lon", "Thoi su toi", "Ca nhac"]);
});

test("selectLatestPrograms: unknown duration is kept; threshold change drives the block", () => {
  const { LiveEpg } = loadPortalScripts();
  const items = [
    prog("Chuong trinh dem", "09:00", null), // no end, no next -> unknown
    prog("Nhac hieu", "08:56", "09:00"), // 4 min
    prog("Thoi su sang", "08:00", "08:56"),
  ];
  const nowLate = new Date("2026-11-06T09:30:00+07:00").getTime();
  // At the 3-minute threshold both stay; at 5 minutes the 4-min one drops.
  assert.deepEqual(
    [...LiveEpg.selectLatestPrograms(items, DATE, 3, nowLate).map((p) => p.title)],
    ["Chuong trinh dem", "Nhac hieu", "Thoi su sang"],
  );
  assert.deepEqual(
    [...LiveEpg.selectLatestPrograms(items, DATE, 5, nowLate).map((p) => p.title)],
    ["Chuong trinh dem", "Thoi su sang"],
  );
});

test("render: latest block shows 4 cards, no GT phim, live card keeps DANG PHAT", () => {
  const { box, dispatchSchedule } = loadPortalScripts();
  // Render uses the real clock, so build items relative to now.
  const now = Date.now();
  const iso = (mins) => new Date(now + mins * 60000).toISOString();
  const hhmm = (mins) => {
    const d = new Date(now + mins * 60000);
    return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  };
  const rel = (title, startMin, endMin) => ({
    title,
    start_time: hhmm(startMin),
    startTime: iso(startMin),
    ...(endMin == null ? {} : { end_time: hhmm(endMin), endTime: iso(endMin) }),
    replay_url: "/x/timeshift.m3u8",
  });
  const items = [
    rel("Phim truyen: Tam Quoc co mat - Tap 42", -3, 60), // LIVE, long
    rel("Cung con khon lon", -15, -3),
    rel("GT phim: Yen son phai - Tap 10", -16, -15), // 1 min
    rel("GT phim: Tam quoc co mat - Tap 42", -17, -16), // 1 min
    rel("Thoi su toi", -40, -17),
    rel("Ca nhac", -70, -40),
  ];
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
  dispatchSchedule({ items, meta: { date: today }, replayingKey: null, channel: { name: "TUYENQUANG", logo: null } });
  assert.equal((box.innerHTML.match(/latest-card/g) || []).length, 4);
  assert.ok(box.innerHTML.includes("Tam Quoc co mat - Tap 42"));
  assert.ok(box.innerHTML.includes("Cung con khon lon"));
  assert.ok(box.innerHTML.includes("Thoi su toi"));
  assert.ok(box.innerHTML.includes("Ca nhac"));
  assert.ok(!box.innerHTML.includes("GT phim"));
  assert.ok(box.innerHTML.includes("ĐANG PHÁT"));
});

test("render: short LIVE program -> no DANG PHAT card, nearest long program first", () => {
  const { box, dispatchSchedule } = loadPortalScripts();
  const now = Date.now();
  const iso = (mins) => new Date(now + mins * 60000).toISOString();
  const hhmm = (mins) => {
    const d = new Date(now + mins * 60000);
    return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  };
  const rel = (title, startMin, endMin) => ({
    title,
    start_time: hhmm(startMin),
    startTime: iso(startMin),
    ...(endMin == null ? {} : { end_time: hhmm(endMin), endTime: iso(endMin) }),
    replay_url: "/x/timeshift.m3u8",
  });
  const items = [
    rel("GT phim ngan dang phat", -1, 1), // LIVE, 2 min
    rel("Cung con khon lon", -15, -1),
    rel("Thoi su toi", -40, -15),
    rel("Ca nhac", -70, -40),
  ];
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
  dispatchSchedule({ items, meta: { date: today }, replayingKey: null, channel: { name: "TUYENQUANG", logo: null } });
  assert.ok(!box.innerHTML.includes("ĐANG PHÁT"));
  assert.ok(box.innerHTML.includes("Cung con khon lon"));
  assert.ok(!box.innerHTML.includes("GT phim"));
});

test("renderSchedule (EPG list) still shows short programs in full", () => {
  const { LiveEpg, box } = loadPortalScripts();
  LiveEpg.renderSchedule({ box, items: screenshotDay(), date: DATE, replayingKey: null, timeshift_available: true, timeshift_unknown: false });
  assert.ok(box.innerHTML.includes("GT phim: Yen son phai"));
  assert.ok(box.innerHTML.includes("GT phim: Tam quoc co mat"));
  assert.equal((box.innerHTML.match(/sched-row/g) || []).length, 7);
});
