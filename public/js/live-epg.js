// Port VTCANY EPG timeline rendering (web truyen-hinh/index.vue) for TSHT
// TV + Radio, in vanilla JS. Rows keep the existing TSHT schedule column
// shape (HH:MM + title) and add, per program, the status computed from
// Saigon time — the same rule as VTCANY mapEpgSchedule/refreshEpgStatus:
//   start > now -> UPCOMING; end < now -> REPLAY; otherwise LIVE.
// The server already recomputes status; this file recomputes it again on
// the client for items that only carry start/end times, so a stale cached
// row never shows a wrong badge. LIVE rows keep the existing TRUC TIEP
// badge + highlight + auto-scroll. REPLAY rows get a "Xem lai" button
// ONLY when the server supplied a replay_url (VTCANY replay_url, or
// direct-AIO coverage-confirmed); REPLAY rows without one show
// "Khong co ban ghi" ONLY when the schedule response says timeshift is
// definitively unavailable for this channel (timeshift_available=false
// and timeshift_unknown=false) — never a silent failure, never a fake
// play. UPCOMING rows get no badge, as before.
(function (global) {
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function saigonToday() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date()); }
  function saigonNowHHMM() {
    return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
  }
  // Status from ISO bounds when available, else from HH:MM on the selected
  // date (internal CMS rows). nowMs is injectable for tests.
  function computeStatus(p, date, nowMs) {
    var now = nowMs || Date.now();
    if (p.startTime || p.endTime) {
      var s = p.startTime ? new Date(p.startTime).getTime() : NaN;
      var e = p.endTime ? new Date(p.endTime).getTime() : NaN;
      if (Number.isFinite(s) && s > now) return "UPCOMING";
      if (Number.isFinite(e) && e < now) return "REPLAY";
      return "LIVE";
    }
    if (date === saigonToday() && p.start_time && p.end_time) {
      var nowHHMM = saigonNowHHMM();
      if (p.start_time > nowHHMM) return "UPCOMING";
      if (p.end_time < nowHHMM) return "REPLAY";
      if (p.start_time <= nowHHMM && nowHHMM < p.end_time) return "LIVE";
    }
    return p.status || "LIVE";
  }
  function replayKey(p) { return (p.startTime || p.start_time || "") + "|" + (p.title || ""); }
  // Cong/tru ngay tren lich YYYY-MM-DD (toan UTC, khong phu thuoc mui gio).
  function addDays(dateStr, n) {
    var parts = String(dateStr || "").split("-");
    var d = new Date(Date.UTC(+parts[0], +parts[1] - 1, +parts[2] + n));
    return d.toISOString().slice(0, 10);
  }
  // Cuon khung lich (box) sao cho dong live nam gan dau khung, con 2 dong
  // phia tren de nguoi xem thay ngu canh. Dung delta bounding-rect do
  // theo chinh box (xem ghi chu trong renderSchedule): khong dung
  // offsetTop vi .sched-list la position:static nen offsetTop do tu mot
  // to tien xa, gay lech ~6 dong.
  function scrollBoxToRow(box, row, rows) {
    rows = rows || box.querySelectorAll(".sched-row");
    var idx = -1, i;
    for (i = 0; i < rows.length; i++) { if (rows[i] === row) { idx = i; break; } }
    var maxScroll = box.scrollHeight - box.clientHeight;
    if (maxScroll <= 0) return;
    if (idx <= 1) { box.scrollTop = 0; return; }
    var delta = rows[idx - 2].getBoundingClientRect().top - box.getBoundingClientRect().top;
    box.scrollTop = Math.max(0, Math.min(box.scrollTop + delta, maxScroll));
  }
  // Gan hang nut chon ngay "Hom qua / Hom nay / Ngay mai" + nut lich
  // (mo date picker goc) cho mot input date co san. Nut bam thi doi
  // gia tri input roi phat su kien change de handler san co (loadSchedule)
  // chay; trang thai active duoc dong bo moi khi input doi (ke ca khi
  // chon ngay khac bang lich: khi do khong nut nao active).
  // dateInput: <input type=date>; navEl: <div class="sched-daynav">.
  function bindDayNav(dateInput, navEl) {
    if (!dateInput || !navEl) return null;
    var btns = navEl.querySelectorAll("[data-day]");
    function sync() {
      var today = saigonToday();
      for (var i = 0; i < btns.length; i++) {
        var off = parseInt(btns[i].getAttribute("data-day"), 10) || 0;
        var on = dateInput.value === addDays(today, off);
        btns[i].classList.toggle("is-active", on);
        btns[i].setAttribute("aria-pressed", on ? "true" : "false");
      }
    }
    for (var i = 0; i < btns.length; i++) {
      (function (btn) {
        btn.addEventListener("click", function () {
          var off = parseInt(btn.getAttribute("data-day"), 10) || 0;
          var v = addDays(saigonToday(), off);
          if (dateInput.value !== v) {
            dateInput.value = v;
            dateInput.dispatchEvent(new Event("change"));
          }
          sync();
        });
      })(btns[i]);
    }
    var calBtn = navEl.querySelector(".sched-cal-btn");
    if (calBtn) calBtn.addEventListener("click", function () {
      try {
        if (typeof dateInput.showPicker === "function") dateInput.showPicker();
        else dateInput.focus();
      } catch (e) { try { dateInput.focus(); } catch (e2) {} }
    });
    dateInput.addEventListener("change", sync);
    sync();
    return { sync: sync };
  }

  // opts: { box, items, date, nowEl, onReplay(item), replayingKey,
  //         timeshift_available, timeshift_unknown, emptyText,
  //         pageScroll }
  // pageScroll (TV page only): khi danh sach vua het trong khung (ngay
  // it chuong trinh, khung khong cuon duoc) thi desktop cuon ca trang toi
  // dong dang phat; mobile bo qua de trang mo len dung o khoi phat truc
  // tuyen truoc. Khi khung co cuon noi bo (desktop, va mobile tu khi
  // khung lich cao 55-60vh) thi luon cuon RIENG khung, khong cuon trang.
  // Callers that do not pass it (radio) keep the same container-scroll
  // behaviour. Ngay khac hom nay: khung ve dau (scrollTop = 0).
  // Returns the LIVE item (for now-playing) or null.
  function renderSchedule(opts) {
    var box = opts.box, items = opts.items || [], date = opts.date || saigonToday();
    if (!box) return null;
    if (!items.length) {
      box.innerHTML = "<p class='sched-empty'>" + esc(opts.emptyText || "Chưa có lịch phát sóng cho ngày đã chọn.") + "</p>";
      return null;
    }
    var today = saigonToday(), liveItem = null;
    var rows = items.map(function (p) {
      var status = computeStatus(p, date);
      // Server status is already recomputed; client recomputation above
      // only corrects rows whose bounds moved across now since fetch.
      if (status === "LIVE" && date === today && !liveItem) liveItem = p;
      var isNow = status === "LIVE" && date === today;
      var isReplaying = opts.replayingKey && replayKey(p) === opts.replayingKey;
      var action = "";
      if (isReplaying) {
        action = "<span class='sched-replaying'>Đang xem</span>";
      } else if (status === "REPLAY" && p.replay_url) {
        // opts.replayLabel lets the TV page read "PHÁT LẠI" while radio
        // (no replayLabel passed) keeps the previous "Xem lại" label.
        action = "<button type='button' class='sched-replay-btn' data-replay='" + esc(replayKey(p)) + "'>" + esc(opts.replayLabel || "Xem lại") + "</button>";
      } else if (status === "REPLAY" && opts.timeshift_available === false && opts.timeshift_unknown === false) {
        action = "<span class='sched-norecord'>Không có bản ghi</span>";
      }
      return "<div class='sched-row" + (isNow ? " is-now" : "") + (isReplaying ? " is-replaying" : "") + "'><span class='sched-time'>" + esc(p.start_time) + "</span><span class='sched-title'><span class='sched-title-text' title=\"" + esc(p.title) + "\">" + esc(p.title) + "</span>" + (isNow ? "<span class='sched-badge'>TRỰC TIẾP</span>" : "") + "</span>" + (action ? "<span class='sched-action'>" + action + "</span>" : "") + "</div>";
    }).join("");
    box.innerHTML = rows;
    var btns = box.querySelectorAll("[data-replay]");
    for (var i = 0; i < btns.length; i++) {
      (function (btn) {
        btn.addEventListener("click", function () {
          var key = btn.getAttribute("data-replay");
          var hit = items.filter(function (p) { return replayKey(p) === key; })[0];
          if (hit && opts.onReplay) opts.onReplay(hit);
        });
      })(btns[i]);
    }
    // Mobile: ten chuong trinh bi cat "…" o 2 dong (CSS) — bam vao dong
    // de mo rong xem du ten, bam lai de thu gon. Bam nut "Xem lai" thi
    // van phat (khong mo rong), nen bo qua click xuat phat tu nut.
    var rowEls = box.querySelectorAll(".sched-row");
    for (var ri = 0; ri < rowEls.length; ri++) {
      (function (row) {
        row.addEventListener("click", function (e) {
          if (e.target && e.target.closest && e.target.closest("[data-replay]")) return;
          row.classList.toggle("is-expanded");
        });
      })(rowEls[ri]);
    }
    if (date === today) {
      var currentRow = box.querySelector(".sched-row.is-now");
      if (currentRow && !opts.replayingKey) {
        if (box.scrollHeight > box.clientHeight + 10) {
          // Khung lich co cuon noi bo (desktop, va mobile tu khi khung
          // 55-60vh): cuon RIENG khung toi dong dang phat, khong cuon
          // ca trang, khong cham player. Khi dang xem lai thi khong
          // giat khung ve dong live (nguoi dung vua chon dong xem lai).
          scrollBoxToRow(box, currentRow);
        } else if (opts.pageScroll && typeof currentRow.scrollIntoView === "function") {
          // Danh sach vua het trong khung (ngay it chuong trinh): chi
          // desktop moi cuon trang toi dong dang phat; mobile bo qua
          // de trang mo len dung o khoi phat truc tuyen truoc.
          if (!(typeof global.matchMedia === "function" && global.matchMedia("(max-width: 800px)").matches)) {
            currentRow.scrollIntoView({ block: "center" });
          }
        }
      }
    } else {
      // Ngay khac hom nay: ve dau khung (khong giu vi tri cuon cua ngay cu).
      box.scrollTop = 0;
    }
    return liveItem;
  }

  // Mobile: mo trang truyen-hinh/phat-thanh thi nhay thang toi khoi
  // phat truc tuyen (player) truoc, thay vi dung o dau trang (header/
  // nav). Chi khi khong co hash (link #... giu hanh vi mac dinh) va
  // trang chua duoc cuon (mo moi, khong phai khoi phuc vi tri cu).
  // Chay o DOMContentLoaded de header.js (nap sau file nay) kip ap
  // logo tu cache truoc khi tinh vi tri khoi phat.
  document.addEventListener("DOMContentLoaded", function () {
    try {
      if (global.location && global.location.hash) return;
      if (global.scrollY) return;
      if (typeof global.matchMedia === "function" && !global.matchMedia("(max-width: 800px)").matches) return;
      var sec = document.querySelector(".live-section");
      if (!sec) return;
      if (typeof sec.scrollIntoView === "function") sec.scrollIntoView({ block: "start" });
      else if (global.scrollTo) global.scrollTo(0, sec.offsetTop);
    } catch (e) { /* khong chan trang neu co loi */ }
  });

  global.LiveEpg = { esc: esc, saigonToday: saigonToday, saigonNowHHMM: saigonNowHHMM, computeStatus: computeStatus, replayKey: replayKey, renderSchedule: renderSchedule, addDays: addDays, scrollBoxToRow: scrollBoxToRow, bindDayNav: bindDayNav };
})(window);
