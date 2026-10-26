// Pure viewer logic, shared by the browser reader and the Node tests.
// No DOM here on purpose: StPageFlip internals are verified by real-mouse
// testing (work-table I1), these functions cover only OUR rules.
export const ZOOM_RATIO = 1.5; // G2/G3: one wheel step / +/- click = x1.5
export const MIN_ZOOM = 1; // 1 = fit-to-frame ("vua khung")
export const MAX_ZOOM = 5.0625; // 1.5^4: 4 steps 1 -> 1.5 -> 2.25 -> 3.375 -> 5.0625, locked at both ends (G2/G3)

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

// Fit-to-frame (nhu Tuyen Quang): o muc 100%, ca cuon sach phai nam tron
// trong khung trinh duyet, khong bi cat duoi/phai, khong phai cuon trang web.
// StPageFlip o che do "stretch" chi vua theo chieu rong (chieu cao theo ti le
// cua chieu rong), nen man hinh rong ma thap se tran chieu cao. Vi vay chieu
// rong sach phai lay theo ca hai chieu: min(rong kha dung, cao kha dung * ti le).
export const PAGE_W = 500, PAGE_H = 707;
export function fitBookWidth({ availW, availH, portrait }) {
  const ratio = portrait ? PAGE_W / PAGE_H : (2 * PAGE_W) / PAGE_H;
  const maxBook = portrait ? 1000 : 2000; // maxWidth moi trang la 1000
  return Math.max(1, Math.floor(Math.min(availW, availH * ratio, maxBook)));
}
// Bia (va trang cuoi le) cua StPageFlip nam o nua phai/trai cua spread, khong
// giua khung nhu Tuyen Quang. Khi o muc vua khung, dich sach sang trai/phai
// nua trang de trang don do nam giua khung. Chi ap dung o zoom = 1, che do
// 2 trang; o che do 1 trang, dang zoom, hoac spread doi thi khong dich.
export function singlePageShift({ currentIndex, total, portrait, zoom, bookWidth }) {
  if (portrait || zoom !== 1) return 0;
  if (currentIndex === 0) return -bookWidth / 4; // nua trang = bookWidth/2 / 2
  if (currentIndex === total - 1 && total % 2 === 0) return bookWidth / 4;
  return 0;
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

// Read mode rendering (2026-10-25 refinement, keeps the 300 dpi desktop
// decision for desktop, 200 dpi on mobile):
// - base dpi: 300 desktop, 200 mobile (<700px, same threshold as portrait)
// - total canvas pixels are capped so a large page cannot blow up memory
//   or hit a browser canvas limit; the scale is reduced proportionally,
//   keeping the page aspect ratio.
export const MAX_READ_PIXELS = 16777216; // 4096 x 4096
export const readBaseDpi = (isMobile) => (isMobile ? 200 : 300);
export function cappedReadScale(pageWidthPt, pageHeightPt, baseDpi) {
  const baseScale = baseDpi / 72;
  const pixels = pageWidthPt * pageHeightPt * baseScale * baseScale;
  if (pixels <= MAX_READ_PIXELS) return baseScale;
  return baseScale * Math.sqrt(MAX_READ_PIXELS / pixels);
}
// Sharp re-render after a zoom settles: the intrinsic width needed for a
// sharp display is fitWidth * zoom * dpr. Never render below the base
// scale (that would only lose quality), and never above the pixel cap.
// Returns the scale to render at; the caller skips the re-render when it
// is not meaningfully above the scale already rendered.
export function sharpReadScale({ pageWidthPt, pageHeightPt, fitWidth, zoom, dpr, baseScale }) {
  const desired = (fitWidth * zoom * dpr) / pageWidthPt;
  const capScale = Math.sqrt(MAX_READ_PIXELS / (pageWidthPt * pageHeightPt));
  return Math.min(capScale, Math.max(baseScale, desired));
}
