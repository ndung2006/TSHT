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
  var liveHandle = null, replayHandle = null, replayingKey = null;
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
  function stopLive() { if (liveHandle) { liveHandle.stop(); liveHandle = null; } }
  function stopReplayOnly() { if (replayHandle) { replayHandle.stop(); replayHandle = null; } replayingKey = null; }
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
    stopReplayOnly();
    setLiveUi();
    hideMsg();
    var audio = document.getElementById("player");
    if (channelSource === "vtcaio") {
      liveHandle = window.playVtcanyLive(audio, currentChannel, showMsg, function () {
        liveHandle = window.playRotating(audio, currentChannel, showMsg);
      });
    } else {
      liveHandle = window.playDirect(audio, channelStreamUrl, showMsg);
    }
  }
  function backToLive() { stopReplayOnly(); renderLastSchedule(); startLive(); }
  function onReplay(item) {
    if (!item.replay_url) return;
    var ctrl = (typeof AbortController !== "undefined") ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 45000) : null;
    fetch(item.replay_url, ctrl ? { signal: ctrl.signal } : {})
      .then(function (r) {
        if (timer) clearTimeout(timer);
        if (!r.ok) return r.json().catch(function () { return {}; }).then(function (d) { throw new Error(d.error || "khoảng giờ này không có bản ghi"); });
        stopLive();
        replayingKey = window.LiveEpg.replayKey(item);
        if (badge) badge.textContent = "ĐANG XEM LẠI";
        if (replayTitleEl) replayTitleEl.textContent = item.title;
        if (replayBar) replayBar.style.display = "block";
        hideMsg();
        var audio = document.getElementById("player");
        replayHandle = window.playTimeshift(audio, item.replay_url, showMsg);
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
    var ch = (d.items || []).filter(function (c) { return c.kind === "radio" && (!c.status || c.status === "RUNNING"); })[0];
    if (!ch) { document.getElementById("channel-name").textContent = "Chưa có kênh phát thanh đang phát"; showMsg("Không có kênh phát thanh RUNNING trong danh mục vtcaio, và CMS cũng chưa có kênh dự phòng."); loadSchedule(); return; }
    document.getElementById("channel-name").textContent = ch.name;
    document.getElementById("channel-desc").textContent = ch.description || "";
    if (nowEl && ch.epgNow) nowEl.textContent = fmtEpgNow(ch.epgNow);
    currentChannel = ch.name;
    channelSource = d.source || "";
    channelStreamUrl = ch.stream_url || "";
    startLive();
    // Nut phat/tam dung lon tren poster dieu khien cung the <audio> nay
    // (van dung ca khi dang xem lai, vi cung mot the audio).
    var audio = document.getElementById("player");
    var btn = document.getElementById("radio-play");
    if (btn) {
      btn.onclick = function () {
        if (audio.paused) audio.play().catch(function () {});
        else audio.pause();
      };
      audio.addEventListener("play", function () { btn.textContent = "❚❚"; });
      audio.addEventListener("pause", function () { btn.textContent = "▶"; });
    }
    loadSchedule();
  }).catch(function () { showMsg("Không tải được danh sách kênh. Vui lòng tải lại trang."); });
})();
