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
  // E1: anh bia co srcset (backend sinh 3 co khi anh o trong kho) thi
  // trinh duyet tu chon co phu hop theo sizes; khong co srcset thi
  // dung src goc. cls = class CSS cua the img (vd article-cover).
  function coverImg(it, cls, sizes, lazy) {
    if (!it.cover) return "";
    var srcset = it.coverSrcset ? " srcset=\"" + esc(it.coverSrcset) + "\" sizes=\"" + sizes + "\"" : "";
    var load = lazy ? " loading=\"lazy\"" : "";
    var clsAttr = cls ? " class=\"" + cls + "\"" : "";
    return "<img" + clsAttr + " src=\"" + esc(it.cover) + "\" alt=\"\"" + srcset + load + ">";
  }
  function card(it) {
    return "<div class=\"news-card\"><a href=\"" + esc(it.url) + "\" title=\"" + esc(it.title || "") + "\">" +
      coverImg(it, "", "300px", true) +
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
      // Giu Meta title cua SSR: neu JS ghi de bang it.title thi
      // <title> dung cua meta (da chen san trong HTML) se mat.
      document.title = (it.metaTitle || it.title) + " — Tòa soạn hội tụ";
      // To noi chuyen muc cua bai tren thanh do (header chung): server
      // khong biet chuyen muc cua bai truoc khi tai, nen goi ham nay sau
      // khi bai ve. Khong biet chuyen muc thi khong to noi — khong crash.
      if (it.category && it.category.slug && window.TSHTHeader && typeof window.TSHTHeader.setActiveCategory === "function") {
        window.TSHTHeader.setActiveCategory(it.category.slug);
      }
      // GĐ3 nen: pageview bai viet (kem ma bai on dinh de C2/C3 gop theo bai, khong phu thuoc slug).
      if (window.TshtTelemetry) window.TshtTelemetry.sendPageview(it.publicId ? { articlePublicId: it.publicId } : {});
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
        (it.cover && !coverInBody ? coverImg(it, "article-cover", "(max-width: 900px) 100vw, 800px", false) : "") +
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
      // Binh luan dot 1: chi khoi tao khi bai tai xong (can allowComments).
      initComments(slug, it.allowComments !== false);
    })
    .catch(function () {
      box.innerHTML = "<p>Không tìm thấy bài viết này (có thể bài chưa xuất bản hoặc đã gỡ xuống).</p>";
      rel.innerHTML = "<p>—</p>";
    });

  // ---- Binh luan dot 1 (thiet-ke-binh-luan-dot-1 §5.2) ----
  // Khung binh luan o cuoi trang doc, duoi noi dung bai, tren footer.
  // Chi render khi CA 2 dung: comments.enabled=true (GET
  // /api/v2/comments/config) VA allowComments=true cua bai viet.
  // Noi dung plain text: esc() roi doi \n -> <br>, KHONG dung
  // sanitize(). Nut Xoa chi khi item.mine=true (API tra them khi co
  // JWT — portal KHONG tu so authorName).
  var COMMENTS_LIMIT = 20;
  var commentsSection = document.getElementById("comments");
  var commentsCfg = null;
  var commentsMe = null;
  var commentsSlug = "";
  var commentsPage = 1;
  var commentsTotal = 0;
  var commentsItems = [];
  var commentsInitDone = false;

  function commentErrText(data) {
    if (data == null) return "";
    if (typeof data === "string") return data;
    if (Array.isArray(data)) return data.map(commentErrText).filter(Boolean).join("; ");
    if (typeof data === "object") return commentErrText(data.error) || commentErrText(data.message) || commentErrText(data.code) || "";
    return "";
  }
  function commentErrorMessage(data, status) {
    // Uu tien ma loi (error.code) vi message co the la tieng Viet co
    // dau / khong dau tuy backend; message chi dung de soi du phong.
    var code = "";
    if (data && typeof data === "object") {
      if (data.error && typeof data.error === "object" && data.error.code) code = String(data.error.code);
      else if (typeof data.code === "string") code = data.code;
    }
    if (code === "email_not_verified") return "Cần xác nhận email trước khi bình luận.";
    if (code === "already_reported") return "Bạn đã báo cáo bình luận này.";
    if (code === "cannot_report_own") return "Bạn không thể báo cáo bình luận của mình.";
    if (code === "comment_empty") return "Bình luận không được để trống.";
    if (code === "comment_too_long") return "Bình luận tối đa 1000 ký tự.";
    if (code === "comment_duplicate") return "Bạn đã gửi bình luận giống hệt trước đó.";
    if (code === "comments_disabled") return "Tính năng bình luận chưa được bật.";
    if (code === "comments_not_allowed") return "Bài viết đã tắt bình luận.";
    if (code === "captcha_failed") return "Xác minh chống robot thất bại, vui lòng thử lại.";
    var raw = commentErrText(data);
    if (/tai khoan bi khoa/i.test(raw)) return "Tài khoản đã bị khóa.";
    if (/email_not_verified|Cần xác nhận email/i.test(raw)) return "Cần xác nhận email trước khi bình luận.";
    if (/comments_disabled/i.test(raw)) return "Tính năng bình luận chưa được bật.";
    if (/comments_not_allowed/i.test(raw)) return "Bài viết đã tắt bình luận.";
    if (/captcha/i.test(raw)) return "Xác minh chống robot thất bại, vui lòng thử lại.";
    if (/comment_empty/i.test(raw)) return "Bình luận không được để trống.";
    if (/comment_too_long/i.test(raw)) return "Bình luận tối đa 1000 ký tự.";
    if (/comment_duplicate/i.test(raw)) return "Bạn đã gửi bình luận giống hệt trước đó.";
    if (/already_reported/i.test(raw)) return "Bạn đã báo cáo bình luận này.";
    if (/cannot_report_own/i.test(raw)) return "Bạn không thể báo cáo bình luận của mình.";
    if (status === 429) return /quá nhanh|30 giây|20 bình luận/i.test(raw) ? raw : "Bạn bình luận quá nhanh, vui lòng thử lại sau.";
    return raw || "Có lỗi xảy ra, vui lòng thử lại sau.";
  }
  function shouldShowComments(cfg, allowComments) {
    return !!(cfg && cfg.enabled && allowComments);
  }
  function formatCommentBody(s) {
    return esc(s == null ? "" : s).replace(/\r\n?/g, "\n").replace(/\n/g, "<br>");
  }
  function hasMoreComments(page, limit, total) {
    return page * limit < total;
  }
  async function commentsApi(path, opts) {
    var r;
    try { r = await fetch(path, opts); }
    catch (e) { return { ok: false, status: 0, data: { error: "Không kết nối được máy chủ, vui lòng thử lại sau." } }; }
    var data = null;
    try { data = await r.json(); } catch (e) { data = null; }
    return { ok: r.ok, status: r.status, data: data || {} };
  }
  function commentsShowStatus(text, isErr) {
    var el = document.getElementById("comments-status");
    if (!el) return;
    el.textContent = text;
    el.className = "comments-status" + (isErr ? " err" : "");
    el.hidden = !text;
  }
  function commentsRenderTitle() {
    var el = document.getElementById("comments-title");
    if (el) el.textContent = "Bình luận (" + commentsTotal + ")";
  }
  function commentItemHtml(it) {
    var h = "<div class=\"comments-item\" data-comment-id=\"" + esc(it.id) + "\">" +
      "<div class=\"comments-item-head\"><span class=\"comments-author\">" + esc(it.authorName || "Bạn đọc") + "</span>" +
      (it.isNewsroom ? " <span class=\"comments-newsroom\">Tòa soạn</span>" : "") +
      (it.createdAt ? "<span class=\"comments-time\">" + esc(fmtDate(it.createdAt)) + "</span>" : "") + "</div>" +
      "<p class=\"comments-body\">" + formatCommentBody(it.body) + "</p>";
    if (commentsMe) {
      h += "<div class=\"comments-actions\">" +
        "<button type=\"button\" class=\"comments-action\" data-action=\"report\" data-comment-id=\"" + esc(it.id) + "\">Báo cáo vi phạm</button>" +
        (it.mine ? "<button type=\"button\" class=\"comments-action\" data-action=\"delete\" data-comment-id=\"" + esc(it.id) + "\">Xóa</button>" : "") +
        "</div>";
    }
    (it.replies || []).forEach(function (rep) {
      h += "<div class=\"comments-reply\">" +
        "<div class=\"comments-item-head\"><span class=\"comments-author\">" + esc(rep.authorName || "Tòa soạn") + "</span>" +
        " <span class=\"comments-newsroom\">Tòa soạn</span>" +
        (rep.createdAt ? "<span class=\"comments-time\">" + esc(fmtDate(rep.createdAt)) + "</span>" : "") + "</div>" +
        "<p class=\"comments-body\">" + formatCommentBody(rep.body) + "</p></div>";
    });
    return h + "</div>";
  }
  function commentsRenderList() {
    var list = document.getElementById("comments-list");
    if (!list) return;
    if (!commentsItems.length) {
      list.innerHTML = "<p class=\"comments-empty\">Chưa có bình luận nào. Hãy là người đầu tiên bình luận.</p>";
    } else {
      list.innerHTML = commentsItems.map(commentItemHtml).join("");
    }
    var more = document.getElementById("comments-more");
    if (more) more.hidden = !hasMoreComments(commentsPage, COMMENTS_LIMIT, commentsTotal);
    commentsRenderTitle();
  }
  function commentsRenderForm() {
    var wrap = document.getElementById("comments-form-wrap");
    if (!wrap) return;
    if (!commentsMe) {
      wrap.innerHTML = "<p>Bạn cần đăng nhập để bình luận.</p>" +
        "<button type=\"button\" class=\"comments-btn\" id=\"comments-login-btn\">Đăng nhập để bình luận</button>";
      var loginBtn = document.getElementById("comments-login-btn");
      if (loginBtn) loginBtn.addEventListener("click", function () {
        if (window.ReaderAuth) window.ReaderAuth.open("login");
      });
      return;
    }
    var maxLen = (commentsCfg && commentsCfg.maxLength) || 1000;
    wrap.innerHTML = "<div class=\"comments-form\">" +
      "<p class=\"comments-as\">Bình luận với tên: " + esc(commentsMe.displayName || "Bạn đọc") + "</p>" +
      "<textarea id=\"comments-textarea\" maxlength=\"" + maxLen + "\" placeholder=\"Viết bình luận của bạn...\"></textarea>" +
      "<p class=\"comments-counter\" id=\"comments-counter\">0/" + maxLen + "</p>" +
      "<div id=\"comments-captcha\"></div>" +
      "<button type=\"button\" class=\"comments-btn\" id=\"comments-submit-btn\">Gửi bình luận</button></div>";
    var ta = document.getElementById("comments-textarea");
    var counter = document.getElementById("comments-counter");
    var updateCounter = function () {
      if (!ta || !counter) return;
      var n = ta.value.length;
      counter.textContent = n + "/" + maxLen;
      counter.className = "comments-counter" + (n > maxLen ? " over" : "");
    };
    if (ta) ta.addEventListener("input", updateCounter);
    if (commentsCfg && commentsCfg.turnstileEnabled && window.ReaderCaptcha) {
      window.ReaderCaptcha.render(document.getElementById("comments-captcha"), "comment", function () {
        commentsShowStatus("Không tải được mã chống robot, không gửi được bình luận lúc này.", true);
      });
    }
    var btn = document.getElementById("comments-submit-btn");
    if (btn) btn.addEventListener("click", async function () {
      var body = ta ? ta.value.trim() : "";
      if (!body) { commentsShowStatus("Bình luận không được để trống.", true); return; }
      var payload = { articleSlug: commentsSlug, body: body };
      if (commentsCfg && commentsCfg.turnstileEnabled && window.ReaderCaptcha) {
        var t = window.ReaderCaptcha.token("comment");
        if (t === null) { commentsShowStatus("Mã chống robot chưa tải xong, vui lòng đợi vài giây rồi thử lại.", true); return; }
        if (t === "") { commentsShowStatus("Vui lòng hoàn thành xác minh chống robot.", true); return; }
        if (t !== undefined) payload.turnstileToken = t;
      }
      btn.disabled = true;
      var r = await commentsApi("/api/v2/reader/comments", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      btn.disabled = false;
      if (!r.ok) { commentsShowStatus(commentErrorMessage(r.data, r.status), true); return; }
      var msg = "Bình luận của bạn đang chờ tòa soạn duyệt.";
      if (r.data && r.data.linksRemoved) msg += " Liên kết đã được loại bỏ khỏi bình luận.";
      commentsShowStatus(msg, false);
      if (ta) { ta.value = ""; updateCounter(); }
      if (window.ReaderCaptcha) window.ReaderCaptcha.reset("comment");
      // Binh luan moi dang cho duyet nen KHONG hien ngay trong danh sach.
    });
  }
  async function commentsLoadPage(page) {
    var r = await commentsApi("/api/v2/comments?articleSlug=" + encodeURIComponent(commentsSlug) +
      "&page=" + page + "&limit=" + COMMENTS_LIMIT);
    if (!r.ok) {
      if (r.status === 403) commentsShowStatus(commentErrorMessage(r.data, r.status), true);
      return false;
    }
    var d = r.data || {};
    commentsTotal = d.total || 0;
    if (page <= 1) commentsItems = d.data || [];
    else commentsItems = commentsItems.concat(d.data || []);
    commentsPage = d.page || page;
    commentsRenderList();
    return true;
  }
  async function commentsReport(id) {
    var reason = window.prompt ? window.prompt("Nhập lý do báo cáo (không bắt buộc):", "") : "";
    if (reason === null) return; // Bam Huy: khong gui.
    var r = await commentsApi("/api/v2/reader/comments/" + encodeURIComponent(id) + "/report", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: reason || undefined }),
    });
    if (!r.ok) { commentsShowStatus(commentErrorMessage(r.data, r.status), true); return; }
    commentsShowStatus("Đã gửi báo cáo.", false);
    if (r.data && r.data.hidden) {
      // Du 3 bao cao -> binh luan tu an: bo khoi danh sach sau khi reload.
      commentsItems = commentsItems.filter(function (c) { return c.id !== id; });
      commentsTotal = Math.max(0, commentsTotal - 1);
      commentsRenderList();
    }
  }
  async function commentsDelete(id) {
    if (!window.confirm || !window.confirm("Bạn có chắc muốn xóa bình luận này?")) return;
    var r = await commentsApi("/api/v2/reader/comments/" + encodeURIComponent(id), { method: "DELETE" });
    if (!r.ok) { commentsShowStatus(commentErrorMessage(r.data, r.status), true); return; }
    commentsItems = commentsItems.filter(function (c) { return c.id !== id; });
    commentsTotal = Math.max(0, commentsTotal - 1);
    commentsRenderList();
    commentsShowStatus("Đã xóa bình luận.", false);
  }
  async function initComments(slug, allowComments) {
    if (!commentsSection || commentsInitDone) return;
    commentsInitDone = true;
    commentsSlug = slug;
    var cfgR = await commentsApi("/api/v2/comments/config");
    commentsCfg = cfgR.ok ? cfgR.data : null;
    if (!shouldShowComments(commentsCfg, allowComments)) return; // An: khong render khung.
    var meR = await commentsApi("/api/v2/reader/me");
    commentsMe = meR.ok && meR.data && meR.data.user ? meR.data.user : null;
    commentsSection.hidden = false;
    commentsSection.innerHTML = "<h2 id=\"comments-title\">Bình luận (0)</h2>" +
      "<p class=\"comments-status\" id=\"comments-status\" hidden></p>" +
      "<div id=\"comments-form-wrap\"></div>" +
      "<div id=\"comments-list\"><p>Đang tải bình luận…</p></div>" +
      "<div class=\"comments-more-wrap\"><button type=\"button\" class=\"comments-btn secondary\" id=\"comments-more\" hidden>Xem thêm</button></div>";
    commentsRenderForm();
    await commentsLoadPage(1);
    var more = document.getElementById("comments-more");
    if (more) more.addEventListener("click", function () { commentsLoadPage(commentsPage + 1); });
    commentsSection.addEventListener("click", function (e) {
      var t = e.target && e.target.closest ? e.target.closest("[data-action]") : null;
      if (!t) return;
      var action = t.getAttribute("data-action");
      var id = t.getAttribute("data-comment-id");
      if (!id) return;
      if (action === "report") commentsReport(id);
      else if (action === "delete") commentsDelete(id);
    });
  }
  // Sau khi dang nhap xong (hop thoai reader-auth): hien form + tai
  // lai danh sach de co co `mine` cho nut Xoa.
  window.addEventListener("reader-auth:changed", async function () {
    if (!commentsSlug || commentsSection.hidden) return;
    var meR = await commentsApi("/api/v2/reader/me");
    commentsMe = meR.ok && meR.data && meR.data.user ? meR.data.user : null;
    commentsRenderForm();
    await commentsLoadPage(1);
  });
  // Hook cho test portal (node --test): khong dung o runtime.
  if (typeof window !== "undefined") {
    window.TshtComments = {
      shouldShowComments: shouldShowComments,
      formatCommentBody: formatCommentBody,
      hasMoreComments: hasMoreComments,
      commentErrorMessage: commentErrorMessage,
      limit: COMMENTS_LIMIT,
    };
  }
})();
