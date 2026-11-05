// Phase 2 + port VTCANY TV (dung chung logic TV): Radio player — cung co
// che link xoay nhu TV, chi khac la luong chi co am thanh (preset
// paudio/paudio64 o phia cap nguon). Phan biet radio dua vao kind:"radio"
// do server da chuan hoa tu preset (neu response co truong kind rieng thi
// server uu tien truong do).
// - Cot lich ben phai: GET /api/v1/schedule?channel=<NAME>&date=... . Doi
//   ngay chi tai lai cot lich, khong khoi dong lai player.
// - Radio hien chua gan lich o vtcaio (epgId null) nen lich rong la binh
//   thuong: cot lich hien dung "Chưa có lịch phát", khong phai thong bao
//   loi, va canh bao vtcaio_error (neu co) van chi nam o #player-msg.
// - Khong tu tao tan so FM, khong tu tao lich hay ban ghi cho radio. Neu
//   sau nay kenh radio co EPG/timeshift that, cung code timeline/xem lai
//   cua TV se chay cho radio ma khong can sua them (cung the <audio>).
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
  function showMsg(t) { msg.textContent = t; msg.style.display = "block"; }
  function hideMsg() { msg.textContent = ""; msg.style.display = "none"; }
  function esc(s) { return window.LiveEpg ? window.LiveEpg.esc(s) : String(s || ""); }
  function fmtEpgNow(e) {
    if (!e || !e.title) return "";
    var s = e.startTime ? e.startTime.slice(11, 16) : "", en = e.endTime ? e.endTime.slice(11, 16) : "";
    return "Đang phát: " + e.title + (s && en ? " (" + s + "–" + en + ")" : "");
  }
  function saigonToday() { return window.LiveEpg.saigonToday(); }
  // Thanh dieu khien tuy chinh (LiveControls, Buoc 0) cho audio: khong
  // PiP/toan man hinh. Cham vao poster de hien/an thanh dieu khien
  // (mobile), cham dup 2 nua poster de tua ±10s khi co DVR.
  var audioEl = document.getElementById("player");
  var ctrl = null;
  if (audioEl && window.LiveControls) {
    ctrl = window.LiveControls.create({
      media: audioEl,
      isVideo: false,
      mount: document.getElementById("lc-mount"),
      tapTarget: document.querySelector(".radio-poster"),
      getLiveEdge: function () { return liveHandle && liveHandle.getLivePosition ? liveHandle.getLivePosition() : null; },
      onBackToLive: backToLive,
      getProgramAt: programAt,
      onViewState: function (st) {
        if (window.TshtTelemetry && window.TshtTelemetry.setHeartbeatType) window.TshtTelemetry.setHeartbeatType(st);
      },
    });
  }
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
    stopLive();
    stopReplayOnly();
    currentChannel = hit.name;
    channelStreamUrl = hit.stream_url || "";
    document.getElementById("channel-name").textContent = hit.name;
    document.getElementById("channel-desc").textContent = hit.description || "";
    renderChannelList();
    startLive();
    loadSchedule();
  }
  function stopLive() { if (liveHandle) { liveHandle.stop(); liveHandle = null; } if (window.TshtTelemetry) window.TshtTelemetry.stopHeartbeat(); }
  function stopReplayOnly() { if (replayHandle) { replayHandle.stop(); replayHandle = null; } replayingKey = null; if (window.TshtTelemetry) window.TshtTelemetry.stopHeartbeat(); }
  function setLiveUi() {
    if (badge) badge.textContent = "● TRỰC TIẾP";
    if (replayBar) replayBar.style.display = "none";
  }
  function renderLastSchedule() {
    if (!lastItems) return;
    var live = window.LiveEpg.renderSchedule({ box: schedBox, items: lastItems, date: lastMeta.date, nowEl: nowEl, onReplay: onReplay, replayingKey: replayingKey, timeshift_available: lastMeta.timeshift_available, timeshift_unknown: lastMeta.timeshift_unknown, emptyText: "Chưa có lịch phát" });
    if (live && nowEl) nowEl.textContent = "Đang phát: " + live.title + (live.start_time && live.end_time ? " (" + live.start_time + "–" + live.end_time + ")" : "");
  }
  function startLive() {
    // Dung handle live cu truoc (neu con) de khong co 2 handle cung
    // dieu khien mot the media — dac biet khi "Thu lai" goi lai ham nay.
    stopLive();
    stopReplayOnly();
    setLiveUi();
    hideMsg();
    replayItem = null;
    var audio = document.getElementById("player");
    if (ctrl) { ctrl.setMode("live"); ctrl.setRetry(startLive); ctrl.onStart(); }
    if (channelSource === "vtcaio") {
      liveHandle = window.playVtcanyLive(audio, currentChannel, showMsg, function () {
        liveHandle = window.playRotating(audio, currentChannel, showMsg);
      });
    } else {
      liveHandle = window.playDirect(audio, channelStreamUrl, showMsg);
    }
    // GĐ3 nen: heartbeat live (nhip 60 giay, dung khi stop/chuyen kenh).
    if (window.TshtTelemetry) window.TshtTelemetry.startHeartbeat({ channel: currentChannel, type: "live", media: audio });
  }
  function backToLive() { stopReplayOnly(); renderLastSchedule(); startLive(); }
  function onReplay(item) {
    if (!item.replay_url) return;
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
        var audio = document.getElementById("player");
        if (ctrl) { ctrl.setMode("replay"); ctrl.setRetry(function () { if (replayItem) onReplay(replayItem); }); ctrl.onStart(); }
        replayHandle = window.playTimeshift(audio, item.replay_url, showMsg);
        // GĐ3 nen: heartbeat xem lai.
        if (window.TshtTelemetry) window.TshtTelemetry.startHeartbeat({ channel: currentChannel, type: "timeshift", media: audio });
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
    if (!currentChannel) { schedBox.innerHTML = "<p class='sched-empty'>Chưa có lịch phát</p>"; return; }
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
    // Chi tai lai cot lich, tuyet doi khong cham vao player.
    dateInput.onchange = loadSchedule;
  }
  fetch("/api/v1/channels").then(function (r) { return r.json(); }).then(function (d) {
    if (d.vtcaio_error) showMsg(d.vtcaio_error);
    channels = (d.items || []).filter(function (c) { return c.kind === "radio" && (!c.status || c.status === "RUNNING"); });
    var ch = channels[0];
    if (!ch) { document.getElementById("channel-name").textContent = "Chưa có kênh phát thanh đang phát"; showMsg("Không có kênh phát thanh RUNNING trong danh mục vtcaio, và CMS cũng chưa có kênh dự phòng."); loadSchedule(); return; }
    document.getElementById("channel-name").textContent = ch.name;
    document.getElementById("channel-desc").textContent = ch.description || "";
    if (nowEl && ch.epgNow) nowEl.textContent = fmtEpgNow(ch.epgNow);
    currentChannel = ch.name;
    channelSource = d.source || "";
    channelStreamUrl = ch.stream_url || "";
    renderChannelList();
    startLive();
    // Nut phat/tam dung lon tren poster dieu khien cung the <audio> nay
    // (van dung ca khi dang xem lai, vi cung mot the audio).
    var audio = document.getElementById("player");
    var btn = document.getElementById("radio-play");
    if (btn) {
      btn.onclick = function () {
        if (ctrl) ctrl.togglePlay();
        else if (audio.paused) audio.play().catch(function () {});
        else audio.pause();
      };
      audio.addEventListener("play", function () { btn.textContent = "❚❚"; });
      audio.addEventListener("pause", function () { btn.textContent = "▶"; });
    }
    loadSchedule();
  }).catch(function () { showMsg("Không tải được danh sách kênh. Vui lòng tải lại trang."); });
  // GĐ3 nen: pageview trang phat thanh.
  if (window.TshtTelemetry) window.TshtTelemetry.sendPageview();
})();
