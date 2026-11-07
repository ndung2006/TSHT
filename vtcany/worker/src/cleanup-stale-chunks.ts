import { readdirSync, rmSync, statSync } from 'fs';
import { join } from 'path';

// Don chunk tai len do dang trong storage/raw/* qua 24 gio.
//
// Quy tac an toan (chunk da gop xong bi xoa ngay trong mergeChunks nen
// thu muc raw/<id>/ con chunk nghia la upload CHUA BAO GIO hoan tat):
//   - Chi xet thu muc raw/<id>/; file gop nam o storage/raw/<id>-<ten>,
//     NGOAI thu muc, nen khong bao gio bi cham.
//   - Chi don khi chunk moi nhat (hoac mtime thu muc neu thu muc rong)
//     cu hon maxAgeMs (mac dinh 24h). Upload dang chay (chunk moi) khong
//     bi cham.
//   - Xoa file chunk roi xoa thu muc neu rong (thu muc co file la thi
//     de lai). Khong dong DB (ban ghi 'pending' cua upload do dang van
//     giu nguyen de CMS/D2 thay).
// Tra ve { checked, removed, bytesFreed }.
export const STALE_CHUNK_MAX_AGE_MS = 24 * 60 * 60 * 1000;

type DirEntry = { name: string; isDirectory: () => boolean; isFile: () => boolean };

function readDirEntries(dir: string): DirEntry[] {
  try {
    return readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

export function cleanupStaleChunks(
  storageRoot: string,
  maxAgeMs = STALE_CHUNK_MAX_AGE_MS,
  now = Date.now(),
): { checked: number; removed: number; bytesFreed: number } {
  const rawRoot = join(storageRoot, 'raw');
  const entries = readDirEntries(rawRoot);
  let checked = 0;
  let removed = 0;
  let bytesFreed = 0;
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const dir = join(rawRoot, e.name);
    checked += 1;
    const files = readDirEntries(dir);
    let newest = 0;
    let hasChunk = false;
    for (const f of files) {
      if (!f.isFile() || !f.name.startsWith('chunk-')) continue;
      hasChunk = true;
      try {
        const mtime = statSync(join(dir, f.name)).mtimeMs;
        if (mtime > newest) newest = mtime;
      } catch { /* chunk bien mat giua chung */ }
    }
    if (!hasChunk) {
      try {
        newest = statSync(dir).mtimeMs;
      } catch {
        continue;
      }
    }
    if (now - newest < maxAgeMs) continue; // dang chay / moi: khong cham
    // Qua han: xoa chunk (neu co) roi xoa thu muc neu rong.
    let cleaned = false;
    for (const f of files) {
      if (!f.isFile() || !f.name.startsWith('chunk-')) continue;
      const p = join(dir, f.name);
      try {
        const size = statSync(p).size;
        rmSync(p, { force: true });
        bytesFreed += size;
        cleaned = true;
      } catch { /* bo qua */ }
    }
    // rmSync khong recursive thi khong xoa duoc thu muc nen phai kiem
    // tra rong truoc roi moi xoa (de quy + force).
    try {
      if (readdirSync(dir).length === 0) {
        rmSync(dir, { recursive: true, force: true });
        cleaned = true;
      }
    } catch { /* thu muc khong rong / loi doc: de lai */ }
    if (cleaned) removed += 1;
  }
  return { checked, removed, bytesFreed };
}
