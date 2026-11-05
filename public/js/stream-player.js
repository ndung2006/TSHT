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
      // startLevel 0 = muc thap nhat (360p): segment dau nhe nhat nen
      // len hinh nhanh nhat; ABR tu chuyen len muc cao sau khi do bang
      // thong. (Mac dinh hls.js cung khoi dong o muc thap, dat tuong
      // minh de chac chan khong doi theo phien ban thu vien.)
      var hls = new global.Hls({ startLevel: 0 });
      hls.loadSource(url);
      hls.attachMedia(media);
      hls.on(global.Hls.Events.ERROR, function (e, data) {
        if (!data || !data.fatal) return;
        // 403 khi phat thuong nam trong data.response.code (neu co).
        var code = data.response ? data.response.code : null;
        onFatal(code);
      });
      return {
        swap: function (u) { hls.loadSource(u); },
        destroy: function () { try { hls.destroy(); } catch (e) {} },
        // Vi tri live hien tai (giay): hls.liveSyncPosition chinh xac hon
        // seekable.end(); dung cho nut TRUC TIEP / do tre cua LiveControls.
        getLivePosition: function () {
          try {
            if (hls.liveSyncPosition != null && isFinite(hls.liveSyncPosition)) return hls.liveSyncPosition;
            if (media.seekable && media.seekable.length) return media.seekable.end(media.seekable.length - 1);
          } catch (e) {}
          return null;
        },
        // API muc chat luong (menu Cai dat cua LiveControls):
        // - getLevels() -> [{index, height, bitrate}] sap xep thap -> cao
        //   (hls.levels tu master playlist; hls.js chi tra muc video).
        // - setLevel(i): i >= 0 khoa dung muc do qua hls.currentLevel
        //   (doi muc ngay, xa buffer, GIU vi tri hien tai — khong ve
        //   dau); i < 0 ve Tu dong. Goi truoc khi manifest ve thi tra
        //   false, controller se ap lai khi MANIFEST_PARSED toi.
        // - getCurrentLevel() -> index muc DANG PHAT THAT (khong phai muc
        //   da chon tay); -1 khi chua co muc.
        // - onLevelChange(cb): cb(index) khi LEVEL_SWITCHED (index >= 0),
        //   cb(-1) khi MANIFEST_PARSED (levels da san). Tra ve ham huy.
        getLevels: function () {
          try {
            var ls = hls.levels || [], out = [];
            for (var i = 0; i < ls.length; i++) out.push({ index: i, height: ls[i].height || 0, bitrate: ls[i].bitrate || 0 });
            return out;
          } catch (e) { return []; }
        },
        setLevel: function (idx) {
          try {
            if (idx == null) return false;
            if (idx < 0) { hls.currentLevel = -1; return true; }
            if (hls.levels && idx < hls.levels.length) { hls.currentLevel = idx; return true; }
          } catch (e) {}
          return false;
        },
        getCurrentLevel: function () {
          try {
            var c = hls.currentLevel;
            if (typeof c === "number" && isFinite(c)) return c;
          } catch (e) {}
          return -1;
        },
        isAutoLevel: function () { try { return !!hls.autoLevelEnabled; } catch (e) { return true; } },
        onLevelChange: function (cb) {
          var onSwitched = function (e, data) { try { cb(data && typeof data.level === "number" ? data.level : -1); } catch (err) {} };
          var onParsed = function () { try { cb(-1); } catch (err) {} };
          hls.on(global.Hls.Events.LEVEL_SWITCHED, onSwitched);
          hls.on(global.Hls.Events.MANIFEST_PARSED, onParsed);
          return function () { try { hls.off(global.Hls.Events.LEVEL_SWITCHED, onSwitched); hls.off(global.Hls.Events.MANIFEST_PARSED, onParsed); } catch (e) {} };
        },
      };
    }
    if (media.canPlayType("application/vnd.apple.mpegurl")) {
      media.src = url;
      return {
        swap: function (u) { var t = media.currentTime; media.src = u; media.play().catch(function () {}); try { media.currentTime = t; } catch (e) {} },
        destroy: function () {},
        getLivePosition: function () {
          try {
            if (media.seekable && media.seekable.length) return media.seekable.end(media.seekable.length - 1);
          } catch (e) {}
          return null;
        },
        // HLS native (Safari): trinh duyet tu chon muc, khong khoa duoc
        // bang code nen menu chat luong chi hien "Tu dong".
        getLevels: function () { return []; },
        setLevel: function () { return false; },
        getCurrentLevel: function () { return -1; },
        isAutoLevel: function () { return true; },
        onLevelChange: function () { return function () {}; },
      };
    }
    return null;
  }

  // Cau noi API muc chat luong: engine HLS chi co sau khi fetch link
  // xong (playRotating / playVtcanyLive), nen callback dang ky truoc
  // phai duoc gan vao engine ngay khi no xuat hien; moi goi deu chiu
  // duoc engine null (tra gia tri mac dinh) de controller goi tu do.
  function levelBridge() {
    var engine = null, pending = [];
    return {
      setEngine: function (e) {
        engine = e || null;
        if (!engine) return;
        for (var i = 0; i < pending.length; i++) {
          try { engine.onLevelChange(pending[i]); } catch (err) {}
        }
        pending = [];
      },
      getLevels: function () { try { return engine && engine.getLevels ? engine.getLevels() : []; } catch (e) { return []; } },
      setLevel: function (idx) { try { return engine && engine.setLevel ? engine.setLevel(idx) : false; } catch (e) { return false; } },
      getCurrentLevel: function () { try { return engine && engine.getCurrentLevel ? engine.getCurrentLevel() : -1; } catch (e) { return -1; } },
      isAutoLevel: function () { try { return engine && engine.isAutoLevel ? engine.isAutoLevel() : true; } catch (e) { return true; } },
      onLevelChange: function (cb) {
        if (engine) {
          try { return engine.onLevelChange(cb) || function () {}; } catch (e) { return function () {}; }
        }
        pending.push(cb);
        return function () { var i = pending.indexOf(cb); if (i >= 0) pending.splice(i, 1); };
      },
    };
  }

  // playRotating(mediaEl, channelName, showMsg)
  // Tra ve ham stop() de huy timer khi roi trang (khong bat buoc goi).
  global.playRotating = function (mediaEl, channelName, showMsg) {
    var engine = null, timer = null, stopped = false, immediateTries = 0;
    var bridge = levelBridge();
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
      bridge.setEngine(engine);
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
    return { stop: function () { stopped = true; clearTimer(); if (engine) engine.destroy(); }, getLivePosition: function () { return engine && engine.getLivePosition ? engine.getLivePosition() : null; }, getLevels: bridge.getLevels, setLevel: bridge.setLevel, getCurrentLevel: bridge.getCurrentLevel, isAutoLevel: bridge.isAutoLevel, onLevelChange: bridge.onLevelChange };
  };

  // playVtcanyLive(mediaEl, channelName, showMsg, onFallback)
  // Port VTCANY (web truyen-hinh: link xoay lay tu EPG endpoint, xin lai
  // truoc khi het han): lay link scan-only tu /api/v1/live tren server TSHT
  // (server moi goi backend VTCANY, browser khong bao gio thay key/JWT).
  // Neu live endpoint khong co link (backend chua san / kenh chua co link
  // xoay), goi onFallback() mot lan de trang dung luong cu (stream-token
  // truc tiep AIO hoac direct) thay vi dung hinh. Timer refresh giong
  // playRotating: xin moi truoc exp 30 phut (phut 210 cua TTL 240), loi
  // fatal/403 thi xin moi ngay lap tuc, toi da 3 lan lien tiep.
  global.playVtcanyLive = function (mediaEl, channelName, showMsg, onFallback) {
    var engine = null, timer = null, stopped = false, immediateTries = 0, fallbackCalled = false;
    var bridge = levelBridge();
    function clearTimer() { if (timer) { clearTimeout(timer); timer = null; } }
    function scheduleRefresh(exp) {
      clearTimer();
      if (stopped) return;
      var delay = exp ? exp - Date.now() - 30 * 60 * 1000 : 210 * 60 * 1000;
      if (delay < 60 * 1000) delay = 60 * 1000;
      timer = setTimeout(function () { refresh(false); }, delay);
    }
    function loadUrl(url, exp) {
      if (!engine) {
        engine = attachHls(mediaEl, url, function (code) { if (code === 403 || code === null) refresh(true); });
        if (!engine) { showMsg("Trình duyệt này không hỗ trợ phát HLS. Vui lòng dùng Chrome/Safari mới nhất."); return; }
      } else engine.swap(url);
      bridge.setEngine(engine);
      scheduleRefresh(exp);
    }
    function refresh(immediate) {
      if (stopped) return;
      if (immediate) {
        immediateTries += 1;
        if (immediateTries > 3) { showMsg("Luồng phát đã hết hạn và xin lại không thành công. Vui lòng tải lại trang."); return; }
      } else immediateTries = 0;
      fetch("/api/v1/live?channel=" + encodeURIComponent(channelName))
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (stopped) return;
          if (!d.ok || !d.url) {
            if (!fallbackCalled && typeof onFallback === "function") { fallbackCalled = true; onFallback(); }
            else if (!engine) showMsg("Không xin được link phát trực tiếp. Vui lòng tải lại trang.");
            return;
          }
          immediateTries = 0;
          loadUrl(d.url, d.exp || null);
          mediaEl.play().catch(function () {});
        })
        .catch(function () {
          if (!fallbackCalled && typeof onFallback === "function") { fallbackCalled = true; onFallback(); }
          else if (!engine) showMsg("Mất kết nối khi xin link phát trực tiếp. Vui lòng tải lại trang.");
        });
    }
    refresh(false);
    return { stop: function () { stopped = true; clearTimer(); if (engine) engine.destroy(); }, getLivePosition: function () { return engine && engine.getLivePosition ? engine.getLivePosition() : null; }, getLevels: bridge.getLevels, setLevel: bridge.setLevel, getCurrentLevel: bridge.getCurrentLevel, isAutoLevel: bridge.isAutoLevel, onLevelChange: bridge.onLevelChange };
  };

  // playTimeshift(mediaEl, url, showMsg): phat playlist VOD xem lai.
  // Khac live o 2 diem: khong co timer xin moi (VOD co ENDLIST, link
  // khong xoay theo TTL) va khong tu xin lai khi loi — loi phat VOD thi
  // bao ro, de trang hien "khoang gio nay khong co ban ghi" thay vi quay
  // vong. Player van cho tua (seek) vi playlist VOD, con live thi khong
  // tua ve qua khu (live playlist khong co ENDLIST, seek bi gioi han boi
  // trinh duyet/hls.js).
  global.playTimeshift = function (mediaEl, url, showMsg) {
    var engine = attachHls(mediaEl, url, function () { showMsg("Không phát được bản ghi xem lại. Có thể khoảng giờ này không có bản ghi."); });
    var bridge = levelBridge();
    if (engine) bridge.setEngine(engine);
    if (!engine) showMsg("Trình duyệt này không hỗ trợ phát HLS. Vui lòng dùng Chrome/Safari mới nhất.");
    else mediaEl.play().catch(function () {});
    return { stop: function () { if (engine) engine.destroy(); }, getLivePosition: function () { return engine && engine.getLivePosition ? engine.getLivePosition() : null; }, getLevels: bridge.getLevels, setLevel: bridge.setLevel, getCurrentLevel: bridge.getCurrentLevel, isAutoLevel: bridge.isAutoLevel, onLevelChange: bridge.onLevelChange };
  };

  // playDirect: phat thang stream_url cua DB noi bo (khong xoay).
  global.playDirect = function (mediaEl, url, showMsg) {
    var engine = attachHls(mediaEl, url, function () { showMsg("Không phát được luồng. Vui lòng thử lại sau hoặc xem lịch phát sóng."); });
    var bridge = levelBridge();
    if (engine) bridge.setEngine(engine);
    if (!engine) showMsg("Trình duyệt này không hỗ trợ phát HLS. Vui lòng dùng Chrome/Safari mới nhất.");
    else mediaEl.play().catch(function () {});
    return { stop: function () { if (engine) engine.destroy(); }, getLivePosition: function () { return engine && engine.getLivePosition ? engine.getLivePosition() : null; }, getLevels: bridge.getLevels, setLevel: bridge.setLevel, getCurrentLevel: bridge.getCurrentLevel, isAutoLevel: bridge.isAutoLevel, onLevelChange: bridge.onLevelChange };
  };
})(window);
