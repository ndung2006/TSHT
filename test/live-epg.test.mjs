// Unit tests for the VTCANY TV port (pure logic only — no network, no DB,
// no real key, no live backend). Run: node --test test/live-epg.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { computeEpgStatus, channelPublicId, mapVtcanyTimeline, saigonHHMM } from "../lib/vtcany.mjs";
import { stitchTimeshiftPlaylists, absolutizeUri, TIMESHIFT_MAX_MS } from "../lib/timeshift.mjs";

const NOW = new Date("2026-10-26T10:00:00+07:00").getTime();

test("EPG status: past -> REPLAY, current -> LIVE, future -> UPCOMING", () => {
  assert.equal(computeEpgStatus("2026-10-26T08:00:00+07:00", "2026-10-26T09:00:00+07:00", NOW), "REPLAY");
  assert.equal(computeEpgStatus("2026-10-26T09:30:00+07:00", "2026-10-26T10:30:00+07:00", NOW), "LIVE");
  assert.equal(computeEpgStatus("2026-10-26T11:00:00+07:00", "2026-10-26T12:00:00+07:00", NOW), "UPCOMING");
  assert.equal(computeEpgStatus(null, null, NOW), "LIVE");
});

test("channelPublicId matches VTCANY rule: sha256(tv-channel:NAME) first 24 hex", async () => {
  const { createHash } = await import("node:crypto");
  const expect = createHash("sha256").update("tv-channel:TUYENQUANG").digest("hex").slice(0, 24);
  assert.equal(channelPublicId("TUYENQUANG"), expect);
  assert.equal(channelPublicId("tuyenquang"), expect); // case-insensitive
  assert.match(channelPublicId("TUYENQUANG"), /^[0-9a-f]{24}$/);
});

test("mapVtcanyTimeline: status recomputed, replay only for REPLAY with replay_url", () => {
  const items = mapVtcanyTimeline([
    { time: "08:00", title: "Da phat co ghi", status: "LIVE", startIso: "2026-10-26T08:00:00+07:00", endIso: "2026-10-26T09:00:00+07:00", replay_url: "/channels/abc/timeshift.m3u8?start=x&end=y" },
    { time: "09:30", title: "Dang phat", status: "REPLAY", startIso: "2026-10-26T09:30:00+07:00", endIso: "2026-10-26T10:30:00+07:00", replay_url: "/channels/abc/timeshift.m3u8?start=x&end=y" },
    { time: "11:00", title: "Sap phat", status: "LIVE", startIso: "2026-10-26T11:00:00+07:00", endIso: "2026-10-26T12:00:00+07:00" },
    { time: "", title: "", status: "LIVE" }, // dropped: no title
  ], "TUYENQUANG", NOW);
  assert.equal(items.length, 3);
  assert.equal(items[0].status, "REPLAY");
  assert.ok(items[0].replay_url.startsWith("/api/v1/timeshift?channel=TUYENQUANG&"));
  assert.equal(items[0].replay_available, true);
  assert.equal(items[1].status, "LIVE"); // stale cached status corrected
  assert.equal(items[1].replay_available, false); // LIVE never replayable
  assert.equal(items[2].status, "UPCOMING");
  assert.equal(items[2].replay_available, false);
});

test("saigonHHMM formats in Asia/Ho_Chi_Minh regardless of host TZ", () => {
  assert.equal(saigonHHMM("2026-10-26T17:00:00+07:00"), "17:00");
  assert.equal(saigonHHMM("2026-10-26T10:00:00Z"), "17:00");
});

test("TIMESHIFT_MAX_MS is 6 hours", () => {
  assert.equal(TIMESHIFT_MAX_MS, 6 * 3600 * 1000);
});

test("stitchTimeshiftPlaylists: one VOD header, DISCONTINUITY between chunks, ENDLIST, absolute segments", () => {
  const chunk = (n) => `#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:10\n#EXTINF:10.0,\nseg${n}.ts\n#EXT-X-ENDLIST\n`;
  const out = stitchTimeshiftPlaylists([
    { playlist: chunk(1), baseUrl: "https://luuchieu1.vtcplay.vn" },
    { playlist: chunk(2), baseUrl: "https://luuchieu1.vtcplay.vn" },
  ]);
  assert.ok(out.startsWith("#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-PLAYLIST-TYPE:VOD\n"));
  assert.ok(out.includes("#EXT-X-DISCONTINUITY"));
  assert.ok(out.includes("https://luuchieu1.vtcplay.vn/seg1.ts"));
  assert.ok(out.includes("https://luuchieu1.vtcplay.vn/seg2.ts"));
  assert.ok(out.trimEnd().endsWith("#EXT-X-ENDLIST"));
  assert.equal((out.match(/#EXT-X-ENDLIST/g) || []).length, 1);
});

test("stitchTimeshiftPlaylists: no segments -> 404 error (no silent empty playlist)", () => {
  assert.throws(() => stitchTimeshiftPlaylists([{ playlist: "#EXTM3U\n#EXT-X-ENDLIST\n", baseUrl: "https://example.test" }]), (e) => e.status === 404);
});

test("absolutizeUri leaves absolute URLs alone", () => {
  assert.equal(absolutizeUri("https://cdn.test/a.ts", "https://base.test"), "https://cdn.test/a.ts");
  assert.equal(absolutizeUri("seg.ts", "https://base.test/hls"), "https://base.test/hls/seg.ts");
});
