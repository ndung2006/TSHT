// Trang Tai khoan cua toi — xem/sua ho ten, gui lai email xac nhan,
// doi mat khau, yeu cau xoa tai khoan, dang xuat.
(function () {
  "use strict";

  var msgEl = null;
  var currentUser = null;

  function $(id) { return document.getElementById(id); }
  function showMsg(text, ok) {
    msgEl.textContent = text;
    msgEl.className = "account-msg " + (ok ? "ok" : "err");
    msgEl.hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function hideMsg() { msgEl.hidden = true; msgEl.textContent = ""; }
  function mapError(data, status) {
    var raw = (data && (data.error || data.message)) || "";
    if (Array.isArray(raw)) raw = raw.join("; ");
    raw = String(raw);
    if (/captcha/i.test(raw)) return "Xác minh chống robot thất bại, vui lòng thử lại.";
    if (/mat khau hien tai khong dung|current password/i.test(raw)) return "Mật khẩu hiện tại không đúng.";
    if (/mat khau moi.*giong|new password.*same|giong mat khau cu/i.test(raw)) return "Mật khẩu mới phải khác mật khẩu hiện tại.";
    if (/mat khau.*8 ky tu|password.*8/i.test(raw)) return "Mật khẩu tối thiểu 8 ký tự.";
    if (/tai khoan bi khoa/i.test(raw)) return "Tài khoản đã bị khóa.";
    return raw || "Có lỗi xảy ra, vui lòng thử lại sau.";
  }
  async function api(path, opts) {
    var r;
    try { r = await fetch(path, opts); }
    catch (e) { return { ok: false, status: 0, data: { error: "Không kết nối được máy chủ, vui lòng thử lại sau." } }; }
    var data = null;
    try { data = await r.json(); } catch (e) { data = null; }
    return { ok: r.ok, status: r.status, data: data || {} };
  }

  function render(user) {
    currentUser = user;
    $("account-loading").hidden = true;
    $("account-login-prompt").hidden = true;
    $("account-main").hidden = false;
    $("account-email").value = user.email || "";
    $("account-name").value = user.displayName || "";
    var v = $("account-verify");
    if (user.emailVerifiedAt) {
      v.textContent = "✓ Email đã được xác nhận.";
      v.className = "account-verify ok";
      $("account-resend-box").hidden = true;
    } else {
      v.textContent = "⚠ Email chưa được xác nhận. Một số tính năng chỉ mở sau khi xác nhận email.";
      v.className = "account-verify warn";
      $("account-resend-box").hidden = false;
      window.ReaderCaptcha.render($("account-resend-captcha"), "resend", function () {
        showMsg("Không tải được mã chống robot, không gửi lại được email xác nhận lúc này.", false);
      });
    }
  }
  function showLoginPrompt() {
    $("account-loading").hidden = true;
    $("account-main").hidden = true;
    $("account-login-prompt").hidden = false;
  }
  async function loadMe() {
    var r = await api("/api/v2/reader/me");
    if (!r.ok || !r.data.user) { showLoginPrompt(); return; }
    render(r.data.user);
  }

  function init() {
    msgEl = $("account-msg");
    $("account-login-btn").addEventListener("click", function () {
      if (window.ReaderAuth) window.ReaderAuth.open("login");
    });
    $("account-save-btn").addEventListener("click", async function () {
      hideMsg();
      var name = $("account-name").value.trim();
      if (!name) { showMsg("Họ tên không được để trống.", false); return; }
      var btn = $("account-save-btn");
      btn.disabled = true;
      var r = await api("/api/v2/reader/me", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: name }),
      });
      btn.disabled = false;
      if (!r.ok) { showMsg(mapError(r.data, r.status), false); return; }
      currentUser.displayName = r.data.user ? r.data.user.displayName : name;
      showMsg("Đã lưu họ tên.", true);
      if (window.ReaderAuth) window.ReaderAuth.refreshHeader();
    });
    $("account-resend-btn").addEventListener("click", function () {
      hideMsg();
      // Doi config tai xong moi doc token (tranh truong hop captcha bat
      // nhung config chua ve kip).
      window.ReaderCaptcha.ensureConfig(function () {
        var t = window.ReaderCaptcha.token("resend");
        if (t === null) { showMsg("Mã chống robot chưa tải xong, vui lòng đợi vài giây rồi thử lại.", false); return; }
        if (t === "") { showMsg("Vui lòng hoàn thành xác minh chống robot.", false); return; }
        var body = { email: currentUser.email };
        if (t !== undefined) body.captchaToken = t;
        var btn = $("account-resend-btn");
        btn.disabled = true;
        api("/api/v2/reader/resend-verification", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
          .then(function (r) {
            btn.disabled = false;
            window.ReaderCaptcha.reset("resend");
            if (!r.ok) { showMsg(mapError(r.data, r.status), false); return; }
            showMsg("Đã gửi lại email xác nhận. Kiểm tra hộp thư (kể cả mục Spam). Liên kết có hiệu lực 24 giờ.", true);
          });
      });
    });
    $("account-pw-form").addEventListener("submit", async function (e) {
      e.preventDefault();
      hideMsg();
      var cur = $("account-pw-current").value;
      var nw = $("account-pw-new").value;
      var cf = $("account-pw-confirm").value;
      if (nw !== cf) { showMsg("Mật khẩu mới nhập lại chưa khớp.", false); return; }
      var btn = this.querySelector("button[type='submit']");
      btn.disabled = true;
      var r = await api("/api/v2/reader/change-password", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: cur, newPassword: nw }),
      });
      btn.disabled = false;
      if (!r.ok) { showMsg(mapError(r.data, r.status), false); return; }
      showMsg("Đã đổi mật khẩu. Bạn sẽ cần đăng nhập lại bằng mật khẩu mới.", true);
      this.reset();
      if (window.ReaderAuth) {
        window.ReaderAuth.refreshHeader();
        setTimeout(function () { window.ReaderAuth.open("login"); }, 1200);
      }
    });
    $("account-delete-btn").addEventListener("click", function () {
      $("account-delete-form").hidden = false;
      $("account-delete-btn").hidden = true;
    });
    $("account-delete-cancel-btn").addEventListener("click", function () {
      $("account-delete-form").hidden = true;
      $("account-delete-btn").hidden = false;
    });
    $("account-delete-confirm-btn").addEventListener("click", async function () {
      hideMsg();
      var reason = $("account-delete-reason").value.trim();
      var btn = $("account-delete-confirm-btn");
      btn.disabled = true;
      var r = await api("/api/v2/reader/request-deletion", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason || undefined }),
      });
      btn.disabled = false;
      if (!r.ok) { showMsg(mapError(r.data, r.status), false); return; }
      showMsg("Đã ghi nhận yêu cầu xóa tài khoản. Tài khoản đã bị khóa.", true);
      if (window.ReaderAuth) window.ReaderAuth.refreshHeader();
      setTimeout(function () { window.location.href = "/"; }, 2000);
    });
    $("account-logout-btn").addEventListener("click", async function () {
      await api("/api/v2/reader/logout", { method: "POST" });
      window.location.href = "/";
    });
    window.addEventListener("reader-auth:changed", loadMe);
    loadMe();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
