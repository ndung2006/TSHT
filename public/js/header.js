// Header kieu DBP (dung chung moi trang): ngay hien tai nam trong hang
// ten, ben phai cung cum Tin moi; mang xa hoi o thanh tren cung (muc
// KET NOI) + anh logo (neu CMS dat) lay tu cai dat Quan ly giao dien.
(function () {
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  var dateEl = document.querySelector("[data-topline-date]");
  if (dateEl) {
    try {
      dateEl.textContent = new Date().toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
    } catch (e) { /* giu trong khi trinh duyet cu khong ho tro */ }
  }
  var contactEl = document.getElementById("topline-contact");
  var logoEl = document.getElementById("brand-logo");
  var nameEl = document.querySelector(".brand .brand-name");
  if (!contactEl && !logoEl) return;
  // Nho logo lan truoc (chi URL anh cong khai, khong phai du lieu rieng):
  // hien ngay khi mo trang, khoi chop chu ten trong luc cho API.
  var logoCacheKey = "tsht_header_image";
  function cacheGet() { try { return window.localStorage.getItem(logoCacheKey) || ""; } catch (e) { return ""; } }
  function cacheSet(v) { try { if (v) window.localStorage.setItem(logoCacheKey, v); else window.localStorage.removeItem(logoCacheKey); } catch (e) { /* bo qua khi khong co storage */ } }
  function showName() { if (logoEl) logoEl.hidden = true; if (nameEl) nameEl.hidden = false; cacheSet(""); }
  function showLogo(url) {
    if (!logoEl || !url) return false;
    logoEl.alt = "Tòa soạn hội tụ";
    logoEl.onerror = function () { showName(); };
    if (logoEl.getAttribute("src") !== url) logoEl.src = url;
    logoEl.hidden = false;
    if (nameEl) nameEl.hidden = true;
    return true;
  }
  var cachedLogo = cacheGet();
  var showingCached = cachedLogo ? showLogo(cachedLogo) : false;
  fetch("/api/v2/site-interface")
    .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .then(function (si) {
      var hd = (si && si.header) || {};
      // Topline chi hien ngay thang, can phai; Hotline khong hien nua
      // (so dien thoai van giu trong cai dat CMS, chi khong render ra portal).
      var socialEl = document.getElementById("utility-social");
      if (socialEl) {
        var socials = [];
        // Icon tron mau theo mang (ky tu don gian, khong dung anh ngoai).
        [["facebook", "f", "soc-fb", "Facebook"], ["youtube", "▶", "soc-yt", "Youtube"], ["tiktok", "♪", "soc-tt", "TikTok"], ["zalo", "Z", "soc-zl", "Zalo"]].forEach(function (p) {
          if (hd[p[0]]) socials.push("<a class=\"soc-icon " + p[2] + "\" href=\"" + esc(hd[p[0]]) + "\" target=\"_blank\" rel=\"noopener\" title=\"" + p[3] + "\">" + p[1] + "</a>");
        });
        if (socials.length) { socialEl.innerHTML = "KẾT NỐI " + socials.join(" "); socialEl.hidden = false; }
      }
      // Co logo that thi chi hien logo, an chu ten (kieu khoi logo cua
      // DBP); API xac nhan/cap nhat lai sau lan hien tu cache.
      if (logoEl && hd.image) {
        showLogo(hd.image);
        cacheSet(hd.image);
      } else if (logoEl) {
        // CMS khong dat logo: hien chu ten, xoa cache cu.
        showName();
      }
    })
    .catch(function () {
      // Tai loi: neu khong co logo cache dang hien thi hien chu ten de
      // khoi trong hang ten; co cache thi giu logo cu cho lan sau sua.
      if (!showingCached) showName();
    });
})();
