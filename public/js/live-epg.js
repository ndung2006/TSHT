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

  // opts: { box, items, date, nowEl, onReplay(item), replayingKey,
  //         timeshift_available, timeshift_unknown, emptyText,
  //         pageScroll }
  // pageScroll (TV page only): on desktop the schedule is a 2-column
  // panel with its own inner scroll, so the current program is
  // brought into view by scrolling the panel only (never the page,
  // never the player). On mobile the panel has no inner scroll, so
  // it falls back to a page scroll. Callers that do not pass it
  // (radio) keep the exact old container-scroll behaviour.
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
      return "<div class='sched-row" + (isNow ? " is-now" : "") + (isReplaying ? " is-replaying" : "") + "'><span class='sched-time'>" + esc(p.start_time) + "</span><span class='sched-title'>" + esc(p.title) + (isNow ? "<span class='sched-badge'>TRỰC TIẾP</span>" : "") + "</span>" + (action ? "<span class='sched-action'>" + action + "</span>" : "") + "</div>";
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
    if (date === today) {
      var currentRow = box.querySelector(".sched-row.is-now");
      if (currentRow) {
        if (opts.pageScroll) {
          // TV 2-column layout: scroll the schedule panel only when
          // it has an inner scroll (desktop); otherwise fall back to
          // a page scroll (mobile). This never touches, resets, or
          // reloads the player. While a replay is playing, do NOT
          // yank the view back to the live row (the user just chose
          // a replay row to watch).
          if (!opts.replayingKey) {
            if (box.scrollHeight > box.clientHeight + 10) {
              box.scrollTop = Math.max(0, currentRow.offsetTop - Math.floor(box.clientHeight / 2) + Math.floor(currentRow.offsetHeight / 2));
            } else if (typeof currentRow.scrollIntoView === "function") {
              currentRow.scrollIntoView({ block: "center" });
            }
          }
        } else {
          // Inner-scroll layout (radio column): old behaviour, scroll
          // the container only, never the page.
          box.scrollTop = Math.max(0, currentRow.offsetTop - 60);
        }
      }
    }
    return liveItem;
  }

  global.LiveEpg = { esc: esc, saigonToday: saigonToday, saigonNowHHMM: saigonNowHHMM, computeStatus: computeStatus, replayKey: replayKey, renderSchedule: renderSchedule };
})(window);
