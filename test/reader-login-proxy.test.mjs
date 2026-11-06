// End-to-end: portal /api/v2/reader/login phai doi email -> identifier
// truoc khi chuyen tiep sang backend (backend chi nhan identifier), va
// loi dang {error:{code, message}} phai hien message chu, khong phai
// "[object Object]". Chay server portal that (tien trinh con) + backend
// gia (stub HTTP). Run: node --test test/reader-login-proxy.test.mjs
import test, { after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const base = 30000 + (process.pid % 5000);
const PORTAL_PORT = base;
const STUB_PORT = base + 1;

let loginBodies = [];

// ---- Backend gia: chi hieu POST /api/v1/auth/user/login ----
const stub = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => { raw += c; });
  req.on("end", () => {
    let body = {};
    try { body = JSON.parse(raw || "{}"); } catch { body = {}; }
    if (req.method === "POST" && req.url === "/api/v1/auth/user/login") {
      loginBodies.push(body);
      if (body.identifier === "ktcn@test.vn" && body.password === "MatKhau123") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          access_token: "acc-1", refresh_token: "ref-1",
          user: { email: "ktcn@test.vn", displayName: "Test" },
        }));
        return;
      }
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { code: "unauthorized", message: "invalid credentials" } }));
      return;
    }
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
  });
});
await new Promise((ok) => stub.listen(STUB_PORT, "127.0.0.1", ok));

// ---- Portal that (tien trinh con), tro backend ve stub ----
const portal = spawn(process.execPath, ["server.mjs"], {
  cwd: root,
  env: {
    ...process.env,
    PORT: String(PORTAL_PORT),
    VTCANY_API_BASE: `http://127.0.0.1:${STUB_PORT}`,
    READER_SESSION_SECRET: "test-secret-for-login-proxy",
    MEDIA_WEBHOOK_SECRET: "test-webhook-secret",
  },
  stdio: "ignore",
});
after(() => { portal.kill("SIGTERM"); stub.close(); });

async function waitPortal() {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORTAL_PORT}/health`);
      if (r.ok) return;
    } catch { /* chua len */ }
    await new Promise((ok) => setTimeout(ok, 100));
  }
  throw new Error("portal khong len sau 10s");
}

async function postLogin(body) {
  const r = await fetch(`http://127.0.0.1:${PORTAL_PORT}/api/v2/reader/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = null; }
  return { status: r.status, data, cookies: r.headers.getSetCookie() };
}

test("login qua portal: email duoc doi thanh identifier, tra user + cookie tsht_reader", async () => {
  await waitPortal();
  loginBodies = [];
  const res = await postLogin({ email: "ktcn@test.vn", password: "MatKhau123" });
  assert.equal(res.status, 200);
  assert.equal(res.data.user.email, "ktcn@test.vn");
  assert.equal(loginBodies.length, 1);
  assert.equal(loginBodies[0].identifier, "ktcn@test.vn");
  assert.equal(loginBodies[0].email, undefined);
  assert.ok(res.cookies.some((c) => c.startsWith("tsht_reader=")));
});

test("login sai: portal tra message chu 'invalid credentials', khong phai '[object Object]'", async () => {
  await waitPortal();
  const res = await postLogin({ email: "ktcn@test.vn", password: "sai" });
  assert.equal(res.status, 401);
  assert.equal(res.data.error, "invalid credentials");
});
