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
      // DBP); logo loi thi quay ve hien chu de khong co khoi trong.
      if (logoEl && hd.image) {
        logoEl.alt = "Tòa soạn hội tụ";
        logoEl.onerror = function () { logoEl.hidden = true; if (nameEl) nameEl.hidden = false; };
        logoEl.src = hd.image;
        logoEl.hidden = false;
        if (nameEl) nameEl.hidden = true;
      }
    })
    .catch(function () { /* giu ngay, an lien he khi tai loi */ });
})();
