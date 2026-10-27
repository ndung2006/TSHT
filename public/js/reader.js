import * as pdfjs from "/vendor/pdfjs.mjs?v=20261026-2";
import {
  zoomIn, zoomOut, canPan, parsePageInput, displayForFlipIndex, scrollAfterZoom, zoomLabel,
  fitBookWidth, singlePageShift, pdfZoomScale,
  readBaseDpi, cappedReadScale, sharpReadScale,
} from "./viewer-logic.js?v=20261026-2";

pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdf.worker.mjs";

// Stage 2: issue ID is the LAST number in the slug (/bao-tuyen-quang-so-319-1.html -> id 1,
// NOT 319 — Stage 1 used id == number, the real DB does not).
// He moi (tu 2026-10-27): URL /bao-in/bao-tuyen-quang-so-<so>-<publicId24hex>
// mo cung trinh doc nay; so moi khong co anh trang render san nen trinh
// doc tu render trang tu PDF (xem khoi isNew ben duoi). Duong cu van
// nguyen cho so cu.
const newMatch = location.pathname.match(/^\/bao-in\/bao-tuyen-quang-so-\d+-([0-9a-f]{24})$/);
const isNew = !!newMatch;
// Cache-buster cho request detail so moi: Cloudflare edge cache giu
// ban JSON cu (khong co `pages`) toi da 4h bat chap origin no-cache,
// nen trinh doc cu bi ket o nhanh fallback PDF.js du backend + proxy
// da co anh trang. Gan ?v= theo ban reader (doi moi lan sua reader)
// de edge coi la URL moi va tra JSON moi ngay. Proxy TSHT chi xet
// pathname nen query nay khong anh huong logic server.
const READER_BUILD = "20261027-5";
const m = location.pathname.match(/-(\d+)\.html$/);
const issueId = m ? Number(m[1]) : Number(new URLSearchParams(location.search).get("issue") || 0);
const res = await fetch(isNew ? `/api/v2/epaper/${newMatch[1]}?v=${READER_BUILD}` : `/api/v1/issues/${issueId}`);
// Public reader: so da xuat ban khong can login; so nhap/cho duyet van 403 o server.
if (!res.ok) { document.getElementById("title").textContent = "Không tìm thấy số báo hoặc không có quyền xem."; throw new Error("issue not found"); }
const issue = await res.json();
document.getElementById("title").textContent = issue.title;
if (issue.can_download) { document.getElementById("download").href = `/api/v1/issues/${issueId}/download`; document.getElementById("download").textContent = "Tải PDF gốc"; }
else document.getElementById("download").remove();
// Tien trinh tai + dung trang (hien o header, ke ben tieu de). Chi dung
// cho so moi; so cu van nap anh co san nhu cu.
const progressEl = document.getElementById("load-progress");
const setProgress = (s) => { if (progressEl) progressEl.textContent = s; };
let total;
// Doc PDF cua so moi, giu lai cho renderFlipProgressive() (fallback) o
// cuoi file. (Khong dung sharedPdfDoc o day vi no khai bao bang let
// ben duoi, gan trong khoi top-level se loi TDZ.)
// newPdfDoc === null nghia la che do anh server (Hybrid): khong tai
// PDF, khong dung bang PDF.js o muc fit.
let newPdfDoc = null;
if (isNew) {
  if (issue.pages && issue.pages.length > 0) {
    // Anh trang render san tu server (Hybrid): sach mo ngay tu anh
    // server (ca flip lan thumbnail), khong tai PDF, khong dung trang
    // bang PDF.js o muc fit. Zoom >100% van dung overlay PDF.js sac
    // net nhu cu (a7521df), che do Doc cung vay — PDF chi tai khi
    // zoom hoac sang che do Doc.
    total = issue.pages.length;
  } else {
    // Fallback (backend chua co anh): tai PDF co % tien trinh, dung dan
    // bang PDF.js — viec dung do renderFlipProgressive() o cuoi file
    // dam nhan, SAU KHI cac khai bao let/function ben duoi da chay
    // xong (goi initFlip() trong khoi top-level se loi TDZ).
    // So trang lay theo PDF that (doc.numPages), khong lay theo so
    // nhap tay neu lech — PDF la su that.
    let doc;
    try {
      setProgress("Đang tải file PDF…");
      const loadingTask = pdfjs.getDocument(issue.pdf_url);
      loadingTask.onProgress = (p) => {
        if (p.total > 0) setProgress(`Đang tải file PDF… ${Math.round((p.loaded / p.total) * 100)}%`);
        else setProgress(`Đang tải file PDF… ${(p.loaded / 1048576).toFixed(1)} MB`);
      };
      doc = await loadingTask.promise;
    }
    catch { setProgress(""); document.getElementById("title").textContent = "Không tải được file PDF của số báo."; throw new Error("pdf load failed"); }
    newPdfDoc = doc;
    total = doc.numPages;
    issue.pages = [];
  }
} else {
  total = issue.pages.length;
}
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
const flipPdfZoomEl = $("flip-pdf-zoom");
// PDF.js zoom overlay (nhu Foxit/TQ): PageFlip chi ve canvas o muc vua khung,
// phong CSS canvas do len se mo du anh nguon co net den dau. Vi vay khi zoom > 1,
// sau 200ms on dinh, spread hien tai duoc ve lai truc tiep tu PDF bang PDF.js
// o dung kich thuoc hien thi, sach PageFlip an di, overlay nay hien len thay.
// Loi PDF.js -> giu nguyen sach cu (fallback), khong bao gio lam hong trang doc.
let sharedPdfDoc = null, flipPdfTimer = null, flipPdfToken = 0, flipPdfVisible = false;
async function getPdfDoc() {
  if (!sharedPdfDoc) sharedPdfDoc = await pdfjs.getDocument(issue.pdf_url).promise;
  return sharedPdfDoc;
}
function hideFlipPdfOverlay() {
  if (flipPdfTimer) { clearTimeout(flipPdfTimer); flipPdfTimer = null; }
  flipPdfToken++; // huy render dang cho/dang ve
  flipPdfVisible = false;
  flipPdfZoomEl.hidden = true; flipPdfZoomEl.innerHTML = "";
  flipZoomWrap.style.display = "";
}
function scheduleFlipPdfOverlay() {
  if (flipPdfTimer) clearTimeout(flipPdfTimer);
  hideFlipPdfOverlay(); // hien sach CSS tam thoi cho phan hoi tuc thi, overlay se thay sau
  if (flipZoom === 1) return;
  flipPdfTimer = setTimeout(() => { flipPdfTimer = null; renderFlipPdfOverlay(); }, 200);
}
async function renderFlipPdfOverlay() {
  const token = ++flipPdfToken, zoomAtStart = flipZoom;
  if (zoomAtStart === 1) return;
  try {
    const doc = await getPdfDoc();
    if (token !== flipPdfToken || flipZoom !== zoomAtStart) return;
    const shown = displayForFlipIndex(currentIndex, total, portrait).shown;
    const fitPageW = portrait ? flipBaseW : flipBaseW / 2;
    const displayPageW = fitPageW * zoomAtStart;
    const frag = document.createDocumentFragment();
    let totalW = 0, displayH = 0;
    for (const pn of shown) {
      const page = await doc.getPage(pn);
      if (token !== flipPdfToken || flipZoom !== zoomAtStart) return;
      const pt = page.getViewport({ scale: 1 });
      const scale = pdfZoomScale({ displayPageWidth: displayPageW, pageWidthPt: pt.width, pageHeightPt: pt.height });
      const vp = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = vp.width; canvas.height = vp.height;
      canvas.style.width = `${displayPageW.toFixed(1)}px`; canvas.style.height = "auto";
      await page.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
      if (token !== flipPdfToken || flipZoom !== zoomAtStart) return;
      frag.appendChild(canvas);
      totalW += displayPageW; displayH = displayPageW * (pt.height / pt.width);
    }
    const sl = flipWrap.scrollLeft, st = flipWrap.scrollTop;
    flipPdfZoomEl.innerHTML = ""; flipPdfZoomEl.appendChild(frag);
    flipPdfZoomEl.style.width = `${totalW.toFixed(1)}px`;
    flipPdfZoomEl.style.height = `${displayH.toFixed(1)}px`;
    flipPdfZoomEl.hidden = false; flipZoomWrap.style.display = "none"; flipPdfVisible = true;
    flipWrap.scrollLeft = sl; flipWrap.scrollTop = st;
  } catch { /* giu sach CSS cu, khong hien overlay loi */ }
}
// Lat trang chi o muc vua khung: dang zoom ma bam nut lat thi ve 1 truoc,
// roi lat binh thuong (giu animation lat, overlay se khong che mat animation).
function flipAtFit(fn) {
  if (flipZoom !== 1) { flipZoom = 1; hideFlipPdfOverlay(); applyFlipZoom(); }
  if (flip) fn();
}
function applyFlipZoom() {
  if (!flipBaseW) { flipBaseW = flipBook.offsetWidth || 500; flipBaseH = flipBook.offsetHeight || 707; }
  flipZoomWrap.style.width = `${(flipBaseW * flipZoom).toFixed(1)}px`;
  flipZoomWrap.style.height = `${(flipBaseH * flipZoom).toFixed(1)}px`;
  flipBook.style.transform = `scale(${flipZoom})`;
  // Bia/trang cuoi le nam giua khung (nhu TQ) chi o muc vua khung.
  const shift = singlePageShift({ currentIndex, total, portrait, zoom: flipZoom, bookWidth: flipBaseW });
  if (shift) {
    const contentW = flipWrap.clientWidth - 32;
    flipZoomWrap.style.marginLeft = `${Math.max(0, (contentW - flipBaseW * flipZoom) / 2) + shift}px`;
  } else flipZoomWrap.style.marginLeft = "";
  flipOverlay.style.display = canPan(flipZoom) ? "block" : "none";
  flipWrap.style.cursor = canPan(flipZoom) ? "grab" : "default";
  const zl = $("flip-zoom-label"); if (zl) zl.textContent = zoomLabel(flipZoom);
}
// Vua khung nhu TQ: sach vua ca rong lan cao cua flip-wrap, khong tran.
// PageFlip "stretch" tu no chi vua theo rong, nen phai ep chieu rong sach
// bang fitBookWidth truoc, roi khoa flipBook o chieu rong co dinh do (neu
// de width 100% cua zoom-wrap, transform zoom se nhan doi chieu rong).
function refitFlip() {
  if (!flip) return;
  flipZoom = 1; hideFlipPdfOverlay();
  const bookW = fitBookWidth({
    availW: Math.max(1, flipWrap.clientWidth - 32),
    availH: Math.max(1, flipWrap.clientHeight - 32),
    portrait,
  });
  flipZoomWrap.style.width = `${bookW}px`;
  flipBook.style.width = `${bookW}px`;
  flip.update();
  flipBaseW = flipBook.offsetWidth || bookW;
  flipBaseH = flipBook.offsetHeight || Math.round(bookW * (portrait ? 707 / 500 : 707 / 1000));
  applyFlipZoom();
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
  scheduleFlipPdfOverlay();
}

function renderThumbs() {
  $("thumbs").innerHTML = issue.pages.map((p, i) =>
    `<img src="${p.thumb}" data-i="${i}" alt="Trang ${p.page_number}" class="${i === currentIndex ? "active" : ""}">`).join("");
  $("thumbs").querySelectorAll("img").forEach((img) =>
    img.onclick = () => { flipAtFit(() => flip.turnToPage(Number(img.dataset.i))); });
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
  hideFlipPdfOverlay();
  // Ep zoom-wrap ve chieu rong vua khung truoc khi PageFlip khoi tao, de
  // sach lan dau da nam tron trong khung, khong tran roi moi thu nho lai.
  flipZoomWrap.style.width = `${fitBookWidth({
    availW: Math.max(1, flipWrap.clientWidth - 32),
    availH: Math.max(1, flipWrap.clientHeight - 32),
    portrait,
  })}px`;
  flip = new St.PageFlip($("flip-book"), {
    width: 500, height: 707, size: "stretch",
    minWidth: 300, maxWidth: 1000, minHeight: 424, maxHeight: 1414,
    showCover: true, // F8: cover + last page single, NO padding page
    flippingTime: 800, usePortrait: portrait, drawShadow: true,
  });
  flip.loadFromImages(issue.pages.map((p) => p.flip));
  // Bao dam tuyet doi: bat ky duong lat nao (nut, phim, thumbnail, click
  // trong sach cua PageFlip, vuot) khi dang zoom cung phai ve fit truoc khi
  // ket thuc. flipAtFit da xu ly cac nut cua minh, nhung PageFlip con co
  // duong lat noi bo (click trang, keo goc) khong qua flipAtFit; neu duong
  // do lat khi dang zoom, su kien flip nay se reset zoom ve 1 ngay lap tuc,
  // nen trang thai cuoi cung luon la fit, khong bao gio giu zoom cu.
  flip.on("flip", (e) => {
    currentIndex = e.data;
    if (flipZoom !== 1) { flipZoom = 1; hideFlipPdfOverlay(); }
    updateLabel(); applyFlipZoom();
  });
  flip.turnToPage(currentIndex);
  updateLabel();
  flipZoom = 1; refitFlip();
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
$("prev").onclick = () => flipAtFit(() => flip.flipPrev());
$("next").onclick = () => flipAtFit(() => flip.flipNext());
$("first").onclick = () => flipAtFit(() => flip.turnToPage(0));
$("last").onclick = () => flipAtFit(() => flip.turnToPage(total - 1));
$("page-input").onchange = (e) => {
  const n = parsePageInput(e.target.value, total);
  if (n === null) { alert(`Nhập số trang từ 1 đến ${total}.`); updateLabel(); return; }
  flipAtFit(() => flip.turnToPage(n - 1)); // StPageFlip is 0-based
};
document.addEventListener("keydown", (e) => {
  if ($("read-wrap").style.display === "block" || e.target.tagName === "INPUT") return;
  if (e.key === "ArrowLeft") flipAtFit(() => flip.flipPrev());
  if (e.key === "ArrowRight") flipAtFit(() => flip.flipNext());
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
  refitFlip(); // doi kich thuoc cua so hoac an/hien thumbnail: sach van vua khung
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
window.addEventListener("mouseup", () => { flipDragging = null; flipOverlay.classList.remove("panning"); flipPdfZoomEl.classList.remove("panning"); });
// Keo pan tren overlay PDF.js (khi overlay hien, sach an nen flipOverlay khong nhan chuot).
flipPdfZoomEl.addEventListener("mousedown", (e) => {
  if (!flipPdfVisible) return;
  flipDragging = { x: e.clientX, y: e.clientY, sl: flipWrap.scrollLeft, st: flipWrap.scrollTop };
  flipPdfZoomEl.classList.add("panning");
});
// Toolbar kieu TQ: thumbnail trai, canh trang, chia se, menu ...
$("thumbs-toggle").onclick = () => { $("thumbs-panel").classList.toggle("hidden"); requestAnimationFrame(refitFlip); };
$("thumbs-close").onclick = () => { $("thumbs-panel").classList.add("hidden"); requestAnimationFrame(refitFlip); };
$("flip-prev-edge").onclick = () => flipAtFit(() => flip.flipPrev());
$("flip-next-edge").onclick = () => flipAtFit(() => flip.flipNext());
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
  flipZoom = 1; hideFlipPdfOverlay(); applyFlipZoom();
  if (flip) flip.turnToPage(readPage - 1); // G1: back to the exact page (flip co the chua co khi dang dung trang)
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

// Fallback cho so moi khi backend chua co anh trang: dung tung trang
// bang PDF.js thanh anh dataURL roi nap vao StPageFlip nhu anh
// flip/thumb cu (cung khung sach 500x707).
// Mo sach DAN: ngay sau khi dung xong trang 1 (bia) thi initFlip luon
// de doc gia doc duoc ngay; cac trang sau moi dung xong thi nap them
// bang flip.updateFromImages() (StPageFlip 2.0.7 giu nguyen trang hien
// tai khi update, va turnToPage vuot qua so trang da dung la no-op
// nen bam nut trong luc dang dung khong loi). Anh nho cap nhat theo
// qua updateLabel() moi trang. Neu dung loi giua chung, sach van giu
// cac trang da dung duoc, khong trang tay.
async function renderFlipProgressive() {
  const doc = newPdfDoc;
  let started = false;
  try {
    for (let pn = 1; pn <= total; pn++) {
      const page = await doc.getPage(pn);
      const pt = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: 500 / pt.width });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
      await page.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
      const url = canvas.toDataURL("image/jpeg", 0.85);
      issue.pages.push({ page_number: pn, pdf_page_number: pn, is_cover: pn === 1, is_padding: false, flip: url, thumb: url });
      setProgress(`Đang dựng trang ${pn}/${total}…`);
      if (!started) { initFlip(); started = true; }
      else { flip.updateFromImages(issue.pages.map((p) => p.flip)); updateLabel(); }
    }
  } catch {
    // Loi giua chung: giu sach voi cac trang da dung duoc, chi xoa tien trinh.
    // Chi khi chua dung duoc trang nao moi bao loi nhu cu.
    setProgress("");
    if (!started) { document.getElementById("title").textContent = "Không dựng được trang báo."; throw new Error("page render failed"); }
  }
  setProgress("");
  if (!started) initFlip();
}

if (isNew) {
  if (newPdfDoc) await renderFlipProgressive(); // fallback PDF.js
  else { setProgress(""); initFlip(); } // anh server: mo sach ngay
} else initFlip();
