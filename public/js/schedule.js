// Phase 2: Lich phat song (EPG) tu vtcaio qua server.
// - Nguon chinh: GET /api/v1/schedule?channel=<NAME>&date=YYYY-MM-DD (ten kenh
//   viet hoa khong dau, gio Asia/Ho_Chi_Minh). Trang nay chon kenh tu danh muc
//   /api/v1/channels (chi kenh RUNNING), mac dinh kenh TV dau tien.
// - Cua so EPG: hom nay + 2 ngay truoc + 7 ngay toi. Ngoai cua so, API tra
//   items:[] kem epg_note (khong phai loi 500) — hien nguyen note do.
// - programs:[] cung co the chi la "ngay do chua co du lieu" (dong bo theo
//   ngay), khong phai loi — hien epg_note tuong ung, khong bao "loi".
// - Chuong trinh dang phat: start <= gio hien tai (Saigon) < end, chi khi xem
//   ngay hom nay. Neu khong can goi EPG, co the dung epgNow trong danh muc.
(function () {
  var dateInput = document.getElementById("sched-date");
  var chanSel = document.getElementById("sched-channel");
  var box = document.getElementById("schedule");
  // Che do thu gon (mobile): mac dinh chi hien dang phat + 4 ke tiep
  // (COMPACT_ROWS, chung voi LiveEpg.COMPACT_ROWS de khoi lech so
  // dong), kem nut "Xem ca ngay" mo rong ra ca ngay ("Thu gon" de thu
  // lai). Nut nam NGOAI khung cuon (#schedule) de luon thay duoc; moi
  // lan load() chay lai (doi ngay/kenh) thi ve lai dang thu gon.
  var COMPACT_ROWS = (window.LiveEpg && window.LiveEpg.COMPACT_ROWS) || 5;
  var lastItems = null, lastDate = null, lastWarn = "", lastNote = "";
  var compactExpanded = false;
  function removeCompactToggle() {
    var t = box._schedCompactToggle;
    if (t && t.parentNode && t.parentNode.removeChild) t.parentNode.removeChild(t);
    else if (t && t.remove) t.remove();
    box._schedCompactToggle = null;
  }
  function clearCompact() {
    compactExpanded = false;
    if (box.classList) { box.classList.remove("is-compact"); box.classList.remove("is-collapsed"); }
    removeCompactToggle();
  }
  function saigonToday() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date()); }
  function saigonNowHHMM() {
    return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
  }
  function esc(s) { return String(s || "").replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function renderTable() {
    var items = lastItems || [], date = lastDate || saigonToday();
    var today = saigonToday(), now = saigonNowHHMM();
    var isMobile = typeof window.matchMedia === "function" && window.matchMedia("(max-width: 800px)").matches;
    var compact = isMobile;
    var liveIdx = -1;
    for (var i = 0; i < items.length; i++) {
      var p = items[i];
      if (date === today && p.start_time <= now && now < p.end_time) { liveIdx = i; break; }
    }
    var startIdx = liveIdx >= 0 ? liveIdx : 0;
    var expanded = compactExpanded;
    var visible = (compact && !expanded) ? items.slice(startIdx, startIdx + COMPACT_ROWS) : items;
    var collapsedCount = Math.min(items.length - startIdx, COMPACT_ROWS);
    var needsToggle = compact && collapsedCount < items.length;
    if (box.classList) {
      if (compact) box.classList.add("is-compact"); else box.classList.remove("is-compact");
      if (compact && !expanded) box.classList.add("is-collapsed"); else box.classList.remove("is-collapsed");
    }
    var rows = visible.map(function (p) {
      var isNow = (date === today && p.start_time <= now && now < p.end_time);
      return "<tr" + (isNow ? ' class="sched-now" style="background:#fff7cc"' : "") + "><td><span class=\"sched-time-start\">" + esc(p.start_time) + "</span><span class=\"sched-time-sep\">–</span><span class=\"sched-time-end\">" + esc(p.end_time) + "</span></td><td><span class=\"sched-title-text\" title=\"" + esc(p.title) + "\">" + esc(p.title) + "</span>" + (isNow ? " <span class=\"sched-now-badge\">• Đang phát</span>" : "") + "</td><td>" + esc(p.description) + "</td></tr>";
    }).join("");
    box.innerHTML = lastWarn + lastNote + "<table style='width:100%;border-collapse:collapse;background:#fff'><thead><tr><th style='text-align:left'>Giờ</th><th style='text-align:left'>Chương trình</th><th style='text-align:left'>Mô tả</th></tr></thead><tbody>" + rows + "</tbody></table>";
    // Mobile: ten chuong trinh bi cat "…" o 1 dong (CSS) — bam vao
    // dong de mo rong xem du ten, bam lai de thu gon.
    var trs = box.querySelectorAll("tbody tr");
    for (var ti = 0; ti < trs.length; ti++) {
      (function (tr) {
        tr.addEventListener("click", function () { tr.classList.toggle("is-expanded"); });
      })(trs[ti]);
    }
    removeCompactToggle();
    if (needsToggle) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "sched-compact-toggle";
      btn.textContent = expanded ? "Thu gọn" : "Xem cả ngày";
      btn.addEventListener("click", function () { compactExpanded = !compactExpanded; renderTable(); });
      if (box.parentNode && box.parentNode.insertBefore) box.parentNode.insertBefore(btn, box.nextSibling || null);
      else if (box.appendChild) box.appendChild(btn);
      box._schedCompactToggle = btn;
    }
    // Ngay hom nay: dang thu gon thi chuong trinh dang phat la dong dau
    // (scrollTop = 0); mo rong thi tu cuon toi dong dang phat nhu cu.
    // Ngay khac thi ve dau khung.
    if (date === today) {
      var nowRow = box.querySelector("tr.sched-now");
      if (compact && !expanded) { box.scrollTop = 0; }
      else if (nowRow && window.LiveEpg && window.LiveEpg.scrollBoxToRow) window.LiveEpg.scrollBoxToRow(box, nowRow, trs);
    } else {
      box.scrollTop = 0;
    }
  }
  function load() {
    clearCompact();
    var date = dateInput.value || saigonToday();
    var channel = chanSel.value || "";
    if (!channel) { box.innerHTML = "<p>Chưa có kênh đang phát để xem lịch.</p>"; return; }
    fetch("/api/v1/schedule?date=" + encodeURIComponent(date) + "&channel=" + encodeURIComponent(channel))
      .then(function (r) { return r.json().then(function (d) { return { status: r.status, data: d }; }); })
      .then(function (res) {
        var d = res.data;
        if (res.status !== 200) { box.innerHTML = "<p>Không tải được lịch phát sóng (" + esc(d.error || res.status) + ").</p>"; return; }
        var warn = d.vtcaio_error ? "<p class='note'>" + esc(d.vtcaio_error) + "</p>" : "";
        var note = d.epg_note ? "<p class='note'>" + esc(d.epg_note) + "</p>" : "";
        if (!d.items || !d.items.length) { box.innerHTML = warn + note + "<p>Chưa có lịch phát sóng cho kênh này trong ngày đã chọn.</p>"; return; }
        lastItems = d.items; lastDate = date; lastWarn = warn; lastNote = note;
        renderTable();
      })
      .catch(function () { box.innerHTML = "<p>Không tải được lịch phát sóng. Vui lòng tải lại trang.</p>"; });
  }
  dateInput.value = saigonToday();
  // Mobile: hang nut Hom qua / Hom nay / Ngay mai + nut lich thay cho
  // o chon ngay lon (an tren mobile qua CSS, input van o trong DOM de
  // nut lich mo duoc date picker goc).
  if (window.LiveEpg && window.LiveEpg.bindDayNav) window.LiveEpg.bindDayNav(dateInput, document.querySelector(".sched-daynav"));
  fetch("/api/v1/channels").then(function (r) { return r.json(); }).then(function (d) {
    var running = (d.items || []).filter(function (c) { return !c.status || c.status === "RUNNING"; });
    if (d.vtcaio_error) box.innerHTML = "<p class='note'>" + esc(d.vtcaio_error) + "</p>";
    if (!running.length) { chanSel.innerHTML = "<option value=''>— Chưa có kênh —</option>"; load(); return; }
    chanSel.innerHTML = running.map(function (c) { return "<option value='" + esc(c.name) + "'>" + esc(c.name) + " (" + (c.kind === "radio" ? "Phát thanh" : "Truyền hình") + ")" + (c.epgNow && c.epgNow.title ? " — đang phát: " + esc(c.epgNow.title) : "") + "</option>"; }).join("");
    var firstTv = running.filter(function (c) { return c.kind === "tv"; })[0];
    chanSel.value = firstTv ? firstTv.name : running[0].name;
    load();
  }).catch(function () { box.innerHTML = "<p>Không tải được danh sách kênh. Vui lòng tải lại trang.</p>"; });
  chanSel.onchange = load;
  dateInput.onchange = load;
})();
