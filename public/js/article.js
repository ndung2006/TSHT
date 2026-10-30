// Trang chi tiet bai viet (/tin/<slug>) — doc qua proxy TSHT /api/v2/news.
// Noi dung body la HTML do bien tap soan trong CMS (tin cay o muc admin);
// truoc khi chen van loc bo <script>/<iframe>/<style> va thuoc tinh on*
// + href javascript: de tranh ma doc chay trong trinh duyet doc gia.
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
  // Khong dua anh bia vao trong bai doc: neu than bai (body) co chen
  // Quy tac uu tien vi tri anh trong body (2026-10-30): neu anh bia da
  // co trong body (cung file sau khi chuan hoa ve pathname, ke ca dang
  // tuong doi /images/... hay tuyet doi qua origin backend) thi KHONG
  // render hero bia rieng — anh chi hien o dung vi tri trong body, khong
  // bi day len dau bai. Chi khi bia khong co trong body moi render hero
  // va strip (du phong) anh bia khoi body.
  function bodyContainsCover(html, coverUrl) {
    if (!coverUrl || !html) return false;
    var coverPath = "";
    try { coverPath = new URL(coverUrl, location.origin).pathname; } catch (e) { coverPath = String(coverUrl); }
    if (!coverPath) return false;
    var tpl = document.createElement("template");
    tpl.innerHTML = html;
    var found = false;
    tpl.content.querySelectorAll("img").forEach(function (img) {
      var src = img.getAttribute("src") || "";
      if (!src) return;
      var p = "";
      try { p = new URL(src, location.origin).pathname; } catch (e) { p = src; }
      if (p === coverPath) found = true;
    });
    return found;
  }
  function stripCoverFromBody(html, coverUrl) {
    if (!coverUrl) return html || "";
    var coverPath = "";
    try { coverPath = new URL(coverUrl, location.origin).pathname; } catch (e) { coverPath = String(coverUrl); }
    if (!coverPath) return html || "";
    var tpl = document.createElement("template");
    tpl.innerHTML = html || "";
    tpl.content.querySelectorAll("img").forEach(function (img) {
      var src = img.getAttribute("src") || "";
      if (!src) return;
      var p = "";
      try { p = new URL(src, location.origin).pathname; } catch (e) { p = src; }
      if (p === coverPath) {
        var parent = img.parentNode;
        img.remove();
        if (parent && (parent.nodeName === "P" || parent.nodeName === "FIGURE") && !parent.textContent.trim() && !parent.querySelector("img")) parent.remove();
      }
    });
    return tpl.innerHTML;
  }
  function card(it) {
    return "<div class=\"news-card\"><a href=\"" + esc(it.url) + "\">" +
      (it.cover ? "<img src=\"" + esc(it.cover) + "\" alt=\"\" loading=\"lazy\">" : "") +
      "<h3>" + esc(it.title) + "</h3></a>" +
      (it.sapo ? "<p class=\"news-sapo\">" + esc(it.sapo) + "</p>" : "") +
      "<p class=\"news-meta\">" + esc(it.category ? it.category.name : "") +
      (it.publishAt ? " · " + esc(fmtDate(it.publishAt)) : "") + "</p></div>";
  }
  // Media dinh dang (Goi 1B): hien thi theo contentType, URL da duoc proxy
  // TSHT resolve (tuong doi -> origin backend, tuyet doi giu nguyen).
  // Khong dung iframe (sanitize se loc bo) — video/audio dung the native.
  function mediaHtml(it) {
    var fd = it.formatData || {};
    if (it.contentType === "video" && fd.videoUrl) {
      return "<video class=\"article-media\" controls preload=\"metadata\" src=\"" + esc(fd.videoUrl) + "\"></video>";
    }
    if (it.contentType === "audio" && fd.audioUrl) {
      return "<audio class=\"article-media\" controls src=\"" + esc(fd.audioUrl) + "\"></audio>";
    }
    if (it.contentType === "gallery" && fd.images && fd.images.length) {
      return "<div class=\"article-gallery\">" + fd.images.map(function (u) {
        return "<img src=\"" + esc(u) + "\" alt=\"\" loading=\"lazy\">";
      }).join("") + "</div>";
    }
    if (it.contentType === "infographic" && fd.imageUrl) {
      return "<img class=\"article-infographic\" src=\"" + esc(fd.imageUrl) + "\" alt=\"\">";
    }
    return "";
  }
  var slug = decodeURIComponent(location.pathname.replace(/^\/tin\//, ""));
  var box = document.getElementById("article");
  var rel = document.getElementById("related");
  fetch("/api/v2/news/" + encodeURIComponent(slug))
    .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .then(function (it) {
      document.title = it.title + " — TSHT";
      var meta = [];
      if (it.category) meta.push("<a href=\"/chuyen-muc/" + esc(it.category.slug) + "\">" + esc(it.category.name) + "</a>");
      if (it.publishAt) meta.push(esc(fmtDate(it.publishAt)));
      if (it.authors && it.authors.length) meta.push("Tác giả: " + esc(it.authors.join(", ")));
      var tags = (it.tags && it.tags.length)
        ? "<p class=\"news-meta\">Từ khóa: " + it.tags.map(esc).join(", ") + "</p>" : "";
      // Uu tien vi tri anh trong body: bia da co trong body thi khong
      // render hero (anh o yen vi tri trong body); chi khi bia khong co
      // trong body moi render hero.
      var bodyHtml = sanitize(it.body);
      var coverInBody = bodyContainsCover(bodyHtml, it.cover);
      box.innerHTML = "<p class=\"news-meta\">" + meta.join(" · ") + "</p>" +
        "<h1>" + esc(it.title) + "</h1>" +
        (it.sapo ? "<p class=\"article-sapo\">" + esc(it.sapo) + "</p>" : "") +
        (it.cover && !coverInBody ? "<img class=\"article-cover\" src=\"" + esc(it.cover) + "\" alt=\"\">" : "") +
        mediaHtml(it) +
        "<div class=\"article-body" + (it.contentType === "emagazine" ? " article-body--emagazine" : "") + "\">" + (coverInBody ? bodyHtml : stripCoverFromBody(bodyHtml, it.cover)) + "</div>" + tags;
      // Quang cao trong bai (article_inbody): chen slot giua than bai
      // (sau doan van giua), roi nho TSHTAds render; neu TSHTAds chua
      // nap thi slot cu hidden, khong anh huong bai viet.
      try {
        var bodyEl = box.querySelector(".article-body");
        if (bodyEl) {
          var paras = bodyEl.querySelectorAll("p");
          var slot = document.createElement("div");
          slot.className = "ad-slot";
          slot.setAttribute("data-ad-placement", "article_inbody");
          slot.hidden = true;
          if (paras.length) {
            var mid = paras[Math.floor(paras.length / 2)];
            mid.parentNode.insertBefore(slot, mid.nextSibling);
          } else { bodyEl.appendChild(slot); }
          if (window.TSHTAds) window.TSHTAds.renderSlot(slot);
        }
      } catch (e) { /* quang cao loi khong duoc lam vo bai */ }
      rel.innerHTML = (it.related && it.related.length)
        ? it.related.map(card).join("")
        : "<p>Chưa có bài liên quan.</p>";
    })
    .catch(function () {
      box.innerHTML = "<p>Không tìm thấy bài viết này (có thể bài chưa xuất bản hoặc đã gỡ xuống).</p>";
      rel.innerHTML = "<p>—</p>";
    });
})();
