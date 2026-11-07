// TshtTelemetry — bo gui pageview + heartbeat kenh (GĐ3 nen, chi thu thap,
// chua dashboard). Dung chung cho moi trang portal.
// - tsht_sid: chuoi ngau nhien luu localStorage, KHONG gan tai khoan,
//   KHONG dinh danh nguoi dung; chi de dedupe phien + dem so phien rieng.
// - Pageview: gui 1 lan khi mo trang (server dedupe 30 phut/phien/noi dung).
// - Heartbeat: gui ngay khi bam phat, lap moi 60 giay khi dang phat
//   (tam dung thi khong gui), dung khi stop/chuyen kenh/roi trang.
// - Gui that bai thi bo qua im lang (khong bao loi, khong retry vo han);
//   backend tra ok gia cho bot/kenh la/gui lap nen FE khong can xu ly.
(function () {
  "use strict";
  var SID_KEY = "tsht_sid";
  function sid() {
    try {
      var v = localStorage.getItem(SID_KEY);
      if (!v) {
        v = (window.crypto && crypto.randomUUID)
          ? crypto.randomUUID()
          : ("sid-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 14));
        localStorage.setItem(SID_KEY, v);
      }
      return v;
    } catch (e) {
      return "";
    }
  }
  function post(path, body) {
    try {
      fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        keepalive: true,
      }).catch(function () {});
    } catch (e) {}
  }
  function sendPageview(extra) {
    var b = { sessionId: sid(), path: location.pathname };
    if (extra) {
      for (var k in extra) {
        if (extra[k] !== undefined && extra[k] !== null && extra[k] !== "") b[k] = extra[k];
      }
    }
    post("/api/v2/pageviews", b);
  }
  var hbTimer = null, hbCur = null;
  function beat() {
    if (!hbCur) return;
    if (hbCur.media && hbCur.media.paused) return;
    post("/api/v2/channel-telemetry", {
      sessionId: sid(),
      channel: hbCur.channel || "",
      type: hbCur.type,
      contentId: hbCur.contentId || "",
    });
  }
  function startHeartbeat(opts) {
    stopHeartbeat();
    if (!opts || !opts.type) return;
    hbCur = {
      channel: opts.channel || "",
      type: opts.type,
      contentId: opts.contentId || "",
      media: opts.media || null,
    };
    beat();
    hbTimer = setInterval(beat, 60000);
    startFinalTracking(opts);
  }
  function stopHeartbeat() {
    if (hbTimer) {
      clearInterval(hbTimer);
      hbTimer = null;
    }
    hbCur = null;
    // Doi video/kenh hoac roi trang: gui beat cuoi cho phien VOD
    // vua ket thuc (neu co) roi moi go tracker.
    sendFinalBeat();
    finalDetach();
  }
  // Doi loai xem giua chung (live <-> timeshift) ma KHONG reset timer
  // 60s: chi doi hbCur.type, nhip beat ke tiep se gui loai moi. Dung khi
  // nguoi xem roi khoi mep live vao cua so DVR / xem lai, hoac quay ve
  // live; khoi dong phat / doi kenh van dung startHeartbeat nhu cu.
  function setHeartbeatType(type) {
    if (!hbCur || !type) return;
    hbCur.type = type;
  }
  // ---- Beat cuoi VOD (3c-final-beat): ghi so giay THUC SU PHAT ----
  // Beat thuong = 1 phut/nhip, khong biet so giay thuc. Tracker nay
  // cong don thoi gian media o trang thai playing (playing -> pause /
  // ended) cho phien VOD hien tai, roi gui 1 beat cuoi (final:true)
  // kem watchedSeconds + durationSec khi:
  //  - video ket thuc (ended),
  //  - pause lau >= FINAL_PAUSE_MS (30 giay),
  //  - doi video/kenh (stopHeartbeat),
  //  - roi trang (pagehide — qua stopHeartbeat).
  // Beat cuoi gui 1 lan cho moi phien (co finalSent); neu nguoi xem
  // phat lai sau khi beat cuoi da gui (vd het pause lau roi bam phat),
  // finalSent duoc mo lai de lan gui sau mang tong cong don moi —
  // backend dedupe beat cuoi theo MAX nen gia tri lon hon thang.
  // Chi VOD moi co beat cuoi (live/timeshift chi co beat thuong).
  var FINAL_PAUSE_MS = 30 * 1000;
  var finalTrack = null;
  function finalAccumulate(track) {
    if (!track || track.playStartMs == null) return;
    track.watchedMs += Date.now() - track.playStartMs;
    track.playStartMs = null;
  }
  function finalClearPauseTimer(track) {
    if (track && track.pauseTimer != null) {
      clearTimeout(track.pauseTimer);
      track.pauseTimer = null;
    }
  }
  function finalDurationSec(track) {
    if (!track || !track.media) return undefined;
    var d = track.media.duration;
    if (typeof d !== "number" || !isFinite(d) || d <= 0) return undefined;
    return Math.round(d);
  }
  function sendFinalBeat() {
    var track = finalTrack;
    if (!track || track.finalSent) return;
    finalAccumulate(track);
    finalClearPauseTimer(track);
    var watchedSeconds = Math.round(track.watchedMs / 1000);
    if (watchedSeconds < 0) watchedSeconds = 0;
    var body = {
      sessionId: sid(),
      channel: track.channel || "",
      type: "vod",
      contentId: track.contentId || "",
      watchedSeconds: watchedSeconds,
      final: true,
    };
    var dur = finalDurationSec(track);
    if (dur !== undefined) body.durationSec = dur;
    track.finalSent = true;
    post("/api/v2/channel-telemetry", body);
  }
  function finalDetach() {
    if (!finalTrack) return;
    var t = finalTrack;
    finalTrack = null;
    if (t.pauseTimer != null) clearTimeout(t.pauseTimer);
    if (t.media) {
      try { t.media.removeEventListener("playing", t.onPlaying); } catch (e) {}
      try { t.media.removeEventListener("pause", t.onPause); } catch (e) {}
      try { t.media.removeEventListener("ended", t.onEnded); } catch (e) {}
    }
  }
  function startFinalTracking(opts) {
    finalDetach();
    if (!opts || opts.type !== "vod" || !opts.media || !opts.contentId) return;
    var media = opts.media;
    var track = {
      media: media,
      channel: opts.channel || "",
      contentId: opts.contentId,
      watchedMs: 0,
      playStartMs: null,
      finalSent: false,
      pauseTimer: null,
      onPlaying: null,
      onPause: null,
      onEnded: null,
    };
    track.onPlaying = function () {
      // Phat lai sau pause (ke ca sau khi beat cuoi da gui): mo lai
      // co gui de lan gui sau mang tong cong don moi.
      if (track.finalSent) track.finalSent = false;
      finalClearPauseTimer(track);
      if (track.playStartMs == null) track.playStartMs = Date.now();
    };
    track.onPause = function () {
      finalAccumulate(track);
      finalClearPauseTimer(track);
      // Da gui beat cuoi roi thi khong dat hen nua (doi phat lai).
      if (track.finalSent) return;
      track.pauseTimer = setTimeout(function () {
        track.pauseTimer = null;
        sendFinalBeat();
      }, FINAL_PAUSE_MS);
    };
    track.onEnded = function () {
      finalAccumulate(track);
      sendFinalBeat();
    };
    finalTrack = track;
    media.addEventListener("playing", track.onPlaying);
    media.addEventListener("pause", track.onPause);
    media.addEventListener("ended", track.onEnded);
    if (!media.paused) track.playStartMs = Date.now();
  }
  window.addEventListener("pagehide", stopHeartbeat);
  window.TshtTelemetry = {
    sid: sid,
    sendPageview: sendPageview,
    startHeartbeat: startHeartbeat,
    stopHeartbeat: stopHeartbeat,
    setHeartbeatType: setHeartbeatType,
  };
})();
