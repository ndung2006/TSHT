import test from "node:test";
import assert from "node:assert/strict";
import {
  zoomIn, zoomOut, canPan, canFlip, buildPageNumbers, parsePageInput,
  displayForFlipIndex, panAfterZoom, scrollFromPan, zoomLabel,
  readBaseDpi, cappedReadScale, sharpReadScale, MAX_READ_PIXELS,
} from "../public/js/viewer-logic.js";

test("wheel zoom steps x1.5 and locks at both ends (G2/G3)", () => {
  assert.equal(zoomIn(1), 1.5);
  assert.equal(zoomIn(1.5), 2.25);
  assert.equal(zoomOut(1.5), 1);
  assert.equal(zoomOut(1), 1); // locked at fit, no flip-by-wheel below fit
  assert.equal(zoomIn(3.375), 5.0625); // 4th x1.5 step reaches the max
  assert.equal(zoomIn(5.0625), 5.0625); // locked at max
  assert.equal(zoomOut(5.0625), 3.375);
  assert.equal(zoomLabel(1.5), "150%");
  assert.equal(zoomLabel(5.0625), "506%");
});

test("drag is pan only when zoomed, flip only at fit (G4/G8)", () => {
  assert.equal(canPan(1.5), true);
  assert.equal(canPan(1), false);
  assert.equal(canFlip(1), true);
  assert.equal(canFlip(1.5), false);
});

test("odd total has no padding page: list is exactly 1..N (F8)", () => {
  assert.deepEqual(buildPageNumbers(9), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(buildPageNumbers(12).length, 12);
  assert.throws(() => buildPageNumbers(0));
});

test("page input accepts only in-range integers (F3)", () => {
  assert.equal(parsePageInput("5", 9), 5);
  assert.equal(parsePageInput("0", 9), null);
  assert.equal(parsePageInput("10", 9), null);
  assert.equal(parsePageInput("abc", 9), null);
});

test("showCover display: cover and last page single, middle in spreads", () => {
  assert.deepEqual(displayForFlipIndex(0, 9, false).shown, [1]);
  assert.deepEqual(displayForFlipIndex(8, 9, false).shown, [9]);
  assert.deepEqual(displayForFlipIndex(1, 9, false).shown, [2, 3]);
  assert.deepEqual(displayForFlipIndex(2, 9, false).shown, [2, 3]);
  assert.deepEqual(displayForFlipIndex(0, 9, true).shown, [1]);
});

test("read render: 300 dpi desktop, 200 dpi mobile, pixel cap holds", () => {
  assert.equal(readBaseDpi(false), 300);
  assert.equal(readBaseDpi(true), 200);
  // A4 at 300 dpi: 595x842pt -> scale 4.17, ~8.7M px, under the cap.
  assert.ok(Math.abs(cappedReadScale(595, 842, 300) - 300 / 72) < 1e-9);
  // A3 at 300 dpi would be ~17.4M px, so it must be scaled down to the cap.
  const capped = cappedReadScale(842, 1191, 300);
  assert.ok(capped < 300 / 72);
  assert.ok(Math.abs(842 * 1191 * capped * capped - MAX_READ_PIXELS) < 1);
});

test("sharp re-render: no-op while base dpi already covers the zoom", () => {
  const base = cappedReadScale(595, 842, 300);
  const args = { pageWidthPt: 595, pageHeightPt: 842, fitWidth: 1000, dpr: 1, baseScale: base };
  assert.equal(sharpReadScale({ ...args, zoom: 1.5 }), base); // needs 1500px < 2480px
  assert.equal(sharpReadScale({ ...args, zoom: 2.25 }), base); // needs 2250px < 2480px
  // At zoom 4 the need (4000px) exceeds both base and the pixel cap.
  const at4 = sharpReadScale({ ...args, zoom: 4 });
  assert.ok(at4 > base);
  assert.ok(Math.abs(595 * 842 * at4 * at4 - MAX_READ_PIXELS) < 1);
});

test("wheel zoom-to-cursor: user formula keeps the cursor point fixed", () => {
  // mouse 200, oldPan 50, 1 -> 1.5: 200 - 150*1.5 = -25.
  // Kiem chung: diem duoi chuot (200-50)/1 = 150; sau zoom 150*1.5 + (-25) = 200.
  assert.equal(panAfterZoom({ mouse: 200, oldPan: 50, oldScale: 1, newScale: 1.5 }), -25);
  // Zoom-out ve fit: (200-(-100))/1.5 = 200; 200*1 + pan = 200 -> pan = 0.
  assert.ok(Math.abs(panAfterZoom({ mouse: 200, oldPan: -100, oldScale: 1.5, newScale: 1 })) < 1e-9);
  // Scroll tu pan, gioi han 2 dau.
  assert.equal(scrollFromPan({ origin: 16, pan: -426, maxScroll: 1000 }), 442);
  assert.equal(scrollFromPan({ origin: 16, pan: 500, maxScroll: 1000 }), 0); // pan vuot goc -> 0
  // O muc vua khung maxScroll = 0 -> scroll ve dung 0 (sach nam giua khung).
  assert.equal(scrollFromPan({ origin: 216, pan: 100, maxScroll: 0 }), 0);
  // Buoc zoom day du giu nguyen phan sach duoi chuot:
  // scroll 200, origin 16, mouse 300, co 1000 -> phan 0.484;
  // sau zoom 1.5 (co 1500, origin 16): scroll 442 -> (442+300-16)/1500 = 0.484.
  const oldPan = 16 - 200;
  const newPan = panAfterZoom({ mouse: 300, oldPan, oldScale: 1, newScale: 1.5 });
  assert.equal(newPan, -426);
  assert.equal(scrollFromPan({ origin: 16, pan: newPan, maxScroll: 5000 }), 442);
});
