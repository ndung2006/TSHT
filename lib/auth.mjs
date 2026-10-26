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
// VTCANY-backed session (see lib/vtcany-auth.mjs). The TSHT session
// cookie stays the same (epaper_session, 8h); the VTCANY access +
// refresh tokens live ONLY in this server-side Map entry, never in the
// browser and never in the published user object. `localId` is the
// TSHT users.id of a local row with the same email, or null when no
// local row is linked: null means the account cannot create issues
// (issues.created_by is NOT NULL in the DB) and cannot download the
// original PDF (can_download_pdf defaults false) — see server.mjs and
// docs/auth-mapping-vtcany.md. No local row is created here, ever.
export function createVtcanySession({ localId, username, displayName, email, mappedRole, canDownloadPdf, vtcanyUserId, vtcanyRole, permissions, accessToken, refreshToken }) {
  const token = crypto.randomBytes(32).toString("hex");
  const pub = {
    id: localId ?? null, username, display_name: displayName, email: email || null,
    role: mappedRole, can_download_pdf: !!canDownloadPdf,
    auth_source: "vtcany", vtcany_user_id: vtcanyUserId || null, vtcany_role: vtcanyRole || null,
    vtcany_permissions: Array.isArray(permissions) ? permissions : [],
  };
  const entry = {
    user: pub, expiresAt: Date.now() + TTL_MS,
    vtcany: { accessToken, refreshToken: refreshToken || null, permissions: pub.vtcany_permissions, meCheckedAt: Date.now() },
  };
  sessions.set(token, entry);
  return { token, user: pub };
}
// Full session entry (user + optional vtcany tokens/cache) for a
// request, or null. userFromRequest() below stays the synchronous
// public-user accessor used by the rest of the server; this helper
// exists so server.mjs can verify VTCANY sessions asynchronously.
export function sessionEntryFromRequest(req) {
  const cookie = (req.headers.cookie || "").split(";").map((s) => s.trim())
    .find((s) => s.startsWith("epaper_session="));
  if (!cookie) return null;
  const token = cookie.slice("epaper_session=".length);
  const s = sessions.get(token);
  if (!s || s.expiresAt < Date.now()) { if (s) sessions.delete(token); return null; }
  return s;
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
