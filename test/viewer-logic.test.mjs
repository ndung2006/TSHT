import test from "node:test";
import assert from "node:assert/strict";
import {
  zoomIn, zoomOut, canPan, canFlip, buildPageNumbers, parsePageInput,
  displayForFlipIndex, scrollAfterZoom, zoomLabel,
} from "../public/js/viewer-logic.js";

test("wheel zoom steps x1.5 and locks at both ends (G2/G3)", () => {
  assert.equal(zoomIn(1), 1.5);
  assert.equal(zoomIn(1.5), 2.25);
  assert.equal(zoomOut(1.5), 1);
  assert.equal(zoomOut(1), 1); // locked at fit, no flip-by-wheel below fit
  assert.equal(zoomIn(4), 4); // locked at max
  assert.equal(zoomLabel(1.5), "150%");
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

test("wheel zoom keeps the cursor point fixed, clamped into range", () => {
  // scroll 100, cursor 50px in, size doubles: (100+50)/1000*2000-50 = 250
  assert.equal(scrollAfterZoom({ scroll: 100, cursor: 50, oldSize: 1000, newSize: 2000, viewport: 800 }), 250);
  assert.equal(scrollAfterZoom({ scroll: 0, cursor: 0, oldSize: 1000, newSize: 500, viewport: 800 }), 0);
});
