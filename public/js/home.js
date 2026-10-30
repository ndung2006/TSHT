// Homepage (/) for TSHT — frame only, real content only.
// Data sources (all existing public APIs, no keys, no tokens):
//   GET /api/v2/epaper?page=1  -> published e-paper issues, newest first
//     (he moi qua proxy TSHT; tra dung dang cu:
//     {items: [{issue_number, issue_type, publish_date, title,
//       page_count, cover, url}], ...})
//     Luu y: /api/v1/issues cu khong con so nao da xuat ban (4 so cu
//     bi go xuat ban), nen trang chu phai doc tu he moi ke tu 27/10.
//   GET /api/v1/schedule?channel=tv|radio&date=YYYY-MM-DD
//     -> {items: [{title, start_time, end_time, startTime, endTime, status}]}
// HERO CHOICE (documented): the newest published e-paper issue is the hero,
// because e-paper is TSHT phase 1 and live TV already has its own pages.
// Live TV/radio appear in the live strip, the "BẠN ĐỌC QUAN TÂM" sidebar
// and the bottom cards — no second player is started on this page.
// News (tu 27/10): chuyen muc + bai viet that qua proxy TSHT
//   GET /api/v2/news-categories -> cay chuyen muc (cap 1 len catnav)
//   GET /api/v2/news?featured=1&limit=4 -> khoi Tin noi bat
//   GET /api/v2/news?limit=8 -> khoi Tin moi nhat
// Videos and weather are still NOT built here: VIDEO MỚI honestly says
// "Chưa có video", and weather is only the neutral "sẽ cập nhật sau"
// line in home.html. Khi chua co chuyen muc/bai viet, cac khoi tin hien
// trang thai cho trung thuc, khong bia.
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

  // --- E-paper blocks (nguon moi, cung proxy nhu trang /bao-in) ---
  fetch("/api/v2/epaper?page=1").then(function (r) {
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
  // --- Tin tuc (chuyen muc + bai viet that, qua proxy TSHT) ---
  function newsCard(it) {
    return "<div class=\"news-card\"><a href=\"" + esc(it.url) + "\">" +
      (it.cover ? "<img src=\"" + esc(it.cover) + "\" alt=\"\" loading=\"lazy\">" : "") +
      "<h3>" + esc(it.title) + "</h3></a>" +
      (it.sapo ? "<p class=\"news-sapo\">" + esc(it.sapo) + "</p>" : "") +
      "<p class=\"news-meta\">" + esc(it.category ? it.category.name : "") +
      (it.publishAt ? " · " + esc(String(it.publishAt).slice(0, 10)) : "") + "</p></div>";
  }
  function loadNewsBlock(url, elId, emptyText) {
    var el = document.getElementById(elId);
    if (!el) return;
    fetch(url)
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (d) {
        var items = (d && d.items) || [];
        el.innerHTML = items.length ? items.map(newsCard).join("") : "<p>" + emptyText + "</p>";
      })
      .catch(function () { el.innerHTML = "<p>Chưa tải được tin bài.</p>"; });
  }
  // --- Vung hien thi trang chu — Goi 1A Zone/Widget Manager ---
  // Khoi tin doc tu zone (bai ghim + lap day tu nhien den du slot).
  // Zone chua co (backend truoc deploy 1A) thi roi ve URL tin cu de
  // trang chu khong trong trong cua so deploy.
  function loadZoneBlock(zoneKey, elId, fallbackUrl, emptyText) {
    var el = document.getElementById(elId);
    if (!el) return;
    fetch("/api/v2/zones/" + zoneKey)
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (d) {
        var items = (d && d.items) || [];
        el.innerHTML = items.length ? items.map(newsCard).join("") : "<p>" + emptyText + "</p>";
      })
      .catch(function () { loadNewsBlock(fallbackUrl, elId, emptyText); });
  }
  loadZoneBlock("tieu-diem", "news-featured", "/api/v2/news?featured=1&limit=4", "Chưa có tin nổi bật.");
  loadZoneBlock("tin-moi-nhat", "news-latest", "/api/v2/news?limit=8", "Chưa có tin bài.");
  // Cai dat giao dien do CMS Quan ly giao dien dat (menu, hot link, khoi
  // trang chu, header, footer, favicon). Lay 1 lan, dung chung cho nav +
  // khoi + header; tai loi thi tra null va portal giu hanh vi cu.
  var siteInterfacePromise = fetch("/api/v2/site-interface")
    .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .catch(function () { return null; });

  // Ap dung cai dat giao dien (tru nav — nav xu ly rieng trong loadCategories).
  function applySiteInterface(si) {
    if (!si) return;
    var strip = document.getElementById("hotlink-strip");
    if (strip && si.hotLinks && si.hotLinks.length) {
      strip.innerHTML = si.hotLinks.map(function (h) {
        return "<a href=\"/tin/" + esc(h.slug) + "\">" + esc(h.title) + "</a>";
      }).join("");
      strip.hidden = false;
    }
    var wrap = document.getElementById("home-sections");
    if (wrap && si.homeSections && si.homeSections.length) {
      si.homeSections.forEach(function (s, i) {
        var sec = document.createElement("section");
        sec.setAttribute("aria-label", s.name);
        var h = document.createElement("h2");
        h.className = "section-title";
        var a = document.createElement("a");
        a.href = "/chuyen-muc/" + encodeURIComponent(s.slug);
        a.textContent = s.name;
        h.appendChild(a);
        var grid = document.createElement("div");
        grid.id = "home-sec-" + i;
        grid.className = "news-grid";
        grid.textContent = "Đang tải tin…";
        sec.appendChild(h);
        sec.appendChild(grid);
        wrap.appendChild(sec);
        loadNewsBlock("/api/v2/news?category=" + encodeURIComponent(s.slug) + "&limit=4", grid.id, "Chưa có tin bài.");
      });
    }
    var hd = si.header || {};
    if (hd.image) {
      var logo = document.getElementById("masthead-logo");
      if (logo) logo.src = hd.image;
    }
    var parts = [];
    if (hd.phone) parts.push("<a href=\"tel:" + esc(String(hd.phone).replace(/\s+/g, "")) + "\">" + esc(hd.phone) + "</a>");
    if (hd.email) parts.push("<a href=\"mailto:" + esc(hd.email) + "\">" + esc(hd.email) + "</a>");
    [["facebook", "Facebook"], ["youtube", "Youtube"], ["tiktok", "TikTok"], ["zalo", "Zalo"]].forEach(function (p) {
      if (hd[p[0]]) parts.push("<a href=\"" + esc(hd[p[0]]) + "\" target=\"_blank\" rel=\"noopener\">" + p[1] + "</a>");
    });
    var contact = document.getElementById("masthead-contact");
    if (contact && parts.length) { contact.innerHTML = parts.join(" · "); contact.hidden = false; }
    var ft = si.footer || {};
    if (ft.logo || ft.description || ft.copyright) {
      var fc = document.getElementById("footer-custom");
      if (fc) {
        var fl = document.getElementById("footer-logo");
        if (fl && ft.logo) { fl.src = ft.logo; fl.hidden = false; }
        var fd = document.getElementById("footer-desc");
        if (fd && ft.description) fd.innerHTML = ft.description;
        var fcp = document.getElementById("footer-copyright");
        if (fcp && ft.copyright) fcp.textContent = ft.copyright;
        fc.hidden = false;
      }
    }
    if (si.favicon && si.favicon.image) {
      var icon = document.querySelector('link[rel="icon"][sizes="any"]');
      if (icon) icon.href = si.favicon.image;
    }
  }

  // Catnav that: thay link placeholder bang chuyen muc that (cap 1);
  // neu khong tai duoc thi giu nguyen link cu + ghi chu nhu cu.
  // Neu CMS Quan ly giao dien da chon menu thi nav chi hien muc da chon
  // theo dung thu tu do (children lay tu payload menu, da loc muc hien);
  // neu menu con trong thi giu nguyen cay day du nhu cu.
  (function loadCategories() {
    var nav = document.querySelector(".catnav");
    if (!nav) return;
    fetch("/api/v2/news-categories")
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (d) {
        var cats = (d && d.data) || [];
        if (!cats.length) return;
        return siteInterfacePromise.then(function (si) { return { cats: cats, si: si }; });
      })
      .then(function (pair) {
        if (!pair) return;
        var cats = pair.cats;
        var si = pair.si;
        var displayCats = (si && si.menu && si.menu.length) ? si.menu : cats;
        var home = nav.querySelector("a.home-link");
        var icons = nav.querySelector(".catnav-icons");
        nav.querySelectorAll("a[data-cat]").forEach(function (a) { a.remove(); });
        // Nav kieu bao dien tu: muc cha tren thanh nav, di chuot (hover) hoac
        // focus hien dropdown muc con ben duoi; tren cam ung, bam nut mui ten
        // de mo/dong dropdown, bam chu muc cha van chuyen trang binh thuong.
        displayCats.forEach(function (c) {
          var item = document.createElement("div");
          item.className = "catnav-item";
          var a = document.createElement("a");
          a.href = "/chuyen-muc/" + encodeURIComponent(c.slug);
          a.textContent = c.name;
          item.appendChild(a);
          var kids = (c.children || []).filter(function (k) { return k && k.slug; });
          if (kids.length) {
            var caret = document.createElement("button");
            caret.type = "button";
            caret.className = "catnav-caret";
            caret.setAttribute("aria-label", "Hiện mục con của " + c.name);
            caret.setAttribute("aria-expanded", "false");
            caret.textContent = "▾";
            caret.addEventListener("click", function (ev) {
              ev.preventDefault();
              ev.stopPropagation();
              var open = item.classList.toggle("open");
              caret.setAttribute("aria-expanded", open ? "true" : "false");
            });
            item.appendChild(caret);
            var drop = document.createElement("div");
            drop.className = "catnav-drop";
            kids.forEach(function (k) {
              var ka = document.createElement("a");
              ka.href = "/chuyen-muc/" + encodeURIComponent(k.slug);
              ka.textContent = k.name;
              drop.appendChild(ka);
            });
            item.appendChild(drop);
          }
          if (icons) nav.insertBefore(item, icons); else nav.appendChild(item);
        });
        document.addEventListener("click", function (ev) {
          if (!ev.target.closest || !ev.target.closest(".catnav-item")) {
            nav.querySelectorAll(".catnav-item.open").forEach(function (it) {
              it.classList.remove("open");
              var cb = it.querySelector(".catnav-caret");
              if (cb) cb.setAttribute("aria-expanded", "false");
            });
          }
        });
        document.addEventListener("keydown", function (ev) {
          if (ev.key === "Escape") {
            nav.querySelectorAll(".catnav-item.open").forEach(function (it) {
              it.classList.remove("open");
              var cb = it.querySelector(".catnav-caret");
              if (cb) cb.setAttribute("aria-expanded", "false");
            });
          }
        });
        var note = document.getElementById("cat-note");
        if (note) note.style.display = "none";
        void home;
        applySiteInterface(si);
      })
      .catch(function () {
        /* giu nguyen catnav placeholder, nhung van ap dung hot link /
           khoi / header / footer / favicon neu tai duoc cai dat. */
        siteInterfacePromise.then(applySiteInterface);
      });
  })();

  loadSchedule("tv", "live-tv", "card-tv", false);
  loadSchedule("radio", "live-radio", "card-radio", true);
})();
