// Header chung (2026-11-05): bo them HANH VI duy nhat cho header.
// Cau truc header (utilitybar / masthead / catnav / mega / drawer) do
// SERVER dung san tu cau hinh CMS khi tra trang (xem server.mjs,
// injectChrome) — file nay KHONG fetch/build menu nua, chi gan hanh vi
// len markup da co: ngay hien tai, logo + mang xa hoi, dropdown muc con,
// bang mega, o tim kiem, ngan keo mobile, to noi bai viet.
(function () {
  "use strict";
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  var isMobile = window.matchMedia
    ? window.matchMedia("(max-width: 900px)")
    : { matches: false, addListener: function () {}, addEventListener: function () {} };

  // ---- Ngay hien tai (goc phai hang logo) ----
  var dateEl = document.querySelector("[data-topline-date]");
  if (dateEl) {
    try {
      dateEl.textContent = new Date().toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
    } catch (e) { /* giu trong khi trinh duyet cu khong ho tro */ }
  }

  // ---- Cai dat giao dien: fetch 1 lan/trang, dem 5 phut ----
  // sessionStorage dung chung cho moi trang (khong phai localStorage de
  // doi CMS khong bi giu qua lau); home.js dung lai promise nay thay vi
  // fetch lan 2 (window.__tshtSiteInterface).
  var SI_KEY = "tsht_site_interface";
  var SI_TTL_MS = 5 * 60 * 1000;
  function siCacheGet() {
    try {
      var raw = sessionStorage.getItem(SI_KEY);
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (!o || !o.v || (Date.now() - (o.t || 0)) > SI_TTL_MS) return null;
      return o.v;
    } catch (e) { return null; }
  }
  function siCacheSet(v) {
    try { sessionStorage.setItem(SI_KEY, JSON.stringify({ t: Date.now(), v: v })); } catch (e) { /* bo qua khi khong co storage */ }
  }
  var cachedSi = siCacheGet();
  var siteInterfacePromise = cachedSi
    ? Promise.resolve(cachedSi)
    : fetch("/api/v2/site-interface")
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (si) { siCacheSet(si); return si; })
      .catch(function () { return null; });
  window.__tshtSiteInterface = siteInterfacePromise;

  // ---- Logo + mang xa hoi (nhu cu) ----
  var logoEl = document.getElementById("brand-logo");
  var nameEl = document.querySelector(".brand .brand-name");
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
  siteInterfacePromise.then(function (si) {
    var hd = (si && si.header) || {};
    var socialEl = document.getElementById("utility-social");
    if (socialEl) {
      var socials = [];
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
    // Day hot link duoi nav (CMS Quan ly giao dien dat): hien tren moi
    // trang co header chung; an khi CMS chua dat.
    var strip = document.getElementById("hotlink-strip");
    if (strip && si.hotLinks && si.hotLinks.length) {
      strip.innerHTML = si.hotLinks.map(function (h) {
        return "<a href=\"/tin/" + esc(h.slug) + "\">" + esc(h.title) + "</a>";
      }).join("");
      strip.hidden = false;
    }
  }).catch(function () {
    // Tai loi: neu khong co logo cache dang hien thi hien chu ten de
    // khoi trong hang ten; co cache thi giu logo cu cho lan sau sua.
    if (!showingCached) showName();
  });

  // ---- Tim kiem dung chung (o duoi nav + o trong ngan keo) ----
  // Enter/"Tim" goi /api/v2/news?q= (API cong khai san co), hien toi da
  // 8 ket qua dang link ve trang doc. Khong them trang ket qua rieng.
  function runSearch(q, resultsEl) {
    if (!resultsEl) return;
    if (!q) { resultsEl.innerHTML = "<p class=\"catnav-search-note\">Nhập từ khóa rồi bấm Tìm.</p>"; return; }
    resultsEl.innerHTML = "<p class=\"catnav-search-note\">Đang tìm…</p>";
    fetch("/api/v2/news?q=" + encodeURIComponent(q) + "&limit=8")
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (d) {
        var items = (d && d.items) || [];
        if (!items.length) { resultsEl.innerHTML = "<p class=\"catnav-search-note\">Không tìm thấy tin bài nào cho \"" + esc(q) + "\".</p>"; return; }
        resultsEl.innerHTML = items.map(function (it) {
          return "<a href=\"" + esc(it.url || "#") + "\">" + esc(it.title || "") + "</a>";
        }).join("");
      })
      .catch(function () { resultsEl.innerHTML = "<p class=\"catnav-search-note\">Không tải được kết quả tìm kiếm.</p>"; });
  }
  (function initCatnavSearch() {
    var btn = document.querySelector(".catnav-search-btn");
    var panel = document.getElementById("catnav-search");
    if (!btn || !panel) return;
    var form = panel.querySelector(".catnav-search-form");
    var input = form ? form.querySelector("input") : null;
    var results = panel.querySelector(".catnav-search-results");
    function open() { panel.hidden = false; btn.setAttribute("aria-expanded", "true"); if (input) input.focus(); }
    function close() { panel.hidden = true; btn.setAttribute("aria-expanded", "false"); }
    btn.addEventListener("click", function () { if (panel.hidden) open(); else close(); });
    document.addEventListener("click", function (ev) {
      if (!panel.hidden && ev.target.closest && !ev.target.closest("#catnav-search") && !ev.target.closest(".catnav-search-btn")) close();
    });
    document.addEventListener("keydown", function (ev) { if (ev.key === "Escape") close(); });
    if (form) form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      runSearch(input ? input.value.trim() : "", results);
    });
  })();

  // ---- Bang mega (may tinh) + ngan keo (mobile): nut ☰ ----
  var megaPanel = document.getElementById("catnav-mega");
  var megaBtn = document.querySelector(".catnav-menu-btn");
  function closeMegaMenu() {
    if (megaPanel) megaPanel.hidden = true;
    if (megaBtn) megaBtn.setAttribute("aria-expanded", "false");
  }
  var drawer = document.getElementById("site-drawer");
  function openDrawer() {
    if (!drawer) return;
    closeMegaMenu();
    drawer.hidden = false;
    document.body.classList.add("drawer-open");
    var c = drawer.querySelector(".site-drawer-close");
    if (c) c.focus();
  }
  function closeDrawer() {
    if (!drawer) return;
    drawer.hidden = true;
    document.body.classList.remove("drawer-open");
  }
  if (megaBtn) megaBtn.addEventListener("click", function (ev) {
    ev.preventDefault();
    ev.stopPropagation();
    // Mobile: ☰ mo ngan keo; may tinh: ☰ mo/đong bang mega.
    if (isMobile.matches) { openDrawer(); return; }
    if (!megaPanel) return;
    if (megaPanel.hidden && !megaPanel.hasChildNodes()) return; // server chua dung duoc menu
    var willOpen = megaPanel.hidden;
    megaPanel.hidden = !willOpen;
    megaBtn.setAttribute("aria-expanded", willOpen ? "true" : "false");
    if (willOpen) {
      var close = megaPanel.querySelector(".mega-close");
      if (close) close.focus();
    }
  });
  if (megaPanel) {
    var megaClose = megaPanel.querySelector(".mega-close");
    if (megaClose) megaClose.addEventListener("click", function () { closeMegaMenu(); });
    document.addEventListener("click", function (ev) {
      if (megaPanel.hidden || !ev.target.closest) return;
      if (!ev.target.closest(".catnav") && !ev.target.closest("#catnav-mega")) closeMegaMenu();
    });
  }
  if (drawer) {
    drawer.querySelectorAll("[data-drawer-close]").forEach(function (el) {
      el.addEventListener("click", function () { closeDrawer(); });
    });
    var drawerClose = drawer.querySelector(".site-drawer-close");
    if (drawerClose) drawerClose.addEventListener("click", function () { closeDrawer(); });
    // Muc con trong ngan keo: bam nut mui ten mo/gap, bam chu van chuyen trang.
    var catsBox = drawer.querySelector(".site-drawer-cats");
    if (catsBox) catsBox.addEventListener("click", function (ev) {
      var t = ev.target && ev.target.closest ? ev.target.closest(".drawer-cat-toggle") : null;
      if (!t) return;
      ev.preventDefault();
      ev.stopPropagation();
      var row = t.closest(".drawer-cat");
      if (!row) return;
      var open = row.classList.toggle("open");
      t.setAttribute("aria-expanded", open ? "true" : "false");
    });
    var drawerForm = drawer.querySelector(".site-drawer-search");
    if (drawerForm) drawerForm.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var input = drawerForm.querySelector("input");
      runSearch(input ? input.value.trim() : "", drawer.querySelector(".site-drawer-results"));
    });
    // Xoay/co man hinh sang desktop thi dong ngan keo (CSS cung an no).
    var onChange = function () { if (!isMobile.matches) closeDrawer(); };
    if (isMobile.addEventListener) isMobile.addEventListener("change", onChange);
    else if (isMobile.addListener) isMobile.addListener(onChange);
  }
  document.addEventListener("keydown", function (ev) {
    if (ev.key !== "Escape") return;
    closeMegaMenu();
    closeDrawer();
  });

  // ---- Dropdown muc con tren thanh do (nut mui ten ▾) ----
  // Markup do server dung san; chi gan hanh vi: bam mui ten mo/dong,
  // bam chu muc cha van chuyen trang; bam ra ngoai / Escape thi dong.
  var nav = document.querySelector(".catnav");
  function closeCatnavDrops() {
    if (!nav) return;
    nav.querySelectorAll(".catnav-item.open").forEach(function (it) {
      it.classList.remove("open");
      var cb = it.querySelector(".catnav-caret");
      if (cb) cb.setAttribute("aria-expanded", "false");
    });
  }
  if (nav) {
    nav.addEventListener("click", function (ev) {
      var caret = ev.target && ev.target.closest ? ev.target.closest(".catnav-caret") : null;
      if (!caret) return;
      ev.preventDefault();
      ev.stopPropagation();
      var item = caret.closest(".catnav-item");
      if (!item) return;
      var open = item.classList.toggle("open");
      caret.setAttribute("aria-expanded", open ? "true" : "false");
    });
    document.addEventListener("click", function (ev) {
      if (!ev.target.closest || !ev.target.closest(".catnav-item")) closeCatnavDrops();
    });
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") closeCatnavDrops();
    });
  }

  // ---- To noi chuyen muc cua bai viet (/tin/<slug>) ----
  // Server da to noi san cho /chuyen-muc/<slug>; rieng trang bai viet,
  // chuyen muc chi biet sau khi article.js tai bai xong nen goi ham nay.
  // Tim muc cha tren thanh do theo slug: khop truc tiep muc cha, neu
  // slug la muc con thi to noi muc cha cua no (tra trong DOM server da
  // dung, khong can fetch cay chuyen muc).
  function setActiveCategory(slug) {
    if (!nav || !slug || !/^[a-z0-9-]+$/.test(slug)) return;
    nav.querySelectorAll(".catnav-item.is-active").forEach(function (it) { it.classList.remove("is-active"); });
    nav.querySelectorAll(".catnav-item > a[aria-current]").forEach(function (a) { a.removeAttribute("aria-current"); });
    var item = null;
    var link = nav.querySelector(".catnav-item > a[href=\"/chuyen-muc/" + slug + "\"]");
    if (link) {
      item = link.parentElement;
    } else {
      var child = nav.querySelector(".catnav-drop a[href=\"/chuyen-muc/" + slug + "\"]");
      if (child && child.closest) item = child.closest(".catnav-item");
    }
    if (item) {
      item.classList.add("is-active");
      var pa = item.getElementsByTagName("a")[0];
      if (pa) pa.setAttribute("aria-current", "page");
    }
  }
  window.TSHTHeader = { setActiveCategory: setActiveCategory };
})();
