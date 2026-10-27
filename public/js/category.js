// Trang chuyen muc (/chuyen-muc/<slug>) — doc qua proxy TSHT /api/v2/news.
// Chuyen muc cha hien ca bai cua chuyen muc con (backend gom con vao loc).
(function () {
  "use strict";
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>\"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmtDate(iso) {
    if (!iso) return "";
    try {
      return new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));
    } catch (e) { return String(iso).slice(0, 10); }
  }
  function card(it) {
    return "<div class=\"news-card\"><a href=\"" + esc(it.url) + "\">" +
      (it.cover ? "<img src=\"" + esc(it.cover) + "\" alt=\"\" loading=\"lazy\">" : "") +
      "<h3>" + esc(it.title) + "</h3></a>" +
      (it.sapo ? "<p class=\"news-sapo\">" + esc(it.sapo) + "</p>" : "") +
      "<p class=\"news-meta\">" + (it.publishAt ? esc(fmtDate(it.publishAt)) : "") + "</p></div>";
  }
  var slug = decodeURIComponent(location.pathname.replace(/^\/chuyen-muc\//, ""));
  var page = Math.max(1, Number(new URLSearchParams(location.search).get("page") || 1));
  var list = document.getElementById("list");
  var pager = document.getElementById("pager");
  var title = document.getElementById("cat-title");
  var childrenNav = document.getElementById("cat-children");
  // Ten chuyen muc + chuyen muc con lay tu cay cong khai.
  fetch("/api/v2/news-categories")
    .then(function (r) { return r.json(); })
    .then(function (d) {
      var all = d.data || [];
      var found = null;
      (function walk(nodes) {
        nodes.forEach(function (n) {
          if (n.slug === slug) found = n;
          else if (n.children) walk(n.children);
        });
      })(all);
      if (found) {
        title.textContent = found.name;
        document.title = found.name + " — TSHT";
        if (found.children && found.children.length) {
          childrenNav.innerHTML = found.children.map(function (c) {
            return "<a href=\"/chuyen-muc/" + esc(c.slug) + "\">" + esc(c.name) + "</a>";
          }).join(" · ");
        }
      } else {
        title.textContent = "Chuyên mục: " + slug;
      }
    })
    .catch(function () { title.textContent = "Chuyên mục: " + slug; });
  fetch("/api/v2/news?category=" + encodeURIComponent(slug) + "&page=" + page + "&limit=20")
    .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .then(function (d) {
      var items = d.items || [];
      list.innerHTML = items.length ? items.map(card).join("") : "<p>Chuyên mục này chưa có bài viết.</p>";
      var links = [];
      if (d.page > 1) links.push("<a href=\"/chuyen-muc/" + esc(slug) + "?page=" + (d.page - 1) + "\">← Trang trước</a>");
      links.push("Trang " + d.page + "/" + (d.total_pages || 1) + " — " + (d.total || 0) + " bài");
      if (d.page < (d.total_pages || 1)) links.push("<a href=\"/chuyen-muc/" + esc(slug) + "?page=" + (d.page + 1) + "\">Trang sau →</a>");
      pager.innerHTML = links.join(" · ");
    })
    .catch(function () {
      list.innerHTML = "<p>Không tải được bài viết của chuyên mục này.</p>";
    });
})();
