// Phase 2: TV player, nguon chinh vtcaio qua server (khong goi vtcaio truc tiep).
// - Kenh RUNNING loai tv dau tien trong danh muc.
// - Neu source:"vtcaio": phat bang link xoay qua POST /api/v1/stream-token,
//   tu dong xin moi o phut 210 / truoc exp 30 phut (xem stream-player.js).
// - Neu source:"internal" (du phong CMS): phat stream_url truc tiep, khong xoay.
// - Hien epgNow (chuong trinh dang phat) neu danh muc co san, khong can goi EPG.
(function () {
  var msg = document.getElementById("player-msg");
  var nowEl = document.getElementById("now-playing");
  function showMsg(t) { msg.textContent = t; msg.style.display = "block"; }
  function fmtEpgNow(e) {
    if (!e || !e.title) return "";
    var s = e.startTime ? e.startTime.slice(11, 16) : "", en = e.endTime ? e.endTime.slice(11, 16) : "";
    return "Đang phát: " + e.title + (s && en ? " (" + s + "–" + en + ")" : "");
  }
  fetch("/api/v1/channels").then(function (r) { return r.json(); }).then(function (d) {
    if (d.vtcaio_error) showMsg(d.vtcaio_error);
    var ch = (d.items || []).filter(function (c) { return c.kind === "tv" && (!c.status || c.status === "RUNNING"); })[0];
    if (!ch) { document.getElementById("channel-name").textContent = "Chưa có kênh truyền hình đang phát"; showMsg("Không có kênh truyền hình RUNNING trong danh mục vtcaio, và CMS cũng chưa có kênh dự phòng."); return; }
    document.getElementById("channel-name").textContent = ch.name;
    document.getElementById("channel-desc").textContent = ch.description || "";
    if (nowEl && ch.epgNow) nowEl.textContent = fmtEpgNow(ch.epgNow);
    var video = document.getElementById("player");
    if (d.source === "vtcaio") window.playRotating(video, ch.name, showMsg);
    else window.playDirect(video, ch.stream_url, showMsg);
  }).catch(function () { showMsg("Không tải được danh sách kênh. Vui lòng tải lại trang."); });
})();
