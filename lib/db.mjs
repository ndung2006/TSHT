// Pha B (2026-10-28): app TSHT KHONG CON DB.
// File nay chi con helper duong dan luu tru (STORAGE_DIR) cho cache anh
// bia so moi (epaper-covers/) va cac duong dan tinh. Ket noi PostgreSQL
// (pg Pool, DATABASE_URL) da go: he cu (so bao, user, kenh/lich noi bo)
// khong con, 4 so cu khong migrate sang backend.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CODE_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = path.join(CODE_ROOT, ".env");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)=(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}
export const STORAGE_DIR = path.resolve(
  CODE_ROOT,
  process.env.STORAGE_DIR || "./storage",
);
// Resolve a stored relative path (storage/epaper/...) under STORAGE_DIR.
// Returns null for absolute paths or path-traversal attempts (A3).
export function resolveStoragePath(rel) {
  if (!rel || path.isAbsolute(rel)) return null;
  const base = rel.replace(/^storage\//, "");
  const full = path.resolve(STORAGE_DIR, base);
  const root = path.resolve(STORAGE_DIR);
  return full === root || full.startsWith(root + path.sep) ? full : null;
}
export function storageRelForIssue(issueId, publishDate, file) {
  const d = new Date(publishDate);
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0");
  return `storage/epaper/${y}/${m}/${issueId}/${file}`;
}
