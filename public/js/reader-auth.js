// Dang nhap / dang ky ban doc — hop thoai tren moi trang (Giai doan 1,
// 2026-11-06). Khong dung token o localStorage: phien nam trong cookie
// HttpOnly tsht_reader do portal cap; JS chi goi /api/v2/reader/*.
(function () {
  "use strict";

  var dialog = null;
  var config = null; // { configured, turnstileSiteKey }
  var me = null; // { user } | null
  var turnstileReady = false;
  var turnstileFailed = false;
  var turnstileWidgets = {}; // form -> widget id
  var turnstileRendered = false;

  // Icon mat SVG (thay bieu tuong cam xuc): mat mo = mat khau dang an,
  // mat gach cheo = mat khau dang hien.
  var EYE_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>';
  var EYE_OFF_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-6.5 0-10-8-10-8a18.45 18.45 0 0 1 5.06-6.06M9.9 4.24A9.12 9.12 0 0 1 12 4c6.5 0 10 8 10 8a18.5 18.5 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

  // Boc text loi tu bat ky dang nao backend/proxy tra ve (chuoi, object
  // {message/code}, mang) — khong bao gio String(object) thanh
  // "[object Object]".
  function errText(data) {
    if (data == null) return "";
    if (typeof data === "string") return data;
    if (Array.isArray(data)) return data.map(errText).filter(Boolean).join("; ");
    if (typeof data === "object") return errText(data.error) || errText(data.message) || errText(data.code) || "";
    return "";
  }

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function showError(msg) {
    var el = $("[data-reader-auth-error]", dialog);
    var ok = $("[data-reader-auth-ok]", dialog);
    if (ok) ok.hidden = true;
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
  }
  function showOk(msg) {
    var el = $("[data-reader-auth-ok]", dialog);
    var errEl = $("[data-reader-auth-error]", dialog);
    if (errEl) errEl.hidden = true;
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
  }
  function clearMessages() {
    var errEl = $("[data-reader-auth-error]", dialog);
    var ok = $("[data-reader-auth-ok]", dialog);
    if (errEl) { errEl.hidden = true; errEl.textContent = ""; }
    if (ok) { ok.hidden = true; ok.textContent = ""; }
    var test = $("[data-reader-auth-testlink]", dialog);
    if (test) test.remove();
  }
  function showTestLink(url, label) {
    var ok = $("[data-reader-auth-ok]", dialog);
    if (!ok || !url) return;
    var box = document.createElement("p");
    box.className = "reader-auth-testlink";
    box.setAttribute("data-reader-auth-testlink", "");
    var a = document.createElement("a");
    a.href = url;
    a.textContent = label;
    box.appendChild(document.createTextNode("Liên kết thử nghiệm (chỉ môi trường test): "));
    box.appendChild(a);
    ok.parentNode.insertBefore(box, ok.nextSibling);
  }

  // Loi backend (tieng Viet khong dau) -> thong bao tieng Viet co dau cho
  // ban doc. O buoc dang nhap khong lo email nao da co tai khoan.
  function mapError(data, status) {
    var raw = errText(data);
    if (status === 429) return raw || "Tài khoản tạm khóa, vui lòng thử lại sau 15 phút.";
    if (/sai thong tin dang nhap|invalid credentials/i.test(raw)) return "Email hoặc mật khẩu không đúng.";
    if (/captcha/i.test(raw)) return "Xác minh chống robot thất bại, vui lòng thử lại.";
    if (/email da duoc dang ky|already registered/i.test(raw)) return "Email này đã được đăng ký. Hãy đăng nhập, hoặc dùng “Quên mật khẩu” nếu bạn quên mật khẩu.";
    if (/email chua duoc xac nhan/i.test(raw)) return "Email chưa được xác nhận. Kiểm tra hộp thư để xác nhận, hoặc đăng nhập rồi gửi lại email xác nhận ở trang Tài khoản của tôi.";
    if (/tai khoan bi khoa/i.test(raw)) return "Tài khoản đã bị khóa.";
    if (/tai khoan tam khoa/i.test(raw)) return raw;
    if (/mat khau.*8 ky tu|password.*8/i.test(raw)) return "Mật khẩu tối thiểu 8 ký tự.";
    return raw || "Có lỗi xảy ra, vui lòng thử lại sau.";
  }

  async function api(path, opts) {
    var r;
    try {
      r = await fetch(path, opts);
    } catch (e) {
      return { ok: false, status: 0, data: { error: "Không kết nối được máy chủ, vui lòng thử lại sau." } };
    }
    var data = null;
    try { data = await r.json(); } catch (e) { data = null; }
    return { ok: r.ok, status: r.status, data: data || {} };
  }
  function postJson(path, body) {
    return api(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  }

  // ---- Turnstile (Cloudflare) ----
  function captchaEnabled() { return !!(config && config.turnstileSiteKey); }
  function loadTurnstile() {
    if (!captchaEnabled() || turnstileReady || turnstileFailed) return;
    var s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.defer = true;
    s.onload = function () { turnstileReady = true; renderTurnstile(); };
    s.onerror = function () {
      turnstileFailed = true;
      $all("[data-reader-captcha]", dialog).forEach(function (c) {
        c.textContent = "Không tải được mã chống robot, vui lòng thử lại sau.";
      });
    };
    document.head.appendChild(s);
  }
  function renderTurnstile() {
    if (!turnstileReady || turnstileRendered || !window.turnstile) return;
    turnstileRendered = true;
    ["login", "register", "forgot"].forEach(function (form) {
      var c = $("[data-reader-captcha='" + form + "']", dialog);
      if (!c) return;
      try {
        turnstileWidgets[form] = window.turnstile.render(c, { sitekey: config.turnstileSiteKey, theme: "light" });
      } catch (e) { /* widget loi: submit se bao loi captcha */ }
    });
  }
  function captchaToken(form) {
    if (!captchaEnabled()) return undefined;
    if (!turnstileReady || !window.turnstile || !(form in turnstileWidgets)) return null;
    try { return window.turnstile.getResponse(turnstileWidgets[form]) || ""; } catch (e) { return ""; }
  }
  function resetCaptcha(form) {
    if (!window.turnstile || !(form in turnstileWidgets)) return;
    try { window.turnstile.reset(turnstileWidgets[form]); } catch (e) { /* bo qua */ }
  }

  // ---- Header: nut Dang nhap / ten + menu ----
  function renderHeader() {
    var loggedIn = !!(me && me.user);
    $all("[data-reader-auth-open]").forEach(function (b) { b.hidden = loggedIn; });
    $all("[data-reader-account]").forEach(function (c) {
      c.hidden = !loggedIn;
      var nameEl = $("[data-reader-account-name]", c);
      if (nameEl && loggedIn) nameEl.textContent = me.user.displayName || me.user.email || "Bạn đọc";
      var menu = $("[data-reader-account-menu]", c);
      if (menu) menu.hidden = true;
    });
  }
  function closeAllAccountMenus() {
    $all("[data-reader-account-menu]").forEach(function (m) { m.hidden = true; });
  }
  async function refreshHeader() {
    var r = await api("/api/v2/reader/me");
    me = r.ok ? r.data : null;
    renderHeader();
    return me;
  }

  // ---- Hop thoai ----
  function showForm(name) {
    $all("[data-reader-auth-form]", dialog).forEach(function (f) {
      f.hidden = f.getAttribute("data-reader-auth-form") !== name;
    });
    $all("[data-reader-auth-tab]", dialog).forEach(function (t) {
      var active = t.getAttribute("data-reader-auth-tab") === name;
      t.classList.toggle("is-active", active);
      t.setAttribute("aria-selected", active ? "true" : "false");
    });
    // An ghi chu OAuth o form quen mat khau (khong lien quan).
    var note = $("[data-reader-auth-note]", dialog);
    if (note) note.hidden = name === "forgot";
    clearMessages();
    var form = $("[data-reader-auth-form='" + name + "']", dialog);
    if (form) {
      var input = form.querySelector("input");
      if (input) input.focus();
    }
  }
  function open(tab) {
    if (!dialog) return;
    if (config && !config.configured) {
      dialog.hidden = false;
      document.body.style.overflow = "hidden";
      showForm("login");
      showError("Đăng nhập bạn đọc chưa khả dụng lúc này, vui lòng thử lại sau.");
      return;
    }
    dialog.hidden = false;
    document.body.style.overflow = "hidden";
    showForm(tab === "register" || tab === "forgot" ? tab : "login");
    loadTurnstile();
    renderTurnstile();
  }
  function close() {
    if (!dialog) return;
    dialog.hidden = true;
    document.body.style.overflow = "";
    $all("input[type='password']", dialog).forEach(function (i) { i.value = ""; });
    ["login", "register", "forgot"].forEach(resetCaptcha);
    clearMessages();
    // Mo lai mac dinh o tab Dang nhap lan sau.
    showForm("login");
  }
  function setBusy(form, busy) {
    var btn = form.querySelector(".reader-auth-submit");
    if (btn) btn.disabled = busy;
  }

  async function submitLogin(form) {
    var email = form.email.value.trim();
    var password = form.password.value;
    var token = captchaToken("login");
    if (token === null) { showError("Không tải được mã chống robot, vui lòng thử lại sau."); return; }
    if (token === "") { showError("Vui lòng hoàn thành xác minh chống robot."); return; }
    setBusy(form, true);
    var r = await postJson("/api/v2/reader/login", { email: email, password: password, captchaToken: token });
    setBusy(form, false);
    resetCaptcha("login");
    if (!r.ok) { showError(mapError(r.data, r.status)); return; }
    me = { user: r.data.user };
    renderHeader();
    close();
    window.dispatchEvent(new CustomEvent("reader-auth:changed", { detail: { user: r.data.user } }));
  }
  async function submitRegister(form) {
    var displayName = form.displayName.value.trim();
    var email = form.email.value.trim();
    var password = form.password.value;
    if (!form.termsAccepted.checked) { showError("Vui lòng đồng ý với Điều khoản sử dụng và Chính sách bảo vệ dữ liệu cá nhân."); return; }
    var token = captchaToken("register");
    if (token === null) { showError("Không tải được mã chống robot, vui lòng thử lại sau."); return; }
    if (token === "") { showError("Vui lòng hoàn thành xác minh chống robot."); return; }
    setBusy(form, true);
    var r = await postJson("/api/v2/reader/register", { displayName: displayName, email: email, password: password, termsAccepted: true, captchaToken: token });
    setBusy(form, false);
    resetCaptcha("register");
    if (!r.ok) { showError(mapError(r.data, r.status)); return; }
    // Dang ky xong: an form, hien thong bao gui email (khong tu dong dang
    // nhap — phai xac nhan email moi mo het tinh nang, nhung dang nhap
    // duoc ngay neu muon gui lai email o trang Tai khoan cua toi).
    $all("[data-reader-auth-form]", dialog).forEach(function (f) { f.hidden = true; });
    $all("[data-reader-auth-tab]", dialog).forEach(function (t) { t.classList.remove("is-active"); });
    if (r.data.emailSent === false) {
      showOk("Đăng ký thành công nhưng chưa gửi được email xác nhận lúc này. Hãy đăng nhập rồi vào “Tài khoản của tôi” để gửi lại email xác nhận.");
    } else {
      showOk("Đăng ký thành công! Chúng tôi đã gửi email xác nhận đến " + email + ". Mở email và bấm liên kết để xác nhận (hiệu lực 24 giờ).");
    }
    if (r.data.devVerificationUrl) showTestLink(r.data.devVerificationUrl, "Mở liên kết xác nhận");
  }
  async function submitForgot(form) {
    var email = form.email.value.trim();
    var token = captchaToken("forgot");
    if (token === null) { showError("Không tải được mã chống robot, vui lòng thử lại sau."); return; }
    if (token === "") { showError("Vui lòng hoàn thành xác minh chống robot."); return; }
    setBusy(form, true);
    var r = await postJson("/api/v2/reader/forgot-password", { email: email, captchaToken: token });
    setBusy(form, false);
    resetCaptcha("forgot");
    if (!r.ok) { showError(mapError(r.data, r.status)); return; }
    showOk("Nếu email đã đăng ký, liên kết đặt lại mật khẩu đã được gửi. Kiểm tra hộp thư (kể cả mục Spam). Liên kết có hiệu lực 30 phút.");
    if (r.data.devResetUrl) showTestLink(r.data.devResetUrl, "Mở liên kết đặt lại mật khẩu");
  }

  async function logout() {
    await postJson("/api/v2/reader/logout", {});
    me = null;
    renderHeader();
    closeAllAccountMenus();
    window.dispatchEvent(new CustomEvent("reader-auth:changed", { detail: { user: null } }));
    if (window.location.pathname === "/tai-khoan") window.location.href = "/";
  }

  function init() {
    dialog = $("[data-reader-auth-dialog]");
    if (!dialog) return;
    // Mo hop thoai tu moi nut (dai tren desktop + ngan keo mobile).
    $all("[data-reader-auth-open]").forEach(function (b) {
      b.addEventListener("click", function () { open("login"); });
    });
    $all("[data-reader-auth-close]", dialog).forEach(function (b) {
      b.addEventListener("click", close);
    });
    $all("[data-reader-auth-tab]", dialog).forEach(function (t) {
      t.addEventListener("click", function () { showForm(t.getAttribute("data-reader-auth-tab")); });
    });
    $all("[data-reader-auth-show]", dialog).forEach(function (b) {
      b.addEventListener("click", function () { showForm(b.getAttribute("data-reader-auth-show")); });
    });
    // Hien/an mat khau.
    $all("[data-reader-pw-toggle]", dialog).forEach(function (b) {
      b.addEventListener("click", function () {
        var input = b.parentNode.querySelector("input");
        if (!input) return;
        var show = input.type === "password";
        input.type = show ? "text" : "password";
        b.setAttribute("aria-label", show ? "Ẩn mật khẩu" : "Hiện mật khẩu");
        b.innerHTML = show ? EYE_OFF_SVG : EYE_SVG;
      });
    });
    // Gui form.
    $all("[data-reader-auth-form]", dialog).forEach(function (form) {
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        clearMessages();
        var kind = form.getAttribute("data-reader-auth-form");
        if (kind === "login") submitLogin(form);
        else if (kind === "register") submitRegister(form);
        else if (kind === "forgot") submitForgot(form);
      });
    });
    // Menu tai khoan: bam ten mo/đong menu; bam ra ngoai hoac Esc thi đong.
    $all("[data-reader-account-btn]").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        var container = btn.closest("[data-reader-account]");
        var menu = container ? $("[data-reader-account-menu]", container) : null;
        if (!menu) return;
        var willOpen = menu.hidden;
        closeAllAccountMenus();
        menu.hidden = !willOpen;
      });
    });
    $all("[data-reader-logout]").forEach(function (b) {
      b.addEventListener("click", logout);
    });
    document.addEventListener("click", function (e) {
      if (!e.target.closest("[data-reader-account]")) closeAllAccountMenus();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        if (dialog && !dialog.hidden) close();
        closeAllAccountMenus();
      }
    });
    // Cau hinh + phien hien tai (song song, khong chan trang).
    api("/api/v2/reader/config").then(function (r) {
      config = r.ok ? r.data : { configured: false, turnstileSiteKey: null };
    });
    refreshHeader();
  }

  window.ReaderAuth = { open: open, close: close, refreshHeader: refreshHeader };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
