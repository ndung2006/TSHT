// Stage 2: session auth (H1/H2). Passwords are scrypt hashes in DB only,
// never plaintext. Sessions are in-memory: a server restart logs everyone
// out — acceptable for this prototype, the internal server must move
// sessions to DB/Redis before go-live (noted in README).
import crypto from "node:crypto";

const sessions = new Map(); // token -> { user, expiresAt }
const TTL_MS = 8 * 60 * 60 * 1000;

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}
export function verifyPassword(password, stored) {
  const parts = (stored || "").split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false; // placeholder seed hash: never valid
  try {
    const hash = crypto.scryptSync(password, parts[1], 64).toString("hex");
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(parts[2]));
  } catch { return false; }
}
export function createSession(user) {
  const token = crypto.randomBytes(32).toString("hex");
  const pub = { id: user.id, username: user.username, display_name: user.display_name, role: user.role, can_download_pdf: user.can_download_pdf };
  sessions.set(token, { user: pub, expiresAt: Date.now() + TTL_MS });
  return { token, user: pub };
}
export function userFromRequest(req) {
  const cookie = (req.headers.cookie || "").split(";").map((s) => s.trim())
    .find((s) => s.startsWith("epaper_session="));
  if (!cookie) return null;
  const token = cookie.slice("epaper_session=".length);
  const s = sessions.get(token);
  if (!s || s.expiresAt < Date.now()) { if (s) sessions.delete(token); return null; }
  return s.user;
}
export function destroySession(req) {
  const cookie = (req.headers.cookie || "").split(";").map((s) => s.trim())
    .find((s) => s.startsWith("epaper_session="));
  if (cookie) sessions.delete(cookie.slice("epaper_session=".length));
}
export function sessionCookie(token) {
  return `epaper_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${TTL_MS / 1000}`;
}
export const ROLES = { admin: 4, reviewer: 3, publisher: 2, reader: 1 };
export const isStaff = (u) => u && u.role !== "reader";
export const isAdmin = (u) => u && u.role === "admin";
export const canReview = (u) => u && (u.role === "reviewer" || u.role === "admin");
