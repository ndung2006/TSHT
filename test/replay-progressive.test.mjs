// Tests cho B1b progressive (portal only, stream-player.js):
// player xem lai (playTimeshift) phai tao hls.js voi progressive: true
// de phat ngay khi co vai giay du lieu dau, khong doi tai xong ca file
// .ts 60s (~15 MB) cua AIO. hls.js 1.5.13 tu doi loader sang FetchLoader
// khi progressive: true (enableStreamingMode trong src/config.ts) nen
// chi can co nay, khong can cau hinh loader rieng; startLevel: 0 giu
// nguyen. Chi duong xem lai duoc bat progressive — live (playDirect /
// playVtcanyLive / playRotating) giu cau hinh cu, va duong native
// Safari (Hls khong ho tro) khong doi.
// Run: node --test test/replay-progressive.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const spSrc = fs.readFileSync(path.join(root, "public/js/stream-player.js"), "utf8");

// Hls gia: ghi lai cau hinh truyen vao constructor moi lan tao.
class FakeHls {
  static instances = [];
  static supported = true;
  static isSupported() { return FakeHls.supported; }
  static get Events() { return { ERROR: "hlsError", MANIFEST_PARSED: "hlsManifestParsed", LEVEL_SWITCHED: "hlsLevelSwitched" }; }
  constructor(cfg) {
    this.cfg = cfg;
    this.levels = [];
    this.currentLevel = -1;
    this.autoLevelEnabled = true;
    FakeHls.instances.push(this);
  }
  loadSource() {}
  attachMedia() {}
  on() {}
  off() {}
  destroy() {}
}

function loadSp() {
  FakeHls.instances = [];
  const media = {
    listeners: {},
    currentTime: 0,
    seekable: { length: 0 },
    addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
    play: () => Promise.resolve(),
    canPlayType: () => "",
  };
  const sandbox = {
    console,
    fetch: async (url) => {
      if (String(url).includes("/api/v1/stream-token")) {
        return { status: 200, json: async () => ({ url: "https://example.test/live.m3u8", exp: Date.now() + 3600 * 1000 }) };
      }
      if (String(url).includes("/api/v1/live")) {
        return { status: 200, json: async () => ({ ok: true, url: "https://example.test/live.m3u8", exp: Date.now() + 3600 * 1000 }) };
      }
      throw new Error("fetch khong mong doi: " + url);
    },
    setTimeout,
    clearTimeout,
    Hls: FakeHls,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(spSrc, sandbox, { filename: "stream-player.js" });
  return { sandbox, media };
}
const tick = async (n = 12) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };

test("playTimeshift tao Hls voi progressive: true + startLevel: 0", () => {
  const { sandbox, media } = loadSp();
  const msgs = [];
  sandbox.playTimeshift(media, "https://example.test/replay.m3u8", (t) => msgs.push(t));
  assert.equal(FakeHls.instances.length, 1, "playTimeshift phai tao 1 Hls");
  assert.equal(FakeHls.instances[0].cfg.startLevel, 0, "van giu startLevel 0 (muc 360p)");
  assert.equal(FakeHls.instances[0].cfg.progressive, true, "xem lai phai bat progressive");
  assert.equal(msgs.length, 0, "khong bao loi khi tao duoc Hls");
});

test("playDirect tao Hls KHONG co progressive (live giu cau hinh cu)", () => {
  const { sandbox, media } = loadSp();
  sandbox.playDirect(media, "https://example.test/live.m3u8", () => {});
  assert.equal(FakeHls.instances.length, 1);
  assert.equal(FakeHls.instances[0].cfg.startLevel, 0);
  assert.equal("progressive" in FakeHls.instances[0].cfg, false, "live khong duoc bat progressive");
});

test("playVtcanyLive tao Hls KHONG co progressive", async () => {
  const { sandbox, media } = loadSp();
  const handle = sandbox.playVtcanyLive(media, "TUYENQUANG", () => {}, () => {});
  await tick();
  assert.equal(FakeHls.instances.length, 1, "live VTCANY phai tao 1 Hls sau khi lay link");
  assert.equal(FakeHls.instances[0].cfg.startLevel, 0);
  assert.equal("progressive" in FakeHls.instances[0].cfg, false, "live khong duoc bat progressive");
  handle.stop();
});

test("playRotating tao Hls KHONG co progressive", async () => {
  const { sandbox, media } = loadSp();
  const handle = sandbox.playRotating(media, "TUYENQUANG", () => {});
  await tick();
  assert.equal(FakeHls.instances.length, 1, "live xoay link phai tao 1 Hls sau khi lay link");
  assert.equal(FakeHls.instances[0].cfg.startLevel, 0);
  assert.equal("progressive" in FakeHls.instances[0].cfg, false, "live khong duoc bat progressive");
  handle.stop();
});

test("Safari native (Hls khong ho tro): xem lai dung src goc, khong tao Hls", () => {
  FakeHls.supported = false;
  try {
    const { sandbox, media } = loadSp();
    media.canPlayType = () => "maybe";
    media.src = "";
    const msgs = [];
    sandbox.playTimeshift(media, "https://example.test/replay.m3u8", (t) => msgs.push(t));
    assert.equal(FakeHls.instances.length, 0, "native khong duoc tao Hls");
    assert.equal(media.src, "https://example.test/replay.m3u8", "native phai gan src goc");
    assert.equal(msgs.length, 0);
  } finally {
    FakeHls.supported = true;
  }
});
