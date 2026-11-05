// LiveControls — thanh dieu khien tuy chinh cho player live (Buoc 0).
// Lop dieu khien tren the media + handle phat co san (stream-player.js):
// khong tu tai stream, khong goi API phat, chi dieu khien phat/tam dung,
// tua ±10s trong cua so DVR, nhan TRUC TIEP / ve live, am luong, PiP,
// toan man hinh, phim tat, cu chi mobile, va bao trang thai tai/loi.
// - Cua so DVR live chi ~23-25 giay (6 doan x ~4s, truot theo live) nen
//   nut ±10s + thanh tua chi hien khi co vung seekable that; khong co
//   DVR thi an nut tua, nhan TRUC TIEP luon do, tam dung roi phat tiep
//   se ve live. Thanh tua doc vung seekable dong (khong cung kich thuoc).
// - Gio phat song khi hover la UOC TINH tu diem live (doan HLS khong co
//   gio tuyet doi, sai so ~1 doan ~4s la chap nhan duoc); ten chuong
//   trinh lay tu lich EPG trang da tai san (opts.getProgramAt).
// - Am luong luu localStorage (tsht_player_volume / tsht_player_muted)
//   de giu qua doi kenh va qua cac trang tv/radio/home. Lan mo trang
//   dau tien luon tu phat KHONG TIENG (muted autoplay) + nut "Bat tieng".
(function (global) {
  "use strict";
  var VOL_KEY = "tsht_player_volume";
  var MUTE_KEY = "tsht_player_muted";
  var LIVE_LAG_S = 10; // tre <= 10s thi coi la dang o mep live
  var WATCHDOG_MS = 15000; // chua phat duoc sau 15s thi hien panel loi

  function $(tag, cls, text) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  }
  function fmtMMSS(s) {
    if (!isFinite(s) || s < 0) s = 0;
    var m = Math.floor(s / 60), sec = Math.floor(s % 60);
    return (m < 10 ? "0" : "") + m + ":" + (sec < 10 ? "0" : "") + sec;
  }
  function fmtSaigonHHMM(ms) {
    try {
      return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(ms));
    } catch (e) {
      var d = new Date(ms);
      return ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2);
    }
  }
  function loadStored(key) {
    try { return global.localStorage.getItem(key); } catch (e) { return null; }
  }
  function saveStored(key, val) {
    try { global.localStorage.setItem(key, val); } catch (e) {}
  }

  global.LiveControls = {
    create: function (opts) {
      opts = opts || {};
      var media = opts.media;
      var isVideo = !!opts.isVideo;
      var mount = opts.mount || null;
      var tapTarget = opts.tapTarget || media;
      var fsTarget = opts.fullscreenTarget || null;
      var mode = "live"; // live | replay | vod
      // behind = nguoi dung da chu dong lui/kéo ve sau mep live (vd bam -10s
      // mot lan). Nhan TRUC TIẾP chi do theo lag > LIVE_LAG_S (10s) thi
      // mot lan -10s roi dung ngay nguong 10s se van hien do — sai tieu chi
      // (loi live 2026-11-05: bam -10s 1 lan van do, 2 lan moi xam -00:20).
      // behind duoc dat khi lui/kéo ve sau, xoa khi ve live hoac khi seek
      // hoan tat va da o trong 2s quanh mep live (onSeeked).
      var behind = false;
      var retryFn = null;
      var lastViewState = null;
      var started = false;
      var watchdog = null;
      var draggingSeek = false;
      var tickTimer = null;
      var hideTimer = null;
      var lastTapAt = 0, lastTapX = 0, pendingTapTimer = null;
      var curVol = 1; // am luong hien tai cua phien (doi kenh giu nguyen)
      var coarse = !!(global.matchMedia && global.matchMedia("(pointer: coarse)").matches);

      // ---- DOM cua thanh dieu khien ----
      var bar = $("div", "lc-bar");
      bar.setAttribute("role", "group");
      bar.setAttribute("aria-label", "Điều khiển phát");
      var seekWrap = $("div", "lc-seek-wrap");
      var seek = document.createElement("input");
      seek.type = "range"; seek.className = "lc-seek";
      seek.min = "0"; seek.max = "100"; seek.step = "0.1"; seek.value = "0";
      seek.setAttribute("aria-label", "Thanh tua");
      seek.title = "Kéo để tua";
      var seekTip = $("span", "lc-seek-tip");
      seekTip.style.display = "none";
      seekWrap.appendChild(seek);
      seekWrap.appendChild(seekTip);
      var row = $("div", "lc-row");
      var playBtn = $("button", "lc-btn lc-play", "▶");
      playBtn.type = "button";
      playBtn.setAttribute("aria-label", "Phát");
      playBtn.title = "Phát / Tạm dừng (Space)";
      var backBtn = $("button", "lc-btn lc-skip lc-back10", "−10s");
      backBtn.type = "button";
      backBtn.setAttribute("aria-label", "Lùi 10 giây");
      backBtn.title = "Lùi 10 giây (←)";
      var fwdBtn = $("button", "lc-btn lc-skip lc-fwd10", "+10s");
      fwdBtn.type = "button";
      fwdBtn.setAttribute("aria-label", "Tới 10 giây");
      fwdBtn.title = "Tới 10 giây (→)";
      var liveBtn = $("button", "lc-btn lc-live", "● TRỰC TIẾP");
      liveBtn.type = "button";
      liveBtn.setAttribute("aria-label", "Về trực tiếp");
      liveBtn.title = "Về trực tiếp (L)";
      var unmuteBtn = $("button", "lc-btn lc-unmute", "🔊 Bật tiếng");
      unmuteBtn.type = "button";
      unmuteBtn.setAttribute("aria-label", "Bật tiếng");
      unmuteBtn.title = "Bật tiếng";
      var muteBtn = $("button", "lc-btn lc-mute", "🔊");
      muteBtn.type = "button";
      muteBtn.setAttribute("aria-label", "Tắt tiếng");
      muteBtn.title = "Tắt tiếng (M)";
      var vol = document.createElement("input");
      vol.type = "range"; vol.className = "lc-vol";
      vol.min = "0"; vol.max = "1"; vol.step = "0.05"; vol.value = "1";
      vol.setAttribute("aria-label", "Âm lượng");
      vol.title = "Âm lượng";
      var spacer = $("span", "lc-spacer");
      var pipBtn = $("button", "lc-btn lc-pip", "PiP");
      pipBtn.type = "button";
      pipBtn.setAttribute("aria-label", "Hình trong hình");
      pipBtn.title = "Hình trong hình";
      var fsBtn = $("button", "lc-btn lc-fs", "⛶");
      fsBtn.type = "button";
      fsBtn.setAttribute("aria-label", "Toàn màn hình");
      fsBtn.title = "Toàn màn hình (F)";
      row.appendChild(playBtn);
      row.appendChild(backBtn);
      row.appendChild(fwdBtn);
      row.appendChild(liveBtn);
      row.appendChild(unmuteBtn);
      row.appendChild(muteBtn);
      row.appendChild(vol);
      row.appendChild(spacer);
      if (isVideo) {
        row.appendChild(pipBtn);
        row.appendChild(fsBtn);
      }
      var loadingEl = $("div", "lc-status lc-loading", "Đang tải…");
      loadingEl.style.display = "none";
      var errorEl = $("div", "lc-status lc-error");
      var errorText = $("span", "", "Không phát được kênh này");
      var retryBtn = $("button", "lc-retry", "Thử lại");
      retryBtn.type = "button";
      retryBtn.setAttribute("aria-label", "Thử lại");
      errorEl.appendChild(errorText);
      errorEl.appendChild(retryBtn);
      errorEl.style.display = "none";
      bar.appendChild(seekWrap);
      bar.appendChild(row);
      bar.appendChild(loadingEl);
      bar.appendChild(errorEl);
      if (mount) mount.appendChild(bar);
      else if (media && media.parentNode) media.parentNode.insertBefore(bar, media.nextSibling);

      // Lop phu "Dang tai" tren khung video (chi video).
      var overlay = null;
      if (isVideo && media && media.parentNode) {
        overlay = $("div", "lc-overlay-loading");
        overlay.appendChild($("span", "", "Đang tải…"));
        overlay.style.display = "none";
        media.parentNode.appendChild(overlay);
      }
      function showLoading(show) {
        loadingEl.style.display = show ? "block" : "none";
        if (overlay) overlay.style.display = show ? "flex" : "none";
      }
      function showError(show) {
        errorEl.style.display = show ? "flex" : "none";
        if (show) showLoading(false);
      }
      function clearWatchdog() {
        if (watchdog) { clearTimeout(watchdog); watchdog = null; }
      }
      function armWatchdog() {
        clearWatchdog();
        watchdog = setTimeout(function () {
          if (started && !media.paused && media.readyState < 3) showError(true);
        }, WATCHDOG_MS);
      }

      // ---- Trang thai suy ra tu media ----
      function seekableRange() {
        try {
          var s = media.seekable;
          if (!s || !s.length) return null;
          return { start: s.start(0), end: s.end(s.length - 1) };
        } catch (e) { return null; }
      }
      function liveEdge() {
        var e = null;
        try { if (typeof opts.getLiveEdge === "function") e = opts.getLiveEdge(); } catch (err) {}
        if (e != null && isFinite(e)) return e;
        var r = seekableRange();
        return r ? r.end : null;
      }
      function hasDvr() {
        if (mode !== "live") return false;
        var r = seekableRange();
        return !!r && (r.end - r.start) > 2;
      }
      function seekAllowed() {
        if (mode === "replay" || mode === "vod") return isFinite(media.duration) && media.duration > 0;
        return hasDvr();
      }
      function currentLag() {
        if (mode !== "live") return 0;
        var e = liveEdge();
        if (e == null) return 0;
        return Math.max(0, e - media.currentTime);
      }
      function viewState() {
        if (mode === "vod") return "vod";
        if (mode === "replay") return "timeshift";
        return (behind || currentLag() > LIVE_LAG_S) ? "timeshift" : "live";
      }
      function reportViewState() {
        var st = viewState();
        if (st !== lastViewState) {
          lastViewState = st;
          if (typeof opts.onViewState === "function") {
            try { opts.onViewState(st); } catch (e) {}
          }
        }
      }

      // ---- Hanh dong ----
      function togglePlay() {
        if (media.paused) { media.play().catch(function () {}); }
        else media.pause();
      }
      function skip(sec) {
        if (!seekAllowed()) return;
        var target;
        if (mode === "live") {
          var r = seekableRange(), edge = liveEdge();
          if (!r || edge == null) return;
          target = media.currentTime + sec;
          if (target < r.start) target = r.start;
          if (target > edge) target = edge;
          if (sec < 0) behind = true; // chu dong lui: hien xam ngay ca khi lag dung o nguong 10s
        } else {
          if (!isFinite(media.duration)) return;
          target = media.currentTime + sec;
          if (target < 0) target = 0;
          if (target > media.duration) target = media.duration;
        }
        media.currentTime = target;
      }
      function seekToLive() {
        var edge = liveEdge();
        if (edge == null) return;
        behind = false;
        media.currentTime = edge;
        if (media.paused) media.play().catch(function () {});
      }
      function backToLive() {
        if (mode === "live") seekToLive();
        else if (typeof opts.onBackToLive === "function") opts.onBackToLive();
      }
      function setMuted(m) {
        media.muted = !!m;
        saveStored(MUTE_KEY, media.muted ? "1" : "0");
        syncMuteUi();
      }
      function setVolume(v) {
        v = Math.max(0, Math.min(1, v));
        curVol = v;
        media.volume = v;
        saveStored(VOL_KEY, String(v));
        if (v > 0 && media.muted) setMuted(false);
        else syncMuteUi();
      }
      function syncMuteUi() {
        muteBtn.textContent = media.muted ? "🔇" : "🔊";
        muteBtn.setAttribute("aria-label", media.muted ? "Bật tiếng" : "Tắt tiếng");
        muteBtn.title = media.muted ? "Bật tiếng (M)" : "Tắt tiếng (M)";
        unmuteBtn.style.display = media.muted ? "inline-block" : "none";
        vol.value = String(media.volume);
      }
      function syncPlayUi() {
        var paused = media.paused;
        playBtn.textContent = paused ? "▶" : "❚❚";
        playBtn.setAttribute("aria-label", paused ? "Phát" : "Tạm dừng");
        playBtn.title = paused ? "Phát (Space)" : "Tạm dừng (Space)";
      }
      function syncPipFsUi() {
        if (pipBtn.parentNode) {
          pipBtn.style.display = (!isVideo || !document.pictureInPictureEnabled) ? "none" : "";
        }
        if (fsBtn.parentNode) fsBtn.style.display = !isVideo ? "none" : "";
      }

      // ---- Cap nhat dinh ky ----
      function updateSeek() {
        var show = false, min = 0, max = 0;
        if (mode === "live") {
          var r = seekableRange();
          if (r && (r.end - r.start) > 2) { show = true; min = r.start; max = r.end; }
        } else if (isFinite(media.duration) && media.duration > 0) {
          show = true; min = 0; max = media.duration;
        }
        seekWrap.style.display = show ? "block" : "none";
        backBtn.style.display = show ? "" : "none";
        fwdBtn.style.display = show ? "" : "none";
        if (show) {
          if (Number(seek.min) !== min) seek.min = String(min);
          if (Number(seek.max) !== max) seek.max = String(max);
          if (!draggingSeek) seek.value = String(Math.max(min, Math.min(max, media.currentTime)));
        }
      }
      function updateLiveLabel() {
        if (mode === "live") {
          var lag = currentLag();
          if (behind || lag > LIVE_LAG_S) {
            liveBtn.textContent = "−" + fmtMMSS(lag);
            liveBtn.classList.remove("is-live");
            liveBtn.classList.add("is-behind");
            liveBtn.setAttribute("aria-label", "Đang chậm " + fmtMMSS(lag) + " so với trực tiếp, bấm để về trực tiếp");
          } else {
            liveBtn.textContent = "● TRỰC TIẾP";
            liveBtn.classList.remove("is-behind");
            liveBtn.classList.add("is-live");
            liveBtn.setAttribute("aria-label", "Đang phát trực tiếp");
          }
        } else {
          liveBtn.textContent = "Về trực tiếp";
          liveBtn.classList.remove("is-live", "is-behind");
          liveBtn.setAttribute("aria-label", "Về trực tiếp");
        }
      }
      function tick() {
        updateSeek();
        updateLiveLabel();
        reportViewState();
      }

      // ---- Su kien media ----
      function onPlay() {
        syncPlayUi();
        showLoading(false);
        // Tam dung roi phat tiep: neu diem dung da truot khoi cua so DVR
        // (tam dung qua ~25s) hoac kenh khong co DVR thi ve live; con
        // trong cua so thi tiep tuc tu diem dung (thanh timeshift).
        if (mode === "live") {
          var r = seekableRange(), edge = liveEdge();
          if (edge != null && r && media.currentTime < r.start - 0.5) {
            media.currentTime = edge;
          } else if (edge != null && !r) {
            media.currentTime = edge;
          }
        }
        reportViewState();
      }
      function onPause() { syncPlayUi(); reportViewState(); }
      function onTimeUpdate() { updateSeek(); updateLiveLabel(); reportViewState(); }
      function onWaiting() { showLoading(true); }
      function onPlaying() { clearWatchdog(); showLoading(false); showError(false); syncPlayUi(); }
      function onMediaError() { if (started && !media.paused) showError(true); }
      function onVolumeChange() { syncMuteUi(); }
      function onLoadedMetadata() { updateSeek(); }
      // Seek hoan tat: chot lai co dang o sau mep live khong. Day la noi
      // duy nhat xoa 'behind' theo vi tri that (tranh race: tick 500ms co
      // the do truoc khi seek ap dung, lam mat co behind vua dat).
      function onSeeked() {
        if (mode === "live") {
          var e = liveEdge();
          if (e != null) behind = (e - media.currentTime) > 2;
          tick();
        }
      }

      var mediaHandlers = [
        ["play", onPlay], ["pause", onPause], ["timeupdate", onTimeUpdate],
        ["waiting", onWaiting], ["playing", onPlaying], ["error", onMediaError],
        ["volumechange", onVolumeChange], ["loadedmetadata", onLoadedMetadata],
        ["seeked", onSeeked],
      ];
      function bindMedia() {
        for (var i = 0; i < mediaHandlers.length; i++) media.addEventListener(mediaHandlers[i][0], mediaHandlers[i][1]);
      }
      function unbindMedia() {
        for (var i = 0; i < mediaHandlers.length; i++) media.removeEventListener(mediaHandlers[i][0], mediaHandlers[i][1]);
      }
      bindMedia();

      // ---- Su kien thanh dieu khien ----
      playBtn.addEventListener("click", function () { showControlsTemporarily(); togglePlay(); });
      backBtn.addEventListener("click", function () { showControlsTemporarily(); skip(-10); });
      fwdBtn.addEventListener("click", function () { showControlsTemporarily(); skip(10); });
      liveBtn.addEventListener("click", function () { showControlsTemporarily(); backToLive(); });
      unmuteBtn.addEventListener("click", function () { setMuted(false); });
      muteBtn.addEventListener("click", function () { setMuted(!media.muted); });
      vol.addEventListener("input", function () { setVolume(parseFloat(vol.value)); });
      retryBtn.addEventListener("click", function () {
        showError(false);
        if (typeof retryFn === "function") retryFn();
      });
      seek.addEventListener("pointerdown", function () { draggingSeek = true; });
      seek.addEventListener("pointerup", function () { draggingSeek = false; });
      seek.addEventListener("change", function () { draggingSeek = false; });
      seek.addEventListener("input", function () {
        if (!seekAllowed()) return;
        var v = parseFloat(seek.value);
        if (mode === "live") {
          var edge = liveEdge();
          if (edge != null && v > edge) v = edge;
          if (edge != null && edge - v > 2) behind = true; // kéo ve sau mep live
        } else if (isFinite(media.duration) && v > media.duration) v = media.duration;
        if (v < 0) v = 0;
        media.currentTime = v;
      });
      seek.addEventListener("mousemove", function (e) {
        var rect = seek.getBoundingClientRect();
        if (!rect.width) return;
        var ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        var min = parseFloat(seek.min) || 0, max = parseFloat(seek.max) || 0;
        var pos = min + ratio * (max - min);
        var tip = "";
        if (mode === "live") {
          var edge = liveEdge();
          if (edge == null) return;
          var bcastMs = Date.now() - (edge - pos) * 1000;
          tip = fmtSaigonHHMM(bcastMs);
          try {
            var prog = (typeof opts.getProgramAt === "function") ? opts.getProgramAt(bcastMs) : null;
            if (prog) tip += " · " + prog;
          } catch (err) {}
        } else {
          tip = fmtMMSS(pos) + " / " + fmtMMSS(media.duration);
        }
        seekTip.textContent = tip;
        seekTip.style.display = "block";
        seekTip.style.left = (ratio * 100) + "%";
      });
      seek.addEventListener("mouseleave", function () { seekTip.style.display = "none"; });
      if (isVideo) {
        pipBtn.addEventListener("click", function () {
          try {
            if (document.pictureInPictureElement) document.exitPictureInPicture().catch(function () {});
            else if (media.requestPictureInPicture) media.requestPictureInPicture().catch(function () {});
          } catch (e) {}
        });
        fsBtn.addEventListener("click", function () { toggleFullscreen(); });
        document.addEventListener("fullscreenchange", function () {
          fsBtn.textContent = document.fullscreenElement ? "⤢" : "⛶";
        });
      }
      function toggleFullscreen() {
        try {
          if (document.fullscreenElement) { document.exitFullscreen().catch(function () {}); return; }
          var t = fsTarget || media;
          if (t.requestFullscreen) t.requestFullscreen().catch(function () {});
        } catch (e) {}
      }

      // ---- Phim tat (khong cuop khi dang go trong input/textarea/select,
      //   nut, link, hoac kem Ctrl/Cmd/Alt) ----
      function onKeydown(e) {
        if (!e || e.ctrlKey || e.metaKey || e.altKey) return;
        var t = e.target;
        if (t) {
          var tag = (t.tagName || "").toUpperCase();
          if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "BUTTON" || tag === "A" || t.isContentEditable) return;
        }
        var k = e.key;
        if (k === " " || k === "Spacebar") { e.preventDefault(); togglePlay(); }
        else if (k === "ArrowLeft") { if (seekAllowed()) { e.preventDefault(); skip(-10); } }
        else if (k === "ArrowRight") { if (seekAllowed()) { e.preventDefault(); skip(10); } }
        else if (k === "m" || k === "M") { setMuted(!media.muted); }
        else if ((k === "f" || k === "F") && isVideo) { toggleFullscreen(); }
        else if (k === "l" || k === "L") { backToLive(); }
      }
      document.addEventListener("keydown", onKeydown);

      // ---- Mobile: cham hien/an thanh dieu khien, cham dup 2 nua tua ----
      function showControlsTemporarily() {
        if (!coarse) return;
        bar.classList.remove("lc-hidden");
        if (hideTimer) clearTimeout(hideTimer);
        hideTimer = setTimeout(function () { bar.classList.add("lc-hidden"); }, 3000);
      }
      if (coarse && tapTarget) {
        tapTarget.addEventListener("click", function (e) {
          // Bam vao nut ben trong vung cham (vd nut phat lon tren poster
          // radio) thi de nut do xu ly, khong doi thanh hien/an.
          if (e.target && e.target.closest && e.target.closest("button")) return;
          var now = Date.now();
          var rect = tapTarget.getBoundingClientRect ? tapTarget.getBoundingClientRect() : null;
          var x = e.clientX || (rect ? rect.left + rect.width / 2 : 0);
          if (now - lastTapAt < 300) {
            if (pendingTapTimer) { clearTimeout(pendingTapTimer); pendingTapTimer = null; }
            lastTapAt = 0;
            var half = rect ? (x < rect.left + rect.width / 2 ? -10 : 10) : 10;
            skip(half);
            showControlsTemporarily();
            return;
          }
          lastTapAt = now;
          lastTapX = x;
          pendingTapTimer = setTimeout(function () {
            pendingTapTimer = null;
            if (bar.classList.contains("lc-hidden")) showControlsTemporarily();
            else { bar.classList.add("lc-hidden"); if (hideTimer) clearTimeout(hideTimer); }
          }, 300);
        });
      }

      // ---- Khoi tao: khoi phuc am luong, luon tu phat khong tieng ----
      var savedVol = loadStored(VOL_KEY);
      curVol = (savedVol != null && isFinite(parseFloat(savedVol))) ? Math.max(0, Math.min(1, parseFloat(savedVol))) : 1;
      media.volume = curVol;
      media.muted = true; // muted autoplay lan mo trang; nut "Bat tieng" hien ro
      syncMuteUi();
      syncPlayUi();
      syncPipFsUi();
      tick();
      tickTimer = setInterval(tick, 500);

      return {
        setMode: function (m) {
          if (m === "live" || m === "replay" || m === "vod") mode = m;
          behind = false;
          lastViewState = null;
          tick();
        },
        setRetry: function (fn) { retryFn = (typeof fn === "function") ? fn : null; },
        onStart: function () {
          started = true;
          showError(false);
          showLoading(true);
          armWatchdog();
        },
        showError: function () { showError(true); },
        hideError: function () { showError(false); },
        togglePlay: togglePlay,
        seekToLive: seekToLive,
        skip: skip,
        setMuted: setMuted,
        attachMedia: function (newMedia, newIsVideo) {
          behind = false;
          if (!newMedia || newMedia === media) {
            isVideo = !!newIsVideo;
            syncPipFsUi();
            tick();
            return;
          }
          var wasMuted = media.muted;
          unbindMedia();
          clearWatchdog();
          media = newMedia;
          isVideo = !!newIsVideo;
          // Doi kenh trong cung trang: giu trang thai tat tieng + am luong
          // cua phien hien tai (khong ep tat tieng lai nhu luc mo trang).
          media.volume = curVol;
          media.muted = wasMuted;
          bindMedia();
          syncMuteUi();
          syncPlayUi();
          syncPipFsUi();
          tick();
        },
      };
    },
  };
})(window);
