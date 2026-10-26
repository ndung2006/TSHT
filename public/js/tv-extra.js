// TV-page extras for /truyen-hinh only (tv.html). Does NOT touch the live
// player, schedule column, or replay state in tv.js: it only listens for
// the "tv-schedule" event tv.js dispatches after every schedule render,
// renders "CHƯƠNG TRÌNH MỚI NHẤT" cards from that same schedule data, and
// reuses tv.js's own replay handler (window.playScheduleReplay) behind the
// card PHÁT LẠI buttons — so pre-check, no-record message, Về live and
// live/timeshift behaviour are exactly the tv.js behaviour, never a second
// player or a fake playback.
// Card rule (documented, no guessing): take today's schedule items whose
// status is REPLAY or LIVE (computed by LiveEpg.computeStatus, Saigon
// time), newest start time first, take 4. No category is inferred from
// titles — that is why the category sections below stay honest
// placeholders instead of listing guessed programs.
(function () {
  var box = document.getElementById("latest-programs");
  var toTop = document.getElementById("to-top");
  if (toTop) toTop.addEventListener("click", function () { window.scrollTo({ top: 0, behavior: "smooth" }); });
  if (!box) return;
  var rendered = false;
  function esc(s) { return window.LiveEpg ? window.LiveEpg.esc(s) : String(s || ""); }
  function render(items, meta, replayingKey) {
    rendered = true;
    var list = (items || []).filter(function (p) {
      var st = window.LiveEpg ? window.LiveEpg.computeStatus(p, meta && meta.date) : (p.status || "");
      return st === "REPLAY" || st === "LIVE";
    });
    // Newest start time first. start_time is HH:MM on the schedule date;
    // startTime (ISO) sorts the same way when present.
    list.sort(function (a, b) {
      var ka = a.startTime || a.start_time || "", kb = b.startTime || b.start_time || "";
      return kb < ka ? -1 : (kb > ka ? 1 : 0);
    });
    list = list.slice(0, 4);
    if (!list.length) {
      box.innerHTML = "<p class='tv-note'>Chưa có chương trình đã phát trong ngày để liệt kê.</p>";
      return;
    }
    box.innerHTML = list.map(function (p) {
      var key = window.LiveEpg ? window.LiveEpg.replayKey(p) : ((p.start_time || "") + "|" + (p.title || ""));
      var isReplaying = replayingKey && key === replayingKey;
      var action = "";
      if (isReplaying) {
        action = "<span class='latest-replaying'>Đang xem</span>";
      } else if (p.replay_url) {
        action = "<button type='button' class='latest-replay-btn' data-replay='" + esc(key) + "'>PHÁT LẠI</button>";
      } else {
        action = "<span class='latest-norecord'>Chưa có bản ghi</span>";
      }
      return "<article class='latest-card'><div class='latest-poster' aria-hidden='true'><span class='play-mark'>▶</span><span>TSHTTV</span></div>"
        + "<p class='latest-time'>" + esc(p.start_time || (p.startTime ? p.startTime.slice(11, 16) : "")) + "</p>"
        + "<p class='latest-title'>" + esc(p.title) + "</p>"
        + "<p class='latest-action'>" + action + "</p></article>";
    }).join("");
    var btns = box.querySelectorAll("[data-replay]");
    for (var i = 0; i < btns.length; i++) {
      (function (btn) {
        btn.addEventListener("click", function () {
          var key = btn.getAttribute("data-replay");
          var hit = list.filter(function (p) { return (window.LiveEpg ? window.LiveEpg.replayKey(p) : ((p.start_time || "") + "|" + (p.title || ""))) === key; })[0];
          if (hit && window.playScheduleReplay) window.playScheduleReplay(hit);
        });
      })(btns[i]);
    }
  }
  window.addEventListener("tv-schedule", function (e) {
    var d = e.detail || {};
    render(d.items, d.meta, d.replayingKey);
  });
  // Graceful degradation if tv.js never dispatches (e.g. schedule fetch
  // failed): do not leave "Đang tải…" forever.
  setTimeout(function () {
    if (!rendered) box.innerHTML = "<p class='tv-note'>Chưa tải được chương trình mới nhất (không tải được lịch phát sóng).</p>";
  }, 20000);
})();
