// Regression guard for the /nen-tang-so card-overlap bug (2026-11-06):
// the note after the short grid overlapped the last card's title because
// (a) .sv-thumb was an inline <span> so aspect-ratio: 2/3 was ignored
// and the card had no deterministic height, and (b) playable cards were
// <button> elements containing a block-level <h3> (invalid HTML — a
// button may only contain phrasing content), so the browser did not
// size the grid row to the full rendered title height. This test pins
// the structural fix in the page source (layout itself is verified by
// eye in a real browser after deploy).
// Run: node --test test/nen-tang-so-cards.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = fs.readFileSync(path.join(root, "public/nen-tang-so.html"), "utf8");

test("the anh .sv-thumb phai la block de aspect-ratio 2/3 co tac dung", () => {
  const rule = /\.sv-thumb \{([^}]*)\}/.exec(src);
  assert.ok(rule, "thieu quy tac .sv-thumb");
  assert.match(rule[1], /display:\s*block/);
  assert.match(rule[1], /aspect-ratio:\s*2\/3/);
  assert.match(rule[1], /overflow:\s*hidden/);
});

test("the phat duoc dung <span class=sv-title>, khong dung <h3> trong <button>", () => {
  // Template the: <button ... class="sv-card sv-playable" ...> + title span.
  assert.match(src, /<button type="button" class="sv-card sv-playable"/);
  assert.match(src, /if \(playId\) titleHtml = '<span class="sv-title" title="/);
  assert.doesNotMatch(src, /if \(playId\) titleHtml = '<h3/);
  assert.match(src, /<span class="sv-title" title="/);
  // The <a> giu <h3> binh thuong (hop le trong <a>).
  assert.match(src, /<h3 class="sv-title" title="/);
  // Tieu de the cat toi da 3 dong + title attr de re chuot thay du.
  const titleRule = /\.sv-card \.sv-title \{([^}]*)\}/.exec(src);
  assert.ok(titleRule, "thieu quy tac .sv-card .sv-title");
  assert.match(titleRule[1], /-webkit-line-clamp:\s*3/);
  assert.match(titleRule[1], /overflow:\s*hidden/);
});

test("luoi the tu gian theo noi dung; dong ghi chu nam sau luoi trong luong binh thuong", () => {
  const gridRule = /\.sv-grid \{([^}]*)\}/.exec(src);
  assert.ok(gridRule, "thieu quy tac .sv-grid");
  assert.match(gridRule[1], /align-items:\s*start/);
  const gridPos = src.indexOf('id="sv-grid"');
  const notePos = src.indexOf('<p class="note">');
  assert.ok(gridPos > 0 && notePos > gridPos, "ghi chu phai nam sau luoi the trong DOM");
  const noteRule = /\.platforms \.note \{([^}]*)\}/.exec(src);
  assert.ok(noteRule, "thieu quy tac .platforms .note");
  assert.match(noteRule[1], /margin-top:\s*1\.5rem/);
});
