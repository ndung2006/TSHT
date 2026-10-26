// Phase 2: Lich phat song (EPG) tu vtcaio qua server.
// - Nguon chinh: GET /api/v1/schedule?channel=<NAME>&date=YYYY-MM-DD (ten kenh
//   viet hoa khong dau, gio Asia/Ho_Chi_Minh). Trang nay chon kenh tu danh muc
//   /api/v1/channels (chi kenh RUNNING), mac dinh kenh TV dau tien.
// - Cua so EPG: hom nay + 2 ngay truoc + 7 ngay toi. Ngoai cua so, API tra
//   items:[] kem epg_note (khong phai loi 500) — hien nguyen note do.
// - programs:[] cung co the chi la "ngay do chua co du lieu" (dong bo theo
//   ngay), khong phai loi — hien epg_note tuong ung, khong bao "loi".
// - Chuong trinh dang phat: start <= gio hien tai (Saigon) < end, chi khi xem
//   ngay hom nay. Neu khong can goi EPG, co the dung epgNow trong danh muc.
(function () {
  var dateInput = document.getElementById("sched-date");
  var chanSel = document.getElementById("sched-channel");
  var box = document.getElementById("schedule");
  function saigonToday() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date()); }
  function saigonNowHHMM() {
    return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
  }
  function esc(s) { return String(s || "").replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function load() {
    var date = dateInput.value || saigonToday();
    var channel = chanSel.value || "";
    if (!channel) { box.innerHTML = "<p>Chưa có kênh đang phát để xem lịch.</p>"; return; }
    fetch("/api/v1/schedule?date=" + encodeURIComponent(date) + "&channel=" + encodeURIComponent(channel))
      .then(function (r) { return r.json().then(function (d) { return { status: r.status, data: d }; }); })
      .then(function (res) {
        var d = res.data;
        if (res.status !== 200) { box.innerHTML = "<p>Không tải được lịch phát sóng (" + esc(d.error || res.status) + ").</p>"; return; }
        var warn = d.vtcaio_error ? "<p class='note'>" + esc(d.vtcaio_error) + "</p>" : "";
        var note = d.epg_note ? "<p class='note'>" + esc(d.epg_note) + "</p>" : "";
        if (!d.items || !d.items.length) { box.innerHTML = warn + note + "<p>Chưa có lịch phát sóng cho kênh này trong ngày đã chọn.</p>"; return; }
        var today = saigonToday(), now = saigonNowHHMM();
        var rows = d.items.map(function (p) {
          var isNow = (date === today && p.start_time <= now && now < p.end_time);
          return "<tr" + (isNow ? ' style="background:#fff7cc"' : "") + "><td>" + esc(p.start_time) + "–" + esc(p.end_time) + "</td><td>" + esc(p.title) + (isNow ? " • Đang phát" : "") + "</td><td>" + esc(p.description) + "</td></tr>";
        }).join("");
        box.innerHTML = warn + note + "<table style='width:100%;border-collapse:collapse;background:#fff'><thead><tr><th style='text-align:left'>Giờ</th><th style='text-align:left'>Chương trình</th><th style='text-align:left'>Mô tả</th></tr></thead><tbody>" + rows + "</tbody></table>";
      })
      .catch(function () { box.innerHTML = "<p>Không tải được lịch phát sóng. Vui lòng tải lại trang.</p>"; });
  }
  dateInput.value = saigonToday();
  fetch("/api/v1/channels").then(function (r) { return r.json(); }).then(function (d) {
    var running = (d.items || []).filter(function (c) { return !c.status || c.status === "RUNNING"; });
    if (d.vtcaio_error) box.innerHTML = "<p class='note'>" + esc(d.vtcaio_error) + "</p>";
    if (!running.length) { chanSel.innerHTML = "<option value=''>— Chưa có kênh —</option>"; load(); return; }
    chanSel.innerHTML = running.map(function (c) { return "<option value='" + esc(c.name) + "'>" + esc(c.name) + " (" + (c.kind === "radio" ? "Phát thanh" : "Truyền hình") + ")" + (c.epgNow && c.epgNow.title ? " — đang phát: " + esc(c.epgNow.title) : "") + "</option>"; }).join("");
    var firstTv = running.filter(function (c) { return c.kind === "tv"; })[0];
    chanSel.value = firstTv ? firstTv.name : running[0].name;
    load();
  }).catch(function () { box.innerHTML = "<p>Không tải được danh sách kênh. Vui lòng tải lại trang.</p>"; });
  chanSel.onchange = load;
  dateInput.onchange = load;
})();
