// Tests for Binh luan dot 1 — portal only (thiet-ke-binh-luan-dot-1 §5):
// khung binh luan trang doc (article.js), muc "Binh luan cua toi"
// (tai-khoan.js), proxy server.mjs, marker an/hien o 2 trang phap ly.
// Logic render/escape/phan trang + an/hien theo config.
// Run: node --test test/comments-portal.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const tick = async (n = 8) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };

// ---- Minimal DOM stub (theo mau test/reader-auth.test.mjs) ----
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
    if (this.tagName === "TEMPLATE") this.content = { querySelectorAll: () => [], querySelector: () => null };
  }
  getAttribute(name) { return name in this.attrs ? this.attrs[name] : null; }
  setAttribute(name, value) { this.attrs[name] = String(value); }
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
// Goi truc tiep listener click cua mot element, voi target gia lap
// (stub khong co bubbling).
function fireClickOn(el, target) {
  (el.listeners.click || []).forEach((fn) => fn({ target, preventDefault() {} }));
}

function makeDoc(byId) {
  const docListeners = {};
  const doc = {
    readyState: "complete",
    body: new El("body"),
    head: { appendChild: () => {} },
    createElement: (tag) => new El(tag),
    getElementById: (id) => byId[id] || null,
    addEventListener: (type, fn) => { (docListeners[type] = docListeners[type] || []).push(fn); },
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  return { doc, docListeners };
}

function makeFetch(routes, fetchCalls) {
  return async (url, opts = {}) => {
    fetchCalls.push({ url, opts });
    const key = (opts.method || "GET") + " " + String(url).split("?")[0];
    const route = routes[key];
    const res = typeof route === "function" ? await route(url, opts) : route;
    const status = (res && res._status) || 200;
    const body = res && res._status ? res._body : res;
    return { ok: status >= 200 && status < 300, status, json: async () => body || {} };
  };
}
const err = (msg, status = 400) => ({ _status: status, _body: { error: msg } });
const errObj = (code, message, status = 400) => ({ _status: status, _body: { error: { code, message } } });

const ARTICLE = {
  slug: "bai-test", title: "Bài test", sapo: "Sapo test", body: "<p>Nội dung bài.</p>",
  cover: "", category: { slug: "thoi-su", name: "Thời sự" }, authors: ["PV Test"],
  publishAt: "2026-11-08T03:00:00.000Z", allowComments: true, related: [],
};
const COMMENTS_CFG_ON = { enabled: true, moderationMode: "pre", maxLength: 1000, turnstileEnabled: false, requirePhoneVerified: false };
const COMMENTS_CFG_OFF = { enabled: false, moderationMode: "pre", maxLength: 1000, turnstileEnabled: false, requirePhoneVerified: false };
const ME = { user: { displayName: "Bạn đọc test", email: "test@vidu.vn", emailVerifiedAt: "2026-11-01T00:00:00.000Z" } };
const COMMENT_A = { id: "cmt-aaa", authorName: "Bạn đọc test", isNewsroom: false, body: "Bình luận hay.\nDòng hai.", createdAt: "2026-11-08T04:00:00.000Z", mine: true, replies: [{ id: "cmt-rep", authorName: "Tòa soạn", isNewsroom: true, body: "Cảm ơn bạn đọc.", createdAt: "2026-11-08T05:00:00.000Z" }] };
const COMMENT_B = { id: "cmt-bbb", authorName: "Người khác", isNewsroom: false, body: "<script>alert(1)</script> Xin chào", createdAt: "2026-11-08T04:30:00.000Z", mine: false, replies: [] };

// ---- Load article.js trong vm ----
function loadArticle(routes, extra = {}) {
  const fetchCalls = [];
  const byId = {};
  for (const id of ["article", "related", "comments", "comments-status", "comments-title", "comments-form-wrap", "comments-list", "comments-more", "comments-textarea", "comments-counter", "comments-captcha", "comments-submit-btn", "comments-login-btn"]) {
    byId[id] = new El(id === "article" ? "article" : id === "related" ? "div" : id === "comments" ? "section" : "div", { id });
  }
  byId.comments.hidden = true;
  byId["comments-more"].hidden = true;
  const { doc } = makeDoc(byId);
  const winListeners = {};
  const captchaCalls = [];
  const sandbox = {
    console,
    document: doc,
    location: { pathname: "/tin/bai-test", origin: "http://localhost", href: "http://localhost/tin/bai-test" },
    fetch: makeFetch(routes, fetchCalls),
    CustomEvent: function (type, opts) { this.type = type; this.detail = (opts && opts.detail) || {}; },
    setTimeout: (fn) => 0,
    clearTimeout: () => {},
    prompt: extra.prompt !== undefined ? extra.prompt : (() => ""),
    confirm: extra.confirm !== undefined ? extra.confirm : (() => true),
    ReaderCaptcha: {
      render: (c, k, onFail) => { captchaCalls.push({ container: c, key: k }); },
      token: (k) => (extra.captchaToken !== undefined ? extra.captchaToken : undefined),
      reset: () => {},
      ensureConfig: (cb) => cb(null),
    },
    ReaderAuth: { open: (tab) => { sandbox._authOpened = tab; }, close: () => {}, refreshHeader: async () => {} },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.addEventListener = (type, fn) => { (winListeners[type] = winListeners[type] || []).push(fn); };
  sandbox.dispatchEvent = () => true;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, "public/js/article.js"), "utf8"), sandbox, { filename: "article.js" });
  return { sandbox, byId, fetchCalls, captchaCalls, winListeners };
}
function articleRoutes(over = {}) {
  return {
    "GET /api/v2/news/bai-test": ARTICLE,
    "GET /api/v2/comments/config": COMMENTS_CFG_ON,
    "GET /api/v2/reader/me": ME,
    "GET /api/v2/comments": { data: [COMMENT_A, COMMENT_B], total: 2, page: 1, limit: 20 },
    ...over,
  };
}

// ---- Load tai-khoan.js trong vm ----
function loadTaiKhoan(routes, extra = {}) {
  const fetchCalls = [];
  const byId = {};
  for (const id of ["account-msg", "account-loading", "account-login-prompt", "account-main", "account-email", "account-name", "account-verify", "account-resend-box", "account-resend-captcha", "account-resend-btn", "account-save-btn", "account-login-btn", "account-pw-form", "account-pw-current", "account-pw-new", "account-pw-confirm", "account-delete-btn", "account-delete-form", "account-delete-reason", "account-delete-confirm-btn", "account-delete-cancel-btn", "account-logout-btn", "account-comments", "account-comments-list", "account-comments-more"]) {
    byId[id] = new El("div", { id });
  }
  byId["account-comments"].hidden = true;
  byId["account-comments-more"].hidden = true;
  const { doc } = makeDoc(byId);
  const winListeners = {};
  const sandbox = {
    console,
    document: doc,
    location: { pathname: "/tai-khoan", href: "http://localhost/tai-khoan" },
    fetch: makeFetch(routes, fetchCalls),
    CustomEvent: function (type, opts) { this.type = type; this.detail = (opts && opts.detail) || {}; },
    setTimeout: (fn) => 0,
    clearTimeout: () => {},
    confirm: extra.confirm !== undefined ? extra.confirm : (() => true),
    scrollTo: () => {},
    ReaderCaptcha: { render: () => {}, token: () => undefined, reset: () => {}, ensureConfig: (cb) => cb(null) },
    ReaderAuth: { open: () => {}, close: () => {}, refreshHeader: async () => {} },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.addEventListener = (type, fn) => { (winListeners[type] = winListeners[type] || []).push(fn); };
  sandbox.dispatchEvent = () => true;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(root, "public/js/tai-khoan.js"), "utf8"), sandbox, { filename: "tai-khoan.js" });
  return { sandbox, byId, fetchCalls, winListeners };
}

// ================= Helpers (TshtComments) =================
test("shouldShowComments: chi hien khi enabled=true VA allowComments=true", async () => {
  const { sandbox } = loadArticle(articleRoutes({ "GET /api/v2/comments/config": COMMENTS_CFG_OFF }));
  await tick();
  const f = sandbox.TshtComments.shouldShowComments;
  assert.equal(f({ enabled: true }, true), true);
  assert.equal(f({ enabled: false }, true), false);
  assert.equal(f({ enabled: true }, false), false);
  assert.equal(f({ enabled: false }, false), false);
  assert.equal(f(null, true), false);
  assert.equal(f({ enabled: true }, undefined), false);
});

test("formatCommentBody: escape HTML, giu xuong dong thanh <br>, script chi hien dang chu", async () => {
  const { sandbox } = loadArticle(articleRoutes({ "GET /api/v2/comments/config": COMMENTS_CFG_OFF }));
  await tick();
  const f = sandbox.TshtComments.formatCommentBody;
  assert.equal(f("a<b>&\"'"), "a&lt;b&gt;&amp;&quot;&#39;");
  assert.equal(f("dong 1\ndong 2"), "dong 1<br>dong 2");
  assert.equal(f("<script>alert(1)</script>"), "&lt;script&gt;alert(1)&lt;/script&gt;");
  assert.ok(!f("<script>alert(1)</script>").includes("<script>"));
  assert.equal(f(null), "");
  assert.equal(f(""), "");
});

test("hasMoreComments: dung ranh gioi page*limit < total", async () => {
  const { sandbox } = loadArticle(articleRoutes({ "GET /api/v2/comments/config": COMMENTS_CFG_OFF }));
  await tick();
  const f = sandbox.TshtComments.hasMoreComments;
  assert.equal(f(1, 20, 21), true);
  assert.equal(f(1, 20, 20), false);
  assert.equal(f(1, 20, 2), false);
  assert.equal(f(2, 20, 41), true);
  assert.equal(f(2, 20, 40), false);
});

test("commentErrorMessage: hien dung thong bao loi API (banned / chua xac nhan email / da bao cao / 429)", async () => {
  const { sandbox } = loadArticle(articleRoutes({ "GET /api/v2/comments/config": COMMENTS_CFG_OFF }));
  await tick();
  const f = sandbox.TshtComments.commentErrorMessage;
  assert.equal(f({ error: { code: "forbidden", message: "tai khoan bi khoa" } }, 403), "Tài khoản đã bị khóa.");
  assert.equal(f({ error: { code: "email_not_verified", message: "Cần xác nhận email trước khi bình luận" } }, 403), "Cần xác nhận email trước khi bình luận.");
  assert.equal(f({ error: { code: "already_reported", message: "already reported" } }, 409), "Bạn đã báo cáo bình luận này.");
  assert.equal(f({ error: "comment_duplicate" }, 409), "Bạn đã gửi bình luận giống hệt trước đó.");
  assert.match(f({ error: "too many requests" }, 429), /quá nhanh/);
  assert.equal(f({ error: "co loi xay ra" }, 500), "co loi xay ra");
  assert.equal(f({}, 500), "Có lỗi xảy ra, vui lòng thử lại sau.");
});

// ================= Khung binh luan trang doc =================
test("config tat (enabled=false): khung binh luan an, khong goi API danh sach", async () => {
  const { byId, fetchCalls } = loadArticle(articleRoutes({ "GET /api/v2/comments/config": COMMENTS_CFG_OFF }));
  await tick(12);
  assert.equal(byId.comments.hidden, true);
  assert.equal(fetchCalls.some((c) => c.url.startsWith("/api/v2/comments?")), false);
});

test("allowComments=false: khung binh luan an du config bat", async () => {
  const noAllow = { ...ARTICLE, allowComments: false };
  const { byId, fetchCalls } = loadArticle(articleRoutes({ "GET /api/v2/news/bai-test": noAllow }));
  await tick(12);
  assert.equal(byId.comments.hidden, true);
  assert.equal(fetchCalls.some((c) => c.url.startsWith("/api/v2/comments?")), false);
});

test("chua dang nhap: hien nut Dang nhap de binh luan, khong hien form; trang thai rong hien dung", async () => {
  const { byId, sandbox } = loadArticle(articleRoutes({
    "GET /api/v2/reader/me": err("chua dang nhap", 401),
    "GET /api/v2/comments": { data: [], total: 0, page: 1, limit: 20 },
  }));
  await tick(12);
  assert.equal(byId.comments.hidden, false);
  assert.match(byId["comments-form-wrap"].innerHTML, /Đăng nhập để bình luận/);
  assert.match(byId["comments-list"].innerHTML, /Chưa có bình luận nào\. Hãy là người đầu tiên bình luận\./);
  byId["comments-login-btn"].dispatch("click");
  assert.equal(sandbox._authOpened, "login");
});

test("sau khi dang nhap (reader-auth:changed): hien form voi ten minh, bo dem cap nhat", async () => {
  const routes = articleRoutes({ "GET /api/v2/reader/me": err("chua dang nhap", 401) });
  const { byId, winListeners } = loadArticle(routes);
  await tick(12);
  assert.match(byId["comments-form-wrap"].innerHTML, /Đăng nhập để bình luận/);
  routes["GET /api/v2/reader/me"] = ME;
  (winListeners["reader-auth:changed"] || []).forEach((fn) => fn({}));
  await tick(12);
  assert.match(byId["comments-form-wrap"].innerHTML, /Bạn đọc test/);
  const ta = byId["comments-textarea"];
  ta.value = "xin chào";
  ta.dispatch("input");
  assert.equal(byId["comments-counter"].textContent, "8/1000");
});

test("gui binh luan thanh cong (201 pending): hien cho duyet, form trong, KHONG hien ngay trong danh sach", async () => {
  let posted = null;
  const { byId, fetchCalls } = loadArticle(articleRoutes({
    "POST /api/v2/reader/comments": async (url, opts) => {
      posted = JSON.parse(opts.body);
      return { _status: 201, _body: { id: "cmt-new", status: "pending", authorName: "Bạn đọc test", body: posted.body, createdAt: "2026-11-08T06:00:00.000Z" } };
    },
  }));
  await tick(12);
  byId["comments-textarea"].value = "Bình luận mới";
  byId["comments-submit-btn"].dispatch("click");
  await tick(12);
  assert.equal(posted.articleSlug, "bai-test");
  assert.equal(posted.body, "Bình luận mới");
  assert.equal(byId["comments-textarea"].value, "");
  assert.match(byId["comments-status"].textContent, /đang chờ tòa soạn duyệt/);
  assert.equal(byId["comments-list"].innerHTML.includes("Bình luận mới"), false);
  assert.equal(fetchCalls.filter((c) => c.url === "/api/v2/reader/comments" && c.opts.method === "POST").length, 1);
});

test("gui binh luan bi loai link (linksRemoved=true): hien them thong bao lien ket da bi loai", async () => {
  const { byId } = loadArticle(articleRoutes({
    "POST /api/v2/reader/comments": { _status: 201, _body: { id: "cmt-new", status: "pending", linksRemoved: true } },
  }));
  await tick(12);
  byId["comments-textarea"].value = "xem https://example.com/x nhé";
  byId["comments-submit-btn"].dispatch("click");
  await tick(12);
  assert.match(byId["comments-status"].textContent, /đang chờ tòa soạn duyệt/);
  assert.match(byId["comments-status"].textContent, /Liên kết đã được loại bỏ khỏi bình luận\./);
});

test("gui binh luan bi 403 banned: hien dung thong bao tai khoan bi khoa", async () => {
  const { byId } = loadArticle(articleRoutes({
    "POST /api/v2/reader/comments": errObj("forbidden", "tai khoan bi khoa", 403),
  }));
  await tick(12);
  byId["comments-textarea"].value = "thử gửi";
  byId["comments-submit-btn"].dispatch("click");
  await tick(12);
  assert.equal(byId["comments-status"].textContent, "Tài khoản đã bị khóa.");
});

test("danh sach: escape + giu xuong dong, tra loi toa son long duoi co nhan, mine co nut Xoa, nguoi khac khong", async () => {
  const { byId } = loadArticle(articleRoutes());
  await tick(12);
  const html = byId["comments-list"].innerHTML;
  assert.match(html, /Bình luận hay\.<br>Dòng hai\./);
  assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"), "script phai hien dang chu da escape");
  assert.ok(!html.includes("<script>alert(1)</script>"), "khong duoc chen script that");
  assert.match(html, /Tòa soạn/);
  assert.match(html, /Cảm ơn bạn đọc\./);
  assert.ok(html.includes('data-action="delete" data-comment-id="cmt-aaa"'), "binh luan cua minh phai co nut Xoa");
  assert.ok(!html.includes('data-action="delete" data-comment-id="cmt-bbb"'), "binh luan nguoi khac khong co nut Xoa");
  assert.ok(html.includes('data-action="report" data-comment-id="cmt-bbb"'), "co nut Bao cao vi pham");
  assert.equal(byId["comments-title"].textContent, "Bình luận (2)");
});

test("xoa binh luan cua minh: confirm -> DELETE, item bien khoi danh sach", async () => {
  const { byId, fetchCalls } = loadArticle(articleRoutes({
    "DELETE /api/v2/reader/comments/cmt-aaa": { ok: true },
  }));
  await tick(12);
  assert.ok(byId["comments-list"].innerHTML.includes("Bình luận hay."));
  const btn = new El("button", { "data-action": "delete", "data-comment-id": "cmt-aaa" });
  fireClickOn(byId.comments, btn);
  await tick(12);
  assert.equal(fetchCalls.filter((c) => c.url === "/api/v2/reader/comments/cmt-aaa" && c.opts.method === "DELETE").length, 1);
  assert.equal(byId["comments-list"].innerHTML.includes("Bình luận hay."), false);
  assert.equal(byId["comments-title"].textContent, "Bình luận (1)");
});

test("bao cao vi pham: 409 already_reported -> hien Ban da bao cao binh luan nay", async () => {
  const { byId, fetchCalls } = loadArticle(articleRoutes({
    "POST /api/v2/reader/comments/cmt-bbb/report": errObj("already_reported", "already reported", 409),
  }, { prompt: () => "noi dung xuc pham" }));
  await tick(12);
  const btn = new El("button", { "data-action": "report", "data-comment-id": "cmt-bbb" });
  fireClickOn(byId.comments, btn);
  await tick(12);
  assert.equal(fetchCalls.filter((c) => c.url === "/api/v2/reader/comments/cmt-bbb/report").length, 1);
  assert.equal(byId["comments-status"].textContent, "Bạn đã báo cáo bình luận này.");
});

test("bao cao thanh cong: toast Da gui bao cao; nut Xem them chi hien khi con trang", async () => {
  const { byId, fetchCalls } = loadArticle(articleRoutes({
    "GET /api/v2/comments": { data: [COMMENT_A], total: 25, page: 1, limit: 20 },
    "POST /api/v2/reader/comments/cmt-aaa/report": { ok: true, reportCount: 1, hidden: false },
  }, { prompt: () => "" }));
  await tick(12);
  assert.equal(byId["comments-more"].hidden, false);
  const btn = new El("button", { "data-action": "report", "data-comment-id": "cmt-aaa" });
  fireClickOn(byId.comments, btn);
  await tick(12);
  assert.equal(byId["comments-status"].textContent, "Đã gửi báo cáo.");
  assert.equal(fetchCalls.filter((c) => c.url === "/api/v2/reader/comments/cmt-aaa/report").length, 1);
});

test("Turnstile bat (turnstileEnabled=true): render widget captcha trong form", async () => {
  const cfg = { ...COMMENTS_CFG_ON, turnstileEnabled: true };
  const { captchaCalls } = loadArticle(articleRoutes({ "GET /api/v2/comments/config": cfg }));
  await tick(12);
  assert.equal(captchaCalls.length, 1);
  assert.equal(captchaCalls[0].key, "comment");
});

// ================= Binh luan cua toi (tai-khoan.js) =================
test("TshtMyComments: nhan trang thai + format body + hasMore", async () => {
  const { sandbox } = loadTaiKhoan({
    "GET /api/v2/reader/me": ME,
    "GET /api/v2/comments/config": COMMENTS_CFG_OFF,
  });
  await tick(12);
  const h = sandbox.TshtMyComments;
  assert.equal(h.statusLabel("pending"), "Chờ duyệt");
  assert.equal(h.statusLabel("approved"), "Đã duyệt");
  assert.equal(h.statusLabel("rejected"), "Bị từ chối");
  assert.equal(h.statusLabel("hidden"), "Đã ẩn");
  assert.equal(h.formatBody("a<b>\nx"), "a&lt;b&gt;<br>x");
  assert.equal(h.hasMore(1, 20, 21), true);
  assert.equal(h.hasMore(1, 20, 20), false);
  assert.equal(h.limit, 20);
});

test("tai-khoan, config tat: section Binh luan cua toi an, KHONG goi API mine", async () => {
  const { byId, fetchCalls } = loadTaiKhoan({
    "GET /api/v2/reader/me": ME,
    "GET /api/v2/comments/config": COMMENTS_CFG_OFF,
  });
  await tick(12);
  assert.equal(byId["account-comments"].hidden, true);
  assert.equal(fetchCalls.some((c) => c.url.startsWith("/api/v2/reader/comments/mine")), false);
});

test("tai-khoan, config bat: hien danh sach, bi tu choi kem ly do, xoa duoc", async () => {
  const mine = [
    { id: "m1", articleSlug: "bai-1", articleTitle: "Bài một", body: "Chờ duyệt nè", status: "pending", createdAt: "2026-11-08T04:00:00.000Z" },
    { id: "m2", articleSlug: "bai-2", articleTitle: "Bài hai", body: "Bị từ chối", status: "rejected", moderationReason: "Nội dung không phù hợp", createdAt: "2026-11-07T04:00:00.000Z" },
    { id: "m3", articleSlug: "bai-3", articleTitle: "Bài ba", body: "Đã duyệt", status: "approved", createdAt: "2026-11-06T04:00:00.000Z" },
  ];
  const { byId, fetchCalls } = loadTaiKhoan({
    "GET /api/v2/reader/me": ME,
    "GET /api/v2/comments/config": COMMENTS_CFG_ON,
    "GET /api/v2/reader/comments/mine": { data: mine, total: 3, page: 1, limit: 20 },
    "DELETE /api/v2/reader/comments/m2": { ok: true },
  });
  await tick(12);
  assert.equal(byId["account-comments"].hidden, false);
  const html = byId["account-comments-list"].innerHTML;
  assert.match(html, /Bài một/);
  assert.match(html, /Chờ duyệt/);
  assert.match(html, /Bị từ chối/);
  assert.match(html, /Lý do từ chối: Nội dung không phù hợp/);
  assert.match(html, /Đã duyệt/);
  assert.ok(html.includes('href="/tin/bai-2"'), "tieu de link toi bai viet");
  const btn = new El("button", { "data-my-comment-delete": "m2" });
  fireClickOn(byId["account-comments"], btn);
  await tick(12);
  assert.equal(fetchCalls.filter((c) => c.url === "/api/v2/reader/comments/m2" && c.opts.method === "DELETE").length, 1);
  assert.equal(byId["account-comments-list"].innerHTML.includes("Bị từ chối"), false);
});

// ================= Static guards: server + HTML =================
test("server.mjs: proxy cong khai comments + 4 route reader comments + allowComments", () => {
  const src = fs.readFileSync(path.join(root, "server.mjs"), "utf8");
  assert.match(src, /u\.pathname === "\/api\/v2\/comments\/config"/);
  assert.match(src, /u\.pathname === "\/api\/v2\/comments"/);
  assert.match(src, /fetchVtcanyEpaperJson\("\/comments\/config"\)/);
  assert.match(src, /u\.pathname === "\/api\/v2\/reader\/comments"/);
  assert.match(src, /u\.pathname === "\/api\/v2\/reader\/comments\/mine"/);
  assert.match(src, /readerCommentIdMatch/);
  assert.match(src, /readerCommentReportMatch/);
  assert.match(src, /backendAuth\(`\/comments\/\$\{readerCommentIdMatch\[1\]\}`, \{ method: "DELETE"/);
  assert.match(src, /allowComments: it\.allowComments !== false/);
});

test("article.html: co section binh luan + nap reader-captcha.js + bump ?v= article.js", () => {
  const html = fs.readFileSync(path.join(root, "public/article.html"), "utf8");
  assert.match(html, /<section id="comments" class="comments-section"[^>]*hidden>/);
  assert.match(html, /reader-captcha\.js\?v=/);
  assert.match(html, /article\.js\?v=20261108-1/);
});

test("tai-khoan.html: co section Binh luan cua toi + bump ?v= tai-khoan.js", () => {
  const html = fs.readFileSync(path.join(root, "public/tai-khoan.html"), "utf8");
  assert.match(html, /<section class="account-card" id="account-comments" hidden>/);
  assert.match(html, /tai-khoan\.js\?v=20261108-1/);
});

test("dieu-khoan + chinh-sach: muc binh luan boc data-comments-section, an mac dinh, co ghi Du thao cho phap che", () => {
  for (const f of ["public/dieu-khoan-su-dung.html", "public/chinh-sach-bao-mat.html"]) {
    const html = fs.readFileSync(path.join(root, f), "utf8");
    assert.match(html, /<div data-comments-section hidden>/);
    assert.match(html, /Dự thảo, chờ pháp chế/);
    assert.match(html, /\/api\/v2\/comments\/config/);
    assert.match(html, /querySelectorAll\("\[data-comments-section\]"\)/);
  }
  const dk = fs.readFileSync(path.join(root, "public/dieu-khoan-su-dung.html"), "utf8");
  assert.match(dk, /<h2>3\. Bình luận<\/h2>/);
  assert.match(dk, /chỉ bạn đọc đã đăng nhập và đã xác nhận email/);
  const cs = fs.readFileSync(path.join(root, "public/chinh-sach-bao-mat.html"), "utf8");
  assert.match(cs, /<h2>3\. Dữ liệu bình luận<\/h2>/);
  assert.match(cs, /lưu tối đa 12 tháng/);
});
