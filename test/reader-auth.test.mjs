// Tests for the reader login/register dialog (portal only):
// open/close/Esc/backdrop, tab switching, login success -> header shows
// the reader name, login failure -> generic message (no email leak),
// duplicate register -> specific message, forgot -> generic message,
// captcha off -> no Turnstile script, submit without captcha token.
// Run: node --test test/reader-auth.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// ---- Minimal DOM stub ----
class El {
  constructor(tag, attrs = {}) {
    this.tagName = (tag || "div").toUpperCase();
    this.attrs = { ...attrs };
    this.children = [];
    this.parentNode = null;
    this.listeners = {};
    this.hidden = false;
    this.disabled = false;
    this.checked = false;
    this.value = "";
    this.textContent = "";
    this.innerHTML = "";
    this.style = {};
    this._classes = new Set((attrs.class || "").split(/\s+/).filter(Boolean));
    this.classList = {
      add: (c) => this._classes.add(c),
      remove: (c) => this._classes.delete(c),
      toggle: (c, force) => { const on = force === undefined ? !this._classes.has(c) : !!force; if (on) this._classes.add(c); else this._classes.delete(c); },
      contains: (c) => this._classes.has(c),
    };
  }
  getAttribute(name) { return name in this.attrs ? this.attrs[name] : null; }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  get nextSibling() {
    if (!this.parentNode) return null;
    const i = this.parentNode.children.indexOf(this);
    return this.parentNode.children[i + 1] || null;
  }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  insertBefore(child, ref) {
    child.parentNode = this;
    const i = ref ? this.children.indexOf(ref) : -1;
    if (i < 0) this.children.push(child); else this.children.splice(i, 0, child);
    return child;
  }
  remove() {
    if (!this.parentNode) return;
    const i = this.parentNode.children.indexOf(this);
    if (i >= 0) this.parentNode.children.splice(i, 1);
    this.parentNode = null;
  }
  addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
  dispatch(type, event = {}) {
    const ev = { type, ...event, preventDefault() {}, target: this };
    (this.listeners[type] || []).forEach((fn) => fn(ev));
    return ev;
  }
  focus() {}
  closest(sel) {
    let el = this;
    while (el) { if (matches(el, sel)) return el; el = el.parentNode; }
    return null;
  }
  querySelector(sel) { return querySelectorAll(this, sel)[0] || null; }
  querySelectorAll(sel) { return querySelectorAll(this, sel); }
}

function matches(el, sel) {
  if (!sel || !el || !el.tagName) return false;
  const m = sel.match(/^([a-zA-Z][a-zA-Z0-9]*)?(\.[a-zA-Z0-9_-]+)?(\[([^\]=]+)(?:='([^']*)')?\])?$/);
  if (!m) return false;
  const [, tag, cls, , attr, val] = m;
  if (tag && el.tagName.toLowerCase() !== tag.toLowerCase()) return false;
  if (cls && !el._classes.has(cls.slice(1))) return false;
  if (attr) {
    if (!(attr in el.attrs)) return false;
    if (val !== undefined && el.attrs[attr] !== val) return false;
  }
  return true;
}
function querySelectorAll(rootEl, sel) {
  const out = [];
  (function walk(el) {
    if (matches(el, sel)) out.push(el);
    (el.children || []).forEach(walk);
  })(rootEl);
  return out;
}

function buildFixture() {
  const docListeners = {};
  const dispatched = [];
  const headChildren = [];
  const doc = {
    readyState: "complete",
    body: new El("body"),
    head: { appendChild: (el) => headChildren.push(el) },
    createElement: (tag) => new El(tag),
    addEventListener: (type, fn) => { (docListeners[type] = docListeners[type] || []).push(fn); },
    querySelector: (sel) => querySelectorAll(doc, sel)[0] || null,
    querySelectorAll: (sel) => querySelectorAll(doc, sel),
  };
  doc.children = [];
  const dialog = new El("div", { "data-reader-auth-dialog": "" });
  dialog.hidden = true;
  const backdrop = new El("div", { "data-reader-auth-close": "" });
  const panel = new El("div");
  const xBtn = new El("button", { "data-reader-auth-close": "" });
  const tabLogin = new El("button", { "data-reader-auth-tab": "login", class: "reader-auth-tab is-active" });
  const tabRegister = new El("button", { "data-reader-auth-tab": "register", class: "reader-auth-tab" });
  const errEl = new El("p", { "data-reader-auth-error": "" });
  errEl.hidden = true;
  const okEl = new El("p", { "data-reader-auth-ok": "" });
  okEl.hidden = true;
  const noteEl = new El("p", { "data-reader-auth-note": "" });

  function makeForm(kind, fields) {
    const form = new El("form", { "data-reader-auth-form": kind });
    form.hidden = kind !== "login";
    fields.forEach((f) => {
      const input = new El("input", { name: f, type: f === "email" ? "email" : f === "password" ? "password" : f === "termsAccepted" ? "checkbox" : "text" });
      if (f === "password") input.type = "password";
      form[f] = input;
      form.appendChild(input);
    });
    const captcha = new El("div", { "data-reader-captcha": kind });
    form.appendChild(captcha);
    const submit = new El("button", { class: "reader-auth-submit" });
    submit.type = "submit";
    form.appendChild(submit);
    return form;
  }
  const loginForm = makeForm("login", ["email", "password"]);
  const registerForm = makeForm("register", ["displayName", "email", "password", "termsAccepted"]);
  const forgotForm = makeForm("forgot", ["email"]);
  const forgotLink = new El("button", { "data-reader-auth-show": "forgot" });
  loginForm.appendChild(forgotLink);
  const backLink = new El("button", { "data-reader-auth-show": "login" });
  forgotForm.appendChild(backLink);
  const pwToggle = new El("button", { "data-reader-pw-toggle": "" });
  const pwWrap = new El("span");
  pwWrap.appendChild(loginForm.password);
  pwWrap.appendChild(pwToggle);
  loginForm.appendChild(pwWrap);
  panel.appendChild(xBtn);
  panel.appendChild(tabLogin);
  panel.appendChild(tabRegister);
  panel.appendChild(errEl);
  panel.appendChild(okEl);
  panel.appendChild(loginForm);
  panel.appendChild(registerForm);
  panel.appendChild(forgotForm);
  panel.appendChild(noteEl);
  dialog.appendChild(backdrop);
  dialog.appendChild(panel);
  doc.appendChild = (el) => { el.parentNode = doc; doc.children.push(el); return el; };
  doc.appendChild(dialog);

  function makeAccount() {
    const acc = new El("span", { "data-reader-account": "" });
    acc.hidden = true;
    const btn = new El("button", { "data-reader-account-btn": "" });
    const name = new El("span", { "data-reader-account-name": "" });
    btn.appendChild(name);
    const menu = new El("span", { "data-reader-account-menu": "" });
    menu.hidden = true;
    const logout = new El("button", { "data-reader-logout": "" });
    menu.appendChild(logout);
    acc.appendChild(btn);
    acc.appendChild(menu);
    acc._btn = btn; acc._name = name; acc._menu = menu; acc._logout = logout;
    return acc;
  }
  const openBtns = [new El("button", { "data-reader-auth-open": "" }), new El("button", { "data-reader-auth-open": "" })];
  const accounts = [makeAccount(), makeAccount()];
  openBtns.forEach((b) => doc.appendChild(b));
  accounts.forEach((a) => doc.appendChild(a));
  return {
    doc, dialog, tabLogin, tabRegister, errEl, okEl, noteEl,
    loginForm, registerForm, forgotForm, forgotLink, backLink, pwToggle,
    openBtns, accounts, dispatched, headChildren, docListeners,
    fireKey: (key) => (docListeners.keydown || []).forEach((fn) => fn({ key })),
  };
}

function loadReaderAuth(fixture, routes) {
  const fetchCalls = [];
  const sandbox = {
    console,
    document: fixture.doc,
    location: { pathname: "/", href: "/" },
    fetch: async (url, opts = {}) => {
      fetchCalls.push({ url, opts });
      const route = routes[url.split("?")[0]];
      const res = typeof route === "function" ? route(JSON.parse(opts.body || "{}"), opts) : route;
      const status = (res && res._status) || 200;
      const body = res && res._status ? res._body : res;
      return { ok: status >= 200 && status < 300, status, json: async () => body || {} };
    },
    CustomEvent: function (type, opts) { this.type = type; this.detail = (opts && opts.detail) || {}; },
    setTimeout: (fn) => 0,
    clearTimeout: () => {},
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.window.dispatchEvent = (ev) => { fixture.dispatched.push(ev); return true; };
  sandbox.addEventListener = () => {};
  sandbox.document.defaultView = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, "public/js/reader-auth.js"), "utf8"), sandbox, { filename: "reader-auth.js" });
  return { sandbox, fetchCalls };
}
const tick = async (n = 4) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };
const err = (msg, status = 400) => ({ _status: status, _body: { error: msg } });

test("mo hop thoai mac dinh o tab Dang nhap; chuyen tab Dang ky / Quen mat khau", async () => {
  const f = buildFixture();
  const { sandbox } = loadReaderAuth(f, {
    "/api/v2/reader/config": { configured: true, turnstileSiteKey: null },
    "/api/v2/reader/me": err("chua dang nhap", 401),
  });
  await tick();
  sandbox.ReaderAuth.open("login");
  assert.equal(f.dialog.hidden, false);
  assert.equal(f.loginForm.hidden, false);
  assert.equal(f.registerForm.hidden, true);
  assert.equal(f.tabLogin.classList.contains("is-active"), true);
  f.tabRegister.dispatch("click");
  assert.equal(f.registerForm.hidden, false);
  assert.equal(f.loginForm.hidden, true);
  assert.equal(f.tabRegister.classList.contains("is-active"), true);
  f.tabLogin.dispatch("click");
  f.forgotLink.dispatch("click");
  assert.equal(f.forgotForm.hidden, false);
  assert.equal(f.loginForm.hidden, true);
  f.backLink.dispatch("click");
  assert.equal(f.loginForm.hidden, false);
});

test("Esc dong hop thoai va xoa mat khau; bam backdrop dong", async () => {
  const f = buildFixture();
  const { sandbox } = loadReaderAuth(f, {
    "/api/v2/reader/config": { configured: true, turnstileSiteKey: null },
    "/api/v2/reader/me": err("chua dang nhap", 401),
  });
  await tick();
  sandbox.ReaderAuth.open("login");
  f.loginForm.password.value = "mat-khau-bi-mat";
  f.fireKey("Escape");
  assert.equal(f.dialog.hidden, true);
  assert.equal(f.loginForm.password.value, "");
  sandbox.ReaderAuth.open("login");
  f.dialog.children[0].dispatch("click"); // backdrop
  assert.equal(f.dialog.hidden, true);
});

test("dang nhap thanh cong: header hien ten, an nut Dang nhap, dong hop thoai", async () => {
  const f = buildFixture();
  const { sandbox, fetchCalls } = loadReaderAuth(f, {
    "/api/v2/reader/config": { configured: true, turnstileSiteKey: null },
    "/api/v2/reader/me": err("chua dang nhap", 401),
    "/api/v2/reader/login": { user: { displayName: "Bạn đọc test", email: "test@vidu.vn" } },
  });
  await tick();
  sandbox.ReaderAuth.open("login");
  f.loginForm.email.value = "test@vidu.vn";
  f.loginForm.password.value = "matkhau123";
  f.loginForm.dispatch("submit");
  await tick();
  assert.equal(f.dialog.hidden, true);
  assert.equal(f.openBtns[0].hidden, true);
  assert.equal(f.openBtns[1].hidden, true);
  assert.equal(f.accounts[0].hidden, false);
  assert.equal(f.accounts[0]._name.textContent, "Bạn đọc test");
  assert.equal(fetchCalls.filter((c) => c.url === "/api/v2/reader/login").length, 1);
  assert.equal(JSON.parse(fetchCalls.find((c) => c.url === "/api/v2/reader/login").opts.body).captchaToken, undefined);
  assert.equal(f.dispatched.some((e) => e.type === "reader-auth:changed" && e.detail.user.displayName === "Bạn đọc test"), true);
});

test("dang nhap sai: bao loi chung, khong lo email co tai khoan, hop thoai van mo", async () => {
  const f = buildFixture();
  const { sandbox } = loadReaderAuth(f, {
    "/api/v2/reader/config": { configured: true, turnstileSiteKey: null },
    "/api/v2/reader/me": err("chua dang nhap", 401),
    "/api/v2/reader/login": err("sai thong tin dang nhap", 401),
  });
  await tick();
  sandbox.ReaderAuth.open("login");
  f.loginForm.email.value = "khong-co@vidu.vn";
  f.loginForm.password.value = "sai-sai-sai";
  f.loginForm.dispatch("submit");
  await tick();
  assert.equal(f.dialog.hidden, false);
  assert.equal(f.errEl.hidden, false);
  assert.equal(f.errEl.textContent, "Email hoặc mật khẩu không đúng.");
  assert.equal(f.errEl.textContent.includes("khong-co@vidu.vn"), false);
});

test("dang ky trung email: bao ro + goi y Dang nhap / Quen mat khau", async () => {
  const f = buildFixture();
  const { sandbox } = loadReaderAuth(f, {
    "/api/v2/reader/config": { configured: true, turnstileSiteKey: null },
    "/api/v2/reader/me": err("chua dang nhap", 401),
    "/api/v2/reader/register": err("email da duoc dang ky", 409),
  });
  await tick();
  sandbox.ReaderAuth.open("register");
  f.registerForm.displayName.value = "Người dùng";
  f.registerForm.email.value = "trung@vidu.vn";
  f.registerForm.password.value = "matkhau123";
  f.registerForm.termsAccepted.checked = true;
  f.registerForm.dispatch("submit");
  await tick();
  assert.equal(f.dialog.hidden, false);
  assert.equal(f.errEl.hidden, false);
  assert.match(f.errEl.textContent, /đã được đăng ký/);
  assert.match(f.errEl.textContent, /Quên mật khẩu/);
});

test("quen mat khau: tra thong bao chung du email co hay khong", async () => {
  const f = buildFixture();
  const { sandbox, fetchCalls } = loadReaderAuth(f, {
    "/api/v2/reader/config": { configured: true, turnstileSiteKey: null },
    "/api/v2/reader/me": err("chua dang nhap", 401),
    "/api/v2/reader/forgot-password": { ok: true },
  });
  await tick();
  sandbox.ReaderAuth.open("forgot");
  f.forgotForm.email.value = "khong-ai-biet@vidu.vn";
  f.forgotForm.dispatch("submit");
  await tick();
  assert.equal(f.okEl.hidden, false);
  assert.match(f.okEl.textContent, /Nếu email đã đăng ký/);
  assert.equal(f.okEl.textContent.includes("khong-ai-biet@vidu.vn"), false);
  assert.equal(fetchCalls.filter((c) => c.url === "/api/v2/reader/forgot-password").length, 1);
});

test("captcha tat (khong site key): khong nap script Turnstile", async () => {
  const f = buildFixture();
  const { sandbox } = loadReaderAuth(f, {
    "/api/v2/reader/config": { configured: true, turnstileSiteKey: null },
    "/api/v2/reader/me": err("chua dang nhap", 401),
  });
  await tick();
  sandbox.ReaderAuth.open("login");
  await tick();
  assert.equal(f.headChildren.length, 0);
});

test("dang xuat: goi logout, header ve nut Dang nhap", async () => {
  const f = buildFixture();
  const { sandbox, fetchCalls } = loadReaderAuth(f, {
    "/api/v2/reader/config": { configured: true, turnstileSiteKey: null },
    "/api/v2/reader/me": { user: { displayName: "Bạn đọc test", email: "test@vidu.vn" } },
    "/api/v2/reader/logout": { ok: true },
  });
  await tick();
  assert.equal(f.accounts[0].hidden, false);
  f.accounts[0]._logout.dispatch("click");
  await tick();
  assert.equal(fetchCalls.filter((c) => c.url === "/api/v2/reader/logout").length, 1);
  assert.equal(f.openBtns[0].hidden, false);
  assert.equal(f.accounts[0].hidden, true);
});

test("dang nhap sai voi loi dang object: hien tieng Viet, khong co [object Object]", async () => {
  const f = buildFixture();
  const { sandbox } = loadReaderAuth(f, {
    "/api/v2/reader/config": { configured: true, turnstileSiteKey: null },
    "/api/v2/reader/me": err("chua dang nhap", 401),
    "/api/v2/reader/login": { _status: 401, _body: { error: { code: "unauthorized", message: "invalid credentials" } } },
  });
  await tick();
  sandbox.ReaderAuth.open("login");
  f.loginForm.email.value = "a@vidu.vn";
  f.loginForm.password.value = "sai-sai-sai";
  f.loginForm.dispatch("submit");
  await tick();
  assert.equal(f.dialog.hidden, false);
  assert.equal(f.errEl.hidden, false);
  assert.equal(f.errEl.textContent, "Email hoặc mật khẩu không đúng.");
  assert.equal(f.errEl.textContent.includes("[object Object]"), false);
});

test("dang nhap sai voi loi dang mang object: ve thong bao chung, khong co [object Object]", async () => {
  const f = buildFixture();
  const { sandbox } = loadReaderAuth(f, {
    "/api/v2/reader/config": { configured: true, turnstileSiteKey: null },
    "/api/v2/reader/me": err("chua dang nhap", 401),
    "/api/v2/reader/login": { _status: 400, _body: { error: [{ property: "email", constraints: { isEmail: "email phai dung dinh dang" } }] } },
  });
  await tick();
  sandbox.ReaderAuth.open("login");
  f.loginForm.email.value = "a@vidu.vn";
  f.loginForm.password.value = "sai-sai-sai";
  f.loginForm.dispatch("submit");
  await tick();
  assert.equal(f.errEl.hidden, false);
  assert.equal(f.errEl.textContent, "Có lỗi xảy ra, vui lòng thử lại sau.");
  assert.equal(f.errEl.textContent.includes("[object Object]"), false);
});

test("nut hien/an mat khau: doi kieu input va icon SVG, khong dung bieu tuong cam xuc", async () => {
  const f = buildFixture();
  const { sandbox } = loadReaderAuth(f, {
    "/api/v2/reader/config": { configured: true, turnstileSiteKey: null },
    "/api/v2/reader/me": err("chua dang nhap", 401),
  });
  await tick();
  sandbox.ReaderAuth.open("login");
  assert.equal(f.loginForm.password.type, "password");
  f.pwToggle.dispatch("click");
  assert.equal(f.loginForm.password.type, "text");
  assert.ok(f.pwToggle.innerHTML.includes("<svg"));
  assert.equal(f.pwToggle.innerHTML.includes("🙈"), false);
  assert.equal(f.pwToggle.innerHTML.includes("👁"), false);
  assert.equal(f.pwToggle.getAttribute("aria-label"), "Ẩn mật khẩu");
  f.pwToggle.dispatch("click");
  assert.equal(f.loginForm.password.type, "password");
  assert.ok(f.pwToggle.innerHTML.includes("<svg"));
  assert.equal(f.pwToggle.getAttribute("aria-label"), "Hiện mật khẩu");
});
