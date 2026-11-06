// Captcha Turnstile dung chung cho cac trang ban doc ngoai hop thoai
// (tai-khoan). Chi kich hoat khi /api/v2/reader/config tra site key;
// khi captcha tat thi token() tra undefined (khong can token).
window.ReaderCaptcha = (function () {
  "use strict";
  var siteKey = null;
  var configLoaded = false;
  var scriptLoading = false;
  var scriptFailed = false;
  var widgets = {};

  function ensureConfig(cb) {
    if (configLoaded) return cb(siteKey);
    fetch("/api/v2/reader/config").then(function (r) { return r.json(); }).then(function (d) {
      configLoaded = true;
      siteKey = (d && d.turnstileSiteKey) || null;
      cb(siteKey);
    }).catch(function () { configLoaded = true; cb(null); });
  }
  function loadScript(cb) {
    if (window.turnstile) return cb(true);
    if (scriptFailed) return cb(false);
    if (scriptLoading) {
      var t = setInterval(function () {
        if (window.turnstile || scriptFailed) { clearInterval(t); cb(!!window.turnstile); }
      }, 200);
      return;
    }
    scriptLoading = true;
    var s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.defer = true;
    s.onload = function () { cb(true); };
    s.onerror = function () { scriptFailed = true; cb(false); };
    document.head.appendChild(s);
  }
  // render(container, key, onFail): tao widget Turnstile trong container.
  function render(container, key, onFail) {
    if (!container) return;
    ensureConfig(function (sk) {
      if (!sk) return; // captcha tat: khong render gi.
      loadScript(function (ok) {
        if (!ok) { if (onFail) onFail(); return; }
        try { widgets[key] = window.turnstile.render(container, { sitekey: sk, theme: "light" }); }
        catch (e) { if (onFail) onFail(); }
      });
    });
  }
  // token(key): undefined = captcha tat (khong can token);
  // null = chua san sang (config/script chua tai xong); "" = chua xac minh.
  function token(key) {
    if (!configLoaded) return null;
    if (!siteKey) return undefined;
    if (!window.turnstile || !(key in widgets)) return null;
    try { return window.turnstile.getResponse(widgets[key]) || ""; } catch (e) { return ""; }
  }
  function reset(key) {
    if (window.turnstile && key in widgets) { try { window.turnstile.reset(widgets[key]); } catch (e) { /* bo qua */ } }
  }
  return { render: render, token: token, reset: reset, ensureConfig: ensureConfig };
})();
