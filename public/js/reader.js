import * as pdfjs from "/vendor/pdfjs.mjs";
import {
  zoomIn, zoomOut, canPan, parsePageInput, displayForFlipIndex, scrollAfterZoom, zoomLabel,
  readBaseDpi, cappedReadScale, sharpReadScale,
} from "./viewer-logic.js";

pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdf.worker.mjs";

// Stage 2: issue ID is the LAST number in the slug (/bao-tuyen-quang-so-319-1.html -> id 1,
// NOT 319 — Stage 1 used id == number, the real DB does not).
const m = location.pathname.match(/-(\d+)\.html$/);
const issueId = m ? Number(m[1]) : Number(new URLSearchParams(location.search).get("issue") || 0);
const res = await fetch(`/api/v1/issues/${issueId}`);
// Public reader: so da xuat ban khong can login; so nhap/cho duyet van 403 o server.
if (!res.ok) { document.getElementById("title").textContent = "Không tìm thấy số báo hoặc không có quyền xem."; throw new Error("issue not found"); }
const issue = await res.json();
document.getElementById("title").textContent = issue.title;
if (issue.can_download) { document.getElementById("download").href = `/api/v1/issues/${issueId}/download`; document.getElementById("download").textContent = "Tải PDF gốc"; }
else document.getElementById("download").remove();
const total = issue.pages.length;
const $ = (id) => document.getElementById(id);

// ---------- Flip mode (F1-F5, F8) ----------
let portrait = window.innerWidth < 700; // 1 page on portrait/mobile by default
let lockedMode = null; // F5: once the user toggles, do NOT auto-revert on navigation/resize
let flip = null;
let currentIndex = 0;
// Flip zoom kieu DearFlip/TQ: cuon = zoom x1.5/nac, dang zoom keo = pan, chua zoom keo = lat.
// Zoom bang CSS transform tren sach (khong re-init PageFlip moi nac, tranh animation lat lai
// ve trang hien tai); khi zoom > 1, lop phu chan su kien cua PageFlip de keo thanh pan.
let flipZoom = 1, flipBaseW = 0, flipBaseH = 0;
const flipWrap = $("flip-wrap"), flipBook = $("flip-book"), flipZoomWrap = $("flip-zoom-wrap"), flipOverlay = $("flip-pan-overlay");
function applyFlipZoom() {
  if (!flipBaseW) { flipBaseW = flipBook.offsetWidth || 500; flipBaseH = flipBook.offsetHeight || 707; }
  flipZoomWrap.style.width = `${(flipBaseW * flipZoom).toFixed(1)}px`;
  flipZoomWrap.style.height = `${(flipBaseH * flipZoom).toFixed(1)}px`;
  flipBook.style.transform = `scale(${flipZoom})`;
  flipOverlay.style.display = canPan(flipZoom) ? "block" : "none";
  flipWrap.style.cursor = canPan(flipZoom) ? "grab" : "default";
  const zl = $("flip-zoom-label"); if (zl) zl.textContent = zoomLabel(flipZoom);
}
function stepFlipZoom(dir, cursorX, cursorY) {
  const next = dir > 0 ? zoomIn(flipZoom) : zoomOut(flipZoom);
  if (next === flipZoom) return;
  const rect = flipWrap.getBoundingClientRect();
  const mx = (cursorX ?? rect.left + rect.width / 2) - rect.left;
  const my = (cursorY ?? rect.top + rect.height / 2) - rect.top;
  const oldW = flipBaseW * flipZoom, oldH = flipBaseH * flipZoom;
  flipZoom = next; applyFlipZoom();
  flipWrap.scrollLeft = scrollAfterZoom({ scroll: flipWrap.scrollLeft, cursor: mx, oldSize: oldW, newSize: flipBaseW * flipZoom, viewport: flipWrap.clientWidth });
  flipWrap.scrollTop = scrollAfterZoom({ scroll: flipWrap.scrollTop, cursor: my, oldSize: oldH, newSize: flipBaseH * flipZoom, viewport: flipWrap.clientHeight });
}

function renderThumbs() {
  $("thumbs").innerHTML = issue.pages.map((p, i) =>
    `<img src="${p.thumb}" data-i="${i}" alt="Trang ${p.page_number}" class="${i === currentIndex ? "active" : ""}">`).join("");
  $("thumbs").querySelectorAll("img").forEach((img) =>
    img.onclick = () => { flip.turnToPage(Number(img.dataset.i)); });
}
function updateLabel() {
  const d = displayForFlipIndex(currentIndex, total, portrait);
  $("page-label").textContent = `/ ${total}`;
  $("page-input").value = d.current;
  $("page-mode").textContent = `Chế độ: ${portrait ? "1 trang" : "2 trang"}`;
  renderThumbs();
}
function initFlip() {
  if (flip) flip.destroy();
  flip = new St.PageFlip($("flip-book"), {
    width: 500, height: 707, size: "stretch",
    minWidth: 300, maxWidth: 1000, minHeight: 424, maxHeight: 1414,
    showCover: true, // F8: cover + last page single, NO padding page
    flippingTime: 800, usePortrait: portrait, drawShadow: true,
  });
  flip.loadFromImages(issue.pages.map((p) => p.flip));
  flip.on("flip", (e) => { currentIndex = e.data; updateLabel(); });
  flip.turnToPage(currentIndex);
  updateLabel();
  flipZoom = 1; flipBaseW = flipBook.offsetWidth || 500; flipBaseH = flipBook.offsetHeight || 707; applyFlipZoom();
}
$("page-mode").onclick = () => {
  lockedMode = portrait ? "spread" : "single";
  portrait = !portrait; initFlip();
};
window.addEventListener("resize", () => {
  // Auto portrait only before the user locks a mode (F5).
  if (lockedMode) return;
  const p = window.innerWidth < 700;
  if (p !== portrait) { portrait = p; initFlip(); }
});
$("prev").onclick = () => flip.flipPrev();
$("next").onclick = () => flip.flipNext();
$("first").onclick = () => flip.turnToPage(0);
$("last").onclick = () => flip.turnToPage(total - 1);
$("page-input").onchange = (e) => {
  const n = parsePageInput(e.target.value, total);
  if (n === null) { alert(`Nhập số trang từ 1 đến ${total}.`); updateLabel(); return; }
  flip.turnToPage(n - 1); // StPageFlip is 0-based
};
document.addEventListener("keydown", (e) => {
  if ($("read-wrap").style.display === "block" || e.target.tagName === "INPUT") return;
  if (e.key === "ArrowLeft") flip.flipPrev();
  if (e.key === "ArrowRight") flip.flipNext();
});
$("fullscreen").onclick = () =>
  document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();

// ---------- Flip zoom + pan (kieu TQ) ----------
flipWrap.addEventListener("wheel", (e) => {
  if ($("read-wrap").style.display === "block") return;
  e.preventDefault(); // cuon = zoom, khong cuon trang web, khong lat trang
  stepFlipZoom(e.deltaY < 0 ? 1 : -1, e.clientX, e.clientY);
}, { passive: false });
$("flip-zoom-in").onclick = () => stepFlipZoom(1);
window.addEventListener("resize", () => {
  if (!flip || $("read-wrap").style.display === "block") return;
  if (flipZoom !== 1) { flipZoom = 1; }
  flipBaseW = flipBook.offsetWidth || flipBaseW || 500;
  flipBaseH = flipBook.offsetHeight || flipBaseH || 707;
  applyFlipZoom();
});
$("flip-zoom-out").onclick = () => stepFlipZoom(-1);
let flipDragging = null;
flipOverlay.addEventListener("mousedown", (e) => {
  if (!canPan(flipZoom)) return;
  flipDragging = { x: e.clientX, y: e.clientY, sl: flipWrap.scrollLeft, st: flipWrap.scrollTop };
  flipOverlay.classList.add("panning");
});
window.addEventListener("mousemove", (e) => {
  if (!flipDragging) return;
  flipWrap.scrollLeft = flipDragging.sl - (e.clientX - flipDragging.x);
  flipWrap.scrollTop = flipDragging.st - (e.clientY - flipDragging.y);
});
window.addEventListener("mouseup", () => { flipDragging = null; flipOverlay.classList.remove("panning"); });
// Toolbar kieu TQ: thumbnail trai, canh trang, chia se, menu ...
$("thumbs-toggle").onclick = () => $("thumbs-panel").classList.toggle("hidden");
$("thumbs-close").onclick = () => $("thumbs-panel").classList.add("hidden");
$("flip-prev-edge").onclick = () => flip.flipPrev();
$("flip-next-edge").onclick = () => flip.flipNext();
async function shareIssue() {
  const url = location.href;
  try {
    if (navigator.share) { await navigator.share({ title: issue.title, url }); return; }
  } catch { /* roi xuong Facebook sharer */ }
  window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, "_blank");
}
$("share").onclick = shareIssue;
$("share-toolbar").onclick = shareIssue;
$("more").onclick = (e) => { e.stopPropagation(); $("more-menu").hidden = !$("more-menu").hidden; };
document.addEventListener("click", (e) => {
  const m = $("more-menu");
  if (!m.hidden && !m.contains(e.target) && e.target.id !== "more") m.hidden = true;
});

// ---------- Read mode (G1-G5, G7, G8) ----------
let pdfDoc = null, readPage = 1, zoom = 1;
let renderedScale = 0, renderToken = 0, sharpTimer = null;
const scrollEl = $("read-scroll"), canvas = $("read-canvas"), ctx = canvas.getContext("2d");
function readBaseScale(page) {
  const pt = page.getViewport({ scale: 1 });
  const isMobile = window.innerWidth < 700; // same threshold as portrait mode
  return cappedReadScale(pt.width, pt.height, readBaseDpi(isMobile));
}
async function renderReadPage() {
  if (sharpTimer) { clearTimeout(sharpTimer); sharpTimer = null; }
  const token = ++renderToken;
  if (!pdfDoc) pdfDoc = await pdfjs.getDocument(issue.pdf_url).promise;
  const page = await pdfDoc.getPage(readPage);
  if (token !== renderToken) return; // page changed while loading
  // Render once at base dpi (300 desktop / 200 mobile, pixel-capped);
  // wheel/button zoom then CSS-scales the rendered page instantly, it
  // never CSS-transforms the whole book (G8). A sharper re-render only
  // happens after zoom settles (see scheduleSharpRender).
  const scale = readBaseScale(page);
  const vp = page.getViewport({ scale });
  canvas.width = vp.width; canvas.height = vp.height;
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  if (token !== renderToken) return;
  renderedScale = scale;
  zoom = 1; applyZoom(); // G5: new page resets zoom to fit
}
// After zoom settles (200ms without another zoom step), re-render only if
// the current intrinsic resolution is no longer sharp at this zoom.
// At zoom 1-2.25 on desktop this is a no-op (300 dpi already covers it),
// so most wheel steps stay at CSS-transform speed, no 0.5-2s re-render.
function scheduleSharpRender() {
  if (sharpTimer) clearTimeout(sharpTimer);
  sharpTimer = setTimeout(async () => {
    sharpTimer = null;
    const token = renderToken, pageNo = readPage, zoomAtSchedule = zoom;
    if ($("read-wrap").style.display !== "block") return;
    try {
      const page = await pdfDoc.getPage(pageNo);
      if (token !== renderToken || pageNo !== readPage || zoom !== zoomAtSchedule) return;
      const pt = page.getViewport({ scale: 1 });
      const baseScale = readBaseScale(page);
      const fitW = scrollEl.clientWidth - 32;
      const target = sharpReadScale({
        pageWidthPt: pt.width, pageHeightPt: pt.height,
        fitWidth: fitW, zoom, dpr: window.devicePixelRatio || 1, baseScale,
      });
      if (target <= renderedScale * 1.05) return; // already sharp enough
      // Preserve the reading position across the re-render.
      const rx = scrollEl.scrollWidth ? scrollEl.scrollLeft / scrollEl.scrollWidth : 0;
      const ry = scrollEl.scrollHeight ? scrollEl.scrollTop / scrollEl.scrollHeight : 0;
      const vp = page.getViewport({ scale: target });
      canvas.width = vp.width; canvas.height = vp.height;
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      if (token !== renderToken || pageNo !== readPage) return;
      renderedScale = target;
      applyZoom();
      scrollEl.scrollLeft = rx * scrollEl.scrollWidth;
      scrollEl.scrollTop = ry * scrollEl.scrollHeight;
    } catch { /* keep the CSS-scaled page; sharpness is not fatal */ }
  }, 200);
}
function applyZoom() {
  // Fit width: canvas CSS width follows the scroll container, times zoom.
  const fitW = Math.min(scrollEl.clientWidth - 32, canvas.width);
  canvas.style.width = `${(fitW * zoom).toFixed(1)}px`;
  canvas.style.height = "auto";
  $("zoom-label").textContent = zoomLabel(zoom);
  scrollEl.style.cursor = canPan(zoom) ? "grab" : "default";
}
function stepZoom(dir, cursorX, cursorY) {
  const next = dir > 0 ? zoomIn(zoom) : zoomOut(zoom);
  if (next === zoom) return;
  const rect = scrollEl.getBoundingClientRect();
  const mx = (cursorX ?? rect.left + rect.width / 2) - rect.left;
  const my = (cursorY ?? rect.top + rect.height / 2) - rect.top;
  const oldW = canvas.offsetWidth, oldH = canvas.offsetHeight;
  zoom = next; applyZoom();
  scheduleSharpRender();
  scrollEl.scrollLeft = scrollAfterZoom({ scroll: scrollEl.scrollLeft, cursor: mx, oldSize: oldW, newSize: canvas.offsetWidth, viewport: scrollEl.clientWidth });
  scrollEl.scrollTop = scrollAfterZoom({ scroll: scrollEl.scrollTop, cursor: my, oldSize: oldH, newSize: canvas.offsetHeight, viewport: scrollEl.clientHeight });
}
scrollEl.addEventListener("wheel", (e) => {
  e.preventDefault(); // G2: wheel = zoom, never page flip
  stepZoom(e.deltaY < 0 ? 1 : -1, e.clientX, e.clientY);
}, { passive: false });
$("zoom-in").onclick = () => stepZoom(1);
$("zoom-out").onclick = () => stepZoom(-1);
// G4: drag = pan ONLY while zoomed; at fit, drag does nothing (flip lives in Flip mode).
let dragging = null;
scrollEl.addEventListener("mousedown", (e) => {
  if (!canPan(zoom)) return;
  dragging = { x: e.clientX, y: e.clientY, sl: scrollEl.scrollLeft, st: scrollEl.scrollTop };
  scrollEl.classList.add("panning");
});
window.addEventListener("mousemove", (e) => {
  if (!dragging) return;
  scrollEl.scrollLeft = dragging.sl - (e.clientX - dragging.x);
  scrollEl.scrollTop = dragging.st - (e.clientY - dragging.y);
});
window.addEventListener("mouseup", () => { dragging = null; scrollEl.classList.remove("panning"); });

async function enterRead() {
  $("reader-body").style.display = "none"; $("flip-toolbar").style.display = "none";
  $("read-wrap").style.display = "block";
  readPage = currentIndex + 1; await renderReadPage(); // G1: same page
}
function exitRead() {
  $("read-wrap").style.display = "none";
  $("reader-body").style.display = "flex"; $("flip-toolbar").style.display = "flex";
  flip.turnToPage(readPage - 1); // G1: back to the exact page
}
$("mode-read").onclick = enterRead;
$("read-exit").onclick = exitRead;
const modeFlipBtn = $("mode-flip"); if (modeFlipBtn) modeFlipBtn.onclick = () => { if ($("read-wrap").style.display === "block") exitRead(); };
$("read-prev").onclick = async () => { if (readPage > 1) { readPage--; await renderReadPage(); } };
$("read-next").onclick = async () => { if (readPage < total) { readPage++; await renderReadPage(); } };
// Double-click a flip page also enters Read mode (G1). Nghe ca tren flip-area
// vi PageFlip co the chan dblclick ngay tren sach.
$("flip-book").addEventListener("dblclick", enterRead);
$("flip-area").addEventListener("dblclick", (e) => {
  if ($("read-wrap").style.display !== "block" && !canPan(flipZoom)) enterRead();
});

initFlip();
