// Trang tim kiem (/tim-kiem, 2026-11-05) — chi tim tin bai.
// Doc URL -> dien loc -> goi GET /api/v2/news/search -> render + to dam
// tu khoa (<mark>) + phan trang 20/trang. Khong goi API khi khong co tu
// khoa lan bo loc (hien goi y). Tham so URL theo buoc0 §4.4:
// q, q2, cat, scope, type, from, to, exact, sort, page.
// To dam khong chinh xac theo dung quy tac backend (2026-11-06): tu
// thuong chi to dam khi dung mot minh, tu cuoi to dam ca tu no mo dau.
(function () {
  "use strict";
  var MAX_Q = 200;
  var LIMIT = 20;
  var CONTENT_TYPES = ["text", "video", "audio", "gallery", "infographic", "emagazine"];
  var SCOPES = ["title", "title-sapo", "all"];

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function $(id) { return document.getElementById(id); }
  function fmtDate(iso) {
    if (!iso) return "";
    try {
      return new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));
    } catch (e) { return String(iso).slice(0, 10); }
  }
  function isDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s || ""); }

  // ---- Trang thai tu URL ----
  function readState() {
    var p = new URLSearchParams(location.search);
    var q = (p.get("q") || "").slice(0, MAX_Q);
    var q2 = (p.get("q2") || "").slice(0, MAX_Q);
    var cat = p.get("cat") || "all";
    var scope = p.get("scope") || "title-sapo";
    if (SCOPES.indexOf(scope) < 0) scope = "title-sapo";
    var type = p.get("type") || "all";
    if (type !== "all" && CONTENT_TYPES.indexOf(type) < 0) type = "all";
    var from = isDate(p.get("from")) ? p.get("from") : "";
    var to = isDate(p.get("to")) ? p.get("to") : "";
    var exact = p.get("exact") === "1";
    var sort = p.get("sort") || "";
    if (sort !== "relevance" && sort !== "newest") sort = (q || q2) ? "relevance" : "newest";
    var page = Math.max(1, Number(p.get("page")) || 1);
    return { q: q, q2: q2, cat: cat, scope: scope, type: type, from: from, to: to, exact: exact, sort: sort, page: page };
  }
  function hasSearch(st) {
    return !!(st.q || st.q2 || (st.cat && st.cat !== "all") || (st.type && st.type !== "all") || st.from || st.to);
  }
  // Chi dua len URL cac tham so khac mac dinh (URL ngan, chia se sach).
  function buildUrl(st) {
    var p = new URLSearchParams();
    if (st.q) p.set("q", st.q);
    if (st.q2) p.set("q2", st.q2);
    if (st.cat && st.cat !== "all") p.set("cat", st.cat);
    if (st.scope !== "title-sapo") p.set("scope", st.scope);
    if (st.type && st.type !== "all") p.set("type", st.type);
    if (st.from) p.set("from", st.from);
    if (st.to) p.set("to", st.to);
    if (st.exact) p.set("exact", "1");
    var defaultSort = (st.q || st.q2) ? "relevance" : "newest";
    if (st.sort !== defaultSort) p.set("sort", st.sort);
    if (st.page > 1) p.set("page", String(st.page));
    var qs = p.toString();
    return "/tim-kiem" + (qs ? "?" + qs : "");
  }

  // ---- Sap xep chuyen muc: port tu vtcany/apps/cms/utils/category-sort.ts
  // (portal JS thuan khong import duoc util TS cua CMS). Cha truoc thanh
  // mot khoi, sau do con dang "Cha / Con" gom theo cha theo dung thu tu
  // khoi cha; trong khoi theo sortOrder roi bang chu cai tieng Viet.
  // Nguon: GET /api/v2/news-categories tra cay (muc hien) — lam phang
  // cay thanh danh sach co parentId roi sap theo quy tac tren.
  var viCollator = null;
  try { viCollator = new Intl.Collator("vi"); } catch (e) { viCollator = null; }
  function compareCategories(a, b) {
    var d = (a.sortOrder || 0) - (b.sortOrder || 0);
    if (d !== 0) return d;
    var an = a.name || "", bn = b.name || "";
    return viCollator ? viCollator.compare(an, bn) : (an < bn ? -1 : an > bn ? 1 : 0);
  }
  function flattenCategories(tree) {
    var out = [];
    (function walk(nodes, parentId) {
      (nodes || []).forEach(function (n) {
        if (!n) return;
        var pid = n.parentId != null ? n.parentId : (parentId || null);
        out.push({ id: n.publicId || n.id || null, publicId: n.publicId || null, name: n.name || "", slug: n.slug || "", parentId: pid, sortOrder: n.sortOrder || 0, isVisible: n.isVisible });
        if (n.children && n.children.length) walk(n.children, n.id || n.publicId || null);
      });
    })(tree, null);
    return out;
  }
  function sortCategories(cats) {
    // Khoa nhom ON DINH: API cong chi tra publicId (khong co id/parentId),
    // nen gom theo publicId (fallback id) — gom theo id se undefined cho
    // moi nut, tat ca con roi vao 1 nhom va bi chen lai o moi cha (loi
    // dropdown lap con ~20 lan, 2026-11-05).
    function catKey(c) { return (c && (c.publicId || c.id)) || null; }
    var byKey = {};
    cats.forEach(function (c) { var k = catKey(c); if (k) byKey[k] = c; if (c.id) byKey[c.id] = c; });
    function rootOf(c) {
      var cur = c, seen = {};
      while (cur && cur.parentId) {
        var ck = catKey(cur);
        if (ck && seen[ck]) return null;
        if (ck) seen[ck] = true;
        var p = byKey[cur.parentId];
        if (!p) return null;
        cur = p;
      }
      return cur;
    }
    var parents = cats.filter(function (c) { return !c.parentId; }).sort(compareCategories);
    var kids = {}, orphans = [];
    cats.forEach(function (c) {
      if (!c.parentId) return;
      var root = rootOf(c);
      if (root && root !== c) {
        var k = catKey(root);
        (kids[k] = kids[k] || []).push(c);
      } else orphans.push(c);
    });
    var out = parents.slice();
    parents.forEach(function (p) { out.push.apply(out, (kids[catKey(p)] || []).sort(compareCategories)); });
    out.push.apply(out, orphans.sort(compareCategories));
    return out;
  }
  function categoryLabel(cats, c) {
    var parent = null;
    if (c.parentId) {
      for (var i = 0; i < cats.length; i++) {
        if (cats[i].id === c.parentId || cats[i].publicId === c.parentId) { parent = cats[i]; break; }
      }
    }
    return parent ? parent.name + " / " + c.name : c.name;
  }
  function loadCategories(selectedSlug) {
    var sel = $("f-cat");
    if (!sel) return;
    fetch("/api/v2/news-categories")
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (d) {
        var flat = flattenCategories(d.data || []);
        var sorted = sortCategories(flat).filter(function (c) { return c.slug; });
        sel.innerHTML = "<option value=\"all\">Tất cả chuyên mục</option>" + sorted.map(function (c) {
          return "<option value=\"" + esc(c.slug) + "\">" + esc(categoryLabel(flat, c)) + "</option>";
        }).join("");
        if (selectedSlug) sel.value = selectedSlug;
      })
      .catch(function () { /* giu lai "Tat ca chuyen muc" khi tai cay loi */ });
  }

  // ---- To dam tu khoa: map vi tri khop khong dau ve chuoi goc ----
  // Bo dau tung ky tu: NFD + bo dau ket hop, rieng đ/Đ -> d/D (NFD khong
  // tach đ). Che do chinh xac: khop truc tiep chuoi goc (chi bo hoa/thuong).
  function stripChar(ch) {
    var s = ch.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (s === "đ") return "d";
    if (s === "Đ") return "D";
    return s;
  }
  // Ky tu thuoc ve mot tu sau khi chuan hoa (chu cai a-z khong dau, so, _).
  // Dung de kiem tra ranh gioi tu khi to dam: tu thuong chi to dam khi
  // dung mot minh, tu cuoi chi can bat dau mot tu (khop tien to).
  function isWordCh(ch) {
    return !!ch && /[a-z0-9_]/i.test(ch);
  }
  function normMap(text) {
    var norm = "", map = [];
    for (var i = 0; i < text.length; i++) {
      var s = stripChar(text[i]).toLowerCase();
      for (var j = 0; j < s.length; j++) { norm += s[j]; map.push(i); }
    }
    return { norm: norm, map: map };
  }
  function findRanges(text, terms, exact) {
    var ranges = [];
    if (!text) return ranges;
    if (exact) {
      var low = text.toLowerCase();
      terms.forEach(function (t) {
        if (!t) return;
        var needle = t.toLowerCase(), at = 0, idx;
        while ((idx = low.indexOf(needle, at)) >= 0) {
          ranges.push([idx, idx + needle.length]);
          at = idx + Math.max(1, needle.length);
        }
      });
    } else {
      var nm = normMap(text);
      terms.forEach(function (t) {
        var words = (t || "").split(/\s+/).filter(Boolean);
        words.forEach(function (w, wi) {
          if (!w) return;
          var nw = "";
          for (var i = 0; i < w.length; i++) nw += stripChar(w[i]).toLowerCase();
          if (!nw) return;
          // Cung quy tac nhu backend: tu thuong khop nguyen tu, tu cuoi
          // khop tien to (goi y khi dang go do).
          var isLast = wi === words.length - 1;
          var at = 0, idx;
          while ((idx = nm.norm.indexOf(nw, at)) >= 0) {
            var before = idx === 0 ? "" : nm.norm[idx - 1];
            if (isWordCh(before)) { at = idx + 1; continue; }
            var wordEnd = idx + nw.length;
            if (isLast) {
              // Tien to: to den het tu (vi du "t" -> to ca "tế").
              while (wordEnd < nm.norm.length && isWordCh(nm.norm[wordEnd])) wordEnd++;
            } else {
              // Nguyen tu: ky tu sau tu phai la bien (khong phai ky tu tu).
              var after = wordEnd >= nm.norm.length ? "" : nm.norm[wordEnd];
              if (isWordCh(after)) { at = idx + 1; continue; }
            }
            var start = nm.map[idx], end = nm.map[wordEnd - 1] + 1;
            ranges.push([start, end]);
            at = wordEnd;
          }
        });
      });
    }
    ranges.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    var merged = [];
    ranges.forEach(function (r) {
      var last = merged[merged.length - 1];
      if (last && r[0] <= last[1]) { if (r[1] > last[1]) last[1] = r[1]; }
      else merged.push([r[0], r[1]]);
    });
    return merged;
  }
  function highlight(text, terms, exact) {
    if (!text) return "";
    var ranges = findRanges(text, terms, exact);
    if (!ranges.length) return esc(text);
    var out = "", pos = 0;
    ranges.forEach(function (r) {
      out += esc(text.slice(pos, r[0])) + "<mark>" + esc(text.slice(r[0], r[1])) + "</mark>";
      pos = r[1];
    });
    return out + esc(text.slice(pos));
  }

  // ---- Render ----
  var form = $("search-form"), statusEl = $("search-status"), hintEl = $("search-hint"),
    resultsEl = $("search-results"), pagerEl = $("search-pager"), noteEl = $("search-note");
  var currentTerms = [];

  function showHint() {
    statusEl.textContent = "";
    resultsEl.innerHTML = "";
    pagerEl.innerHTML = "";
    if (hintEl) hintEl.hidden = false;
  }
  function cardHtml(it, terms, exact) {
    var cat = it.category || null;
    var meta = [];
    if (cat && cat.name) meta.push(cat.slug ? "<a href=\"/chuyen-muc/" + esc(cat.slug) + "\">" + esc(cat.name) + "</a>" : esc(cat.name));
    if (it.publishAt) meta.push(esc(fmtDate(it.publishAt)));
    return "<article class=\"search-item\">" +
      (it.cover ? "<a class=\"search-item-thumb\" href=\"" + esc(it.url || ("/tin/" + it.slug)) + "\"><img src=\"" + esc(it.cover) + "\" alt=\"\" loading=\"lazy\"></a>" : "") +
      "<div class=\"search-item-body\"><h3><a href=\"" + esc(it.url || ("/tin/" + it.slug)) + "\" title=\"" + esc(it.title || "") + "\">" + highlight(it.title || "", terms, exact) + "</a></h3>" +
      (it.sapo ? "<p class=\"search-sapo\">" + highlight(it.sapo, terms, exact) + "</p>" : "") +
      (meta.length ? "<p class=\"search-meta\">" + meta.join(" · ") + "</p>" : "") +
      "</div></article>";
  }
  function renderPager(st, total) {
    var totalPages = Math.max(1, Math.ceil(total / LIMIT));
    var links = [];
    if (st.page > 1) links.push("<a href=\"#\" data-page=\"" + (st.page - 1) + "\">← Trang trước</a>");
    links.push("Trang " + st.page + "/" + totalPages + " — " + total + " kết quả");
    if (st.page < totalPages) links.push("<a href=\"#\" data-page=\"" + (st.page + 1) + "\">Trang sau →</a>");
    pagerEl.innerHTML = links.join(" · ");
    pagerEl.querySelectorAll("a[data-page]").forEach(function (a) {
      a.addEventListener("click", function (ev) {
        ev.preventDefault();
        var next = Object.assign({}, st, { page: Number(a.getAttribute("data-page")) || 1 });
        history.pushState(null, "", buildUrl(next));
        runSearch(next);
        window.scrollTo({ top: 0 });
      });
    });
  }
  function runSearch(st) {
    currentTerms = [st.q, st.q2].filter(Boolean);
    if (!hasSearch(st)) { showHint(); return; }
    if (hintEl) hintEl.hidden = true;
    statusEl.textContent = "Đang tìm…";
    resultsEl.innerHTML = "";
    pagerEl.innerHTML = "";
    var q = new URLSearchParams();
    if (st.q) q.set("q", st.q);
    if (st.q2) q.set("q2", st.q2);
    q.set("scope", st.scope);
    if (st.cat && st.cat !== "all") q.set("category", st.cat);
    if (st.type && st.type !== "all") q.set("contentType", st.type);
    if (st.from) q.set("from", st.from);
    if (st.to) q.set("to", st.to);
    q.set("exact", st.exact ? "1" : "0");
    q.set("sort", st.sort);
    q.set("page", String(st.page));
    q.set("limit", String(LIMIT));
    fetch("/api/v2/news/search?" + q.toString())
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (d) {
        var items = d.data || d.items || [];
        var total = typeof d.total === "number" ? d.total : items.length;
        var kw = [st.q, st.q2].filter(Boolean).join(" + ");
        statusEl.textContent = kw
          ? "Tìm thấy " + total + " kết quả với từ khóa \"" + kw + "\""
          : "Tìm thấy " + total + " kết quả";
        if (!items.length) {
          var tip = "Không tìm thấy kết quả nào phù hợp." +
            (st.exact ? " Thử bỏ tick \"Tìm chính xác\"" : "") +
            " hoặc nới bộ lọc (chuyên mục, loại nội dung, khoảng ngày).";
          resultsEl.innerHTML = "<p class=\"search-empty\">" + esc(tip) + "</p>";
          pagerEl.innerHTML = "";
          return;
        }
        resultsEl.innerHTML = items.map(function (it) { return cardHtml(it, currentTerms, st.exact); }).join("");
        renderPager(st, total);
      })
      .catch(function () {
        statusEl.textContent = "";
        resultsEl.innerHTML = "<p class=\"search-empty\">Không tải được kết quả tìm kiếm. Vui lòng thử lại sau.</p>";
      });
  }

  // ---- Dien form tu URL + submit ----
  function fillForm(st) {
    if (!$("f-q")) return;
    $("f-q").value = st.q;
    $("f-q2").value = st.q2;
    $("f-cat").value = st.cat;
    $("f-scope").value = st.scope;
    $("f-type").value = st.type;
    $("f-from").value = st.from;
    $("f-to").value = st.to;
    $("f-exact").checked = st.exact;
    $("f-sort").value = st.sort;
  }
  function readForm() {
    var q = $("f-q").value.trim().slice(0, MAX_Q);
    var q2 = $("f-q2").value.trim().slice(0, MAX_Q);
    var truncated = $("f-q").value.trim().length > MAX_Q || $("f-q2").value.trim().length > MAX_Q;
    if (noteEl) {
      noteEl.hidden = !truncated;
      if (truncated) noteEl.textContent = "Từ khóa dài quá " + MAX_Q + " ký tự nên đã cắt ngắn.";
    }
    return {
      q: q, q2: q2,
      cat: $("f-cat").value || "all",
      scope: $("f-scope").value || "title-sapo",
      type: $("f-type").value || "all",
      from: isDate($("f-from").value) ? $("f-from").value : "",
      to: isDate($("f-to").value) ? $("f-to").value : "",
      exact: $("f-exact").checked,
      sort: $("f-sort").value || ((q || q2) ? "relevance" : "newest"),
      page: 1
    };
  }
  var initial = readState();
  fillForm(initial);
  loadCategories(initial.cat);
  if (form) form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    var st = readForm();
    history.pushState(null, "", buildUrl(st));
    runSearch(st);
  });
  window.addEventListener("popstate", function () {
    var st = readState();
    fillForm(st);
    runSearch(st);
  });
  runSearch(initial);
})();
