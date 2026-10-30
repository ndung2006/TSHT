// Trang chi tiet su kien (/su-kien/<slug>) — doc qua proxy TSHT
// /api/v2/events. Mo ta la text thuong nen escape truoc khi chen
// (khong chen HTML tho nhu body bai viet).
(function () {
  "use strict";
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmtDate(iso) {
    if (!iso) return "";
    try {
      return new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
    } catch (e) { return String(iso).slice(0, 16); }
  }
  var slug = decodeURIComponent(location.pathname.replace(/^\/su-kien\//, ""));
  var box = document.getElementById("detail");
  fetch("/api/v2/events/" + encodeURIComponent(slug)).then(function (r) {
    if (!r.ok) { box.innerHTML = "<p>Không tìm thấy sự kiện.</p>"; return null; }
    return r.json();
  }).then(function (it) {
    if (!it) return;
    var meta = [];
    if (it.category && it.category.name) meta.push(it.category.name);
    if (it.startsAt) meta.push(it.endsAt ? fmtDate(it.startsAt) + " — " + fmtDate(it.endsAt) : fmtDate(it.startsAt));
    if (it.publishAt) meta.push("Đăng " + fmtDate(it.publishAt));
    box.innerHTML = "<h1>" + esc(it.title) + "</h1>" +
      (it.cover ? "<img src=\"" + esc(it.cover) + "\" alt=\"\">" : "") +
      (meta.length ? "<p class=\"news-meta\">" + esc(meta.join(" · ")) + "</p>" : "") +
      (it.description ? "<p>" + esc(it.description) + "</p>" : "");
  }).catch(function () { box.innerHTML = "<p>Không tải được sự kiện.</p>"; });
})();
