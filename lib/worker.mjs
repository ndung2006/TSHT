// Stage 2: worker PDF minimal (C1/C2/C4/C6) — validate + render flip/thumb.
// Uses poppler-utils (pdfinfo/pdftoppm) already on this machine; the
// internal server needs the same tools installed (README Stage 2).
// Read-mode 300 dpi images (C3) are NOT pre-rendered here: Read mode
// renders the PDF on demand with PDF.js at ~300 dpi (Stage 1 decision,
// kept). render() therefore only produces flip (~150 dpi) + thumb.
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

export async function pdfPageCount(pdfPath) {
  const { stdout } = await run("pdfinfo", [pdfPath]);
  const m = stdout.match(/^Pages:\s*(\d+)/m);
  if (!m) throw new Error("pdfinfo khong doc duoc so trang");
  const n = Number(m[1]);
  if (!Number.isInteger(n) || n < 1) throw new Error("PDF khong co trang nao");
  return n;
}

// pdftoppm writes <prefix>-001.jpg …; rename to p001.jpg … (DB convention).
async function renderSet(pdfPath, outDir, dpi) {
  fs.mkdirSync(outDir, { recursive: true });
  const prefix = path.join(outDir, "tmp");
  await run("pdftoppm", ["-jpeg", "-r", String(dpi), "-jpegopt", "quality=82", pdfPath, prefix]);
  for (const f of fs.readdirSync(outDir)) {
    const m = f.match(/^tmp-(\d+)\.jpg$/);
    if (m) fs.renameSync(path.join(outDir, f), path.join(outDir, `p${m[1].padStart(3, "0")}.jpg`));
  }
}

export async function renderIssuePages(pdfPath, issueDir, pageCount) {
  const flipDir = path.join(issueDir, "pages", "flip");
  const thumbDir = path.join(issueDir, "pages", "thumb");
  await renderSet(pdfPath, flipDir, 150);
  await renderSet(pdfPath, thumbDir, 72);
  const flipFiles = fs.readdirSync(flipDir).filter((f) => /^p\d+\.jpg$/.test(f)).sort();
  if (flipFiles.length !== pageCount) {
    throw new Error(`render duoc ${flipFiles.length} anh, PDF co ${pageCount} trang`);
  }
  fs.copyFileSync(path.join(flipDir, "p001.jpg"), path.join(issueDir, "cover.jpg"));
  return flipFiles.length;
}
