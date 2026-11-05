// Phase 2 + port VTCANY TV: TV player, nguon chinh qua server (browser
// khong goi vtcaio/VTCANY truc tiep, khong thay key/JWT).
// - Kenh RUNNING loai tv dau tien trong danh muc.
// - Live: thu link scan-only tu backend VTCANY qua /api/v1/live truoc
//   (playVtcanyLive, refresh truoc exp 30 phut); neu backend chua san thi
//   roi ve luong cu: POST /api/v1/stream-token (link xoay, phut 210) hoac
//   stream_url truc tiep neu source:"internal".
// - Lich EPG dang cuon xuong duoi player: GET /api/v1/schedule?channel=<NAME>&date=... . Doi
//   ngay chi tai lai lich, khong khoi dong lai player. Hang lich hien
//   trang thai LIVE/UPCOMING/REPLAY theo gio Saigon (port VTCANY
//   mapEpgSchedule), chuong trinh da phat co replay_url thi co nut
//   "Xem lai" (timeshift VOD, tua duoc); chuong trinh da phat khong co
//   ban ghi thi hien ro "Khong co ban ghi" thay vi phat gia.
// - Dang xem lai thi co nut "Về trực tiếp" de quay ve truc tiep ngay lap tuc.
(function () {
  var msg = document.getElementById("player-msg");
  var nowEl = document.getElementById("now-playing");
  var dateInput = document.getElementById("sched-date");
  var schedBox = document.getElementById("schedule");
  var badge = document.querySelector(".live-badge");
  var replayBar = document.getElementById("replay-bar");
  var replayTitleEl = document.getElementById("replay-title");
  var backLiveBtn = document.getElementById("back-live");
  var currentChannel = "", channelSource = "", channelStreamUrl = "";
  var channels = [];
  var liveHandle = null, replayHandle = null, replayingKey = null, replayItem = null;
  var lastItems = null, lastMeta = null;
  // Can khung lich dung bang khung video (mau tuyenquangtv.vn/truyen-hinh):
  // chieu cao khung lich = chieu cao .live-player-wrap (video 16:9) tru
  // chieu cao .epg-head, danh sach cuon ben trong. Chi desktop (>900px);
  // mobile xoa chieu cao dat san de lich cuon theo trang nhu cu.
  // Ly do phai do bang JS thay vi chi CSS: grid auto-row lay chieu cao
  // theo noi dung lon nhat, nen flex:1 + overflow:auto mot minh khong
  // gioi han duoc danh sach bang video — ban CSS truoc day can theo ca
  // cot player (video + dong Dang phat ben duoi) nen van lech so voi mau.
  function syncSchedHeight() {
    if (!schedBox) return;
    if (window.innerWidth <= 900) { schedBox.style.height = ""; return; }
    var wrap = document.querySelector(".live-player-wrap");
    var head = document.querySelector(".epg-head");
    if (!wrap || !head) return;
    var h = wrap.offsetHeight - head.offsetHeight;
    if (h > 0) schedBox.style.height = h + "px";
  }
  var schedResizeTimer = null;
  window.addEventListener("resize", function () {
    if (schedResizeTimer) clearTimeout(schedResizeTimer);
    schedResizeTimer = setTimeout(syncSchedHeight, 150);
  });
  if (typeof ResizeObserver !== "undefined") {
    var wrapEl = document.querySelector(".live-player-wrap");
    if (wrapEl) new ResizeObserver(syncSchedHeight).observe(wrapEl);
  }
  var playerEl = document.getElementById("player");
  if (playerEl) playerEl.addEventListener("loadedmetadata", syncSchedHeight);
  // Thanh dieu khien tuy chinh (LiveControls, Buoc 0): thay the
  // controls mac dinh cua trinh duyet. Am luong/tat tieng luu
  // localStorage de giu qua doi kenh va qua cac trang tv/radio/home.
  var ctrl = null;
  if (playerEl && window.LiveControls) {
    ctrl = window.LiveControls.create({
      media: playerEl,
      isVideo: true,
      mount: document.getElementById("lc-mount"),
      frame: document.querySelector(".live-player-wrap"),
      playerRoot: document.querySelector(".live-player-col"),
      fullscreenTarget: document.querySelector(".live-player-col"),
      getLiveEdge: function () { return liveHandle && liveHandle.getLivePosition ? liveHandle.getLivePosition() : null; },
      onBackToLive: backToLive,
      getProgramAt: programAt,
      onViewState: function (st) {
        if (window.TshtTelemetry && window.TshtTelemetry.setHeartbeatType) window.TshtTelemetry.setHeartbeatType(st);
      },
    });
  }
  // Ten chuong trinh dang phat tai thoi diem phat song ms (de hien khi
  // hover thanh tua). Chi dung lich ngay hom nay (lich ngay khac khong
  // phai lich cua "bay gio").
  function programAt(ms) {
    if (!lastItems || !lastMeta || lastMeta.date !== saigonToday()) return null;
    for (var i = 0; i < lastItems.length; i++) {
      var p = lastItems[i];
      var s = p.startTime ? new Date(p.startTime).getTime() : NaN;
      var e = p.endTime ? new Date(p.endTime).getTime() : NaN;
      if (isFinite(s) && isFinite(e) && ms >= s && ms < e) return p.title || null;
    }
    return null;
  }
  // Danh sach kenh truyen hinh RUNNING (truoc day chi lay kenh dau tien).
  function renderChannelList() {
    var box = document.getElementById("lc-channels");
    if (!box) return;
    var html = "";
    for (var i = 0; i < channels.length; i++) {
      var c = channels[i];
      html += "<button type=\"button\" class=\"lc-ch-btn" + (c.name === currentChannel ? " selected" : "") + "\" data-name=\"" + esc(c.name) + "\">" + esc(c.name) + "</button>";
    }
    box.innerHTML = html;
    var btns = box.querySelectorAll(".lc-ch-btn");
    for (var j = 0; j < btns.length; j++) {
      (function (btn) {
        btn.addEventListener("click", function () { selectChannel(btn.getAttribute("data-name")); });
      })(btns[j]);
    }
  }
  function selectChannel(name) {
    var hit = null;
    for (var i = 0; i < channels.length; i++) { if (channels[i].name === name) { hit = channels[i]; break; } }
    if (!hit || hit.name === currentChannel) return;
    // Doi kenh: dung handle cu + heartbeat truoc, roi moi phat live
    // kenh moi (khong chong tieng/heartbeat).
    stopLive();
    stopReplayOnly();
    currentChannel = hit.name;
    channelStreamUrl = hit.stream_url || "";
    document.getElementById("channel-desc").textContent = hit.description || "";
    renderChannelList();
    startLive();
    loadSchedule();
  }
  function showMsg(t) { msg.textContent = t; msg.style.display = "block"; }
  function hideMsg() { msg.textContent = ""; msg.style.display = "none"; }
  function esc(s) { return window.LiveEpg ? window.LiveEpg.esc(s) : String(s || ""); }
  function fmtEpgNow(e) {
    if (!e || !e.title) return "";
    var s = e.startTime ? e.startTime.slice(11, 16) : "", en = e.endTime ? e.endTime.slice(11, 16) : "";
    return "Đang phát: " + e.title + (s && en ? " (" + s + "–" + en + ")" : "");
  }
  function saigonToday() { return window.LiveEpg.saigonToday(); }
  function stopLive() { if (liveHandle) { liveHandle.stop(); liveHandle = null; } if (window.TshtTelemetry) window.TshtTelemetry.stopHeartbeat(); }
  function stopReplayOnly() { if (replayHandle) { replayHandle.stop(); replayHandle = null; } replayingKey = null; if (window.TshtTelemetry) window.TshtTelemetry.stopHeartbeat(); }
  function setLiveUi() {
    if (badge) badge.textContent = "● TRỰC TIẾP";
    if (replayBar) replayBar.style.display = "none";
  }
  // "Dang phat:" phai doi dung luc chuong trinh hien tai ket thuc, khong
  // cho lam moi dinh ky (truoc day chi doi khi tai lai lich). Hen gio
  // theo EPG: het chuong trinh thi tai lai lich (chi cham lich + nhan,
  // tuyet doi khong cham player, ke ca khi dang xem lai).
  var nowTimer = null;
  function endMsOf(p, dateStr) {
    if (!p) return null;
    if (p.endTime) { var e = new Date(p.endTime).getTime(); return isFinite(e) ? e : null; }
    if (p.end_time && dateStr) {
      var m = /^(\d{1,2}):(\d{2})/.exec(p.end_time);
      if (!m) return null;
      var hh = m[1].length < 2 ? "0" + m[1] : m[1];
      var d = new Date(dateStr + "T" + hh + ":" + m[2] + ":00+07:00").getTime();
      return isFinite(d) ? d : null;
    }
    return null;
  }
  function armNowTimer(live) {
    if (nowTimer) { clearTimeout(nowTimer); nowTimer = null; }
    if (!live || !lastMeta || lastMeta.date !== saigonToday()) return;
    var end = endMsOf(live, lastMeta.date);
    if (end == null) return;
    var delay = end - Date.now() + 2000;
    if (delay <= 0 || delay > 12 * 3600 * 1000) return;
    var ch = currentChannel, date = lastMeta.date;
    nowTimer = setTimeout(function () {
      if (ch !== currentChannel || !lastMeta || lastMeta.date !== date) return;
      loadSchedule();
    }, delay);
  }
  function renderLastSchedule() {
    if (!lastItems) return;
    // TV page only: schedule replay buttons read "PHÁT LẠI" (same onReplay
    // behaviour as before); radio keeps the default "Xem lại" label.
    var live = window.LiveEpg.renderSchedule({ box: schedBox, items: lastItems, date: lastMeta.date, nowEl: nowEl, onReplay: onReplay, replayingKey: replayingKey, replayLabel: "PHÁT LẠI", timeshift_available: lastMeta.timeshift_available, timeshift_unknown: lastMeta.timeshift_unknown, emptyText: "Chưa có lịch phát sóng cho ngày đã chọn.", pageScroll: true });
    syncSchedHeight();
    if (live && nowEl) nowEl.textContent = "Đang phát: " + live.title + (live.start_time && live.end_time ? " (" + live.start_time + "–" + live.end_time + ")" : "");
    armNowTimer(live);
    // TV-page extras (tv-extra.js) render "CHƯƠNG TRÌNH MỚI NHẤT" from this
    // same schedule data and reuse onReplay via window.playScheduleReplay.
    // This dispatch changes no player/schedule behaviour in this file.
    window.dispatchEvent(new CustomEvent("tv-schedule", { detail: { items: lastItems, meta: lastMeta, replayingKey: replayingKey } }));
  }
  // Exposed ONLY so tv-extra.js card buttons can call the exact same
  // pre-checked replay handler (no second player, no duplicated logic).
  window.playScheduleReplay = onReplay;
  function startLive() {
    // Dung handle live cu truoc (neu con) de khong co 2 handle cung
    // dieu khien mot the media — dac biet khi "Thu lai" goi lai ham nay.
    stopLive();
    stopReplayOnly();
    setLiveUi();
    hideMsg();
    replayItem = null;
    var video = document.getElementById("player");
    if (ctrl) { ctrl.setMode("live"); ctrl.setRetry(startLive); ctrl.onStart(); }
    if (channelSource === "vtcaio") {
      liveHandle = window.playVtcanyLive(video, currentChannel, showMsg, function () {
        // Backend VTCANY chua san / kenh chua co link xoay: roi ve luong cu.
        liveHandle = window.playRotating(video, currentChannel, showMsg);
        if (ctrl) ctrl.setQualityHandle(liveHandle);
      });
    } else {
      liveHandle = window.playDirect(video, channelStreamUrl, showMsg);
    }
    if (ctrl) ctrl.setQualityHandle(liveHandle);
    // GĐ3 nen: heartbeat live (nhip 60 giay, dung khi stop/chuyen kenh).
    if (window.TshtTelemetry) window.TshtTelemetry.startHeartbeat({ channel: currentChannel, type: "live", media: video });
  }
  function backToLive() { stopReplayOnly(); renderLastSchedule(); startLive(); }
  function onReplay(item) {
    if (!item.replay_url) return;
    // Kiem tra truoc khi dung live: neu timeshift loi thi giu nguyen live
    // dang phat va bao ro ly do, khong de player dung hinh o trang thai loi.
    // LUU Y: bien aborter (AbortController cho fetch kiem tra) KHONG duoc
    // dat ten 'ctrl' — 'ctrl' o day la LiveControls o pham vi ngoai, va
    // dung ten trung se che mat no khien ctrl.setMode bi loi (loi live
    // 2026-11-05: "ctrl.setMode is not a function", xem lai khong chay).
    var aborter = (typeof AbortController !== "undefined") ? new AbortController() : null;
    var timer = aborter ? setTimeout(function () { aborter.abort(); }, 45000) : null;
    fetch(item.replay_url, aborter ? { signal: aborter.signal } : {})
      .then(function (r) {
        if (timer) clearTimeout(timer);
        if (!r.ok) return r.json().catch(function () { return {}; }).then(function (d) { throw new Error(d.error || "khoảng giờ này không có bản ghi"); });
        stopReplayOnly();
        stopLive();
        replayingKey = window.LiveEpg.replayKey(item);
        replayItem = item;
        if (badge) badge.textContent = "XEM LẠI";
        if (replayTitleEl) replayTitleEl.textContent = item.title;
        if (replayBar) replayBar.style.display = "block";
        hideMsg();
        var video = document.getElementById("player");
        if (ctrl) { ctrl.setMode("replay"); ctrl.setReplayTitle(item.title); ctrl.setRetry(function () { if (replayItem) onReplay(replayItem); }); ctrl.onStart(); }
        replayHandle = window.playTimeshift(video, item.replay_url, showMsg);
        if (ctrl) ctrl.setQualityHandle(replayHandle);
        // GĐ3 nen: heartbeat xem lai.
        if (window.TshtTelemetry) window.TshtTelemetry.startHeartbeat({ channel: currentChannel, type: "timeshift", media: video });
        renderLastSchedule();
      })
      .catch(function (e) {
        if (timer) clearTimeout(timer);
        var why = (e && e.name === "AbortError") ? "quá thời gian chờ" : (e && e.message ? e.message : "lỗi mạng");
        showMsg("Không xem lại được (" + why + "). Đang tiếp tục phát trực tiếp.");
      });
  }
  if (backLiveBtn) backLiveBtn.addEventListener("click", backToLive);
  function loadSchedule() {
    if (!schedBox) return;
    if (!currentChannel) { schedBox.innerHTML = "<p class='sched-empty'>Chưa có lịch phát sóng cho ngày đã chọn.</p>"; return; }
    var date = dateInput.value || saigonToday();
    var ctrl = (typeof AbortController !== "undefined") ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 15000) : null;
    fetch("/api/v1/schedule?date=" + encodeURIComponent(date) + "&channel=" + encodeURIComponent(currentChannel), ctrl ? { signal: ctrl.signal } : {})
      .then(function (r) { if (timer) clearTimeout(timer); return r.json().then(function (d) { return { status: r.status, data: d }; }); })
      .then(function (res) {
        var d = res.data;
        if (res.status !== 200) { schedBox.innerHTML = "<p class='sched-empty'>Không tải được lịch phát sóng (" + esc(d.error || res.status) + ").</p>"; return; }
        if (d.fallback_warning) showMsg(d.fallback_warning);
        lastItems = d.items || [];
        lastMeta = { date: date, timeshift_available: d.timeshift_available, timeshift_unknown: d.timeshift_unknown };
        renderLastSchedule();
      })
      .catch(function (e) {
        if (timer) clearTimeout(timer);
        var why = (e && e.name === "AbortError") ? "quá thời gian chờ (15 giây)" : "lỗi mạng";
        schedBox.innerHTML = "<p class='sched-empty'>Không tải được lịch phát sóng (" + why + ").</p><p><button type='button' id='sched-retry'>Tải lại lịch</button></p>";
        var btn = document.getElementById("sched-retry");
        if (btn) btn.addEventListener("click", loadSchedule);
      });
  }
  if (dateInput) {
    dateInput.value = saigonToday();
    // Chi tai lai lich, tuyet doi khong cham vao player (ke ca khi
    // dang xem lai).
    dateInput.onchange = loadSchedule;
  }
  fetch("/api/v1/channels").then(function (r) { return r.json(); }).then(function (d) {
    if (d.vtcaio_error) showMsg(d.vtcaio_error);
    channels = (d.items || []).filter(function (c) { return c.kind === "tv" && (!c.status || c.status === "RUNNING"); });
    var ch = channels[0];
    if (!ch) { showMsg("Không có kênh truyền hình đang phát (không có kênh RUNNING trong danh mục vtcaio, và CMS cũng chưa có kênh dự phòng)."); loadSchedule(); return; }
    // Khong hien ten kenh dang text tren trang (nhan TSHTTV da bo);
    // currentChannel van la ten kenh nguon (TUYENQUANG) cho moi API.
    document.getElementById("channel-desc").textContent = ch.description || "";
    if (nowEl && ch.epgNow) nowEl.textContent = fmtEpgNow(ch.epgNow);
    currentChannel = ch.name;
    channelSource = d.source || "";
    channelStreamUrl = ch.stream_url || "";
    renderChannelList();
    startLive();
    loadSchedule();
  }).catch(function () { showMsg("Không tải được danh sách kênh. Vui lòng tải lại trang."); });
  // Menu do: do server dung san, header.js gan hanh vi
  // (xem public/js/header.js) — khong build bang JS o day nua.
  // GĐ3 nen: pageview trang truyen hinh.
  if (window.TshtTelemetry) window.TshtTelemetry.sendPageview();
})();
