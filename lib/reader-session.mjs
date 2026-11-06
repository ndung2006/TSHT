// Phien ban doc tren portal: cap access + refresh token cua backend
// (JWT enduser) duoc MA HOA (AES-256-GCM) vao cookie tsht_reader — song
// qua restart portal (khong luu Map bo nho), dung duoc ca khi backend
// deploy lai nho refresh token da chuyen sang DB. Cookie: HttpOnly,
// Secure, SameSite=Lax, Path=/, 7 ngay. Khoa suy tu
// READER_SESSION_SECRET (chua dat bien nay thi dang nhap ban doc tat).
import crypto from "node:crypto";

const COOKIE_NAME = "tsht_reader";
const REFRESH_TTL_MS = 7 * 24 * 3600 * 1000;

function sessionKey() {
  const s = (process.env.READER_SESSION_SECRET || "").trim();
  if (!s) return null;
  return crypto.createHash("sha256").update(s).digest();
}

export function readerAuthConfigured() {
  return !!sessionKey();
}

export function readerSessionCookie(accessToken, refreshToken) {
  const key = sessionKey();
  if (!key) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const payload = JSON.stringify({ a: accessToken, r: refreshToken });
  const enc = Buffer.concat([cipher.update(payload, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const val = Buffer.concat([iv, tag, enc]).toString("base64url");
  return `${COOKIE_NAME}=${val}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${REFRESH_TTL_MS / 1000}`;
}

export function clearReaderSessionCookie() {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

export function readReaderSession(req) {
  const key = sessionKey();
  if (!key) return null;
  const cookie = (req.headers.cookie || "")
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(COOKIE_NAME + "="));
  if (!cookie) return null;
  try {
    const buf = Buffer.from(cookie.slice(COOKIE_NAME.length + 1), "base64url");
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const enc = buf.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const payload = JSON.parse(Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8"));
    if (!payload.a || !payload.r) return null;
    return { accessToken: payload.a, refreshToken: payload.r };
  } catch {
    return null;
  }
}

// Giai ma payload JWT (khong xac minh chu ky — backend xac minh khi goi
// /auth/me) de biet access token het han chua.
export function jwtExpiryMs(token) {
  try {
    const part = String(token || "").split(".")[1];
    const payload = JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
    return typeof payload.exp === "number" ? payload.exp * 1000 : 0;
  } catch {
    return 0;
  }
}
