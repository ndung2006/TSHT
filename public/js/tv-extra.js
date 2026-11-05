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
// Thumbnails (AIO, 2026-11-05 — KHONG con tu cat bang ffmpeg): a played
// program shows its AIO thumbnailSmall (640x360) in the card; clicking
// PHÁT LẠI plays the replay with the 1280x720 thumbnail as the player
// poster (set by tv.js onReplay). No thumbnail yet (empty string) ->
// branded client-side placeholder: channel logo + title + time on the
// existing blue gradient. A LIVE card reads "ĐANG PHÁT" and clicking it
// goes back to live (window.backToLive). A REPLAY card with no replay_url
// yet reads "Đang chuẩn bị" and has NO play button (the old "Chưa có
// bản ghi" label is gone here; the schedule column keeps its own label).
// Mobile (<=800px): compact horizontal cards (image left ~120x68,
// right = time + title max 2 lines + small "Xem lại" button).
(function () {
  var box = document.getElementById("latest-programs");
  var toTop = document.getElementById("to-top");
  if (toTop) toTop.addEventListener("click", function () { window.scrollTo({ top: 0, behavior: "smooth" }); });
  if (!box) return;
  var rendered = false;
  function esc(s) { return window.LiveEpg ? window.LiveEpg.esc(s) : String(s || ""); }
  function render(items, meta, replayingKey, channel) {
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
    // Same mobile rule as the schedule column (tv.js renderLastSchedule):
    // small "Xem lại" label on phones, "PHÁT LẠI" on desktop.
    var isMobile = window.innerWidth <= 800;
    box.innerHTML = list.map(function (p) {
      var st = window.LiveEpg ? window.LiveEpg.computeStatus(p, meta && meta.date) : (p.status || "");
      var key = window.LiveEpg ? window.LiveEpg.replayKey(p) : ((p.start_time || "") + "|" + (p.title || ""));
      var isReplaying = replayingKey && key === replayingKey;
      var time = esc(p.start_time || (p.startTime ? p.startTime.slice(11, 16) : ""));
      var title = esc(p.title);
      // Card image: AIO thumbnailSmall (640x360). Empty -> branded
      // placeholder (channel logo + title + time on the blue gradient);
      // NEVER a bare frame with only a play mark.
      var small = (typeof p.thumbnailSmall === "string" && p.thumbnailSmall) ? p.thumbnailSmall : "";
      var poster = "";
      if (small) {
        poster = "<img class='latest-poster-img' src='" + esc(small) + "' alt='' loading='lazy'>";
      } else {
        var logo = (channel && channel.logo)
          ? "<img class='latest-fallback-logo' src='" + esc(channel.logo) + "' alt=''>"
          : "";
        poster = "<span class='latest-poster-fallback'>" + logo
          + "<span class='latest-fallback-title'>" + title + "</span>"
          + "<span class='latest-fallback-time'>" + time + "</span></span>";
      }
      var action = "";
      var cardCls = "latest-card";
      var cardAttrs = "";
      if (isReplaying) {
        action = "<span class='latest-replaying'>Đang xem</span>";
      } else if (st === "LIVE") {
        // Live card: label "ĐANG PHÁT"; the whole card goes back to live.
        action = "<span class='latest-live-badge'>● ĐANG PHÁT</span>";
        cardCls += " is-live";
        cardAttrs = " data-live='1' role='button' tabindex='0' aria-label='Đang phát: " + title + " — bấm để xem trực tiếp'";
      } else if (p.replay_url) {
        action = "<button type='button' class='latest-replay-btn' data-replay='" + esc(key) + "'>" + (isMobile ? "Xem lại" : "PHÁT LẠI") + "</button>";
      } else {
        // Played but no recording yet (AIO attaches the replay ~1-2 min
        // after the program ends): no play button, no "Chưa có bản ghi".
        action = "<span class='latest-preparing'>Đang chuẩn bị</span>";
      }
      return "<article class='" + cardCls + "'" + cardAttrs + "><div class='latest-poster' aria-hidden='true'>" + poster + "</div>"
        + "<p class='latest-time'>" + time + "</p>"
        + "<p class='latest-title'>" + title + "</p>"
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
    var liveCards = box.querySelectorAll("[data-live]");
    for (var j = 0; j < liveCards.length; j++) {
      (function (card) {
        var goLive = function () { if (window.backToLive) window.backToLive(); };
        card.addEventListener("click", goLive);
        card.addEventListener("keydown", function (e) {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); goLive(); }
        });
      })(liveCards[j]);
    }
  }
  window.addEventListener("tv-schedule", function (e) {
    var d = e.detail || {};
    render(d.items, d.meta, d.replayingKey, d.channel || null);
  });
  // Graceful degradation if tv.js never dispatches (e.g. schedule fetch
  // failed): do not leave "Đang tải…" forever.
  setTimeout(function () {
    if (!rendered) box.innerHTML = "<p class='tv-note'>Chưa tải được chương trình mới nhất (không tải được lịch phát sóng).</p>";
  }, 20000);
})();
