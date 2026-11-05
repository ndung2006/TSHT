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
  }
  function stopHeartbeat() {
    if (hbTimer) {
      clearInterval(hbTimer);
      hbTimer = null;
    }
    hbCur = null;
  }
  // Doi loai xem giua chung (live <-> timeshift) ma KHONG reset timer
  // 60s: chi doi hbCur.type, nhip beat ke tiep se gui loai moi. Dung khi
  // nguoi xem roi khoi mep live vao cua so DVR / xem lai, hoac quay ve
  // live; khoi dong phat / doi kenh van dung startHeartbeat nhu cu.
  function setHeartbeatType(type) {
    if (!hbCur || !type) return;
    hbCur.type = type;
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
