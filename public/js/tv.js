// Phase 2: TV player, nguon chinh vtcaio qua server (khong goi vtcaio truc tiep).
// - Kenh RUNNING loai tv dau tien trong danh muc.
// - Neu source:"vtcaio": phat bang link xoay qua POST /api/v1/stream-token,
//   tu dong xin moi o phut 210 / truoc exp 30 phut (xem stream-player.js).
// - Neu source:"internal" (du phong CMS): phat stream_url truc tiep, khong xoay.
// - Hien epgNow (chuong trinh dang phat) neu danh muc co san, khong can goi EPG.
// - Cot lich ben phai: GET /api/v1/schedule?channel=<NAME>&date=... . Doi ngay
//   chi tai lai cot lich, khong khoi dong lai player. Hang lich chi de xem,
//   khong phat lai (chua co catch-up).
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
    if (!currentChannel) { schedBox.innerHTML = "<p class='sched-empty'>Chưa có lịch phát sóng cho ngày đã chọn.</p>"; return; }
    var date = dateInput.value || saigonToday();
    fetch("/api/v1/schedule?date=" + encodeURIComponent(date) + "&channel=" + encodeURIComponent(currentChannel))
      .then(function (r) { return r.json().then(function (d) { return { status: r.status, data: d }; }); })
      .then(function (res) {
        var d = res.data;
        // Loi tai lich (khac voi lich rong): bao ro, khong nham voi "chua co lich".
        if (res.status !== 200) { schedBox.innerHTML = "<p class='sched-empty'>Không tải được lịch phát sóng (" + esc(d.error || res.status) + ").</p>"; return; }
        if (!d.items || !d.items.length) { schedBox.innerHTML = "<p class='sched-empty'>Chưa có lịch phát sóng cho ngày đã chọn.</p>"; return; }
        var today = saigonToday(), now = saigonNowHHMM(), currentRow = null;
        var rows = d.items.map(function (p) {
          var isNow = (date === today && p.start_time <= now && now < p.end_time);
          return "<div class='sched-row" + (isNow ? " is-now" : "") + "'><span class='sched-time'>" + esc(p.start_time) + "</span><span class='sched-title'>" + esc(p.title) + (isNow ? "<span class='sched-badge'>TRỰC TIẾP</span>" : "") + "</span></div>";
        }).join("");
        schedBox.innerHTML = rows;
        if (date === today) {
          var cur = d.items.filter(function (p) { return p.start_time <= now && now < p.end_time; })[0];
          if (cur && nowEl) nowEl.textContent = "Đang phát: " + cur.title + " (" + cur.start_time + "–" + cur.end_time + ")";
          currentRow = schedBox.querySelector(".sched-row.is-now");
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
    var ch = (d.items || []).filter(function (c) { return c.kind === "tv" && (!c.status || c.status === "RUNNING"); })[0];
    if (!ch) { document.getElementById("channel-name").textContent = "Chưa có kênh truyền hình đang phát"; showMsg("Không có kênh truyền hình RUNNING trong danh mục vtcaio, và CMS cũng chưa có kênh dự phòng."); loadSchedule(); return; }
    document.getElementById("channel-name").textContent = ch.name;
    document.getElementById("channel-desc").textContent = ch.description || "";
    if (nowEl && ch.epgNow) nowEl.textContent = fmtEpgNow(ch.epgNow);
    currentChannel = ch.name;
    var video = document.getElementById("player");
    if (d.source === "vtcaio") window.playRotating(video, ch.name, showMsg);
    else window.playDirect(video, ch.stream_url, showMsg);
    loadSchedule();
  }).catch(function () { showMsg("Không tải được danh sách kênh. Vui lòng tải lại trang."); });
})();
