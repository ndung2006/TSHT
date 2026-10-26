// Homepage (/) for TSHT — frame only, real content only.
// Data sources (all existing public APIs, no keys, no tokens):
//   GET /api/v1/issues?page=1  -> published e-paper issues, newest first
//     ({items: [{id, issue_number, issue_type, publish_date, title,
//       page_count, cover, url}], ...})
//   GET /api/v1/schedule?channel=tv|radio&date=YYYY-MM-DD
//     -> {items: [{title, start_time, end_time, startTime, endTime, status}]}
// HERO CHOICE (documented): the newest published e-paper issue is the hero,
// because e-paper is TSHT phase 1 and live TV already has its own pages.
// Live TV/radio appear in the live strip, the "BẠN ĐỌC QUAN TÂM" sidebar
// and the bottom cards — no second player is started on this page.
// News categories, videos and weather are NOT built here: categories show a
// "sẽ có bài viết sau" notice, VIDEO MỚI honestly says "Chưa có video",
// and weather is only the neutral "sẽ cập nhật sau" line in home.html.
// Every block degrades to a plain "chưa tải được" note on API failure.
(function () {
  "use strict";
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function saigonToday() {
    try {
      return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
    } catch (e) { return new Date().toISOString().slice(0, 10); }
  }
  function typeLabel(t) { return t === "vung_cao" ? "Vùng cao" : "Thường"; }
  function issueLabel(it) {
    var title = (it.title || "").trim();
    var base = title || ("Báo in số " + it.issue_number);
    return base + " — Số " + it.issue_number + " (" + typeLabel(it.issue_type) + "), " +
      (it.publish_date || "") + (it.page_count ? ", " + it.page_count + " trang" : "");
  }
  function issueCard(it, small) {
    var cls = small ? "issue-small" : "issue-card";
    return "<div class=\"" + cls + "\"><a href=\"" + esc(it.url || ("/api/v1/issues/" + it.id)) + "\">" +
      "<img src=\"" + esc(it.cover) + "\" alt=\"Bìa " + esc(issueLabel(it)) + "\" loading=\"lazy\"></a>" +
      "<div><p><a href=\"" + esc(it.url || "#") + "\">" + esc(issueLabel(it)) + "</a></p>" +
      "<p class=\"issue-meta\">Báo in</p></div></div>";
  }
  function findLive(items) {
    if (!items || !items.length) return null;
    var now = Date.now(), i, s, e;
    for (i = 0; i < items.length; i++) {
      if (items[i].status === "LIVE") return items[i];
    }
    for (i = 0; i < items.length; i++) {
      s = items[i].startTime ? Date.parse(items[i].startTime) : NaN;
      e = items[i].endTime ? Date.parse(items[i].endTime) : NaN;
      if (isFinite(s) && isFinite(e) && s <= now && now < e) return items[i];
    }
    return null;
  }
  function progLine(it) {
    if (!it) return "";
    return esc(it.title) + (it.start_time && it.end_time ? " (" + esc(it.start_time) + "–" + esc(it.end_time) + ")" : "");
  }

  // Categories are placeholders for the future news module: no fake pages.
  document.querySelectorAll(".catnav a[data-cat]").forEach(function (a) {
    a.addEventListener("click", function (ev) {
      ev.preventDefault();
      var note = document.getElementById("cat-note");
      if (note) note.textContent = "Chuyên mục " + a.getAttribute("data-cat") +
        " sẽ có bài viết sau — module tin tức đang được xây dựng tiếp.";
    });
  });
  var topBtn = document.getElementById("to-top");
  if (topBtn) topBtn.addEventListener("click", function () { window.scrollTo({ top: 0, behavior: "smooth" }); });

  // Sidebar content is assembled from two independent fetches (issues and
  // schedules), so keep both parts in variables and re-render on either
  // completion instead of letting one fetch overwrite the other's output.
  var sideIssuesHtml = "";
  var sideLiveLines = [];
  function renderSide() {
    var side = document.getElementById("feat-side");
    if (!side) return;
    var body = (sideIssuesHtml || "") + sideLiveLines.map(function (l) { return "<p>" + l + "</p>"; }).join("");
    if (body) side.innerHTML = body;
  }

  // --- E-paper blocks ---
  fetch("/api/v1/issues?page=1").then(function (r) {
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }).then(function (d) {
    var items = (d && d.items) || [];
    var hero = document.getElementById("feat-hero");
    var left = document.getElementById("feat-left");
    var side = document.getElementById("feat-side");
    var more = document.getElementById("epaper-more");
    if (!items.length) {
      hero.innerHTML = "<p>Chưa có số báo nào đã xuất bản.</p>";
      left.innerHTML = "<p>Chưa có số báo nào đã xuất bản.</p>";
      sideIssuesHtml = "<p>Chưa có số báo nào đã xuất bản.</p>";
      renderSide();
      more.innerHTML = "<p>Chưa có số báo nào đã xuất bản. <a href=\"/bao-in\">Xem trang báo in →</a></p>";
      return;
    }
    var first = items[0];
    hero.innerHTML = "<a href=\"" + esc(first.url) + "\"><img src=\"" + esc(first.cover) +
      "\" alt=\"Bìa " + esc(issueLabel(first)) + "\"></a>" +
      "<h3><a href=\"" + esc(first.url) + "\">" + esc(issueLabel(first)) + "</a></h3>" +
      "<p><a href=\"" + esc(first.url) + "\">Đọc số báo này →</a></p>";
    var rest = items.slice(1);
    left.innerHTML = rest.slice(0, 3).map(function (it) { return issueCard(it, true); }).join("") ||
      "<p>Chỉ có một số báo đã xuất bản.</p>";
    var sideIssues = rest.slice(3, 8).map(function (it) {
      return "<p><a href=\"" + esc(it.url) + "\">" + esc(issueLabel(it)) + "</a></p>";
    }).join("");
    sideIssuesHtml = sideIssues || "<p>Xem thêm các số báo mới nhất ở khối bên trái và trang báo in.</p>";
    renderSide();
    more.innerHTML = rest.map(function (it) { return issueCard(it, false); }).join("") ||
      "<p>Chỉ có một số báo đã xuất bản.</p>";
  }).catch(function () {
    ["feat-hero", "feat-left", "feat-side", "epaper-more"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.innerHTML = "<p>Chưa tải được danh sách báo in. <a href=\"/bao-in\">Thử xem trang báo in →</a></p>";
    });
  });

  // --- Live TV / radio blocks (no player on this page, links only) ---
  var date = saigonToday();
  function loadSchedule(kind, elId, cardId, isRadio) {
    return fetch("/api/v1/schedule?channel=" + encodeURIComponent(kind) + "&date=" + encodeURIComponent(date))
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (d) {
        var items = (d && d.items) || [];
        var live = findLive(items);
        var el = document.getElementById(elId), card = cardId && document.getElementById(cardId);
        var html;
        if (live) {
          html = "<span class=\"badge-live\">● TRỰC TIẾP</span> " + progLine(live);
        } else if (!items.length) {
          html = isRadio ? "Chưa có lịch phát" : "Chưa có lịch phát sóng cho ngày đã chọn.";
        } else {
          html = "Hiện chưa có chương trình đang phát.";
        }
        if (el) el.innerHTML = html;
        if (card) card.innerHTML = html + " <a href=\"" + (isRadio ? "/phat-thanh" : "/truyen-hinh") + "\">Xem trang trực tiếp →</a>";
        // Append the live program to the sidebar list, if it loaded.
        if (live) {
          sideLiveLines.push((isRadio ? "Phát thanh đang phát: " : "Truyền hình đang phát: ") + progLine(live));
          renderSide();
        }
        return live;
      })
      .catch(function () {
        var el = document.getElementById(elId), card = cardId && document.getElementById(cardId);
        var msg = "Chưa tải được lịch phát sóng.";
        if (el) el.textContent = msg;
        if (card) card.textContent = msg;
        return null;
      });
  }
  loadSchedule("tv", "live-tv", "card-tv", false);
  loadSchedule("radio", "live-radio", "card-radio", true);
})();
