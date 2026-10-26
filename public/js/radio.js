// Phase 2: Radio player — cung co che link xoay nhu TV (tai lieu v1.0 muc 5),
// chi khac la luong chi co am thanh (preset paudio/paudio64 o phia cap nguon).
// Phan biet radio o day dua vao kind:"radio" do server da chuan hoa tu preset
// (neu response co truong kind rieng thi server uu tien truong do).
// - Cot lich ben phai: GET /api/v1/schedule?channel=<NAME>&date=... . Doi ngay
//   chi tai lai cot lich, khong khoi dong lai player. Hang lich chi de xem,
//   khong phat lai (chua co catch-up).
// - Radio hien chua gan lich o vtcaio (epgId null) nen lich rong la binh thuong:
//   cot lich hien dung "Chưa có lịch phát", khong phai thong bao loi, va
//   canh bao vtcaio_error (neu co) van chi nam o #player-msg.
(function () {
  var msg = document.getElementById("player-msg");
  var nowEl = document.getElementById("now-playing");
  var dateInput = document.getElementById("sched-date");
  var schedBox = document.getElementById("schedule");
  var currentChannel = "";
  function showMsg(t) { msg.textContent = t; msg.style.display = "block"; }
  function fmtEpgNow(e) {
    if (!e || !e.title) return "";
    var s = e.startTime ? e.startTime.slice(11, 16) : "", en = e.endTime ? e.endTime.slice(11, 16) : "";
    return "Đang phát: " + e.title + (s && en ? " (" + s + "–" + en + ")" : "");
  }
  function saigonToday() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date()); }
  function saigonNowHHMM() {
    return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
  }
  function esc(s) { return String(s || "").replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function loadSchedule() {
    if (!schedBox) return;
    if (!currentChannel) { schedBox.innerHTML = "<p class='sched-empty'>Chưa có lịch phát</p>"; return; }
    var date = dateInput.value || saigonToday();
    fetch("/api/v1/schedule?date=" + encodeURIComponent(date) + "&channel=" + encodeURIComponent(currentChannel))
      .then(function (r) { return r.json().then(function (d) { return { status: r.status, data: d }; }); })
      .then(function (res) {
        var d = res.data;
        if (res.status !== 200) { schedBox.innerHTML = "<p class='sched-empty'>Không tải được lịch phát sóng (" + esc(d.error || res.status) + ").</p>"; return; }
        // Lich rong (ke ca khi server kem epg_note do vtcaio tra 404 vi kenh
        // radio chua gan lich): hien dung cum nay, khong them note hay canh bao.
        if (!d.items || !d.items.length) { schedBox.innerHTML = "<p class='sched-empty'>Chưa có lịch phát</p>"; return; }
        var today = saigonToday(), now = saigonNowHHMM();
        var rows = d.items.map(function (p) {
          var isNow = (date === today && p.start_time <= now && now < p.end_time);
          return "<div class='sched-row" + (isNow ? " is-now" : "") + "'><span class='sched-time'>" + esc(p.start_time) + "</span><span class='sched-title'>" + esc(p.title) + (isNow ? "<span class='sched-badge'>TRỰC TIẾP</span>" : "") + "</span></div>";
        }).join("");
        schedBox.innerHTML = rows;
        if (date === today) {
          var cur = d.items.filter(function (p) { return p.start_time <= now && now < p.end_time; })[0];
          if (cur && nowEl) nowEl.textContent = "Đang phát: " + cur.title + " (" + cur.start_time + "–" + cur.end_time + ")";
          var currentRow = schedBox.querySelector(".sched-row.is-now");
          if (currentRow) schedBox.scrollTop = Math.max(0, currentRow.offsetTop - 60);
        }
      })
      .catch(function () { schedBox.innerHTML = "<p class='sched-empty'>Không tải được lịch phát sóng. Vui lòng tải lại trang.</p>"; });
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
    var audio = document.getElementById("player");
    if (d.source === "vtcaio") window.playRotating(audio, ch.name, showMsg);
    else window.playDirect(audio, ch.stream_url, showMsg);
    // Nut phat/tam dung lon tren poster dieu khien cung the <audio> nay.
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
