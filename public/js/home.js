// Homepage (/) for TSHT — frame only, real content only.
// Data sources (all existing public APIs, no keys, no tokens):
//   GET /api/v2/epaper?page=1  -> published e-paper issues, newest first
//     (he moi qua proxy TSHT; tra dung dang cu:
//     {items: [{issue_number, issue_type, publish_date, title,
//       page_count, cover, url}], ...})
//   GET /api/v2/home-blocks -> khoi trang chu do CMS quan ly (Layout
//     blocks, tab Khoi trang chu trong Quan ly giao dien): thu tu,
//     cot hien thi, chuyen muc nguon, bat/tat. Chi khoi dang bat moi
//     co trong danh sach public.
//   GET /api/v2/news?category=<slug>&limit=5 -> bai da xuat ban cua
//     mot chuyen muc (khoi chuyen muc: 1 bai lon + toi da 4 bai sau).
//   GET /api/v2/zones/tieu-diem -> khoi Hero CU (bai ghim + lap day),
//     chi dung lam fallback khi endpoint moi loi (xem loadHeroBlock).
//   GET /api/v2/home-slots/noi-bat | tieu-diem -> 2 khoi Hero (nguon
//     duy nhat, danh sach da sap; rong la hop le, khong tu lap).
// Cac khoi trung da go 2026-11-04: luoi Tin tieu diem duoi hero, dai
// Dang phat cu, cum TV/PHAT THANH TRUC TUYEN/VIDEO MOI, khoi Noi bat
// giua trang (bao in + BAN DOC QUAN TAM lap lan 2), danh sach Tin moi
// nhat tron chung (thay bang khoi chuyen muc). Khoi chuyen muc nao
// chua co bai da xuat ban thi tu an, khong de khoang trong.
// Every block degrades to a plain "chưa tải được" note on API failure.
(function () {
  "use strict";
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
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

  // --- E-paper: chi khoi "Bao in moi nhat" o cuoi trang (nguon moi,
  // cung proxy nhu trang /bao-in). Khoi Noi bat giua trang (feat-hero /
  // feat-left / feat-side) da go theo yeu cau don khoi lap: noi dung
  // khoi cuoi trang giu nguyen — cac so sau so moi nhat, dang luoi ngang.
  fetch("/api/v2/epaper?page=1").then(function (r) {
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }).then(function (d) {
    var items = (d && d.items) || [];
    var more = document.getElementById("epaper-more");
    if (!more) return;
    if (!items.length) {
      more.innerHTML = "<p>Chưa có số báo nào đã xuất bản. <a href=\"/bao-in\">Xem trang báo in →</a></p>";
      return;
    }
    var rest = items.slice(1);
    more.innerHTML = rest.map(function (it) { return issueCard(it, false); }).join("") ||
      "<p>Chỉ có một số báo đã xuất bản.</p>";
  }).catch(function () {
    var more = document.getElementById("epaper-more");
    if (more) more.innerHTML = "<p>Chưa tải được danh sách báo in. <a href=\"/bao-in\">Thử xem trang báo in →</a></p>";
  });

  // --- Tin tuc (chuyen muc + bai viet that, qua proxy TSHT) ---
  // --- Khoi Tin noi bat kieu hero (mau Tuyen Quang TV): cot trai la
  // danh sach doc co thanh cuon (hien 3 tin, cuon xem them, bam vao tin
  // nao thi tin do len giua lam hero), tin hero lon o giua (nut < >
  // chuyen tin, tu cuon cot trai theo), hop "Ban doc quan tam" ben
  // phai lay tu tin moi nhat (tru cac tin da hien o hero). Chi hoc bo
  // cuc, noi dung la tin cua minh; chua co API xep hang luot doc that
  // nen cot phai khong phai "doc nhieu nhat" dung nghia.
  function heroSideRow(it) {
    return "<a class=\"hero-side-row\" href=\"" + esc(it.url) + "\" title=\"" + esc(it.title || "") + "\">" +
      (it.cover ? "<img src=\"" + esc(it.cover) + "\" alt=\"\" loading=\"lazy\">" : "") +
      "<span>" + esc(it.title) + "</span></a>";
  }
  function heroLeftRow(it, idx, active) {
    return "<button type=\"button\" class=\"hero-left-row" + (active ? " active" : "") + "\" data-idx=\"" + idx + "\" title=\"" + esc(it.title || "") + "\">" +
      (it.cover ? "<img src=\"" + esc(it.cover) + "\" alt=\"\" loading=\"lazy\">" : "") +
      "<span>" + esc(it.title) + "</span></button>";
  }
  // Link duoi tin lon: tu danh sach Tin tieu diem da sap, tru tin lon
  // dang hien, toi da 3. Neu tin lon cung nam trong danh sach (bai vua
  // la Bai chinh vua trong Tieu diem) thi bo link trung do, khong lap
  // bai khac vao cho do.
  function heroLinks(spotItems, heroUrl) {
    var links = (spotItems || []).filter(function (it) { return it.url && it.url !== heroUrl; }).slice(0, 3);
    if (!links.length) return "";
    return "<div class=\"hero-links\">" + links.map(function (it) {
      return "<a href=\"" + esc(it.url) + "\">" + esc(it.title) + "</a>";
    }).join("") + "</div>";
  }
  function renderHeroBlock(el, zoneItems, sideItems, heroIdx, spotItems) {
    var hero = zoneItems[heroIdx];
    var prevLeft = el.querySelector(".hero-left");
    var prevScroll = prevLeft ? prevLeft.scrollTop : 0;
    var leftHtml = zoneItems.map(function (it, idx) {
      return heroLeftRow(it, idx, idx === heroIdx);
    }).join("");
    var html = "<div class=\"hero-block\">" +
      "<div class=\"hero-left-wrap\"><div class=\"hero-left\">" + leftHtml + "</div><div class=\"hero-scroll\"><i></i></div></div>" +
      "<div class=\"hero-center\">" +
        "<div class=\"hero-media\">" +
          (hero.cover ? "<a href=\"" + esc(hero.url) + "\"><img src=\"" + esc(hero.cover) + "\" alt=\"\" loading=\"lazy\"></a>" : "") +
          "<button type=\"button\" class=\"hero-arrow hero-prev\" aria-label=\"Tin trước\">‹</button>" +
          "<button type=\"button\" class=\"hero-arrow hero-next\" aria-label=\"Tin sau\">›</button>" +
        "</div>" +
        "<h3><a href=\"" + esc(hero.url) + "\">" + esc(hero.title) + "</a></h3>" +
        (hero.sapo ? "<p class=\"news-sapo\">" + esc(hero.sapo) + "</p>" : "") +
        "<p class=\"news-meta\">" + esc(hero.category ? hero.category.name : "") +
        (hero.publishAt ? " · " + esc(String(hero.publishAt).slice(0, 10)) : "") + "</p>" +
        heroLinks(spotItems, hero.url) +
      "</div>" +
      "<aside class=\"hero-right\"><h3>Bạn đọc quan tâm</h3>" +
        (sideItems.length ? sideItems.map(heroSideRow).join("") : "<p>Chưa có tin.</p>") +
      "</aside></div>";
    el.innerHTML = html;
    var newLeft = el.querySelector(".hero-left");
    if (newLeft) {
      newLeft.scrollTop = prevScroll;
      var active = newLeft.querySelector(".hero-left-row.active");
      if (active) {
        // Chi cuon trong khung danh sach, khong cuon trang: scrollIntoView
        // cuon ca toan trang khi the dang ngoai viewport (tren mobile the
        // dang chon nam duoi hero) nen bam < > bi nhay xuong bai ben duoi.
        var rowTop = active.offsetTop - newLeft.offsetTop;
        var rowBottom = rowTop + active.offsetHeight;
        if (rowTop < newLeft.scrollTop) newLeft.scrollTop = rowTop;
        else if (rowBottom > newLeft.scrollTop + newLeft.clientHeight) newLeft.scrollTop = rowBottom - newLeft.clientHeight;
      }
    }
    // Vach do ngan chi thi vi tri cuon (kieu TQTV: ranh an, chi hien
    // doan do ngan chay theo): thanh cuon goc da an han nen moi trinh
    // duyet deu hien cung mot vach; keo vach khong cuon, cuon bang
    // chuot/cam ung/nut < >.
    var scrollTrack = el.querySelector(".hero-scroll");
    var scrollThumb = el.querySelector(".hero-scroll i");
    function syncHeroScroll() {
      if (!newLeft || !scrollThumb) return;
      var max = newLeft.scrollHeight - newLeft.clientHeight;
      if (scrollTrack) scrollTrack.style.display = max > 0 ? "" : "none";
      var top = max > 0 ? (newLeft.scrollTop / max) * (newLeft.clientHeight - 48) : 0;
      scrollThumb.style.top = top + "px";
    }
    if (newLeft) newLeft.addEventListener("scroll", syncHeroScroll);
    syncHeroScroll();
    el.querySelectorAll(".hero-left-row").forEach(function (btn) {
      btn.addEventListener("click", function () {
        renderHeroBlock(el, zoneItems, sideItems, parseInt(btn.getAttribute("data-idx"), 10) || 0, spotItems);
      });
    });
    var prev = el.querySelector(".hero-prev");
    var next = el.querySelector(".hero-next");
    if (prev) prev.addEventListener("click", function () {
      renderHeroBlock(el, zoneItems, sideItems, (heroIdx - 1 + zoneItems.length) % zoneItems.length, spotItems);
    });
    if (next) next.addEventListener("click", function () {
      renderHeroBlock(el, zoneItems, sideItems, (heroIdx + 1) % zoneItems.length, spotItems);
    });
  }
  // Khoi Tin noi bat / Tin tieu diem — danh sach sap xep rieng (Buoc 0
  // 2026-11-05, phuong an A): trang chu doc GET /api/v2/home-slots/
  // noi-bat va /tieu-diem lam nguon duy nhat. Fallback ve nguon cu
  // (zone tieu-diem, roi isFeatured) CHI khi endpoint moi LOI (fetch
  // fail / HTTP >= 400); danh sach moi rong la hop le (hien "Chua co
  // tin."), khong tu lap bai khac.
  function loadHeroBlock(zoneKey, elId, fallbackUrl, emptyText) {
    var el = document.getElementById(elId);
    if (!el) return;
    // Timeout rieng cho moi fetch phia client (ngan hon 8s cua proxy):
    // 3 nguon doc lap (noi-bat, tieu-diem, news) chay SONG SONG nen tong
    // thoi gian cho ~1 timeout thay vi 3 timeout noi tiep (20-60s) nhu
    // cu. Duong fallback (zone + featured) cung chay song song, uu tien
    // zone khi co bai. Giu nguyen ngu nghia cu: endpoint moi loi moi
    // fallback; danh sach rong la hop le, khong tu lap.
    var HERO_TIMEOUT_MS = 6000;
    // Tuong duong Promise.allSettled (file nay giu kieu ES5, khong dung
    // API moi): tra [{ok, value}] cho moi promise, khong reject som.
    function settled(promises) {
      return Promise.all(promises.map(function (p) {
        return p.then(function (v) { return { ok: true, value: v }; }, function () { return { ok: false, value: null }; });
      }));
    }
    function fetchItems(url) {
      var ctrl = (typeof AbortController !== "undefined") ? new AbortController() : null;
      var timer = null;
      if (ctrl) timer = setTimeout(function () { ctrl.abort(); }, HERO_TIMEOUT_MS);
      return fetch(url, ctrl ? { signal: ctrl.signal } : undefined)
        .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
        .then(function (d) { return (d && d.items) || []; })
        .then(function (v) { if (timer) clearTimeout(timer); return v; }, function (e) { if (timer) clearTimeout(timer); throw e; });
    }
    function render(zoneItems, spotItems, latest) {
      if (!zoneItems.length) { el.innerHTML = "<p>" + emptyText + "</p>"; return; }
      // Danh sach Tieu diem da sap (toi da 3); heroLinks() tru tin lon
      // dang hien roi lay toi da 3. Loi tai -> coi nhu rong (an khoi).
      var seen = {};
      zoneItems.forEach(function (it) { if (it.url) seen[it.url] = true; });
      var side = (latest || []).filter(function (it) { return it.url && !seen[it.url]; }).slice(0, 5);
      renderHeroBlock(el, zoneItems, side, 0, spotItems || []);
    }
    settled([
      fetchItems("/api/v2/home-slots/noi-bat"),
      fetchItems("/api/v2/home-slots/tieu-diem"),
      fetchItems("/api/v2/news?limit=12"),
    ]).then(function (rs) {
      var spot = rs[1].ok ? rs[1].value : [];
      var latest = rs[2].ok ? rs[2].value : [];
      if (rs[0].ok) { render(rs[0].value, spot, latest); return; }
      // Noi-bat loi -> duong cu: zone tieu-diem truoc (ghim + lap day),
      // roi featured; chay song song, chi dung featured khi zone rong/loi.
      settled([fetchItems("/api/v2/zones/" + zoneKey), fetchItems(fallbackUrl)])
        .then(function (fb) {
          var zone = fb[0].ok ? fb[0].value : [];
          var feat = fb[1].ok ? fb[1].value : [];
          if (zone.length) render(zone, spot, latest);
          else if (feat.length) render(feat, spot, latest);
          else el.innerHTML = "<p>" + emptyText + "</p>";
        });
    });
  }
  loadHeroBlock("tieu-diem", "news-featured", "/api/v2/news?featured=1&limit=10", "Chưa có tin.");
  // Cai dat giao dien do CMS Quan ly giao dien dat (hot link, khoi
  // trang chu, footer, favicon). Header chung: header.js (nap truoc)
  // da fetch /api/v2/site-interface 1 lan/trang va de o
  // window.__tshtSiteInterface — dung lai thay vi fetch lan 2; neu
  // header.js chua kip chay thi fetch nhu cu. Tai loi thi tra null va
  // portal giu hanh vi cu.
  var siteInterfacePromise = (window.__tshtSiteInterface && typeof window.__tshtSiteInterface.then === "function")
    ? window.__tshtSiteInterface
    : fetch("/api/v2/site-interface")
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .catch(function () { return null; });

  // Ap dung cai dat giao dien (menu/nav do server dung san roi; chi
  // hot link + footer + favicon o day).
  function applySiteInterface(si) {
    if (!si) return;
    var strip = document.getElementById("hotlink-strip");
    if (strip && si.hotLinks && si.hotLinks.length) {
      strip.innerHTML = si.hotLinks.map(function (h) {
        return "<a href=\"/tin/" + esc(h.slug) + "\">" + esc(h.title) + "</a>";
      }).join("");
      strip.hidden = false;
    }
    // Topline (ngay + hotline/mang xa hoi + anh logo) va chan trang tuy
    // chinh do header.js dam nhan tren moi trang, khong lam o day nua.
    if (si.favicon && si.favicon.image) {
      var icon = document.querySelector('link[rel="icon"][sizes="any"]');
      if (icon) icon.href = si.favicon.image;
    }
  }

  // Menu do + bang mega + o tim kiem: do server dung san, header.js gan
  // hanh vi (xem public/js/header.js) — khong build bang JS o day nua.
  siteInterfacePromise.then(applySiteInterface);


  // --- Khoi trang chu do CMS quan ly (Layout blocks) ---
  // Config tu /api/v2/home-blocks (chi khoi dang bat, xep theo order):
  // khoi full (Hero / Multimedia / Bao in) hien/ an + xep thu tu that
  // trong luong trang; khoi left/right gom vao vung 2 cot (trai = khoi
  // chuyen muc, phai = Thoi tiet + slot quang cao cot phai). Khoi
  // chuyen muc goi /api/v2/news?category=<slug>&limit=5: 0 bai da xuat
  // ban -> khong ve khoi (tu an, khong de khoang trong). Config loi ->
  // giu nguyen thu tu mac dinh + khoi Thoi tiet mac dinh, khong vo trang.
  function catBlockHtml(title, slug, items) {
    var feat = items[0];
    var rest = items.slice(1, 5);
    var featHtml = "<a class=\"cat-feat\" href=\"" + esc(feat.url || "#") + "\" title=\"" + esc(feat.title || "") + "\">" +
      (feat.cover ? "<img src=\"" + esc(feat.cover) + "\" alt=\"\" loading=\"lazy\">" : "") +
      "<h3>" + esc(feat.title || "") + "</h3>" +
      (feat.sapo ? "<p class=\"cat-feat-sapo\">" + esc(feat.sapo) + "</p>" : "") + "</a>";
    var rows = rest.map(function (it) {
      return "<a class=\"cat-row\" href=\"" + esc(it.url || "#") + "\" title=\"" + esc(it.title || "") + "\">" +
        (it.cover ? "<img src=\"" + esc(it.cover) + "\" alt=\"\" loading=\"lazy\">" : "") +
        "<span>" + esc(it.title || "") + "</span></a>";
    }).join("");
    return "<div class=\"cat-block-head\"><h2>" + esc(title) + "</h2>" +
      "<a href=\"/chuyen-muc/" + encodeURIComponent(slug) + "\">Xem thêm →</a></div>" +
      "<div class=\"cat-block-body\">" + featHtml + "<div class=\"cat-list\">" + rows + "</div></div>";
  }
  (function initHomeBlocks() {
    var flow = document.getElementById("home-flow");
    if (!flow) return;
    var heroSec = document.getElementById("block-hero");
    var mmSec = document.getElementById("multimedia");
    var bodyEl = document.getElementById("home-body");
    var epaperSec = document.getElementById("block-epaper");
    var leftCol = document.getElementById("home-cat-left");
    var weatherSlot = document.getElementById("home-weather-slot");
    var adMedia = document.querySelector('[data-ad-placement="web_home_media_right"]');
    var adUnderMedia = document.querySelector('[data-ad-placement="web_home_under_media"]');
    var fullSections = { HERO_NEWS: heroSec, MULTIMEDIA: mmSec, EPAPER: epaperSec };
    function renderWeather() {
      if (weatherSlot) weatherSlot.innerHTML = "<section class=\"side-block\" aria-label=\"Thời tiết\"><h3>Thời tiết</h3><p class=\"weather-note\">Thời tiết: sẽ cập nhật sau.</p></section>";
    }
    function refreshBodyVisibility() {
      if (!bodyEl) return;
      var hasLeft = leftCol && leftCol.childNodes.length > 0;
      var hasWeather = weatherSlot && weatherSlot.childNodes.length > 0;
      bodyEl.style.display = (hasLeft || hasWeather) ? "" : "none";
    }
    function loadCatBlock(b) {
      if (!leftCol || !b.categorySlug) return;
      // Tao khung khoi TRUOC, chen ngay theo thu tu config (applyBlocks
      // duyet khoi theo order): neu doi fetch xong moi chen thi thu tu
      // hien thi se theo toc do tra API tung khoi, khong theo order CMS.
      var sec = document.createElement("section");
      sec.className = "cat-block";
      leftCol.appendChild(sec);
      refreshBodyVisibility();
      fetch("/api/v2/news?category=" + encodeURIComponent(b.categorySlug) + "&limit=5")
        .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
        .then(function (d) {
          var items = (d && d.items) || [];
          if (!items.length) { sec.remove(); return; } // chuyen muc chua co bai -> an gon khoi
          var title = (items[0].category && items[0].category.name) || b.title || b.categorySlug;
          sec.setAttribute("aria-label", title);
          sec.innerHTML = catBlockHtml(title, b.categorySlug, items);
          refreshBodyVisibility();
        })
        .catch(function () { sec.remove(); refreshBodyVisibility(); });
    }
    function applyBlocks(blocks) {
      var sorted = (blocks || []).slice().sort(function (a, c) { return (a.order || 0) - (c.order || 0); });
      var activeFull = {};
      var nodes = [];
      var bodyPlaced = false;
      sorted.forEach(function (b) {
        if (b.column === "left" || b.column === "right") {
          if (!bodyPlaced && bodyEl) { nodes.push(bodyEl); bodyPlaced = true; }
        } else {
          var sec = fullSections[b.type];
          if (sec) {
            nodes.push(sec); activeFull[b.type] = true;
            if (b.type === "MULTIMEDIA") { if (adMedia) nodes.push(adMedia); if (adUnderMedia) nodes.push(adUnderMedia); }
          }
        }
      });
      Object.keys(fullSections).forEach(function (t) {
        var sec = fullSections[t];
        if (sec) sec.style.display = activeFull[t] ? "" : "none";
      });
      if (bodyEl) bodyEl.style.display = bodyPlaced ? "" : "none";
      nodes.forEach(function (n) { flow.appendChild(n); });
      sorted.forEach(function (b) {
        if (b.type === "CATEGORY_NEWS") loadCatBlock(b);
        else if (b.type === "WEATHER") renderWeather();
      });
      refreshBodyVisibility();
    }
    fetch("/api/v2/home-blocks")
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (d) {
        var blocks = (d && d.blocks) || [];
        if (!blocks.length) { renderWeather(); return; }
        applyBlocks(blocks);
      })
      .catch(function () { renderWeather(); });
  })();

  // Giu vach do chi thi cuon dung vi tri khi khung doi kich thuoc
  // (xoay dien thoai, co gian cua so): tinh lai tu DOM hien tai thay vi
  // dung so do tu lan render truoc. Vach cao co dinh 48px, khong co dan.
  window.addEventListener("resize", function () {
    document.querySelectorAll(".hero-left").forEach(function (list) {
      var wrap = list.parentElement;
      var track = wrap ? wrap.querySelector(".hero-scroll") : null;
      var thumb = wrap ? wrap.querySelector(".hero-scroll i") : null;
      if (!thumb) return;
      var max = list.scrollHeight - list.clientHeight;
      if (track) track.style.display = max > 0 ? "" : "none";
      thumb.style.top = (max > 0 ? (list.scrollTop / max) * (list.clientHeight - 48) : 0) + "px";
    });
  });
  // GĐ3 nen: pageview trang chu (server dedupe 30 phut/phien).
  if (window.TshtTelemetry) window.TshtTelemetry.sendPageview();
})();
