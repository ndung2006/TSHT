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
  // --- BÁO IN (khoi hero giua trang chu, sau khoi tin chinh, truoc
  // khoi Truyen hinh; vi tri that do thu tu khoi CMS /api/v2/home-blocks
  // quyet dinh — xem initHomeBlocks). 2 an pham xep chung theo ngay phat
  // hanh, moi nhat dau, toi da 10 so; nhan "SỐ MỚI" cho so moi nhat cua
  // MOI an pham; so vung cao co them nhan "VÙNG CAO" goc bia. Anh bia
  // dung ban thu nho ~400px + srcset 800px (server tra coverSrcset),
  // loading lazy. Khong co so nao -> an toan bo khoi; loi tai -> giu
  // khoi + ghi chu nhu cu.
  var EPAPER_WEEKDAYS = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];
  function epaperDisplayName(it) {
    if (it.issue_type === "vung_cao") return "Báo Điện Biên Phủ vùng cao số " + it.issue_number;
    return "Báo Điện Biên Phủ số " + it.issue_number;
  }
  function epaperVnDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    if (!m) return iso || "";
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    if (Number.isNaN(d.getTime()) || d.getUTCDate() !== +m[3] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCFullYear() !== +m[1]) return iso;
    return EPAPER_WEEKDAYS[d.getUTCDay()] + ", " + m[3] + "/" + m[2] + "/" + m[1];
  }
  function epaperPrepare(items) {
    // Xep chung 2 an pham theo ngay phat hanh (moi nhat dau); cung ngay
    // thi so lon hon truoc. Cat toi da 10 so. Nhan isNewest cho so moi
    // nhat cua MOI an pham (toi da 2 nhan).
    var sorted = (items || []).slice().sort(function (a, b) {
      var da = String(a.publish_date || ""), db = String(b.publish_date || "");
      if (db !== da) return db < da ? -1 : 1;
      return (Number(b.issue_number) || 0) - (Number(a.issue_number) || 0);
    }).slice(0, 10);
    var seenType = {};
    return sorted.map(function (it) {
      var t = it.issue_type || "thuong";
      var isNewest = !seenType[t];
      seenType[t] = true;
      return { it: it, isNewest: isNewest };
    });
  }
  function epaperCard(entry) {
    var it = entry.it;
    var name = epaperDisplayName(it);
    var srcset = it.coverSrcset ? " srcset=\"" + esc(it.coverSrcset) + "\" sizes=\"(max-width: 800px) 45vw, 272px\"" : "";
    var img = it.cover ? "<img src=\"" + esc(it.cover) + "\"" + srcset + " alt=\"Bìa " + esc(name) + "\" loading=\"lazy\">" : "";
    var badges = "";
    if (entry.isNewest) badges += "<span class=\"bi-badge bi-badge-new\">SỐ MỚI</span>";
    if (it.issue_type === "vung_cao") badges += "<span class=\"bi-badge bi-badge-hl\">VÙNG CAO</span>";
    return "<article class=\"bi-card\"><a href=\"" + esc(it.url || "/bao-in") + "\">" +
      "<div class=\"bi-cover\">" + badges + img + "</div>" +
      "<h3>" + esc(name) + "</h3>" +
      "<p class=\"bi-date\">" + esc(epaperVnDate(it.publish_date)) + "</p></a></article>";
  }
  function syncEpaperArrows() {
    var rail = document.getElementById("epaper-more");
    var sec = document.getElementById("block-epaper");
    if (!rail || !sec) return;
    var prev = sec.querySelector(".epaper-arrow-prev");
    var next = sec.querySelector(".epaper-arrow-next");
    if (!prev || !next) return;
    var max = rail.scrollWidth - rail.clientWidth;
    var noOverflow = max <= 1;
    prev.classList.toggle("is-hidden", noOverflow || rail.scrollLeft <= 0);
    next.classList.toggle("is-hidden", noOverflow || rail.scrollLeft >= max - 1);
  }
  function initEpaperArrows() {
    var rail = document.getElementById("epaper-more");
    var sec = document.getElementById("block-epaper");
    if (!rail || !sec) return;
    var prev = sec.querySelector(".epaper-arrow-prev");
    var next = sec.querySelector(".epaper-arrow-next");
    if (!prev || !next) return;
    function cardStep() {
      var card = rail.querySelector(".bi-card");
      return card ? card.getBoundingClientRect().width + 16 : 288;
    }
    prev.addEventListener("click", function () { rail.scrollBy({ left: -cardStep(), behavior: "smooth" }); });
    next.addEventListener("click", function () { rail.scrollBy({ left: cardStep(), behavior: "smooth" }); });
    rail.addEventListener("scroll", syncEpaperArrows, { passive: true });
    window.addEventListener("resize", syncEpaperArrows);
    syncEpaperArrows();
  }
  initEpaperArrows();
  fetch("/api/v2/epaper?page=1").then(function (r) {
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }).then(function (d) {
    var items = (d && d.items) || [];
    var more = document.getElementById("epaper-more");
    var sec = document.getElementById("block-epaper");
    if (!more) return;
    if (!items.length) {
      // Khong co so nao -> an toan bo khoi (data-epaper-empty de
      // applyBlocks khong hien lai khi config home-blocks ve sau).
      if (sec) { sec.setAttribute("data-epaper-empty", "1"); sec.style.display = "none"; }
      return;
    }
    if (sec) sec.removeAttribute("data-epaper-empty");
    more.innerHTML = epaperPrepare(items).map(epaperCard).join("");
    syncEpaperArrows();
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
  // E1: anh co srcset (backend sinh 3 co khi anh bia o trong kho) thi
  // trinh duyet tu chon co phu hop theo sizes; khong co srcset thi
  // dung src goc. eager=true: anh hero dau trang tai ngay (khong lazy,
  // fetchpriority high); mac dinh lazy cho anh duoi man hinh dau.
  function imgTag(it, sizes, eager) {
    if (!it.cover) return "";
    var srcset = it.coverSrcset ? " srcset=\"" + esc(it.coverSrcset) + "\" sizes=\"" + sizes + "\"" : "";
    var load = eager ? " fetchpriority=\"high\"" : " loading=\"lazy\"";
    return "<img src=\"" + esc(it.cover) + "\" alt=\"\"" + srcset + load + ">";
  }
  function heroSideRow(it) {
    return "<a class=\"hero-side-row\" href=\"" + esc(it.url) + "\" title=\"" + esc(it.title || "") + "\">" +
      imgTag(it, "200px") +
      "<span>" + esc(it.title) + "</span></a>";
  }
  function heroLeftRow(it, idx, active) {
    return "<button type=\"button\" class=\"hero-left-row" + (active ? " active" : "") + "\" data-idx=\"" + idx + "\" title=\"" + esc(it.title || "") + "\">" +
      imgTag(it, "200px") +
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
      // E3: tieu de khoi "Tin nổi bật" tren khung cuon cot trai (kieu
      // .cat-block-head h2); .hero-left ha 639 -> 592px de tong chieu
      // cao hero khong doi (home.css).
      "<div class=\"hero-left-wrap\"><div class=\"hero-left-title\"><h2>Tin nổi bật</h2></div><div class=\"hero-left\">" + leftHtml + "</div><div class=\"hero-scroll\"><i></i></div></div>" +
      "<div class=\"hero-center\">" +
        "<div class=\"hero-media\">" +
          (hero.cover ? "<a href=\"" + esc(hero.url) + "\">" + imgTag(hero, "(max-width: 900px) 100vw, 640px", true) + "</a>" : "") +
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
      imgTag(feat, "(max-width: 900px) 100vw, 600px") +
      "<h3>" + esc(feat.title || "") + "</h3>" +
      (feat.sapo ? "<p class=\"cat-feat-sapo\">" + esc(feat.sapo) + "</p>" : "") + "</a>";
    var rows = rest.map(function (it) {
      return "<a class=\"cat-row\" href=\"" + esc(it.url || "#") + "\" title=\"" + esc(it.title || "") + "\">" +
        imgTag(it, "300px") +
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
        if (!sec) return;
        // BÁO IN rong (khong co so nao) thi giu an ke ca khi config bat
        // khoi — tranh race: fetch epaper ve truoc, applyBlocks ve sau
        // hien lai khoi rong.
        if (t === "EPAPER" && sec.getAttribute("data-epaper-empty") === "1") { sec.style.display = "none"; return; }
        sec.style.display = activeFull[t] ? "" : "none";
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
