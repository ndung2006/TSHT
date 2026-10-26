// Phase 2: Radio player — cung co che link xoay nhu TV (tai lieu v1.0 muc 5),
// chi khac la luong chi co am thanh (preset paudio/paudio64 o phia cap nguon).
// Phan biet radio o day dua vao kind:"radio" do server da chuan hoa tu preset
// (neu response co truong kind rieng thi server uu tien truong do).
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
    var ch = (d.items || []).filter(function (c) { return c.kind === "radio" && (!c.status || c.status === "RUNNING"); })[0];
    if (!ch) { document.getElementById("channel-name").textContent = "Chưa có kênh phát thanh đang phát"; showMsg("Không có kênh phát thanh RUNNING trong danh mục vtcaio, và CMS cũng chưa có kênh dự phòng."); return; }
    document.getElementById("channel-name").textContent = ch.name;
    document.getElementById("channel-desc").textContent = ch.description || "";
    if (nowEl && ch.epgNow) nowEl.textContent = fmtEpgNow(ch.epgNow);
    var audio = document.getElementById("player");
    if (d.source === "vtcaio") window.playRotating(audio, ch.name, showMsg);
    else window.playDirect(audio, ch.stream_url, showMsg);
  }).catch(function () { showMsg("Không tải được danh sách kênh. Vui lòng tải lại trang."); });
})();
