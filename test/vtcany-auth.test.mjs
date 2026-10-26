// Mock tests for the VTCANY auth preparation (lib/vtcany-auth.mjs +
// lib/auth.mjs). No real backend, no real credential, no DB: every
// network call goes through a stub fetch injected as an argument (the
// lib functions take fetchFn, defaulting to globalThis.fetch, and never
// capture fetch at import time). The full server login flow (DB lookup
// by email, cookie handling, per-route 403s in server.mjs) is NOT run
// here — server.mjs starts an HTTP server + DB migration on import,
// so it cannot be unit-tested in this harness; it was checked with
// node --check and by code review against the routes listed in
// docs/auth-mapping-vtcany.md. What IS proven here: the flag default,
// the permission normalisation/mapping, login 401 handling, /me
// verification with 5-minute cache, the single-refresh flow, and the
// deny-on-backend-error rule.
import test from "node:test";
import assert from "node:assert/strict";
import {
  vtcanyAuthEnabled, normalizePermissions, hasVtcanyPermission,
  mapVtcanyToTshtRole, loginToVtcany, fetchVtcanyMe, verifyVtcanySession,
  VTCANY_ME_CACHE_MS,
} from "../lib/vtcany-auth.mjs";
import { createSession, createVtcanySession, sessionEntryFromRequest } from "../lib/auth.mjs";

const ADMIN_PERMS = ["*"];
// Default VTCANY Editor, flattened as /auth/me returns it (videos/epg/
// categories/catalog/users, no articles at all).
const EDITOR_PERMS = [
  "video:read", "video:create", "video:update", "video:submit",
  "epg:read", "epg:write", "category:read", "category:create", "category:update",
  "layout:read", "catalog:read", "catalog:write", "user:read",
];
const EPAPER_PUBLISHER_PERMS = ["articles:view", "articles:create", "articles:update"];
const EPAPER_REVIEWER_PERMS = ["articles:view", "articles:create", "articles:update", "articles:publish"];

function jsonResponse(status, data) {
  return { status, ok: status >= 200 && status < 300, text: async () => JSON.stringify(data) };
}
function reqFromCookie(cookie) { return { headers: { cookie } }; }

test("flag: default off (unset and '0'), on only for exact '1'", () => {
  const prev = process.env.VTCANY_AUTH_ENABLED;
  try {
    delete process.env.VTCANY_AUTH_ENABLED;
    assert.equal(vtcanyAuthEnabled(), false);
    process.env.VTCANY_AUTH_ENABLED = "0";
    assert.equal(vtcanyAuthEnabled(), false);
    process.env.VTCANY_AUTH_ENABLED = "true";
    assert.equal(vtcanyAuthEnabled(), false, "'true' must NOT enable cutover");
    process.env.VTCANY_AUTH_ENABLED = "1";
    assert.equal(vtcanyAuthEnabled(), true);
  } finally {
    if (prev === undefined) delete process.env.VTCANY_AUTH_ENABLED;
    else process.env.VTCANY_AUTH_ENABLED = prev;
  }
});

test("old login path is untouched when flag is off (code contract)", async () => {
  // lib/auth.mjs scrypt sessions are the old path and must keep working
  // regardless of the VTCANY code: create + read back a session.
  const { token, user } = createSession({ id: 7, username: "oldadmin", display_name: "Old Admin", role: "admin", can_download_pdf: true });
  assert.equal(user.auth_source, undefined, "old sessions carry no auth_source");
  assert.equal(user.role, "admin");
  // sessionEntryFromRequest reads the same Map entry back.
  const entry = sessionEntryFromRequest(reqFromCookie(`epaper_session=${token}`));
  assert.equal(entry.user.username, "oldadmin");
  assert.equal(entry.vtcany, undefined, "old sessions carry no VTCANY tokens");
});

test("permission normalisation: map and flattened list check identically, aliases work", () => {
  assert.equal(hasVtcanyPermission({ articles: ["publish"] }, "articles:submit"), true);
  assert.equal(hasVtcanyPermission({ articles: ["create"] }, "articles:write"), true);
  assert.equal(hasVtcanyPermission({ articles: ["view"] }, "articles:read"), true);
  assert.equal(hasVtcanyPermission(["articles:publish"], "articles:submit"), true);
  assert.equal(hasVtcanyPermission(["videos:view"], "video:read"), true, "singular alias");
  assert.equal(hasVtcanyPermission(["*"], "articles:publish"), true);
  assert.equal(hasVtcanyPermission(["articles:view"], "articles:create"), false);
  assert.equal(hasVtcanyPermission([], "articles:view"), false);
  assert.equal(hasVtcanyPermission(null, "articles:view"), false);
  assert.equal(normalizePermissions({ "*": ["*"] }).has("*"), true);
});

test("mapping: admin '*', reviewer on publish, publisher on create/update, editor->reader, empty->null, enduser->null", () => {
  assert.equal(mapVtcanyToTshtRole("cms", ADMIN_PERMS), "admin");
  assert.equal(mapVtcanyToTshtRole("cms", EPAPER_REVIEWER_PERMS), "reviewer");
  assert.equal(mapVtcanyToTshtRole("cms", EPAPER_PUBLISHER_PERMS), "publisher");
  assert.equal(mapVtcanyToTshtRole("cms", EDITOR_PERMS), "reader",
    "default VTCANY Editor has no articles permission, so it must NOT get e-paper writes");
  assert.equal(mapVtcanyToTshtRole("cms", []), null, "empty-permission role gets no TSHT session");
  assert.equal(mapVtcanyToTshtRole("cms", ["catalog:view"]), "reader");
  assert.equal(mapVtcanyToTshtRole("enduser", ADMIN_PERMS), null, "end-user never maps, even with a token");
  assert.equal(mapVtcanyToTshtRole("cms", ["articles:publish"]), "reviewer",
    "publish alone maps to reviewer, not publisher (TSHT reviewers cannot upload)");
});

test("mapping table spot checks: editor denied e-paper writes, admin allowed", () => {
  for (const perm of ["articles:create", "articles:update", "articles:publish"]) {
    assert.equal(hasVtcanyPermission(EDITOR_PERMS, perm), false, `editor must lack ${perm}`);
    assert.equal(hasVtcanyPermission(ADMIN_PERMS, perm), true, `admin must have ${perm}`);
  }
  // Legacy editor list uses the synthetic "epg:write", not a specific
  // "epg:create": under strict VTCANY semantics it does NOT imply a
  // specific create right (flattenPermissions emits :write FROM a write
  // action, not the other way round). The DB default Editor role, with
  // explicit epg:[view,create,...], DOES have epg:create — but TSHT
  // still blocks it from schedule writes via the TSHT admin gate.
  assert.equal(hasVtcanyPermission(EDITOR_PERMS, "epg:create"), false, "legacy epg:write does not imply epg:create");
  assert.equal(hasVtcanyPermission(EDITOR_PERMS, "epg:write"), true, "legacy editor keeps its synthetic epg write alias");
  assert.equal(hasVtcanyPermission(["epg:view", "epg:create", "epg:update", "epg:publish", "epg:delete"], "epg:create"), true, "DB Editor with explicit epg actions has epg:create");
  assert.equal(hasVtcanyPermission(EDITOR_PERMS, "users:create"), false, "editor cannot manage users");
});

test("login 401: invalid_credentials, and the caller must not create a session from it", async () => {
  const stub = async (url) => {
    assert.match(url, /\/auth\/admin\/login$/);
    return jsonResponse(401, { error: "invalid credentials" });
  };
  const r = await loginToVtcany("someone@example.com", "wrong-password", stub);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "invalid_credentials");
  assert.equal(r.access_token, undefined, "no token on 401, so server.mjs cannot create a session");
});

test("login: email goes to admin/login, username goes to legacy login, success returns tokens", async () => {
  const seen = [];
  const stub = async (url, opts) => {
    seen.push(url);
    const body = JSON.parse(opts.body);
    assert.equal(opts.headers["Content-Type"], "application/json");
    assert.ok(!JSON.stringify(opts).includes("Bearer"), "login must not send a bearer token");
    return jsonResponse(200, { access_token: "tok-1", refresh_token: "ref-1", role: "admin", permissions: ADMIN_PERMS, _echo: body });
  };
  const byEmail = await loginToVtcany("a@example.com", "pw", stub);
  assert.equal(byEmail.ok, true);
  assert.match(seen[0], /\/auth\/admin\/login$/);
  const byUser = await loginToVtcany("someuser", "pw", stub);
  assert.match(seen[1], /\/auth\/login$/);
  assert.equal(byUser.access_token, "tok-1");
});

test("login: backend unreachable is reported, never treated as invalid credentials", async () => {
  const stub = async () => { throw new Error("connect ECONNREFUSED"); };
  const r = await loginToVtcany("a@example.com", "pw", stub);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "backend_unreachable");
});

test("verify: cached /me within 5 minutes makes no second network call", async () => {
  let calls = 0;
  const stub = async () => { calls += 1; return jsonResponse(200, { kind: "cms", user: { id: "u1", username: "ed", email: "e@example.com", role: "editor" }, permissions: EPAPER_PUBLISHER_PERMS }); };
  const { token, user } = createVtcanySession({
    localId: 9, username: "ed", displayName: "Ed", email: "e@example.com", mappedRole: "publisher",
    canDownloadPdf: false, vtcanyUserId: "u1", vtcanyRole: "editor", permissions: EPAPER_PUBLISHER_PERMS,
    accessToken: "tok-1", refreshToken: "ref-1",
  });
  const entry = sessionEntryFromRequest(reqFromCookie(`epaper_session=${token}`));
  assert.equal(user.auth_source, "vtcany");
  // First verify after login: meCheckedAt was set at creation, so this
  // is a cache hit (0 calls). Force expiry, then verify twice.
  entry.vtcany.meCheckedAt = Date.now() - VTCANY_ME_CACHE_MS - 1000;
  const first = await verifyVtcanySession(entry, stub);
  assert.equal(first.ok, true);
  assert.equal(first.cached, false);
  assert.equal(calls, 1);
  const second = await verifyVtcanySession(entry, stub);
  assert.equal(second.ok, true);
  assert.equal(second.cached, true);
  assert.equal(calls, 1, "second verify inside 5 minutes must not call the backend");
  assert.equal(entry.user.role, "publisher");
});

test("verify: backend unreachable denies but keeps the session (no grant, no destroy)", async () => {
  const stub = async () => { throw new Error("network down"); };
  const { token } = createVtcanySession({
    localId: 9, username: "ed", displayName: "Ed", email: "e@example.com", mappedRole: "publisher",
    canDownloadPdf: false, vtcanyUserId: "u1", vtcanyRole: "editor", permissions: EPAPER_PUBLISHER_PERMS,
    accessToken: "tok-1", refreshToken: "ref-1",
  });
  const entry = sessionEntryFromRequest(reqFromCookie(`epaper_session=${token}`));
  entry.vtcany.meCheckedAt = 0;
  const before = entry.vtcany.accessToken;
  const r = await verifyVtcanySession(entry, stub);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "backend_unreachable");
  assert.equal(entry.vtcany.accessToken, before, "tokens untouched on backend error");
  assert.equal(entry.vtcany.permissions, EPAPER_PUBLISHER_PERMS);
  // Session still exists in the Map: a retry after recovery can succeed.
  assert.ok(sessionEntryFromRequest(reqFromCookie(`epaper_session=${token}`)), "session must survive backend outage");
});

test("verify: 401 then successful refresh retries /me once and updates tokens", async () => {
  let meCalls = 0;
  const stub = async (url, opts) => {
    if (url.endsWith("/auth/me")) {
      meCalls += 1;
      if (meCalls === 1) return jsonResponse(401, { error: "invalid token" });
      assert.equal(opts.headers.Authorization, "Bearer tok-2", "retried /me must use the NEW access token");
      return jsonResponse(200, { kind: "cms", user: { id: "u1", username: "ed", email: "e@example.com", role: "admin" }, permissions: ADMIN_PERMS });
    }
    if (url.endsWith("/auth/refresh")) {
      assert.equal(JSON.parse(opts.body).refresh_token, "ref-1");
      return jsonResponse(200, { access_token: "tok-2", refresh_token: "ref-2", permissions: ADMIN_PERMS });
    }
    throw new Error(`unexpected url ${url}`);
  };
  const { token } = createVtcanySession({
    localId: null, username: "ed", displayName: "Ed", email: "e@example.com", mappedRole: "publisher",
    canDownloadPdf: false, vtcanyUserId: "u1", vtcanyRole: "editor", permissions: EPAPER_PUBLISHER_PERMS,
    accessToken: "tok-1", refreshToken: "ref-1",
  });
  const entry = sessionEntryFromRequest(reqFromCookie(`epaper_session=${token}`));
  entry.vtcany.meCheckedAt = 0;
  const r = await verifyVtcanySession(entry, stub);
  assert.equal(r.ok, true);
  assert.equal(entry.vtcany.accessToken, "tok-2");
  assert.equal(entry.vtcany.refreshToken, "ref-2");
  assert.equal(entry.user.role, "admin", "role upgrade from verified /me applies immediately");
});

test("verify: refresh failure (backend restart wiping in-memory tokens) means re-login, no loop", async () => {
  let calls = 0;
  const stub = async (url) => {
    calls += 1;
    if (url.endsWith("/auth/refresh")) return jsonResponse(401, { error: "invalid refresh token" });
    return jsonResponse(401, { error: "invalid token" });
  };
  const { token } = createVtcanySession({
    localId: null, username: "ed", displayName: "Ed", email: "e@example.com", mappedRole: "publisher",
    canDownloadPdf: false, vtcanyUserId: "u1", vtcanyRole: "editor", permissions: EPAPER_PUBLISHER_PERMS,
    accessToken: "tok-1", refreshToken: "ref-1",
  });
  const entry = sessionEntryFromRequest(reqFromCookie(`epaper_session=${token}`));
  entry.vtcany.meCheckedAt = 0;
  const r = await verifyVtcanySession(entry, stub);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "reauth");
  assert.equal(calls, 2, "exactly /me + one refresh, never a loop");
});

test("verify: /me succeeding as enduser, or with permissions revoked, denies CMS", async () => {
  const enduser = async () => jsonResponse(200, { kind: "enduser", user: { id: "eu1" }, profiles: [] });
  const { token: t1 } = createVtcanySession({
    localId: null, username: "eu", displayName: "Eu", email: "eu@example.com", mappedRole: "reader",
    canDownloadPdf: false, vtcanyUserId: "eu1", vtcanyRole: null, permissions: [],
    accessToken: "tok-eu", refreshToken: null,
  });
  const e1 = sessionEntryFromRequest(reqFromCookie(`epaper_session=${t1}`));
  e1.vtcany.meCheckedAt = 0;
  const r1 = await verifyVtcanySession(e1, enduser);
  assert.equal(r1.ok, false);
  assert.equal(r1.reason, "forbidden");

  const revoked = async () => jsonResponse(200, { kind: "cms", user: { id: "u1", username: "ed", email: "e@example.com", role: "editor" }, permissions: [] });
  const { token: t2 } = createVtcanySession({
    localId: 9, username: "ed", displayName: "Ed", email: "e@example.com", mappedRole: "publisher",
    canDownloadPdf: false, vtcanyUserId: "u1", vtcanyRole: "editor", permissions: EPAPER_PUBLISHER_PERMS,
    accessToken: "tok-1", refreshToken: "ref-1",
  });
  const e2 = sessionEntryFromRequest(reqFromCookie(`epaper_session=${t2}`));
  e2.vtcany.meCheckedAt = 0;
  const r2 = await verifyVtcanySession(e2, revoked);
  assert.equal(r2.ok, false);
  assert.equal(r2.reason, "forbidden");
});

test("fetchVtcanyMe: 401 vs unreachable are distinct reasons", async () => {
  const unauth = await fetchVtcanyMe("bad", async () => jsonResponse(401, {}));
  assert.equal(unauth.reason, "unauthorized");
  const down = await fetchVtcanyMe("tok", async () => { throw new Error("down"); });
  assert.equal(down.reason, "backend_unreachable");
});

test("VTCANY session public shape never carries tokens", () => {
  const { user } = createVtcanySession({
    localId: null, username: "ed", displayName: "Ed", email: "e@example.com", mappedRole: "publisher",
    canDownloadPdf: false, vtcanyUserId: "u1", vtcanyRole: "editor", permissions: EPAPER_PUBLISHER_PERMS,
    accessToken: "tok-secret", refreshToken: "ref-secret",
  });
  assert.equal(JSON.stringify(user).includes("tok-secret"), false);
  assert.equal(JSON.stringify(user).includes("ref-secret"), false);
  assert.equal(user.auth_source, "vtcany");
  assert.equal(user.id, null, "unlinked VTCANY account has no local id (upload must 403, see server.mjs)");
  assert.equal(user.can_download_pdf, false);
});
