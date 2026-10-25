// Stage 2: DB connection. Config lives ONLY in code/.env (local dev file,
// chmod 600, never copied to the internal server as-is). On the internal
// server the dev regenerates it with tools/setup-internal-server.sh values.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const CODE_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = path.join(CODE_ROOT, ".env");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)=(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL chua duoc cau hinh (xem code/.env, README Stage 2)");
}
export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
export const STORAGE_DIR = path.resolve(
  CODE_ROOT,
  process.env.STORAGE_DIR || "./storage",
);
// Resolve a DB-stored relative path (storage/epaper/...) under STORAGE_DIR.
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
