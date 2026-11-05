// Unit tests for the EPG thumbnail anti-overwrite memory (pure logic only
// — no network, no DB). Run: node --test test/epg-thumb-memory.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { createThumbMemoryStore, mergeThumbMemory } from "../lib/epg-thumb-memory.mjs";

const CH = "TUYENQUANG";
const START = "2026-11-05T10:30:00.000Z";

function item(overrides = {}) {
  return { title: "Ca nhac", startTime: START, endTime: "2026-11-05T11:00:00.000Z", thumbnail: "", thumbnailSmall: "", ...overrides };
}

test("merge: fresh thumbnails are kept and remembered", () => {
  const store = createThumbMemoryStore();
  const items = [item({ thumbnail: "https://x/t-1280.jpg", thumbnailSmall: "https://x/t-640.jpg" })];
  mergeThumbMemory(store, CH, items);
  assert.equal(items[0].thumbnail, "https://x/t-1280.jpg");
  assert.equal(items[0].thumbnailSmall, "https://x/t-640.jpg");
  assert.equal(store.size, 1);
});

test("merge: a later empty fetch does NOT overwrite a remembered thumbnail", () => {
  const store = createThumbMemoryStore();
  mergeThumbMemory(store, CH, [item({ thumbnail: "https://x/t-1280.jpg", thumbnailSmall: "https://x/t-640.jpg" })]);
  const later = [item()];
  mergeThumbMemory(store, CH, later);
  assert.equal(later[0].thumbnail, "https://x/t-1280.jpg");
  assert.equal(later[0].thumbnailSmall, "https://x/t-640.jpg");
});

test("merge: a fresh non-empty thumbnail wins over the remembered one", () => {
  const store = createThumbMemoryStore();
  mergeThumbMemory(store, CH, [item({ thumbnail: "https://x/old.jpg", thumbnailSmall: "https://x/old-s.jpg" })]);
  const later = [item({ thumbnail: "https://x/new.jpg", thumbnailSmall: "https://x/new-s.jpg" })];
  mergeThumbMemory(store, CH, later);
  assert.equal(later[0].thumbnail, "https://x/new.jpg");
  assert.equal(later[0].thumbnailSmall, "https://x/new-s.jpg");
  // And the new one is what the next empty fetch gets back.
  const third = [item()];
  mergeThumbMemory(store, CH, third);
  assert.equal(third[0].thumbnail, "https://x/new.jpg");
});

test("merge: partial memory fills only the empty field", () => {
  const store = createThumbMemoryStore();
  mergeThumbMemory(store, CH, [item({ thumbnail: "https://x/t-1280.jpg" })]);
  const later = [item({ thumbnailSmall: "https://x/t-640.jpg" })];
  mergeThumbMemory(store, CH, later);
  assert.equal(later[0].thumbnail, "https://x/t-1280.jpg");
  assert.equal(later[0].thumbnailSmall, "https://x/t-640.jpg");
});

test("merge: different programs/channels do not share memory", () => {
  const store = createThumbMemoryStore();
  mergeThumbMemory(store, CH, [item({ thumbnail: "https://x/t-1280.jpg" })]);
  const otherProgram = [item({ startTime: "2026-11-05T11:00:00.000Z" })];
  mergeThumbMemory(store, CH, otherProgram);
  assert.equal(otherProgram[0].thumbnail, "");
  const otherChannel = [item()];
  mergeThumbMemory(store, "OTHER", otherChannel);
  assert.equal(otherChannel[0].thumbnail, "");
});

test("merge: items without startTime are ignored, not crashed on", () => {
  const store = createThumbMemoryStore();
  const items = [{ title: "No time", thumbnail: "https://x/t.jpg" }];
  assert.doesNotThrow(() => mergeThumbMemory(store, CH, items));
  assert.equal(store.size, 0);
  assert.equal(mergeThumbMemory(store, CH, null), null);
});
