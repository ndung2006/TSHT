// TSHT -> VTCANY account integration (prepared, OFF by default).
// Sources (read-only, ~/workspace/vtcany):
//   backend/src/modules/auth/auth.controller.ts — POST /api/v1/auth/admin/login
//     {email, password}, POST /api/v1/auth/login {username, password},
//     GET /api/v1/auth/me (Bearer JWT), POST /api/v1/auth/refresh
//     {refresh_token}. 401 on invalid credentials / invalid refresh token.
//   backend/src/modules/auth/auth.service.ts — issueCmsPair(): access_token
//     (JWT, 3600s), refresh_token (random hex, 7 days, stored in an
//     in-memory Map — LOST on backend restart), permissions = flattened
//     ["module:action", ...] or ['*']; me() returns {kind:'cms', user,
//     permissions} for CMS accounts and {kind:'enduser', ...} for app users.
//   backend/src/modules/auth/permissions.catalog.ts — modules x actions
//     (view/create/update/publish/delete), flattenPermissions() aliases:
//     module:submit == module:publish, module:write == any write action,
//     module:read == module:view, video->videos, category->categories,
//     user->users. There is NO 'issues'/'epaper' module in VTCANY, so
//     TSHT e-paper actions are mapped to the 'articles' module (see
//     docs/auth-mapping-vtcany.md). That mapping is a TSHT-side convention,
//     not a native VTCANY e-paper permission.
//   backend/src/modules/auth/auth.module.ts — JWT secret defaults to a
//     known dev value when JWT_SECRET is unset. NEVER enable this
//     integration until JWT_SECRET is set to a real secret in Coolify
//     and the backend is redeployed (see docs/auth-mapping-vtcany.md).
//
// Security rules enforced here (never weakened by callers):
// - Browser NEVER calls the VTCANY backend directly for auth, and NEVER
//   sees a VTCANY JWT, refresh token, or password. All VTCANY calls are
//   server-side, from TSHT server.mjs only.
// - Passwords and tokens are NEVER logged (not even their length/shape).
// - A VTCANY 401 at login means "tài khoản VTCANY không đúng": the
//   server does NOT fall back to the old TSHT scrypt login and does NOT
//   create any TSHT account.
// - A backend error (unreachable / timeout / 5xx) NEVER grants access:
//   verify() returns backend_unreachable and the caller must deny the
//   current CMS call (503), keeping the session intact for a retry.
// - Refresh is best-effort, attempted at most ONCE per verification.
//   A backend restart wipes the in-memory refresh Map, so a failed
//   refresh means "session must re-login" — never an infinite loop.
//
// Config (env only, no secret in code):
//   VTCANY_AUTH_ENABLED — '1' enables VTCANY CMS login; anything else
//     (including unset and '0') keeps the old TSHT scrypt login. Default
//     OFF, so deploying this code changes nothing until the operator
//     deliberately flips the env and restarts/redeploys.
//   VTCANY_API_BASE — same base as lib/vtcany.mjs (default
//     https://vtcany-api.vtctech.xyz). Empty base + enabled => 503
//     (misconfiguration), never a silent fallback to old login.

import { vtcanyApiBase } from "./vtcany.mjs";

export const VTCANY_ME_CACHE_MS = 5 * 60 * 1000;
const TIMEOUT_MS = 8000;
const WRITE_ACTIONS = ["create", "update", "publish", "delete"];

// Enabled only on the exact value '1'. 'true'/'yes' do NOT enable it,
// so a loosely-written env value cannot accidentally cut over auth.
export function vtcanyAuthEnabled() {
  return process.env.VTCANY_AUTH_ENABLED === "1";
}

// Normalise a VTCANY permission payload into a Set of "module:action"
// strings. Accepts: a flattened array (what /auth/me and login return),
// a Role.permissions map {module: [actions]}, or null/undefined.
// Expands the same aliases VTCANY flattenPermissions() produces, so a
// raw map and a flattened list check identically.
export function normalizePermissions(input) {
  const out = new Set();
  if (!input) return out;
  const add = (module, action) => {
    out.add(`${module}:${action}`);
    // Legacy singular/plural aliases, BOTH directions
    // (permissions.catalog.ts MODULE_ALIASES, plus the legacy in-memory
    // editor list which uses singular forms and read/write aliases).
    if (module === "videos") out.add(`video:${action}`);
    if (module === "video") out.add(`videos:${action}`);
    if (module === "categories") out.add(`category:${action}`);
    if (module === "category") out.add(`categories:${action}`);
    if (module === "users") out.add(`user:${action}`);
    if (module === "user") out.add(`users:${action}`);
    if (WRITE_ACTIONS.includes(action)) out.add(`${module}:write`);
    if (action === "view") out.add(`${module}:read`);
    if (action === "read") out.add(`${module}:view`);
    if (action === "publish") out.add(`${module}:submit`);
    if (action === "submit") out.add(`${module}:publish`);
  };
  if (Array.isArray(input)) {
    for (const p of input) {
      if (p === "*") { out.add("*"); continue; }
      const idx = String(p).indexOf(":");
      if (idx < 0) continue;
      add(String(p).slice(0, idx), String(p).slice(idx + 1));
    }
    return out;
  }
  if (typeof input === "object") {
    for (const [module, actions] of Object.entries(input)) {
      if (module === "*" && Array.isArray(actions) && actions.includes("*")) { out.add("*"); continue; }
      for (const a of Array.isArray(actions) ? actions : []) add(module, a);
    }
  }
  return out;
}

export function hasVtcanyPermission(permissions, required) {
  const set = permissions instanceof Set ? permissions : normalizePermissions(permissions);
  if (set.has("*")) return true;
  if (!required || !required.includes(":")) return false;
  const [module, action] = required.split(":");
  if (set.has(`${module}:*`) || set.has(`${module}:${action}`)) return true;
  if (action === "write") return WRITE_ACTIONS.some((a) => set.has(`${module}:${a}`));
  if (action === "read") return set.has(`${module}:view`);
  if (action === "view") return set.has(`${module}:read`);
  if (action === "submit") return set.has(`${module}:publish`);
  if (action === "publish") return set.has(`${module}:submit`);
  return false;
}

// Map a verified VTCANY CMS identity to a TSHT role. Returns null when
// the identity must NOT get a TSHT CMS session at all.
// - kind !== 'cms' (end-user / app account): null — end-users never get
//   CMS access, even if they somehow present a valid token.
// - '*' (Super Admin / Admin): 'admin' — full TSHT CMS access.
// - articles:publish: 'reviewer' — TSHT reviewers publish/unpublish/
//   reject/checklist, but cannot upload (TSHT excludes reviewers from
//   upload by design). A VTCANY user who needs BOTH upload and publish
//   needs '*' in VTCANY: TSHT has no combined publisher+reviewer role.
// - articles:create or articles:update: 'publisher' — upload, edit own
//   drafts, submit, retry processing.
// - Any view permission (articles/catalog/tv/epg/videos view): 'reader'
//   — can log in and view published content, all CMS writes 403.
// - Nothing at all (e.g. default 'Moderators' / 'Khởi tạo' roles with
//   {} permissions): null — login is denied with a clear message,
//   rather than silently granting a reader session.
// NOTE: the default VTCANY Editor role has NO 'articles' permission at
// all (it is OTT-focused: videos/epg/categories/catalog), so it maps
// to 'reader' here and every e-paper write is 403 until a VTCANY admin
// grants it 'articles' permissions (or a dedicated e-paper role).
export function mapVtcanyToTshtRole(kind, permissions) {
  if (kind !== "cms") return null;
  const set = permissions instanceof Set ? permissions : normalizePermissions(permissions);
  if (set.has("*")) return "admin";
  if (hasVtcanyPermission(set, "articles:publish")) return "reviewer";
  if (hasVtcanyPermission(set, "articles:create") || hasVtcanyPermission(set, "articles:update")) return "publisher";
  if (
    hasVtcanyPermission(set, "articles:view") ||
    hasVtcanyPermission(set, "catalog:view") ||
    hasVtcanyPermission(set, "tv:view") ||
    hasVtcanyPermission(set, "epg:view") ||
    hasVtcanyPermission(set, "videos:view")
  ) return "reader";
  return null;
}

async function postJson(url, body, { token = null, timeoutMs = TIMEOUT_MS, fetchFn = globalThis.fetch } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetchFn(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await r.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    return { status: r.status, ok: r.ok, data, text };
  } catch (e) {
    return { status: 0, ok: false, reason: "fetch_failed", error: e.message };
  } finally { clearTimeout(timer); }
}

async function getJson(url, { token = null, timeoutMs = TIMEOUT_MS, fetchFn = globalThis.fetch } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetchFn(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: ctrl.signal,
    });
    const text = await r.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    return { status: r.status, ok: r.ok, data, text };
  } catch (e) {
    return { status: 0, ok: false, reason: "fetch_failed", error: e.message };
  } finally { clearTimeout(timer); }
}

// Login against VTCANY only. Never touches the TSHT users table and
// never creates a TSHT account. Returns:
//   {ok:true, access_token, refresh_token, role, permissions} on success
//   {ok:false, reason:'invalid_credentials'} on VTCANY 401
//   {ok:false, reason:'backend_unreachable'} on network/timeout/5xx
// loginId: an email (preferred, /auth/admin/login) or a username
// (legacy /auth/login). Both are VTCANY-side; the TSHT local login is
// never tried from here.
export async function loginToVtcany(loginId, password, fetchFn = globalThis.fetch) {
  const base = vtcanyApiBase();
  if (!base) return { ok: false, reason: "not_configured" };
  const isEmail = String(loginId || "").includes("@");
  const path = isEmail ? "/auth/admin/login" : "/auth/login";
  const body = isEmail ? { email: loginId, password } : { username: loginId, password };
  const r = await postJson(base + path, body, { fetchFn });
  if (r.reason === "fetch_failed") return { ok: false, reason: "backend_unreachable" };
  if (r.status === 401) return { ok: false, reason: "invalid_credentials" };
  if (!r.ok || !r.data || !r.data.access_token) {
    return { ok: false, reason: r.status >= 500 ? "backend_unreachable" : "login_failed", status: r.status };
  }
  return {
    ok: true,
    access_token: r.data.access_token,
    refresh_token: r.data.refresh_token || null,
    role: r.data.role || null,
    permissions: r.data.permissions || [],
  };
}

// GET /auth/me. Returns {ok:true, kind, user, permissions} or
// {ok:false, reason:'unauthorized'|'backend_unreachable'|'me_failed'}.
export async function fetchVtcanyMe(accessToken, fetchFn = globalThis.fetch) {
  const base = vtcanyApiBase();
  if (!base) return { ok: false, reason: "not_configured" };
  const r = await getJson(base + "/auth/me", { token: accessToken, fetchFn });
  if (r.reason === "fetch_failed") return { ok: false, reason: "backend_unreachable" };
  if (r.status === 401) return { ok: false, reason: "unauthorized" };
  if (!r.ok || !r.data) return { ok: false, reason: "me_failed", status: r.status };
  return { ok: true, kind: r.data.kind, user: r.data.user || {}, permissions: r.data.permissions || [] };
}

async function refreshVtcanyToken(refreshToken, fetchFn = globalThis.fetch) {
  const base = vtcanyApiBase();
  if (!base) return { ok: false, reason: "not_configured" };
  const r = await postJson(base + "/auth/refresh", { refresh_token: refreshToken }, { fetchFn });
  if (r.reason === "fetch_failed") return { ok: false, reason: "backend_unreachable" };
  if (!r.ok || !r.data || !r.data.access_token) return { ok: false, reason: "invalid_refresh_token", status: r.status };
  return { ok: true, access_token: r.data.access_token, refresh_token: r.data.refresh_token || null, permissions: r.data.permissions || [] };
}

// Verify a TSHT session entry that came from VTCANY (see lib/auth.mjs
// createVtcanySession / sessionEntryFromRequest). Mutates the entry's
// cached permissions/role on success. Returns:
//   {ok:true, user} — cached (<5 min) or freshly verified.
//   {ok:false, reason:'reauth'} — access token AND refresh both invalid
//     (includes backend restart wiping in-memory refresh tokens). The
//     caller must destroy the TSHT session and answer 401 with a
//     "please log in again" message. No retry loop.
//   {ok:false, reason:'backend_unreachable'} — network/timeout/5xx.
//     The caller must deny the current CMS call (503) and KEEP the
//     session, so a retry succeeds once the backend recovers. Never
//     grant on this path.
//   {ok:false, reason:'forbidden'} — /me succeeded but the account no
//     longer maps to any TSHT role (permissions revoked, or end-user
//     kind). Caller denies with 403; session is kept so a re-grant
//     takes effect at the next verification (cache is NOT refreshed
//     on this path, so re-grant is picked up on the next call).
export async function verifyVtcanySession(entry, fetchFn = globalThis.fetch) {
  if (!entry || !entry.vtcany || !entry.vtcany.accessToken) return { ok: false, reason: "reauth" };
  const v = entry.vtcany;
  if (v.meCheckedAt && Date.now() - v.meCheckedAt < VTCANY_ME_CACHE_MS && v.permissions) {
    return { ok: true, user: entry.user, cached: true };
  }
  let me = await fetchVtcanyMe(v.accessToken, fetchFn);
  if (!me.ok && me.reason === "unauthorized" && v.refreshToken) {
    // Exactly ONE refresh attempt, then exactly ONE /me retry.
    const ref = await refreshVtcanyToken(v.refreshToken, fetchFn);
    if (ref.ok) {
      v.accessToken = ref.access_token;
      if (ref.refresh_token) v.refreshToken = ref.refresh_token;
      me = await fetchVtcanyMe(v.accessToken, fetchFn);
    } else if (ref.reason === "backend_unreachable") {
      return { ok: false, reason: "backend_unreachable" };
    } else {
      return { ok: false, reason: "reauth" };
    }
  }
  if (!me.ok) {
    if (me.reason === "backend_unreachable") return { ok: false, reason: "backend_unreachable" };
    if (me.reason === "unauthorized") return { ok: false, reason: "reauth" };
    return { ok: false, reason: "backend_unreachable" };
  }
  const mapped = mapVtcanyToTshtRole(me.kind, me.permissions);
  if (mapped === null) return { ok: false, reason: "forbidden" };
  // Apply the verified identity to the stored TSHT session user, so
  // every existing role check in server.mjs sees the current role,
  // and per-action VTCANY permission checks see current permissions.
  // A downgrade here (e.g. admin -> reader) takes effect immediately,
  // it does not wait for the TSHT session to expire.
  entry.user.role = mapped;
  entry.user.vtcany_role = me.user.role || null;
  entry.user.vtcany_permissions = Array.isArray(me.permissions) ? me.permissions : [];
  entry.user.username = me.user.username || entry.user.username;
  entry.user.email = me.user.email || entry.user.email;
  v.permissions = entry.user.vtcany_permissions;
  v.meCheckedAt = Date.now();
  return { ok: true, user: entry.user, cached: false };
}
