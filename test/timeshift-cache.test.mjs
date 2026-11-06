// Tests for the B1 timeshift playlist cache (portal only): the replay
// path fetches the same /api/v1/timeshift URL twice per click (pre-check
// fetch in tv.js onReplay, then hls.js loadSource), and the server
// rebuilt the playlist from scratch both times (~10s to first motion).
// A short in-memory server cache (60s, keyed by channel+start+end)
// makes the second fetch near-instant. Only successful (200) playlists
// are cached; 404/400/502 are never cached, and the client still gets
// Cache-Control: no-store.
// - lib/timeshift-cache.mjs: unit tests (fake clock, no server needed).
// - server.mjs: source-level wiring tests (the server cannot be
//   imported in-process — it listens on import — and the upstream
//   VTCANY/AIO is not configured locally, so the handler path is
//   pinned at source level like nen-tang-so-cards.test.mjs does).
// Run: node --test test/timeshift-cache.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const cacheSrc = await import(path.join(root, "lib/timeshift-cache.mjs"));
const serverSrc = fs.readFileSync(path.join(root, "server.mjs"), "utf8");

const { createTimeshiftCache, timeshiftCacheKey, TIMESHIFT_CACHE_TTL_MS } = cacheSrc;

function fakeClock(startMs = 1_000_000) {
  let now = startMs;
  return { now: () => now, advance: (ms) => { now += ms; } };
}

const PLAYLIST_A = "#EXTM3U\n#EXT-X-VERSION:3\n#EXTINF:10,\nseg-a.ts\n";
const PLAYLIST_B = "#EXTM3U\n#EXT-X-VERSION:3\n#EXTINF:10,\nseg-b.ts\n";

test("cache hit tra dung playlist vua set", () => {
  const clock = fakeClock();
  const c = createTimeshiftCache({ now: clock.now });
  const key = timeshiftCacheKey("TUYENQUANG", "2026-11-06T22:23:00.000Z", "2026-11-06T23:29:00.000Z");
  assert.equal(c.get(key), null);
  c.set(key, PLAYLIST_A);
  assert.equal(c.get(key), PLAYLIST_A);
});

test("het TTL (60s) -> miss, muc cu bi xoa", () => {
  assert.equal(TIMESHIFT_CACHE_TTL_MS, 60 * 1000);
  const clock = fakeClock();
  const c = createTimeshiftCache({ now: clock.now });
  const key = timeshiftCacheKey("TUYENQUANG", "2026-11-06T22:23:00.000Z", "2026-11-06T23:29:00.000Z");
  c.set(key, PLAYLIST_A);
  clock.advance(59 * 1000);
  assert.equal(c.get(key), PLAYLIST_A);
  clock.advance(2 * 1000);
  assert.equal(c.get(key), null);
  // Het han thi muc da bi xoa khoi store (khong phinh bo nho).
  assert.equal(c.size(), 0);
});

test("khoa khac nhau khong dung: kenh / gio bat dau / gio ket thuc", () => {
  const clock = fakeClock();
  const c = createTimeshiftCache({ now: clock.now });
  const base = ["TUYENQUANG", "2026-11-06T22:23:00.000Z", "2026-11-06T23:29:00.000Z"];
  const k1 = timeshiftCacheKey(...base);
  const kOtherChannel = timeshiftCacheKey("TUYENQUANGRadio", base[1], base[2]);
  const kOtherStart = timeshiftCacheKey(base[0], "2026-11-06T22:24:00.000Z", base[2]);
  const kOtherEnd = timeshiftCacheKey(base[0], base[1], "2026-11-06T23:30:00.000Z");
  assert.notEqual(k1, kOtherChannel);
  assert.notEqual(k1, kOtherStart);
  assert.notEqual(k1, kOtherEnd);
  c.set(k1, PLAYLIST_A);
  assert.equal(c.get(kOtherChannel), null);
  assert.equal(c.get(kOtherStart), null);
  assert.equal(c.get(kOtherEnd), null);
  assert.equal(c.get(k1), PLAYLIST_A);
});

test("khoa kenh khong phan biet hoa/thuong; set lai ghi de playlist moi", () => {
  const clock = fakeClock();
  const c = createTimeshiftCache({ now: clock.now });
  const kLower = timeshiftCacheKey("tuyenquang", "2026-11-06T22:23:00.000Z", "2026-11-06T23:29:00.000Z");
  const kUpper = timeshiftCacheKey("TUYENQUANG", "2026-11-06T22:23:00.000Z", "2026-11-06T23:29:00.000Z");
  assert.equal(kLower, kUpper);
  c.set(kUpper, PLAYLIST_A);
  c.set(kUpper, PLAYLIST_B);
  assert.equal(c.get(kUpper), PLAYLIST_B);
  assert.equal(c.size(), 1);
});

test("set playlist rong / khong phai chuoi thi bo qua, khong cache", () => {
  const clock = fakeClock();
  const c = createTimeshiftCache({ now: clock.now });
  const key = timeshiftCacheKey("TUYENQUANG", "2026-11-06T22:23:00.000Z", "2026-11-06T23:29:00.000Z");
  c.set(key, "");
  c.set(key, null);
  c.set(key, 42);
  assert.equal(c.get(key), null);
  assert.equal(c.size(), 0);
});

test("vuot gioi han muc -> xoa muc cu nhat (khong phinh bo nho)", () => {
  const clock = fakeClock();
  const c = createTimeshiftCache({ now: clock.now, max: 3 });
  const keys = [1, 2, 3, 4].map((n) => timeshiftCacheKey("TUYENQUANG", `2026-11-06T22:0${n}:00.000Z`, "2026-11-06T23:29:00.000Z"));
  keys.forEach((k, i) => c.set(k, PLAYLIST_A + i));
  assert.equal(c.size(), 3);
  assert.equal(c.get(keys[0]), null);
  assert.equal(c.get(keys[3]), PLAYLIST_A + 3);
});

test("clear() xoa het", () => {
  const clock = fakeClock();
  const c = createTimeshiftCache({ now: clock.now });
  const key = timeshiftCacheKey("TUYENQUANG", "2026-11-06T22:23:00.000Z", "2026-11-06T23:29:00.000Z");
  c.set(key, PLAYLIST_A);
  c.clear();
  assert.equal(c.get(key), null);
  assert.equal(c.size(), 0);
});

// ---- server.mjs wiring (source level) ----

test("server: timeshift handler tra cache truoc khi goi VTCANY/AIO", () => {
  assert.ok(serverSrc.includes("timeshiftCache.get("), "handler phai doc cache");
  // Neo vao chuoi rieng cua handler (GET ...), khong phai dong
  // isPublicRead o dau file cung chua "/api/v1/timeshift".
  const handlerAt = serverSrc.indexOf('req.method === "GET" && u.pathname === "/api/v1/timeshift"');
  assert.ok(handlerAt >= 0, "khong tim thay handler /api/v1/timeshift");
  const getAt = serverSrc.indexOf("timeshiftCache.get(", handlerAt);
  const vtcanyAt = serverSrc.indexOf("fetchVtcanyTimeshift(", handlerAt);
  assert.ok(getAt >= 0 && vtcanyAt >= 0 && getAt < vtcanyAt, "cache.get phai dung truoc fetchVtcanyTimeshift trong handler");
});

test("server: chi cache playlist thanh cong (200), khong cache loi", () => {
  // Ca 2 duong thanh cong (VTCANY + stitch AIO) deu set cache; cac
  // duong loi (404/400/502) tra ve ma khong set.
  const setCount = (serverSrc.match(/timeshiftCache\.set\(/g) || []).length;
  assert.equal(setCount, 2, "phai co dung 2 cho set cache (VTCANY ok + stitch ok), hien co " + setCount);
  assert.ok(!/return err\(res, 404[^;]*timeshiftCache\.set/.test(serverSrc), "duong 404 khong duoc set cache");
  assert.ok(!/return err\(res, 502[^;]*timeshiftCache\.set/.test(serverSrc), "duong 502 khong duoc set cache");
});

test("server: client van nhan Cache-Control: no-store cho timeshift", () => {
  const handlerAt = serverSrc.indexOf('req.method === "GET" && u.pathname === "/api/v1/timeshift"');
  const nextHandlerAt = serverSrc.indexOf('req.method === "GET" && u.pathname === "/api/v1/timeshift-coverage"', handlerAt);
  assert.ok(handlerAt >= 0 && nextHandlerAt > handlerAt, "khong tim thay khoi handler timeshift");
  const block = serverSrc.slice(handlerAt, nextHandlerAt);
  assert.ok(block.includes('"Cache-Control": "no-store"'), "timeshift van phai tra no-store cho client");
});

test("server: WARMUP_URLS co du 4 URL live (live + live-master x 2 kenh)", () => {
  for (const u of [
    "/api/v1/live?channel=TUYENQUANG",
    "/api/v1/live-master?channel=TUYENQUANG",
    "/api/v1/live?channel=TUYENQUANGRadio",
    "/api/v1/live-master?channel=TUYENQUANGRadio",
  ]) {
    assert.ok(serverSrc.includes(`"${u}"`), "WARMUP_URLS thieu " + u);
  }
});
