import * as pdfjs from "/vendor/pdfjs.mjs";
import {
  zoomIn, zoomOut, canPan, parsePageInput, displayForFlipIndex, scrollAfterZoom, zoomLabel,
} from "./viewer-logic.js";

pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdf.worker.mjs";

// Stage 2: issue ID is the LAST number in the slug (/bao-tuyen-quang-so-319-1.html -> id 1,
// NOT 319 — Stage 1 used id == number, the real DB does not).
const m = location.pathname.match(/-(\d+)\.html$/);
const issueId = m ? Number(m[1]) : Number(new URLSearchParams(location.search).get("issue") || 0);
const res = await fetch(`/api/v1/issues/${issueId}`);
if (res.status === 401) { location.href = "/login.html"; throw new Error("unauthorized"); }
if (!res.ok) { document.getElementById("title").textContent = "Không tìm thấy số báo hoặc không có quyền xem."; throw new Error("issue not found"); }
const issue = await res.json();
document.getElementById("title").textContent = `${issue.title} — ${issue.publish_date} (${issue.page_count} trang)`;
if (issue.can_download) { document.getElementById("download").href = `/api/v1/issues/${issueId}/download`; document.getElementById("download").textContent = "Tải PDF gốc"; }
else document.getElementById("download").remove();
const total = issue.pages.length;
const $ = (id) => document.getElementById(id);

// ---------- Flip mode (F1-F5, F8) ----------
let portrait = window.innerWidth < 700; // 1 page on portrait/mobile by default
let lockedMode = null; // F5: once the user toggles, do NOT auto-revert on navigation/resize
let flip = null;
let currentIndex = 0;

function renderThumbs() {
  $("thumbs").innerHTML = issue.pages.map((p, i) =>
    `<img src="${p.thumb}" data-i="${i}" alt="Trang ${p.page_number}" class="${i === currentIndex ? "active" : ""}">`).join("");
  $("thumbs").querySelectorAll("img").forEach((img) =>
    img.onclick = () => { flip.turnToPage(Number(img.dataset.i)); });
}
function updateLabel() {
  const d = displayForFlipIndex(currentIndex, total, portrait);
  $("page-label").textContent = `Trang ${d.shown.join("–")} / ${total}`;
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

// ---------- Read mode (G1-G5, G7, G8) ----------
let pdfDoc = null, readPage = 1, zoom = 1;
const scrollEl = $("read-scroll"), canvas = $("read-canvas"), ctx = canvas.getContext("2d");
async function renderReadPage() {
  if (!pdfDoc) pdfDoc = await pdfjs.getDocument(issue.pdf_url).promise;
  const page = await pdfDoc.getPage(readPage);
  // Render once at ~300 dpi (300/72 = 4.17); wheel/button zoom then scales
  // the rendered page, it never CSS-transforms the whole book (G8).
  const vp = page.getViewport({ scale: 300 / 72 });
  canvas.width = vp.width; canvas.height = vp.height;
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  zoom = 1; applyZoom(); // G5: new page resets zoom to fit
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
  $("flip-wrap").style.display = "none"; $("flip-toolbar").style.display = "none"; $("thumbs").style.display = "none";
  $("read-wrap").style.display = "block";
  readPage = currentIndex + 1; await renderReadPage(); // G1: same page
}
function exitRead() {
  $("read-wrap").style.display = "none";
  $("flip-wrap").style.display = "flex"; $("flip-toolbar").style.display = "flex"; $("thumbs").style.display = "flex";
  flip.turnToPage(readPage - 1); // G1: back to the exact page
}
$("mode-read").onclick = enterRead;
$("read-exit").onclick = exitRead;
$("mode-flip").onclick = () => { if ($("read-wrap").style.display === "block") exitRead(); };
$("read-prev").onclick = async () => { if (readPage > 1) { readPage--; await renderReadPage(); } };
$("read-next").onclick = async () => { if (readPage < total) { readPage++; await renderReadPage(); } };
// Double-click a flip page also enters Read mode (G1).
$("flip-book").addEventListener("dblclick", enterRead);

initFlip();
