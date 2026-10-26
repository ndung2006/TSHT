// Phase 2 — Player xoay link (tai lieu VTCAIO v1.0, muc 4.3).
// Ky luat bat buoc, ap dung cho ca TV (video) va Radio (audio):
//  - Link co TTL 240 phut. Xin link moi o phut 210 (truoc khi het han 30 phut),
//    neu server tra exp thi tinh: refresh luc (exp - 30 phut), khong doi toi exp.
//  - Trinh tu an toan: xin link moi -> chuyen player sang link moi -> moi bo
//    link cu. Khong bao gio de player dung link da qua exp.
//  - Khi phat bi 403 (link qua exp hoac bi thay khoa he thong): xin link moi
//    NGAY LAP TUC, khong doi toi lich hen gio.
//  - Tuyet doi khong cache link qua han. Moi lan refresh deu goi lai
//    POST /api/v1/stream-token tren server (server moi goi vtcaio, browser
//    khong bao gio thay partner key).
//  - Neu kenh den tu DB noi bo (source:"internal"): phat stream_url truc tiep,
//    khong xoay (vi do khong phai link xoay vtcaio).
(function (global) {
  function attachHls(media, url, onFatal) {
    if (global.Hls && global.Hls.isSupported()) {
      var hls = new global.Hls();
      hls.loadSource(url);
      hls.attachMedia(media);
      hls.on(global.Hls.Events.ERROR, function (e, data) {
        if (!data || !data.fatal) return;
        // 403 khi phat thuong nam trong data.response.code (neu co).
        var code = data.response ? data.response.code : null;
        onFatal(code);
      });
      return { swap: function (u) { hls.loadSource(u); }, destroy: function () { try { hls.destroy(); } catch (e) {} } };
    }
    if (media.canPlayType("application/vnd.apple.mpegurl")) {
      media.src = url;
      return { swap: function (u) { var t = media.currentTime; media.src = u; media.play().catch(function () {}); try { media.currentTime = t; } catch (e) {} }, destroy: function () {} };
    }
    return null;
  }

  // playRotating(mediaEl, channelName, showMsg)
  // Tra ve ham stop() de huy timer khi roi trang (khong bat buoc goi).
  global.playRotating = function (mediaEl, channelName, showMsg) {
    var engine = null, timer = null, stopped = false, immediateTries = 0;
    function clearTimer() { if (timer) { clearTimeout(timer); timer = null; } }
    function scheduleRefresh(exp) {
      clearTimer();
      if (stopped) return;
      var delay;
      if (exp) {
        // Xin moi truoc khi het han 30 phut (tai lieu: phut 210 cua TTL 240).
        delay = exp - Date.now() - 30 * 60 * 1000;
        if (delay < 60 * 1000) delay = 60 * 1000;
      } else {
        delay = 210 * 60 * 1000;
      }
      timer = setTimeout(function () { refresh(false); }, delay);
    }
    function loadUrl(url, exp) {
      if (!engine) {
        engine = attachHls(mediaEl, url, function (code) {
          // 403 hoac loi fatal khac khi dang phat: xin moi ngay lap tuc.
          if (code === 403 || code === null) refresh(true);
        });
        if (!engine) { showMsg("Trình duyệt này không hỗ trợ phát HLS. Vui lòng dùng Chrome/Safari mới nhất."); return; }
      } else {
        // Xin link moi -> chuyen player sang link moi truoc, roi moi bo cu:
        // swap() cua hls.js / native deu thay source ngay, link cu tu het tac dung.
        engine.swap(url);
      }
      scheduleRefresh(exp);
    }
    function refresh(immediate) {
      if (stopped) return;
      if (immediate) {
        immediateTries += 1;
        if (immediateTries > 3) { showMsg("Luồng phát đã hết hạn và xin lại không thành công. Vui lòng tải lại trang."); return; }
      } else {
        immediateTries = 0;
      }
      fetch("/api/v1/stream-token", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ channel: channelName }) })
        .then(function (r) { return r.json().then(function (d) { return { status: r.status, data: d }; }); })
        .then(function (res) {
          if (res.status !== 200 || !res.data.url) {
            // 409 = kenh khong con RUNNING; 404 = kenh khong ton tai; 503 = chua cau hinh.
            showMsg("Không xin được link phát mới (" + (res.data.error || res.status) + "). Vui lòng tải lại trang.");
            return;
          }
          immediateTries = 0;
          loadUrl(res.data.url, res.data.exp || null);
          mediaEl.play().catch(function () {});
        })
        .catch(function () { showMsg("Mất kết nối khi xin link phát mới. Vui lòng tải lại trang."); });
    }
    mediaEl.addEventListener("error", function () { refresh(true); });
    refresh(false);
    return { stop: function () { stopped = true; clearTimer(); if (engine) engine.destroy(); } };
  };

  // playDirect: phat thang stream_url cua DB noi bo (khong xoay).
  global.playDirect = function (mediaEl, url, showMsg) {
    var engine = attachHls(mediaEl, url, function () { showMsg("Không phát được luồng. Vui lòng thử lại sau hoặc xem lịch phát sóng."); });
    if (!engine) showMsg("Trình duyệt này không hỗ trợ phát HLS. Vui lòng dùng Chrome/Safari mới nhất.");
    else mediaEl.play().catch(function () {});
    return { stop: function () { if (engine) engine.destroy(); } };
  };
})(window);
