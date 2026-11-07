// Tests for the hardened /cover-thumb route (user 2026-11-07, truoc khi
// deploy khoi BAO IN): chi so da xuat ban + chi size 400/800; toi da 2
// render dong thoi (FIFO) + rate limit theo IP; loi render -> anh du
// phong; cache theo fingerprint PDF (doi PDF thi render lai); warmup
// 10 so moi nhat luc khoi dong.
// Logic nam trong lib/epaper-cover.mjs (thuan, khong phu thuoc http)
// nen test truc tiep duoc: backend + pdftoppm deu stub (tru 1 test
// render that, skip neu thieu pdftoppm). Disk cache dung thu muc tam
// that de kiem tra ten file + don file cu.
// Run: node --test test/cover-thumb-hardening.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createCoverThumbService,
  renderPdfPageToJpeg,
  coverThumbClientIp,
  COVER_THUMB_MAX_CONCURRENT,
} from "../lib/epaper-cover.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const server = fs.readFileSync(path.join(root, "server.mjs"), "utf8");
const coverLib = fs.readFileSync(path.join(root, "lib", "epaper-cover.mjs"), "utf8");
const homeJs = fs.readFileSync(path.join(root, "public/js/home.js"), "utf8");

const ID_A = "4bbdb72c2fd9115efd05ea10"; // 559 vung cao (live)
const ID_B = "014ab17ef75433437d62e473"; // 320 thuong (live)
const ID_C = "b62e16d4e2f8331a6df51ef4"; // 319 thuong (live)
const ID_UNPUB = "aaaaaaaaaaaaaaaaaaaaaaaa"; // ton tai nhung chua xuat ban
const ID_MISSING = "ffffffffffffffffffffffff"; // khong ton tai
const FAKE_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9]);
const FALLBACK = { contentType: "image/svg+xml", body: Buffer.from("<svg>fallback</svg>") };

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
const tick = async (n = 10) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };

// Harness: state co the doi giua test de gia lap backend loi / doi
// fingerprint; counters dem so lan goi tung dep de chung minh "KHONG
// dung" (vd size sai thi khong duoc goi render).
function makeService(overrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cover-thumb-test-"));
  const state = {
    publishedIds: [ID_A, ID_B, ID_C],
    versions: { [ID_A]: "1000-111", [ID_B]: "2000-222", [ID_C]: "3000-333" },
    listOk: true,
    versionStatus: {}, // id -> 404 de gia lap detail 404
    fetchPdfImpl: null, // (id) => Buffer | throw
    renderImpl: null, // (pdf, dpi) => Buffer | Promise | throw
    renderDelayMs: 0,
  };
  Object.assign(state, overrides.state || {});
  const calls = { list: 0, version: 0, pdf: 0, render: 0 };
  const renderDpis = [];
  let activeRenders = 0;
  let maxActiveRenders = 0;
  const startOrder = [];
  let renderSeq = 0;
  const svc = createCoverThumbService({
    coverDir: dir,
    fetchPublishedList: async () => {
      calls.list++;
      if (!state.listOk) return { ok: false };
      return { ok: true, items: state.publishedIds.map((id, i) => ({ publicId: id, publishDate: `2026-10-${20 + i}`, issueNumber: 300 + i })) };
    },
    fetchIssueVersion: async (id) => {
      calls.version++;
      if (state.versionStatus[id] === 404) return { ok: false, status: 404 };
      return { ok: true, version: state.versions[id] ?? null };
    },
    fetchPdf: async (id) => {
      calls.pdf++;
      if (state.fetchPdfImpl) return state.fetchPdfImpl(id);
      return Buffer.from("fake-pdf-bytes");
    },
    renderPdf: async (pdf, dpi) => {
      calls.render++;
      renderDpis.push(dpi);
      const mySeq = renderSeq++;
      startOrder.push(mySeq);
      activeRenders++;
      maxActiveRenders = Math.max(maxActiveRenders, activeRenders);
      try {
        if (state.renderDelayMs) await new Promise((r) => setTimeout(r, state.renderDelayMs));
        if (state.renderImpl) return await state.renderImpl(pdf, dpi, mySeq);
        return FAKE_JPEG;
      } finally { activeRenders--; }
    },
    readFallback: () => FALLBACK,
    log: () => {},
    ...(overrides.options || {}),
  });
  return {
    svc, dir, state, calls, renderDpis,
    get maxActiveRenders() { return maxActiveRenders; },
    get startOrder() { return startOrder; },
    files: () => fs.readdirSync(dir).sort(),
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
}

test("1a. id chua xuat ban -> 404, khong render, khong tao file cache", async (t) => {
  const h = makeService({ state: { publishedIds: [ID_A, ID_B, ID_C, ID_UNPUB].filter((x) => x !== ID_UNPUB) } });
  t.after(h.cleanup);
  // ID_UNPUB khong co trong danh sach published -> 404 (du backend
  // detail co the tra no, route nay chi tin list published).
  const r = await h.svc.serveCoverThumb({ publicId: ID_UNPUB, sizeRaw: undefined, ip: "1.2.3.4" });
  assert.equal(r.status, 404);
  assert.equal(h.calls.render, 0, "khong duoc render so chua xuat ban");
  assert.equal(h.calls.pdf, 0, "khong duoc tai PDF so chua xuat ban");
  assert.deepEqual(h.files(), [], "khong duoc tao file cache");
});

test("1b. id khong ton tai -> 404, khong render", async (t) => {
  const h = makeService();
  t.after(h.cleanup);
  const r = await h.svc.serveCoverThumb({ publicId: ID_MISSING, sizeRaw: "400", ip: "1.2.3.4" });
  assert.equal(r.status, 404);
  assert.equal(h.calls.render, 0);
});

test("1c. id sai dinh dang (khong phai 24 hex) -> 404 truoc ca khi goi backend", async (t) => {
  const h = makeService();
  t.after(h.cleanup);
  const r = await h.svc.serveCoverThumb({ publicId: "xyz", sizeRaw: undefined, ip: "1.2.3.4" });
  assert.equal(r.status, 404);
  assert.equal(h.calls.list, 0, "id sai dinh dang thi khong duoc goi backend");
});

test("1d. detail backend 404 (so vua bi ha xuat ban, list cache con cu) -> 404", async (t) => {
  const h = makeService({ state: { versionStatus: { [ID_A]: 404 } } });
  t.after(h.cleanup);
  const r = await h.svc.serveCoverThumb({ publicId: ID_A, sizeRaw: undefined, ip: "1.2.3.4" });
  assert.equal(r.status, 404);
  assert.equal(h.calls.render, 0);
});

test("1e. size sai -> 400, KHONG goi backend, KHONG render, KHONG tao file", async (t) => {
  const h = makeService();
  t.after(h.cleanup);
  for (const bad of ["200", "8000", "abc", "400.5", " 400", "400 ", "-400", "0"]) {
    const r = await h.svc.serveCoverThumb({ publicId: ID_A, sizeRaw: bad, ip: "1.2.3.4" });
    assert.equal(r.status, 400, `size=${JSON.stringify(bad)} phai 400`);
  }
  assert.equal(h.calls.list, 0, "size sai thi khong duoc goi backend");
  assert.equal(h.calls.version, 0);
  assert.equal(h.calls.pdf, 0);
  assert.equal(h.calls.render, 0, "size sai thi TUYET DOI khong duoc dung anh");
  assert.deepEqual(h.files(), []);
});

test("1f. size hop le: mac dinh 400 (dpi 50), ?size=800 (dpi 100) -> 200 + image/jpeg", async (t) => {
  const h = makeService();
  t.after(h.cleanup);
  const r400 = await h.svc.serveCoverThumb({ publicId: ID_A, sizeRaw: undefined, ip: "1.2.3.4" });
  assert.equal(r400.status, 200);
  assert.equal(r400.contentType, "image/jpeg");
  assert.ok(r400.body.equals(FAKE_JPEG));
  const r800 = await h.svc.serveCoverThumb({ publicId: ID_A, sizeRaw: "800", ip: "1.2.3.4" });
  assert.equal(r800.status, 200);
  assert.equal(r800.contentType, "image/jpeg");
  assert.deepEqual(h.renderDpis, [50, 100], "400 -> dpi 50, 800 -> dpi 100");
  assert.ok(h.files().some((f) => f.startsWith(`${ID_A}-400-`)), "phai co file cache 400 versioned");
  assert.ok(h.files().some((f) => f.startsWith(`${ID_A}-800-`)), "phai co file cache 800 versioned");
});

test("1g. goi lan 2 cung id+size -> phuc vu tu cache, khong render lai", async (t) => {
  const h = makeService();
  t.after(h.cleanup);
  await h.svc.serveCoverThumb({ publicId: ID_A, sizeRaw: undefined, ip: "1.2.3.4" });
  const r2 = await h.svc.serveCoverThumb({ publicId: ID_A, sizeRaw: undefined, ip: "1.2.3.4" });
  assert.equal(r2.status, 200);
  assert.equal(h.calls.render, 1, "lan 2 phai lay tu cache");
  assert.equal(r2._origin, "cached");
});

test("2a. gioi han dong thoi: 5 request cung luc -> toi da 2 render, thu tu FIFO", async (t) => {
  const gates = [deferred(), deferred(), deferred(), deferred(), deferred()];
  const h = makeService({
    state: {
      renderImpl: (_pdf, _dpi, seq) => gates[seq].promise,
    },
  });
  t.after(h.cleanup);
  const ids = [ID_A, ID_B, ID_C, ID_A, ID_B];
  const sizes = [undefined, undefined, undefined, "800", "800"];
  // ID_A/800 va ID_B/800 la cache-miss khac voi 400 nen cung render.
  const pending = ids.map((id, i) => h.svc.serveCoverThumb({ publicId: id, sizeRaw: sizes[i], ip: "1.2.3.4" }));
  await tick(20);
  assert.equal(h.maxActiveRenders, 2, "khong bao gio qua 2 render dong thoi");
  assert.deepEqual(h.startOrder, [0, 1], "2 request dau vao render truoc");
  gates[0].resolve(FAKE_JPEG);
  await tick(20);
  assert.deepEqual(h.startOrder, [0, 1, 2], "request thu 3 chi bat dau sau khi 1 slot trong (FIFO)");
  assert.equal(h.maxActiveRenders, 2);
  gates[1].resolve(FAKE_JPEG);
  await tick(20);
  assert.deepEqual(h.startOrder, [0, 1, 2, 3], "request thu 4 vao tiep theo thu tu");
  gates[2].resolve(FAKE_JPEG);
  await tick(20);
  assert.deepEqual(h.startOrder, [0, 1, 2, 3, 4]);
  gates[3].resolve(FAKE_JPEG);
  gates[4].resolve(FAKE_JPEG);
  const results = await Promise.all(pending);
  assert.ok(results.every((r) => r.status === 200), "ca 5 request deu tra 200");
  assert.equal(h.maxActiveRenders, 2, "xuyen suot khong qua 2 render dong thoi");
});

test("2b. rate limit theo IP: qua nguong -> anh du phong (200 + header), IP khac khong bi anh huong", async (t) => {
  const h = makeService({ options: { rateMax: 3, rateWindowMs: 60000 } });
  t.after(h.cleanup);
  // 3 luot render dau OK (3 id khac nhau de khong dinh cache).
  for (const id of [ID_A, ID_B, ID_C]) {
    const r = await h.svc.serveCoverThumb({ publicId: id, sizeRaw: undefined, ip: "9.9.9.9" });
    assert.equal(r.status, 200);
    assert.equal(r._origin, "rendered");
  }
  // Luot thu 4 cung IP: het han muc -> fallback, KHONG render.
  const over = await h.svc.serveCoverThumb({ publicId: ID_A, sizeRaw: "800", ip: "9.9.9.9" });
  assert.equal(over.status, 200, "qua nguong van tra 200 anh du phong (the <img> khong co onerror)");
  assert.equal(over.headers["X-Cover-Fallback"], "rate-limited");
  assert.ok(over.body.equals(FALLBACK.body));
  assert.equal(h.calls.render, 3, "luot bi chan khong duoc render");
  // IP khac van render binh thuong.
  const other = await h.svc.serveCoverThumb({ publicId: ID_A, sizeRaw: "800", ip: "8.8.8.8" });
  assert.equal(other._origin, "rendered");
  assert.equal(h.calls.render, 4);
});

test("2c. hang doi day -> anh du phong ngay, khong cho doi", async (t) => {
  const gate = deferred();
  const h = makeService({
    options: { maxConcurrent: 1, maxQueue: 1 },
    state: { renderImpl: () => gate.promise },
  });
  t.after(h.cleanup);
  const p1 = h.svc.serveCoverThumb({ publicId: ID_A, sizeRaw: undefined, ip: "1.1.1.1" });
  await tick(20); // p1 chiem slot duy nhat
  const p2 = h.svc.serveCoverThumb({ publicId: ID_B, sizeRaw: undefined, ip: "1.1.1.1" });
  await tick(20); // p2 vao hang doi (1 cho)
  const p3 = h.svc.serveCoverThumb({ publicId: ID_C, sizeRaw: undefined, ip: "1.1.1.1" });
  const r3 = await Promise.race([p3, new Promise((res) => setTimeout(() => res("TIMEOUT"), 2000))]);
  assert.notEqual(r3, "TIMEOUT", "hang doi day phai tra ngay, khong treo");
  assert.equal(r3.headers["X-Cover-Fallback"], "queue-full");
  assert.ok(r3.body.equals(FALLBACK.body));
  gate.resolve(FAKE_JPEG);
  const [r1, r2] = await Promise.all([p1, p2]);
  assert.equal(r1.status, 200);
  assert.equal(r2.status, 200);
});

test("2d. cho slot qua 15s (o day thu voi 50ms) -> anh du phong queue-timeout, slot van duoc giai phong", async (t) => {
  const gate = deferred();
  const h = makeService({
    options: { maxConcurrent: 1, maxQueue: 8, queueWaitMs: 50 },
    state: { renderImpl: () => gate.promise },
  });
  t.after(h.cleanup);
  const p1 = h.svc.serveCoverThumb({ publicId: ID_A, sizeRaw: undefined, ip: "1.1.1.1" });
  await tick(20);
  const r2 = await h.svc.serveCoverThumb({ publicId: ID_B, sizeRaw: undefined, ip: "1.1.1.1" });
  assert.equal(r2.headers["X-Cover-Fallback"], "queue-timeout");
  assert.ok(r2.body.equals(FALLBACK.body));
  // Giai phong slot: request sau van render duoc (khong ket slot).
  gate.resolve(FAKE_JPEG);
  await p1;
  const r3 = await h.svc.serveCoverThumb({ publicId: ID_C, sizeRaw: undefined, ip: "1.1.1.1" });
  assert.equal(r3._origin, "rendered", "slot phai duoc giai phong sau khi render xong");
});

test("2e. loi render (pdftoppm loi / PDF loi) -> anh du phong, request khong treo", async (t) => {
  const h = makeService({ state: { renderImpl: () => { throw new Error("pdftoppm exit 1"); } } });
  t.after(h.cleanup);
  const r = await Promise.race([
    h.svc.serveCoverThumb({ publicId: ID_A, sizeRaw: undefined, ip: "1.2.3.4" }),
    new Promise((res) => setTimeout(() => res("TIMEOUT"), 5000)),
  ]);
  assert.notEqual(r, "TIMEOUT", "loi render khong duoc treo request");
  assert.equal(r.status, 200);
  assert.equal(r.headers["X-Cover-Fallback"], "render-error");
  assert.ok(r.body.equals(FALLBACK.body));
  assert.equal(h.calls.render, 1);
  // Loi khong duoc cache: lan sau van thu render lai.
  const r2 = await h.svc.serveCoverThumb({ publicId: ID_A, sizeRaw: undefined, ip: "1.2.3.4" });
  assert.equal(r2.headers["X-Cover-Fallback"], "render-error");
  assert.equal(h.calls.render, 2, "loi render khong duoc cache");
});

test("2f. loi tai PDF -> anh du phong, khong treo", async (t) => {
  const h = makeService({ state: { fetchPdfImpl: () => { throw new Error("pdf 404"); } } });
  t.after(h.cleanup);
  const r = await h.svc.serveCoverThumb({ publicId: ID_A, sizeRaw: undefined, ip: "1.2.3.4" });
  assert.equal(r.status, 200);
  assert.equal(r.headers["X-Cover-Fallback"], "render-error");
});

test("3a. doi fingerprint PDF -> cache key doi -> render lai + don file cu", async (t) => {
  const h = makeService({ options: { metaTtlMs: 1 } });
  t.after(h.cleanup);
  const r1 = await h.svc.serveCoverThumb({ publicId: ID_A, sizeRaw: undefined, ip: "1.2.3.4" });
  assert.equal(r1._origin, "rendered");
  const oldFiles = h.files();
  assert.equal(oldFiles.length, 1);
  assert.ok(oldFiles[0].includes("1000-111"), "ten file phai chua fingerprint cu");
  // PDF bi thay: backend tra fingerprint moi.
  h.state.versions[ID_A] = "9999-999";
  await new Promise((r) => setTimeout(r, 5)); // het TTL meta 1ms
  const r2 = await h.svc.serveCoverThumb({ publicId: ID_A, sizeRaw: undefined, ip: "1.2.3.4" });
  assert.equal(r2._origin, "rendered", "doi PDF thi phai render lai, khong lay anh cu");
  assert.equal(h.calls.render, 2);
  const newFiles = h.files();
  assert.equal(newFiles.length, 1, "file cache cu phai duoc don");
  assert.ok(newFiles[0].includes("9999-999"), "ten file moi phai chua fingerprint moi");
  assert.ok(!newFiles[0].includes("1000-111"));
  // Lan 3 cung fingerprint moi -> lay tu cache.
  const r3 = await h.svc.serveCoverThumb({ publicId: ID_A, sizeRaw: undefined, ip: "1.2.3.4" });
  assert.equal(r3._origin, "cached");
  assert.equal(h.calls.render, 2);
});

test("3b. fingerprint that: ten file = <id>-<size>-<size>-<mtimeMs>.jpg (kieu backend)", async (t) => {
  const h = makeService();
  t.after(h.cleanup);
  await h.svc.serveCoverThumb({ publicId: ID_A, sizeRaw: "800", ip: "1.2.3.4" });
  assert.deepEqual(h.files(), [`${ID_A}-800-1000-111.jpg`]);
});

test("4a. warmup: render san 2 size cho 10 so moi nhat; lan 2 khong render lai", async (t) => {
  const h = makeService();
  t.after(h.cleanup);
  const s1 = await h.svc.warmupCovers(10);
  assert.equal(s1.rendered, 6, "3 so x 2 size = 6 render");
  assert.equal(s1.cached, 0);
  assert.equal(s1.failed, 0);
  assert.equal(h.files().length, 6);
  const s2 = await h.svc.warmupCovers(10);
  assert.equal(s2.rendered, 0, "lan 2 tat ca da co san");
  assert.equal(s2.cached, 6);
  assert.equal(h.calls.render, 6);
});

test("4b. warmup chi lay 10 so moi nhat (sap xep nhu home.js) du list dai hon", async (t) => {
  // 12 id hex hop le (24 ky tu), ngay phat hanh phan biet qua fixture.
  const realIds = Array.from({ length: 12 }, (_, i) => (i + 10).toString(16).padStart(24, "a"));
  const h = makeService({
    state: {
      publishedIds: realIds,
      versions: Object.fromEntries(realIds.map((id) => [id, "1-1"])),
    },
  });
  t.after(h.cleanup);
  const s = await h.svc.warmupCovers(10);
  assert.equal(s.rendered, 20, "chi 10 so x 2 size");
  assert.equal(h.files().length, 20);
});

test("5a. backend list loi + chua co cache -> 502; list cu con dung duoc khi fetch loi", async (t) => {
  const h = makeService({ options: { metaTtlMs: 1 } });
  t.after(h.cleanup);
  h.state.listOk = false;
  const r = await h.svc.serveCoverThumb({ publicId: ID_A, sizeRaw: undefined, ip: "1.2.3.4" });
  assert.equal(r.status, 502, "chua co du lieu gi ma backend loi thi 502");
  // Nap cache thanh cong 1 lan, sau do backend loi -> dung list cu.
  h.state.listOk = true;
  const ok = await h.svc.serveCoverThumb({ publicId: ID_A, sizeRaw: undefined, ip: "1.2.3.4" });
  assert.equal(ok.status, 200);
  h.state.listOk = false;
  await new Promise((r) => setTimeout(r, 5)); // het TTL meta
  const stale = await h.svc.serveCoverThumb({ publicId: ID_B, sizeRaw: undefined, ip: "1.2.3.4" });
  assert.equal(stale.status, 200, "list cu van phuc vu khi backend loi tam thoi");
  const stale404 = await h.svc.serveCoverThumb({ publicId: ID_MISSING, sizeRaw: undefined, ip: "1.2.3.4" });
  assert.equal(stale404.status, 404, "list cu van chan id khong xuat ban");
});

test("5b. render that bang pdftoppm: PDF mau -> JPEG that, 800 lon hon 400", async (t) => {
  const pdfPath = path.join(root, "storage-seed", "epaper", "2026", "10", "1", "original.pdf");
  const pdf = fs.readFileSync(pdfPath);
  let jpg400, jpg800;
  try {
    jpg400 = await renderPdfPageToJpeg(pdf, 50);
    jpg800 = await renderPdfPageToJpeg(pdf, 100);
  } catch (e) {
    if (/ENOENT/.test(e.message || "")) { t.skip("pdftoppm khong co san tren may nay"); return; }
    throw e;
  }
  assert.equal(jpg400[0], 0xff);
  assert.equal(jpg400[1], 0xd8, "dpi 50 phai tra JPEG that");
  assert.equal(jpg800[0], 0xff);
  assert.equal(jpg800[1], 0xd8, "dpi 100 phai tra JPEG that");
  assert.ok(jpg800.length > jpg400.length, `800 (${jpg800.length}B) phai lon hon 400 (${jpg400.length}B)`);
});

test("6. IP client: uu tien X-Forwarded-For dau tien, roi moi socket", () => {
  assert.equal(coverThumbClientIp({ headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.1" }, socket: { remoteAddress: "10.0.0.2" } }), "203.0.113.7");
  assert.equal(coverThumbClientIp({ headers: {}, socket: { remoteAddress: "10.0.0.2" } }), "10.0.0.2");
  assert.equal(coverThumbClientIp({ headers: {}, socket: {} }), "unknown");
});

test("source: server noi service siet vao route + srcset 800 qua cover-thumb + warmup luc khoi dong", () => {
  assert.ok(server.includes("createCoverThumbService"), "server phai import service siet cover-thumb");
  assert.ok(server.includes("coverThumbService.serveCoverThumb"), "route /cover-thumb phai goi service");
  assert.ok(server.includes('u.searchParams.get("size")'), "route phai doc ?size=");
  assert.ok(server.includes("coverThumbClientIp(req)"), "route phai lay IP client cho rate limit");
  assert.ok(server.includes("?size=800 800w"), "coverSrcset 800w phai qua /cover-thumb?size=800 (co siet), khong qua /cover");
  assert.ok(server.includes("warmupCovers(10)"), "khoi dong phai warmup 10 so moi nhat");
  assert.ok(server.includes("cover-fallback.svg"), "phai co anh du phong tinh");
  assert.ok(coverLib.includes("X-Cover-Fallback"), "loi render phai danh dau bang header X-Cover-Fallback");
  assert.equal(COVER_THUMB_MAX_CONCURRENT, 2, "toi da 2 render dong thoi");
  assert.ok(!server.includes('serveEpaperCover(res, publicId, 50, `${publicId}-400.jpg`)'), "route thumb cu (khong siet) phai duoc thay");
  const fallback = fs.readFileSync(path.join(root, "public", "img", "cover-fallback.svg"));
  assert.ok(fallback.length > 0 && fallback.length < 4096, "file fallback phai nho (<4KB)");
  assert.ok(fallback.toString("utf8").includes("<svg"), "fallback phai la SVG");
  assert.ok(!homeJs.includes("/cover 800w"), "home.js khong con dung /cover cho srcset 800w");
});
