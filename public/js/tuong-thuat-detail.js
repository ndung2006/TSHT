// Trang chi tiet tuong thuat (/tuong-thuat/<slug>) — doc qua proxy
// TSHT /api/v2/liveblogs. Dong tuong thuat la HTML do bien tap soan
// (tin cay o muc admin) nen loc bo <script>/<iframe>/<style> va thuoc
// tinh on* + href javascript: truoc khi chen, giong cach article.js loc
// body bai viet. Thu tu dong giu nguyen nhu backend tra (createdAt
// ASC), khong sap xep lai.
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
  function sanitize(html) {
    var tpl = document.createElement("template");
    tpl.innerHTML = html || "";
    tpl.content.querySelectorAll("script, iframe, style, object, embed, form").forEach(function (el) { el.remove(); });
    tpl.content.querySelectorAll("*").forEach(function (el) {
      Array.prototype.slice.call(el.attributes || []).forEach(function (a) {
        if (/^on/i.test(a.name) || (a.name === "href" && /^\s*javascript:/i.test(a.value))) el.removeAttribute(a.name);
      });
    });
    return tpl.innerHTML;
  }
  var slug = decodeURIComponent(location.pathname.replace(/^\/tuong-thuat\//, ""));
  var box = document.getElementById("detail");
  var entriesBox = document.getElementById("entries");
  fetch("/api/v2/liveblogs/" + encodeURIComponent(slug)).then(function (r) {
    if (!r.ok) { box.innerHTML = "<p>Không tìm thấy tường thuật.</p>"; entriesBox.innerHTML = ""; return null; }
    return r.json();
  }).then(function (it) {
    if (!it) return;
    var meta = [];
    if (it.publishAt) meta.push("Đăng " + fmtDate(it.publishAt));
    box.innerHTML = "<h1>" + esc(it.title) + "</h1>" +
      (it.cover ? "<img src=\"" + esc(it.cover) + "\" alt=\"\">" : "") +
      (it.event && it.event.slug ? "<p class=\"news-meta\"><a href=\"/su-kien/" + esc(it.event.slug) + "\">Sự kiện: " + esc(it.event.title) + "</a></p>" : "") +
      (meta.length ? "<p class=\"news-meta\">" + esc(meta.join(" · ")) + "</p>" : "") +
      (it.description ? "<p>" + esc(it.description) + "</p>" : "");
    entriesBox.innerHTML = (it.entries || []).map(function (e) {
      return "<div><p class=\"news-meta\">" + esc(fmtDate(e.createdAt)) + (e.isPinned ? " · 📌 Ghim" : "") + "</p>" +
        "<div>" + sanitize(e.body) + "</div>" +
        (e.media ? "<img src=\"" + esc(e.media) + "\" alt=\"\">" : "") + "</div>";
    }).join("") || "<p>Chưa có dòng tường thuật nào.</p>";
  }).catch(function () { box.innerHTML = "<p>Không tải được tường thuật.</p>"; entriesBox.innerHTML = ""; });
})();
