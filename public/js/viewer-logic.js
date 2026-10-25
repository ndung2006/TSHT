// Pure viewer logic, shared by the browser reader and the Node tests.
// No DOM here on purpose: StPageFlip internals are verified by real-mouse
// testing (work-table I1), these functions cover only OUR rules.
export const ZOOM_RATIO = 1.5; // G2/G3: one wheel step / +/- click = x1.5
export const MIN_ZOOM = 1; // 1 = fit-to-frame ("vua khung")
export const MAX_ZOOM = 4; // locked at both ends (G2/G3)

export function zoomIn(z) {
  return Math.min(z * ZOOM_RATIO, MAX_ZOOM);
}
export function zoomOut(z) {
  return Math.max(z / ZOOM_RATIO, MIN_ZOOM);
}
// G4/G8: above fit, drag = pan and must NOT flip. At fit, drag = flip.
export const canPan = (z) => z > MIN_ZOOM;
export const canFlip = (z) => z === MIN_ZOOM;

// F8: NO padding page for odd totals. Page list is exactly 1..total,
// pdf_page_number === page_number, so the odd issue (9 pages) has no blank.
export function buildPageNumbers(total) {
  if (!Number.isInteger(total) || total < 1) throw new Error("total >= 1");
  return Array.from({ length: total }, (_, i) => i + 1);
}

// F3: page-number input. Returns a 1-based page or null when invalid.
export function parsePageInput(raw, total) {
  const n = Number(String(raw).trim());
  if (!Number.isInteger(n) || n < 1 || n > total) return null;
  return n;
}

// What the Flip toolbar shows for a 0-based StPageFlip index, with
// showCover:true (first and last pages single, middle pages in spreads).
export function displayForFlipIndex(index, total, portrait) {
  if (portrait) return { current: index + 1, shown: [index + 1] };
  if (index === 0) return { current: 1, shown: [1] };
  if (index === total - 1) return { current: total, shown: [total] };
  const shown =
    index % 2 === 1
      ? [index + 1, index + 2]
      : [index, index + 1];
  return { current: index + 1, shown: shown.filter((p) => p <= total) };
}

// Read-mode wheel zoom (G2): keep the point under the cursor fixed while
// the page resizes, then clamp the scroll position into the new range.
export function scrollAfterZoom({ scroll, cursor, oldSize, newSize, viewport }) {
  const ratio = (scroll + cursor) / oldSize;
  const next = ratio * newSize - cursor;
  return Math.max(0, Math.min(next, Math.max(0, newSize - viewport)));
}
export const zoomLabel = (z) => `${Math.round(z * 100)}%`;
