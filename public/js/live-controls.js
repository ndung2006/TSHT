// LiveControls — thanh dieu khien PHU trong khung video (overlay) + chon
// do phan giai (2026-11-05, theo Buoc 0 da duyet).
// Lop dieu khien tren the media + handle phat co san (stream-player.js):
// khong tu tai stream, khong goi API phat, chi dieu khien phat/tam dung,
// tua ±10s trong cua so DVR, nhan TRUC TIEP / ve live, am luong, PiP,
// toan man hinh, phim tat, cu chi mobile, va bao trang thai tai/loi.
// - Thanh nam PHU o day khung video (khung = opts.frame, mac dinh la
//   the cha cua media): nen gradient toi dan len trong suot; tu an sau
//   3s khong re chuot khi dang phat, hien lai khi re chuot/phim tat;
//   luon hien khi tam dung; toan man hinh cung an con tro cung nhip.
// - Nut Phat tron lon giua khung khi tam dung; nhan nho "Bam de bat
//   tieng" trong khung khi dang tat tieng (bien mat khi da bat tieng).
// - Cua so DVR live chi ~23-25 giay (6 doan x ~4s, truot theo live) nen
//   nut ±10s + thanh tua chi hien khi co vung seekable that; khong co
//   DVR thi an nut tua, nhan TRUC TIEP luon do, tam dung roi phat tiep
//   se ve live. Thanh tua doc vung seekable dong (khong cung kich thuoc).
// - Gio phat song khi hover la UOC TINH tu diem live (doan HLS khong co
//   gio tuyet doi, sai so ~1 doan ~4s la chap nhan duoc); ten chuong
//   trinh lay tu lich EPG trang da tai san (opts.getProgramAt).
// - Chat luong (chi video): menu Cai dat doc muc that tu handle phat
//   (hls.levels); chon tay khoa bang hls.currentLevel (doi muc khong
//   ve dau, khong mat vi tri); lua chon luu localStorage theo chieu cao
//   (720/480/360) de ap lai khi doi kenh/xem lai/VOD; HLS native
//   (Safari) khong khoa duoc muc bang code nen menu chi hien Tu dong.
// - Am luong luu localStorage (tsht_player_volume / tsht_player_muted)
//   de giu qua doi kenh va qua cac trang tv/radio/home. Lan mo trang
//   dau tien luon tu phat KHONG TIENG (muted autoplay).
(function (global) {
  "use strict";
  var VOL_KEY = "tsht_player_volume";
  var MUTE_KEY = "tsht_player_muted";
  var QUALITY_KEY = "tsht_quality"; // "auto" | "720" | "480" | "360"
  var LIVE_LAG_S = 10; // tre <= 10s thi coi la dang o mep live
  var WATCHDOG_MS = 15000; // chua phat duoc sau 15s thi hien panel loi
  var UI_HIDE_MS = 3000; // an thanh sau 3s khong re chuot khi dang phat

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

  // Icon SVG net manh, mau trang (1 bo duy nhat). Mau nhan #d61f2f chi
  // dung cho thanh tua / thanh am luong / cham TRUC TIEP (qua CSS).
  var ICONS = {
    play: '<path d="M8 5v14l11-7z" fill="currentColor" stroke="none"/>',
    pause: '<rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/>',
    back10: '<polyline points="1 4 1 10 7 10" fill="none"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" fill="none"/><text x="12" y="16" text-anchor="middle" font-size="8.5" font-weight="700" fill="currentColor" stroke="none">10</text>',
    fwd10: '<polyline points="23 4 23 10 17 10" fill="none"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" fill="none"/><text x="12" y="16" text-anchor="middle" font-size="8.5" font-weight="700" fill="currentColor" stroke="none">10</text>',
    vol: '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" stroke="none"/><path d="M15.5 8.5a5 5 0 0 1 0 7" fill="none"/><path d="M18.6 5.4a9 9 0 0 1 0 13.2" fill="none"/>',
    volOff: '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" stroke="none"/><line x1="16" y1="9" x2="22" y2="15" fill="none"/><line x1="22" y1="9" x2="16" y2="15" fill="none"/>',
    gear: '<circle cx="12" cy="12" r="3" fill="none"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" fill="none"/>',
    pip: '<rect x="2" y="4" width="20" height="14" rx="2" fill="none"/><rect x="12" y="11" width="7" height="5" rx="1" fill="currentColor" stroke="none"/>',
    fs: '<path d="M8 3H5a2 2 0 0 0-2 2v3" fill="none"/><path d="M16 3h3a2 2 0 0 1 2 2v3" fill="none"/><path d="M8 21H5a2 2 0 0 1-2-2v-3" fill="none"/><path d="M16 21h3a2 2 0 0 0 2-2v-3" fill="none"/>',
    fsExit: '<polyline points="4 14 10 14 10 20" fill="none"/><polyline points="20 10 14 10 14 4" fill="none"/><line x1="14" y1="10" x2="21" y2="3" fill="none"/><line x1="3" y1="21" x2="10" y2="14" fill="none"/>',
  };
  function svgIcon(name) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || "") + "</svg>";
  }

  global.LiveControls = {
    create: function (opts) {
      opts = opts || {};
      var media = opts.media;
      var isVideo = !!opts.isVideo;
      var mount = opts.mount || null;
      var tapTarget = opts.tapTarget || media;
      var playerRoot = opts.playerRoot || null; // vung player: phim tat chay khi focus o bat ky phan tu nao trong nay
      var fsTarget = opts.fullscreenTarget || null;
      // Khung ma thanh phu nam trong: opts.frame (vd .live-player-wrap /
      // .mm-media), mac dinh la the cha cua media. Neu khong co khung
      // thi roi ve mount (thanh hien dang tinh ben duoi nhu cu).
      var frame = opts.frame || (media && media.parentNode) || null;
      var hasFrame = !!frame;
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
      var lastTapAt = 0, lastTapX = 0, pendingTapTimer = null;
      var curVol = 1; // am luong hien tai cua phien (doi kenh giu nguyen)
      var coarse = !!(global.matchMedia && global.matchMedia("(pointer: coarse)").matches);
      var loadingVisible = false, errorVisible = false;
      var replayTitle = "";
      // Tu an thanh: chi khi dang phat, khong loi, khong dang tai, menu
      // chat luong khong mo. lastActivity cap nhat khi re chuot / bam
      // nut / phim tat / cham (mobile).
      var lastActivity = Date.now();
      var uiHidden = false;

      // ---- Chat luong (chi video) ----
      var qualityHandle = null, qualityUnsub = null;
      var qualityLevels = []; // [{index, height, bitrate}] tu handle phat
      var qualityCurrentIdx = -1; // muc dang phat that (LEVEL_SWITCHED)
      var qualitySaved = loadStored(QUALITY_KEY) || "auto"; // "auto" | "720" | ...
      var qualityAppliedFor = null; // handle da ap lua chon da luu
      var qualityMenuOpen = false;
      var lastQualitySig = "";

      // ---- DOM cua thanh dieu khien (phu trong khung) ----
      var barHost = frame || mount;
      if (barHost && barHost.classList) barHost.classList.add("lc-frame");
      var bar = $("div", "lc-bar");
      if (!hasFrame) bar.classList.add("lc-bar-static");
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
      var playBtn = $("button", "lc-btn lc-play");
      playBtn.type = "button";
      playBtn.innerHTML = svgIcon("play");
      playBtn.setAttribute("aria-label", "Phát");
      playBtn.title = "Phát / Tạm dừng (Space)";
      var backBtn = $("button", "lc-btn lc-skip lc-back10");
      backBtn.type = "button";
      backBtn.innerHTML = svgIcon("back10");
      backBtn.setAttribute("aria-label", "Lùi 10 giây");
      backBtn.title = "Lùi 10 giây (←)";
      var fwdBtn = $("button", "lc-btn lc-skip lc-fwd10");
      fwdBtn.type = "button";
      fwdBtn.innerHTML = svgIcon("fwd10");
      fwdBtn.setAttribute("aria-label", "Tới 10 giây");
      fwdBtn.title = "Tới 10 giây (→)";
      var liveBtn = $("button", "lc-btn lc-live", "● TRỰC TIẾP");
      liveBtn.type = "button";
      liveBtn.setAttribute("aria-label", "Về trực tiếp");
      liveBtn.title = "Về trực tiếp (L)";
      var volWrap = $("span", "lc-vol-wrap");
      var muteBtn = $("button", "lc-btn lc-mute");
      muteBtn.type = "button";
      muteBtn.innerHTML = svgIcon("volOff");
      muteBtn.setAttribute("aria-label", "Bật tiếng");
      muteBtn.title = "Bật tiếng (M)";
      var vol = document.createElement("input");
      vol.type = "range"; vol.className = "lc-vol";
      vol.min = "0"; vol.max = "1"; vol.step = "0.05"; vol.value = "1";
      vol.setAttribute("aria-label", "Âm lượng");
      vol.title = "Âm lượng";
      volWrap.appendChild(muteBtn);
      volWrap.appendChild(vol);
      var spacer = $("span", "lc-spacer");
      // Cai dat -> Chat luong (chi video; radio/audio an).
      var settingsWrap = $("div", "lc-settings");
      var gearBtn = $("button", "lc-btn lc-gear");
      gearBtn.type = "button";
      gearBtn.innerHTML = svgIcon("gear");
      gearBtn.setAttribute("aria-label", "Cài đặt");
      gearBtn.setAttribute("aria-expanded", "false");
      gearBtn.title = "Cài đặt";
      var menuEl = $("div", "lc-menu");
      menuEl.style.display = "none";
      menuEl.setAttribute("role", "menu");
      menuEl.setAttribute("aria-label", "Chất lượng");
      var menuTitle = $("div", "lc-menu-title", "Chất lượng");
      menuEl.appendChild(menuTitle);
      settingsWrap.appendChild(gearBtn);
      settingsWrap.appendChild(menuEl);
      var pipBtn = $("button", "lc-btn lc-pip");
      pipBtn.type = "button";
      pipBtn.innerHTML = svgIcon("pip");
      pipBtn.setAttribute("aria-label", "Hình trong hình");
      pipBtn.title = "Hình trong hình";
      var fsBtn = $("button", "lc-btn lc-fs");
      fsBtn.type = "button";
      fsBtn.innerHTML = svgIcon("fs");
      fsBtn.setAttribute("aria-label", "Toàn màn hình");
      fsBtn.title = "Toàn màn hình (F)";
      row.appendChild(playBtn);
      row.appendChild(backBtn);
      row.appendChild(fwdBtn);
      row.appendChild(liveBtn);
      row.appendChild(volWrap);
      row.appendChild(spacer);
      row.appendChild(settingsWrap);
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
      if (barHost) barHost.appendChild(bar);
      else if (media && media.parentNode) media.parentNode.insertBefore(bar, media.nextSibling);

      // Nut Phat tron lon giua khung khi tam dung (chi video) + nhan
      // nho "Bam de bat tieng" khi dang tat tieng (chi an khi da bat).
      var centerPlay = null, muteHint = null;
      if (barHost) {
        centerPlay = $("button", "lc-center-play");
        centerPlay.type = "button";
        centerPlay.innerHTML = svgIcon("play");
        centerPlay.setAttribute("aria-label", "Phát");
        centerPlay.title = "Phát (Space)";
        centerPlay.style.display = "none";
        barHost.appendChild(centerPlay);
        muteHint = $("button", "lc-mute-hint");
        muteHint.type = "button";
        muteHint.innerHTML = svgIcon("volOff") + "<span>Bấm để bật tiếng</span>";
        muteHint.setAttribute("aria-label", "Bấm để bật tiếng");
        muteHint.title = "Bấm để bật tiếng";
        muteHint.style.display = "none";
        barHost.appendChild(muteHint);
      }

      // Lop phu "Dang tai" tren khung video (chi video).
      var overlay = null;
      if (isVideo && media && media.parentNode) {
        overlay = $("div", "lc-overlay-loading");
        overlay.appendChild($("span", "", "Đang tải…"));
        overlay.style.display = "none";
        media.parentNode.appendChild(overlay);
      }
      function showLoading(show) {
        loadingVisible = !!show;
        loadingEl.style.display = show ? "block" : "none";
        if (overlay) overlay.style.display = show ? "flex" : "none";
        if (show) pokeUi();
      }
      function showError(show) {
        errorVisible = !!show;
        errorEl.style.display = show ? "flex" : "none";
        if (show) { showLoading(false); pokeUi(); }
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

      // ---- Tu an thanh (chi khi dang phat) ----
      function setUiHidden(h) {
        if (uiHidden === h) return;
        uiHidden = h;
        if (frame && frame.classList) frame.classList.toggle("lc-ui-hidden", h);
      }
      function pokeUi() {
        lastActivity = Date.now();
        setUiHidden(false);
      }
      function maybeHideUi() {
        if (media.paused || errorVisible || loadingVisible || qualityMenuOpen) return;
        if (Date.now() - lastActivity > UI_HIDE_MS) setUiHidden(true);
      }
      if (frame) {
        frame.addEventListener("mousemove", pokeUi);
        frame.addEventListener("mouseenter", pokeUi);
        frame.addEventListener("mouseleave", function () {
          if (!media.paused && !errorVisible && !loadingVisible) {
            closeQualityMenu();
            setUiHidden(true);
          }
        });
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
        muteBtn.innerHTML = media.muted ? svgIcon("volOff") : svgIcon("vol");
        muteBtn.setAttribute("aria-label", media.muted ? "Bật tiếng" : "Tắt tiếng");
        muteBtn.title = media.muted ? "Bật tiếng (M)" : "Tắt tiếng (M)";
        if (muteHint) muteHint.style.display = media.muted ? "flex" : "none";
        vol.value = String(media.volume);
      }
      function syncPlayUi() {
        var paused = media.paused;
        playBtn.innerHTML = paused ? svgIcon("play") : svgIcon("pause");
        playBtn.setAttribute("aria-label", paused ? "Phát" : "Tạm dừng");
        playBtn.title = paused ? "Phát (Space)" : "Tạm dừng (Space)";
        if (centerPlay) centerPlay.style.display = (isVideo && paused) ? "flex" : "none";
      }
      function syncChromeUi() {
        // PiP / toan man hinh / cai dat chat luong chi co o video; audio
        // (radio, khoi da phuong tien khi chon radio) an het.
        if (pipBtn.parentNode) {
          pipBtn.style.display = (!isVideo || !document.pictureInPictureEnabled) ? "none" : "";
        }
        if (fsBtn.parentNode) fsBtn.style.display = !isVideo ? "none" : "";
        settingsWrap.style.display = !isVideo ? "none" : "";
        if (!isVideo && qualityMenuOpen) closeQualityMenu();
      }

      // ---- Chat luong ----
      function qualityLabelFor(lv) {
        if (lv.height && lv.height > 0) return lv.height + "p";
        if (lv.bitrate && lv.bitrate > 0) return Math.round(lv.bitrate / 1000) + " kbps";
        return "Mức " + (lv.index + 1);
      }
      function qualitySig() {
        var parts = [qualitySaved, qualityCurrentIdx];
        for (var i = 0; i < qualityLevels.length; i++) parts.push(qualityLevels[i].height + ":" + qualityLevels[i].bitrate);
        return parts.join("|");
      }
      // Che do Tu dong THUC TE: "auto" hoac muc da luu khong co trong
      // luong hien tai (vd da luu 360p nhung VOD chi co 720p/480p) thi
      // player dang chay tu dong — menu phai hien dung nhu vay (tick
      // o Tu dong + muc dang phat), du lua chon da luu van giu de ap
      // lai khi doi sang luong khac co muc do.
      function effectiveAuto() {
        if (qualitySaved === "auto") return true;
        var h = parseInt(qualitySaved, 10);
        for (var i = 0; i < qualityLevels.length; i++) {
          if (qualityLevels[i].height === h) return false;
        }
        return true;
      }
      function autoMenuText() {
        var t = "Tự động";
        if (effectiveAuto() && qualityCurrentIdx >= 0 && qualityLevels[qualityCurrentIdx]) {
          t += " (" + qualityLabelFor(qualityLevels[qualityCurrentIdx]) + ")";
        }
        return t;
      }
      var autoMenuItem = null;
      function renderQualityMenu() {
        // Xoa het item cu (giu lai tieu de o children[0]).
        while (menuEl.children.length > 1) menuEl.removeChild(menuEl.lastChild);
        autoMenuItem = document.createElement("button");
        autoMenuItem.type = "button";
        autoMenuItem.className = "lc-menu-item" + (effectiveAuto() ? " is-active" : "");
        autoMenuItem.setAttribute("role", "menuitemradio");
        autoMenuItem.setAttribute("aria-checked", effectiveAuto() ? "true" : "false");
        autoMenuItem.textContent = (effectiveAuto() ? "✓ " : "") + autoMenuText();
        autoMenuItem.addEventListener("click", function () { chooseQuality("auto"); });
        menuEl.appendChild(autoMenuItem);
        // Muc cao truoc (720p len truoc 480p, 360p). Chi liet ke muc
        // luong that su co (tu hls.levels); khong hardcode.
        var sorted = qualityLevels.slice().sort(function (a, b) {
          return (b.height || 0) - (a.height || 0) || (b.bitrate || 0) - (a.bitrate || 0);
        });
        for (var i = 0; i < sorted.length; i++) {
          (function (lv) {
            if (!lv.height && !lv.bitrate) return;
            var active = qualitySaved !== "auto" && parseInt(qualitySaved, 10) === lv.height;
            var item = document.createElement("button");
            item.type = "button";
            item.className = "lc-menu-item" + (active ? " is-active" : "");
            item.setAttribute("role", "menuitemradio");
            item.setAttribute("aria-checked", active ? "true" : "false");
            item.textContent = (active ? "✓ " : "") + qualityLabelFor(lv);
            item.setAttribute("aria-label", "Chất lượng " + qualityLabelFor(lv));
            item.addEventListener("click", function () { chooseQuality(String(lv.height)); });
            menuEl.appendChild(item);
          })(sorted[i]);
        }
      }
      function updateAutoMenuLabel() {
        if (!autoMenuItem) return;
        autoMenuItem.textContent = (effectiveAuto() ? "✓ " : "") + autoMenuText();
      }
      function applySavedQuality() {
        if (!qualityHandle || !qualityLevels.length) return;
        if (qualitySaved === "auto") {
          try {
            if (qualityHandle.isAutoLevel && !qualityHandle.isAutoLevel()) qualityHandle.setLevel(-1);
          } catch (e) {}
          return;
        }
        var h = parseInt(qualitySaved, 10);
        var target = null;
        for (var i = 0; i < qualityLevels.length; i++) {
          if (qualityLevels[i].height === h) { target = qualityLevels[i]; break; }
        }
        if (!target) {
          // Muc da luu khong co trong luong nay (vd VOD khong co 360p)
          // thi ve Tu dong cho luong nay, giu nguyen lua chon da luu de
          // doi sang luong khac co muc do thi ap lai.
          try {
            if (qualityHandle.isAutoLevel && !qualityHandle.isAutoLevel()) qualityHandle.setLevel(-1);
          } catch (e) {}
          return;
        }
        try {
          var cur = qualityHandle.getCurrentLevel ? qualityHandle.getCurrentLevel() : -1;
          var auto = qualityHandle.isAutoLevel ? qualityHandle.isAutoLevel() : true;
          if (auto || cur !== target.index) qualityHandle.setLevel(target.index);
        } catch (e) {}
      }
      function refreshQualityFromHandle() {
        if (!qualityHandle) {
          // Khong co handle (doi kenh/xem lai, handle moi chua toi):
          // menu chi con "Tu dong", khong giu muc cua luong cu.
          qualityLevels = [];
          var sig0 = qualitySig();
          if (sig0 !== lastQualitySig) { lastQualitySig = sig0; renderQualityMenu(); }
          return;
        }
        var levels = [];
        try { levels = qualityHandle.getLevels ? qualityHandle.getLevels() || [] : []; } catch (e) { levels = []; }
        qualityLevels = levels;
        if (levels.length) {
          var cur = -1;
          try { cur = qualityHandle.getCurrentLevel ? qualityHandle.getCurrentLevel() : -1; } catch (e) {}
          if (typeof cur === "number" && cur >= 0 && cur < levels.length) qualityCurrentIdx = cur;
          if (qualityAppliedFor !== qualityHandle) {
            applySavedQuality();
            qualityAppliedFor = qualityHandle;
          } else if (qualitySaved !== "auto") {
            applySavedQuality(); // giu khoa tay sau khi swap/loadSource
          }
        }
        var sig = qualitySig();
        if (sig !== lastQualitySig) {
          lastQualitySig = sig;
          renderQualityMenu();
        } else {
          updateAutoMenuLabel();
        }
      }
      function chooseQuality(val) {
        qualitySaved = val;
        saveStored(QUALITY_KEY, val);
        applySavedQuality();
        renderQualityMenu();
        closeQualityMenu();
      }
      function openQualityMenu() {
        renderQualityMenu();
        menuEl.style.display = "block";
        gearBtn.setAttribute("aria-expanded", "true");
        qualityMenuOpen = true;
        pokeUi();
      }
      function closeQualityMenu() {
        if (!qualityMenuOpen) return;
        menuEl.style.display = "none";
        gearBtn.setAttribute("aria-expanded", "false");
        qualityMenuOpen = false;
      }
      function toggleQualityMenu() {
        if (qualityMenuOpen) closeQualityMenu();
        else openQualityMenu();
      }
      function setQualityHandle(handle) {
        if (qualityUnsub) { try { qualityUnsub(); } catch (e) {} qualityUnsub = null; }
        qualityHandle = handle || null;
        qualityLevels = [];
        qualityCurrentIdx = -1;
        qualityAppliedFor = null;
        lastQualitySig = "";
        if (qualityHandle && typeof qualityHandle.onLevelChange === "function") {
          try {
            qualityUnsub = qualityHandle.onLevelChange(function (idx) {
              // idx >= 0: LEVEL_SWITCHED (muc dang phat that); -1: chi
              // bao levels da san (MANIFEST_PARSED).
              if (typeof idx === "number" && idx >= 0) qualityCurrentIdx = idx;
              refreshQualityFromHandle();
            });
          } catch (e) {}
        }
        refreshQualityFromHandle();
      }

      // ---- Cap nhat dinh ky ----
      function updateSeekFill() {
        var min = parseFloat(seek.min) || 0, max = parseFloat(seek.max) || 0;
        var v = parseFloat(seek.value) || 0;
        var pct = (max > min) ? Math.max(0, Math.min(100, (v - min) / (max - min) * 100)) : 0;
        seek.style.background = "linear-gradient(to right, #d61f2f 0%, #d61f2f " + pct + "%, rgba(255,255,255,0.35) " + pct + "%, rgba(255,255,255,0.35) 100%)";
      }
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
          updateSeekFill();
        }
      }
      function updateLiveLabel() {
        if (mode === "live") {
          var lag = currentLag();
          if (behind || lag > LIVE_LAG_S) {
            liveBtn.textContent = "−" + fmtMMSS(lag);
            liveBtn.classList.remove("is-live");
            liveBtn.classList.add("is-behind");
            liveBtn.classList.remove("is-replay", "is-vod");
            liveBtn.setAttribute("aria-label", "Đang chậm " + fmtMMSS(lag) + " so với trực tiếp, bấm để về trực tiếp");
          } else {
            // Cham do #d61f2f (CSS .lc-dot) + chu TRUC TIEP trang.
            liveBtn.textContent = "";
            var dot = document.createElement("span");
            dot.className = "lc-dot";
            dot.setAttribute("aria-hidden", "true");
            liveBtn.appendChild(dot);
            liveBtn.appendChild(document.createTextNode(" TRỰC TIẾP"));
            liveBtn.classList.remove("is-behind");
            liveBtn.classList.add("is-live");
            liveBtn.classList.remove("is-replay", "is-vod");
            liveBtn.setAttribute("aria-label", "Đang phát trực tiếp");
          }
        } else if (mode === "replay") {
          liveBtn.textContent = "XEM LẠI" + (replayTitle ? " · " + replayTitle : "");
          liveBtn.classList.remove("is-live", "is-behind", "is-vod");
          liveBtn.classList.add("is-replay");
          liveBtn.setAttribute("aria-label", "Đang xem lại" + (replayTitle ? " " + replayTitle : "") + ", bấm để về trực tiếp");
        } else {
          var cur = isFinite(media.currentTime) ? media.currentTime : 0;
          var dur = isFinite(media.duration) ? media.duration : 0;
          liveBtn.textContent = fmtMMSS(cur) + " / " + fmtMMSS(dur);
          liveBtn.classList.remove("is-live", "is-behind", "is-replay");
          liveBtn.classList.add("is-vod");
          liveBtn.setAttribute("aria-label", "Đã phát " + fmtMMSS(cur) + " trên tổng " + fmtMMSS(dur) + ", bấm để về trực tiếp");
        }
      }
      function tick() {
        updateSeek();
        updateLiveLabel();
        reportViewState();
        refreshQualityFromHandle();
        maybeHideUi();
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
      function onMediaError() {
        // Dang thu nguon (retry tu dong trong stream-player) thi CHI hien
        // bieu tuong dang tai, KHONG hien panel loi — loi chi hien khi
        // watchdog het han (15s chua phat duoc) hoac khi da het cach thu.
        // Hien panel loi o day se tat overlay dang tai, de lo ca chu loi
        // mac dinh cua trinh duyet ("Khong the phat noi dung da phuong
        // tien.") trong luc van dang thu (loi live 2026-11-05).
        if (started && !media.paused) showLoading(true);
      }
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
      playBtn.addEventListener("click", function () { pokeUi(); togglePlay(); });
      if (centerPlay) centerPlay.addEventListener("click", function () { pokeUi(); togglePlay(); });
      if (muteHint) muteHint.addEventListener("click", function () { pokeUi(); setMuted(false); });
      backBtn.addEventListener("click", function () { pokeUi(); skip(-10); });
      fwdBtn.addEventListener("click", function () { pokeUi(); skip(10); });
      liveBtn.addEventListener("click", function () { pokeUi(); backToLive(); });
      muteBtn.addEventListener("click", function () { pokeUi(); setMuted(!media.muted); });
      vol.addEventListener("input", function () { pokeUi(); setVolume(parseFloat(vol.value)); });
      gearBtn.addEventListener("click", function (e) { e.stopPropagation(); pokeUi(); toggleQualityMenu(); });
      document.addEventListener("click", function (e) {
        if (!qualityMenuOpen) return;
        if (e.target && e.target.closest && e.target.closest(".lc-settings")) return;
        closeQualityMenu();
      });
      retryBtn.addEventListener("click", function () {
        pokeUi();
        showError(false);
        if (typeof retryFn === "function") retryFn();
      });
      seek.addEventListener("pointerdown", function () { draggingSeek = true; pokeUi(); });
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
        updateSeekFill();
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
          pokeUi();
          try {
            if (document.pictureInPictureElement) document.exitPictureInPicture().catch(function () {});
            else if (media.requestPictureInPicture) media.requestPictureInPicture().catch(function () {});
          } catch (e) {}
        });
        fsBtn.addEventListener("click", function () { pokeUi(); toggleFullscreen(); });
        document.addEventListener("fullscreenchange", function () {
          fsBtn.innerHTML = document.fullscreenElement ? svgIcon("fsExit") : svgIcon("fs");
          fsBtn.setAttribute("aria-label", document.fullscreenElement ? "Thoát toàn màn hình" : "Toàn màn hình");
        });
      }
      function toggleFullscreen() {
        try {
          if (document.fullscreenElement) { document.exitFullscreen().catch(function () {}); return; }
          var t = fsTarget || media;
          if (t.requestFullscreen) t.requestFullscreen().catch(function () {});
        } catch (e) {}
      }

      // ---- Phim tat: chay khi focus o bat ky phan tu nao trong player
      //   (ke ca sau khi bam nut — nut giu focus nhung van nam trong
      //   playerRoot), va khi trang co player ma khong co o nhap lieu nao
      //   dang duoc focus (focus o body). Chi khong cuop khi dang go trong
      //   input/textarea/select, khi kem Ctrl/Cmd/Alt, hoac khi focus o
      //   nut/link NGOAI player (de control do xu ly, vd nut PHAT LAI
      //   trong lich). Menu Cai dat dang mo: chi Esc dong menu, cac phim
      //   tat khac tam dung de khong vua chon muc vua tua/phat. ----
      function onKeydown(e) {
        if (!e || e.ctrlKey || e.metaKey || e.altKey) return;
        var t = e.target;
        if (t) {
          var tag = (t.tagName || "").toUpperCase();
          if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t.isContentEditable) return;
          if (tag === "BUTTON" || tag === "A") {
            var inPlayer = false;
            try {
              inPlayer = (playerRoot && playerRoot.contains(t)) || (mount && mount.contains(t)) || t === media;
            } catch (err) {}
            if (!inPlayer) return;
          }
        }
        if (qualityMenuOpen) {
          if (e.key === "Escape") { e.preventDefault(); closeQualityMenu(); }
          return;
        }
        var k = e.key;
        pokeUi();
        if (k === " " || k === "Spacebar") { e.preventDefault(); togglePlay(); }
        else if (k === "ArrowLeft") { if (seekAllowed()) { e.preventDefault(); skip(-10); } }
        else if (k === "ArrowRight") { if (seekAllowed()) { e.preventDefault(); skip(10); } }
        else if (k === "m" || k === "M") { setMuted(!media.muted); }
        else if ((k === "f" || k === "F") && isVideo) { toggleFullscreen(); }
        else if (k === "l" || k === "L") { backToLive(); }
      }
      document.addEventListener("keydown", onKeydown);

      // ---- Mobile: cham hien/an thanh dieu khien, cham dup 2 nua tua ----
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
            pokeUi();
            return;
          }
          lastTapAt = now;
          lastTapX = x;
          pendingTapTimer = setTimeout(function () {
            pendingTapTimer = null;
            if (uiHidden) pokeUi();
            else { lastActivity = 0; setUiHidden(true); }
          }, 300);
        });
      }

      // ---- Khoi tao: khoi phuc am luong, luon tu phat khong tieng ----
      var savedVol = loadStored(VOL_KEY);
      curVol = (savedVol != null && isFinite(parseFloat(savedVol))) ? Math.max(0, Math.min(1, parseFloat(savedVol))) : 1;
      media.volume = curVol;
      media.muted = true; // muted autoplay lan mo trang; nhan "Bam de bat tieng" hien ro
      syncMuteUi();
      syncPlayUi();
      syncChromeUi();
      renderQualityMenu();
      tick();
      tickTimer = setInterval(tick, 500);

      return {
        setMode: function (m) {
          if (m === "live" || m === "replay" || m === "vod") mode = m;
          if (m !== "replay") replayTitle = "";
          behind = false;
          lastViewState = null;
          tick();
        },
        setReplayTitle: function (t) {
          replayTitle = (t == null ? "" : String(t));
          updateLiveLabel();
        },
        setQualityHandle: setQualityHandle,
        setRetry: function (fn) { retryFn = (typeof fn === "function") ? fn : null; },
        onStart: function () {
          started = true;
          showError(false);
          showLoading(true);
          armWatchdog();
        },
        showError: function () { showError(true); },
        hideError: function () { showError(false); },
        // Tat overlay "Dang tai…" (ke ca watchdog): dung khi khoi dong
        // phat that bai truoc khi co media (vd fetch link VOD loi) de
        // khong ket overlay dang tai tren player dung im.
        hideLoading: function () { clearWatchdog(); showLoading(false); },
        togglePlay: togglePlay,
        seekToLive: seekToLive,
        skip: skip,
        setMuted: setMuted,
        attachMedia: function (newMedia, newIsVideo) {
          behind = false;
          // Doi media (doi kenh o khoi da phuong tien): handle phat cu
          // da dung, bo lien ket chat luong cu; trang se gan handle moi
          // qua setQualityHandle ngay sau khi tao xong.
          setQualityHandle(null);
          if (!newMedia || newMedia === media) {
            isVideo = !!newIsVideo;
            syncChromeUi();
            syncPlayUi();
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
          syncChromeUi();
          tick();
        },
      };
    },
  };
})(window);
