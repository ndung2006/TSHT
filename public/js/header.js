// Header kieu DBP (dung chung moi trang): ngay hien tai ben trai hang
// tren; hotline + mang xa hoi ben phai + anh logo (neu CMS dat) lay tu
// cai dat Quan ly giao dien. Khong co du lieu thi chi hien ngay, khong
// hien khoi lien he trong.
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
      if (contactEl) {
        var phone = hd.phone ? "<a href=\"tel:" + esc(String(hd.phone).replace(/\s+/g, "")) + "\">Hotline: " + esc(hd.phone) + "</a>" : "";
        var socials = [];
        [["facebook", "Facebook"], ["youtube", "Youtube"], ["tiktok", "TikTok"], ["zalo", "Zalo"]].forEach(function (p) {
          if (hd[p[0]]) socials.push("<a href=\"" + esc(hd[p[0]]) + "\" target=\"_blank\" rel=\"noopener\">" + p[1] + "</a>");
        });
        var html = phone;
        if (socials.length) html += (html ? " | Theo dõi Tòa soạn hội tụ qua " : "Theo dõi Tòa soạn hội tụ qua ") + socials.join(" · ");
        if (html) { contactEl.innerHTML = html; contactEl.hidden = false; }
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
