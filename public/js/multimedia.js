// Khoi Da phuong tien trang chu, nam ngay duoi "Tin tieu diem":
// Truyen hinh / Phat thanh / Lich phat song / Video noi bat.
// Chi dung API that, khong mock cung:
// - GET /api/v1/channels (vtcaio; hien tai dung 2 kenh RUNNING:
//   TUYENQUANG tv + TUYENQUANGRadio radio)
// - POST /api/v1/stream-token + GET /api/v1/live (phat truc tiep,
//   xoay link theo TTL; browser khong bao gio thay partner key)
// - GET /api/v1/schedule?channel=&date= (lich + replay_url xem lai)
// - GET /api/v2/catalog-videos (thu vien video; hien tai chua co
//   video thoi su that nen hang video hien trang thai trong, khong
//   dung tieu de/anh video bia san)
// - GET /api/v2/vod/video/:id/play (link phat VOD khi bam the video)
// Phat lai dung window.playVtcanyLive / playRotating / playTimeshift /
// playDirect tu stream-player.js (giong trang truyen-hinh), trang thai
// lich tinh bang window.LiveEpg.computeStatus (giong live-epg.js).
// API kenh khong co logo: o kenh hien thi bang the chu (monogram +
// ten hien thi), khong lay anh seal "Tuyen Quang Online" lam logo
// kenh (anh do la thuong hieu bao dien tu, khong phai logo kenh).
(function () {
  var root = document.getElementById("multimedia");
  if (!root) return;
  var $ = function (id) { return document.getElementById(id); };
  var tvBox = $("mm-channels-tv"), radioBox = $("mm-channels-radio"), appsBox = $("mm-apps");
  var videoEl = $("mm-video"), audioEl = $("mm-audio"), radioArt = $("mm-radio-art"), radioName = $("mm-radio-name");
  var badgeText = $("mm-badge-text"), liveBtn = $("mm-live-btn"), msgEl = $("mm-msg");
  var dateSel = $("mm-sched-date"), schedList = $("mm-sched-list"), videosBox = $("mm-videos");
  // Cum UNG DUNG: chua co API rieng nen dung link tinh (user cho phep).
  // TSHTgo chua co trang ung dung rieng nen tam tro ve trang chu; khi
  // co URL app that thi sua 1 dong o day.
  var APPS = [
    { name: "TSHTgo", url: "/", external: false, title: "Xem trên web" },
    { name: "VTVgo", url: "https://vtvgo.vn/", external: true, title: "Mở VTVgo" },
  ];
  // Ten hien thi (chi de hien thi; ten kenh API moi la khoa goi API).
  var LABELS = { TUYENQUANG: "Tuyên Quang TV", TUYENQUANGRadio: "Tuyên Quang Radio" };
  var MONOGRAM = { TUYENQUANG: "TQ", TUYENQUANGRadio: "TQR" };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function saigonToday() {
    if (window.LiveEpg && window.LiveEpg.saigonToday) return window.LiveEpg.saigonToday();
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
  }
  function addDays(iso, n) {
    var d = new Date(iso + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  function fmtVN(iso) {
    var p = (iso || "").split("-");
    return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : iso;
  }
  function labelOf(ch) { return LABELS[ch.name] || ch.name; }
  function monoOf(ch) { return MONOGRAM[ch.name] || String(ch.name || "?").replace(/radio$/i, "").slice(0, 3).toUpperCase(); }
  function glyphOf(ch) { return ch.kind === "radio" ? "📻" : "📺"; }
  function showMsg(t) { if (!msgEl) return; msgEl.textContent = t; msgEl.style.display = t ? "block" : "none"; }
  function statusOf(p, date) {
    if (window.LiveEpg && window.LiveEpg.computeStatus) return window.LiveEpg.computeStatus(p, date);
    var now = Date.now();
    var s = p.startTime ? new Date(p.startTime).getTime() : NaN;
    var e = p.endTime ? new Date(p.endTime).getTime() : NaN;
    if (Number.isFinite(s) && s > now) return "UPCOMING";
    if (Number.isFinite(e) && e < now) return "REPLAY";
    return "LIVE";
  }
  function replayKey(p) {
    if (window.LiveEpg && window.LiveEpg.replayKey) return window.LiveEpg.replayKey(p);
    return (p.startTime || p.start_time || "") + "|" + (p.title || "");
  }

  var channels = [], current = null, selectedDate = saigonToday();
  var mode = "live"; // live | replay | video
  var liveHandle = null, replayHandle = null, videoHandle = null, replayingKey = null, replayTitle = "", videoTitle = "";
  var lastItems = null, lastMeta = null;

  function stopAll() {
    if (liveHandle) { try { liveHandle.stop(); } catch (e) {} liveHandle = null; }
    if (replayHandle) { try { replayHandle.stop(); } catch (e) {} replayHandle = null; }
    if (videoHandle) { try { videoHandle.stop(); } catch (e) {} videoHandle = null; }
  }
  function setMode(m) {
    mode = m;
    if (liveBtn) liveBtn.style.display = (m === "live") ? "none" : "inline-block";
  }
  function setBadgeLive(liveItem) {
    if (!badgeText) return;
    if (liveItem) {
      badgeText.textContent = "🕐 " + (liveItem.start_time || "") + " · " + liveItem.title;
    } else if (current && current.epgNow && current.epgNow.title) {
      var s = current.epgNow.startTime ? current.epgNow.startTime.slice(11, 16) : "";
      badgeText.textContent = "🕐 " + (s ? s + " · " : "") + current.epgNow.title;
    } else if (current) {
      badgeText.textContent = "● LIVE · " + labelOf(current);
    } else {
      badgeText.textContent = "";
    }
  }
  function setBadgeReplay() { if (badgeText) badgeText.textContent = "ĐANG XEM LẠI · " + replayTitle; }
  function setBadgeVideo() { if (badgeText) badgeText.textContent = "ĐANG PHÁT VIDEO · " + videoTitle; }

  function showMediaFor(ch) {
    var isRadio = ch.kind === "radio";
    if (videoEl) videoEl.style.display = isRadio ? "none" : "block";
    if (radioArt) radioArt.style.display = isRadio ? "flex" : "none";
    if (audioEl) audioEl.style.display = isRadio ? "block" : "none";
    if (isRadio && radioName) radioName.textContent = labelOf(ch);
    // Nen radio: banner cua kenh tu CMS (neu co) thay gradient cung;
    // khong co banner thi giu gradient + song am nhu truoc.
    if (radioArt) {
      if (isRadio && ch.banner_url) {
        radioArt.style.backgroundImage = "url(\"" + String(ch.banner_url).replace(/"/g, "") + "\")";
        radioArt.style.backgroundSize = "cover";
        radioArt.style.backgroundPosition = "center";
        radioArt.classList.add("has-banner");
      } else {
        radioArt.style.backgroundImage = "";
        radioArt.classList.remove("has-banner");
      }
    }
  }
  function startLive() {
    stopAll();
    setMode("live");
    replayingKey = null;
    if (!current) return;
    showMediaFor(current);
    var media = current.kind === "radio" ? audioEl : videoEl;
    if (!media) return;
    var fallback = function () {
      if (window.playRotating) liveHandle = window.playRotating(media, current.name, showMsg);
      else showMsg("Không tải được trình phát. Vui lòng tải lại trang.");
    };
    if (window.playVtcanyLive) liveHandle = window.playVtcanyLive(media, current.name, showMsg, fallback);
    else fallback();
  }
  function backToLive() {
    // Thu tu quan trong: startLive() xoa replayingKey truoc, roi moi
    // ve lai lich — nguoc lai dong vua xem van giu nhan "Dang xem"
    // (quirk thay tren live sau khi bam nut LIVE).
    startLive();
    renderSchedule();
    if (selectedDate === saigonToday() && lastItems) {
      var live = null;
      for (var i = 0; i < lastItems.length; i++) { if (statusOf(lastItems[i], selectedDate) === "LIVE") { live = lastItems[i]; break; } }
      setBadgeLive(live);
    } else {
      setBadgeLive(null);
    }
  }
  function onReplay(item) {
    if (!item.replay_url) return;
    // Kiem tra truoc khi dung live: timeshift loi thi giu nguyen live
    // dang phat va bao ro ly do (giong trang truyen-hinh).
    var ctrl = (typeof AbortController !== "undefined") ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 45000) : null;
    fetch(item.replay_url, ctrl ? { signal: ctrl.signal } : {})
      .then(function (r) {
        if (timer) clearTimeout(timer);
        if (!r.ok) return r.json().catch(function () { return {}; }).then(function (d) { throw new Error(d.error || "khoảng giờ này không có bản ghi"); });
        stopAll();
        replayingKey = replayKey(item);
        replayTitle = item.title;
        setMode("replay");
        setBadgeReplay();
        showMediaFor(current);
        var media = current && current.kind === "radio" ? audioEl : videoEl;
        if (media && window.playTimeshift) replayHandle = window.playTimeshift(media, item.replay_url, showMsg);
        renderSchedule();
      })
      .catch(function (e) {
        if (timer) clearTimeout(timer);
        var why = (e && e.name === "AbortError") ? "quá thời gian chờ" : (e && e.message ? e.message : "lỗi mạng");
        showMsg("Không xem lại được (" + why + "). Đang tiếp tục phát trực tiếp.");
      });
  }

  function buildDateOptions() {
    if (!dateSel) return;
    var today = saigonToday();
    var html = "";
    for (var d = -2; d <= 7; d++) {
      var iso = addDays(today, d);
      html += "<option value=\"" + iso + "\"" + (iso === selectedDate ? " selected" : "") + ">" + fmtVN(iso) + (iso === today ? " · Hôm nay" : "") + "</option>";
    }
    dateSel.innerHTML = html;
  }
  // Khoa chieu cao khung lich bang dung cot Player tren desktop.
  // Ly do phai do bang JS: grid auto-row gian theo noi dung day du
  // cua danh sach du co flex:1 + overflow (flex khong cat duoc kich
  // thuoc content cua grid item khi track la auto) — dung anh live
  // 2026-11-03 10:01: cot lich keo dai tu 05:20 den toi, de trong
  // khoang lon duoi Player. Do truc tiep offsetHeight cot Player
  // roi gan max-height cho list; ResizeObserver giu dung khi badge /
  // thong bao doi chieu cao hoac cua so resize. Mobile (<=900px)
  // de CSS lo (max-height 360px), khong dong bo.
  var playerBox = root.querySelector(".mm-player"), schedHead = root.querySelector(".mm-sched-head");
  function syncSchedHeight() {
    if (!schedList || !playerBox || !schedHead) return;
    if (window.matchMedia && !window.matchMedia("(min-width: 901px)").matches) { schedList.style.maxHeight = ""; return; }
    var avail = playerBox.offsetHeight - schedHead.offsetHeight - 10; // tru margin-top 0.6rem cua list
    schedList.style.maxHeight = Math.max(120, avail) + "px";
  }
  function scrollListToLive() {
    if (!schedList) return;
    // Chi cuon khung lich, tuyet doi khong cuon trang (bai hoc hero).
    if (schedList.scrollHeight <= schedList.clientHeight + 10) return;
    var rows = schedList.querySelectorAll(".mm-row");
    var currentRow = null;
    for (var i = 0; i < rows.length; i++) { if (rows[i].classList.contains("is-now")) { currentRow = rows[i]; break; } }
    if (!currentRow) return;
    // Dua dong dang phat ve chinh giua vung nhin cua khung lich khi
    // mo trang (thay vi chi hien 2 dong phia tren nhu truoc).
    var maxScroll = schedList.scrollHeight - schedList.clientHeight;
    var delta = currentRow.getBoundingClientRect().top - schedList.getBoundingClientRect().top;
    var target = schedList.scrollTop + delta - (schedList.clientHeight - currentRow.offsetHeight) / 2;
    schedList.scrollTop = Math.max(0, Math.min(target, maxScroll));
  }
  function renderSchedule() {
    if (!schedList) return;
    var items = lastItems || [];
    var date = (lastMeta && lastMeta.date) || selectedDate;
    var today = saigonToday();
    if (!items.length) {
      var empty = (current && current.kind === "radio")
        ? "Chưa có lịch phát."
        : ((lastMeta && lastMeta.note) || "Chưa có lịch phát sóng cho ngày đã chọn.");
      schedList.innerHTML = "<p class=\"mm-sched-empty\">" + esc(empty) + "</p>";
      return;
    }
    var html = "";
    for (var i = 0; i < items.length; i++) {
      var p = items[i];
      var st = statusOf(p, date);
      var isNow = st === "LIVE" && date === today;
      var isReplaying = replayingKey && replayKey(p) === replayingKey;
      var action = "";
      if (isReplaying) {
        action = "<span class=\"mm-row-state\">Đang xem</span>";
      } else if (st === "REPLAY" && p.replay_url) {
        action = "<span class=\"mm-row-state mm-replay\">Xem lại</span>";
      } else if (st === "REPLAY" && lastMeta && lastMeta.timeshift_available === false && lastMeta.timeshift_unknown === false) {
        action = "<span class=\"mm-row-state mm-norecord\">Không có bản ghi</span>";
      }
      var clickable = (st === "REPLAY" && !!p.replay_url) || (isNow && mode !== "live");
      var tag = clickable ? "button type=\"button\"" : "div";
      html += "<" + tag + " class=\"mm-row" + (isNow ? " is-now" : "") + (isReplaying ? " is-replaying" : "") + "\" data-i=\"" + i + "\">" +
        "<span class=\"mm-time\">" + esc(p.start_time || "") + "</span>" +
        "<span class=\"mm-row-main\"><span class=\"mm-row-name\">" + esc(p.title) + "</span>" +
        (p.description ? "<span class=\"mm-row-desc\">" + esc(p.description) + "</span>" : "") + "</span>" +
        (isNow ? "<span class=\"mm-row-live\">((•))</span>" : "") +
        (action ? "<span class=\"mm-row-action\">" + action + "</span>" : "") +
        "</" + (clickable ? "button" : "div") + ">";
    }
    schedList.innerHTML = html;
    var rows = schedList.querySelectorAll(".mm-row[data-i]");
    for (var j = 0; j < rows.length; j++) {
      (function (row) {
        if (row.tagName !== "BUTTON") return;
        row.addEventListener("click", function () {
          var p = items[Number(row.getAttribute("data-i"))];
          if (!p) return;
          if (p.replay_url && statusOf(p, date) === "REPLAY") onReplay(p);
          else if (statusOf(p, date) === "LIVE" && date === today) backToLive();
        });
      })(rows[j]);
    }
    // Khoa chieu cao truoc roi moi cuon: tam nhin dung thi diem giua
    // moi tinh dung.
    syncSchedHeight();
    // Chi tu cuon ve dong dang phat khi dang xem live ngay hom nay;
    // dang xem lai / xem video thi khong giat khung lich.
    if (date === today && mode === "live") scrollListToLive();
  }
  function loadSchedule() {
    if (!schedList || !current) { if (schedList) schedList.innerHTML = "<p class=\"mm-sched-empty\">Chưa có lịch phát sóng cho ngày đã chọn.</p>"; return; }
    var date = dateSel ? (dateSel.value || selectedDate) : selectedDate;
    selectedDate = date;
    schedList.innerHTML = "<p class=\"mm-sched-empty\">Đang tải lịch phát sóng…</p>";
    fetch("/api/v1/schedule?channel=" + encodeURIComponent(current.name) + "&date=" + encodeURIComponent(date))
      .then(function (r) { return r.json().then(function (d) { return { status: r.status, data: d }; }); })
      .then(function (res) {
        var d = res.data || {};
        if (res.status !== 200) { schedList.innerHTML = "<p class=\"mm-sched-empty\">Không tải được lịch phát sóng (" + esc(d.error || res.status) + ").</p>"; return; }
        if (d.fallback_warning) showMsg(d.fallback_warning);
        lastItems = d.items || [];
        lastMeta = { date: date, timeshift_available: d.timeshift_available, timeshift_unknown: d.timeshift_unknown, note: d.epg_note || null };
        renderSchedule();
        // Badge chi cap nhat theo lich khi dang xem live; dang xem lai /
        // xem video thi giu nguyen tieu de dang xem.
        if (mode === "live") {
          if (date === saigonToday()) {
            var live = null;
            for (var i = 0; i < lastItems.length; i++) { if (statusOf(lastItems[i], date) === "LIVE") { live = lastItems[i]; break; } }
            setBadgeLive(live);
          } else {
            setBadgeLive(null);
          }
        }
      })
      .catch(function () { schedList.innerHTML = "<p class=\"mm-sched-empty\">Không tải được lịch phát sóng (lỗi mạng).</p>"; });
  }
  function renderChannels() {
    function group(list, box, kindLabel) {
      if (!box) return;
      if (!list.length) { box.innerHTML = ""; return; }
      // Khong con o ten kenh + logo: chinh dong tieu de loai kenh
      // (TRUYEN HINH / PHAT THANH) lam nut chon kenh. Hien moi loai
      // chi co 1 kenh nen nut chon kenh dau tien cua nhom.
      var selected = false;
      for (var s = 0; s < list.length; s++) { if (current && current.name === list[s].name) { selected = true; break; } }
      // Logo kenh quay lai, nam ben trai dong tieu de; van khong
      // co ten kenh dang tile. Anh loi thi roi ve monogram chu.
      var ch0 = list[0];
      var mark = ch0.logo
        ? "<img class=\"mm-ch-logo\" src=\"" + esc(ch0.logo) + "\" alt=\"\" onerror=\"this.parentNode.classList.remove('has-logo');this.parentNode.textContent='" + esc(monoOf(ch0)) + "'\">"
        : esc(monoOf(ch0));
      box.innerHTML = "<button type=\"button\" class=\"mm-ch-head" + (selected ? " selected" : "") + "\">" +
        "<span class=\"mm-ch-mark" + (ch0.logo ? " has-logo" : "") + "\">" + mark + "</span>" +
        "<span class=\"mm-ch-head-text\">" + kindLabel + "</span></button>";
      var head = box.querySelector(".mm-ch-head");
      head.addEventListener("click", function () { selectChannel(list[0]); });
    }
    var tvs = [], radios = [];
    for (var i = 0; i < channels.length; i++) {
      if (channels[i].kind === "radio") radios.push(channels[i]); else tvs.push(channels[i]);
    }
    group(tvs, tvBox, "TRUYỀN HÌNH");
    group(radios, radioBox, "PHÁT THANH");
    if (appsBox) {
      var html = "<h3>ỨNG DỤNG</h3>";
      for (var a = 0; a < APPS.length; a++) {
        var ap = APPS[a];
        html += "<a class=\"mm-app\" href=\"" + esc(ap.url) + "\"" + (ap.external ? " target=\"_blank\" rel=\"noopener\"" : "") + " title=\"" + esc(ap.title) + "\">" +
          "<span class=\"mm-ch-mark\">" + esc(ap.name.replace(/go$/i, "")) + "</span>" +
          "<span class=\"mm-ch-name\">" + esc(ap.name) + "</span></a>";
      }
      appsBox.innerHTML = html;
    }
  }
  function selectChannel(ch) {
    current = ch;
    renderChannels();
    // Doi kenh luon ve live cua kenh moi (khong giu trang thai xem lai
    // cua kenh cu).
    startLive();
    // Badge tam theo epgNow cua kenh moi; loadSchedule se dong bo lai
    // theo lich dung ngay khi lich ve.
    setBadgeLive(null);
    loadSchedule();
  }
  function loadVideos() {
    if (!videosBox) return;
    videosBox.innerHTML = "<p class=\"mm-videos-empty\">Đang tải video…</p>";
    fetch("/api/v2/catalog-videos?limit=4")
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var items = (d && d.items) || [];
        if (!items.length) {
          videosBox.innerHTML = "<p class=\"mm-videos-empty\">Chưa có video.</p>";
          return;
        }
        videosBox.innerHTML = items.map(function (it) {
          var thumb = it.thumbnail
            ? "<img src=\"" + esc(it.thumbnail) + "\" alt=\"\" loading=\"lazy\">"
            : "<span class=\"mm-thumb-fallback\">▶</span>";
          return "<button type=\"button\" class=\"mm-video-card\" data-id=\"" + esc(it.publicId) + "\" aria-label=\"" + esc(it.title) + "\">" +
            "<span class=\"mm-thumb\">" + thumb + "</span>" +
            "<span class=\"mm-video-title\">" + esc(it.title) + "</span></button>";
        }).join("");
        var cards = videosBox.querySelectorAll(".mm-video-card");
        for (var i = 0; i < cards.length; i++) {
          (function (card) {
            card.addEventListener("click", function () { playCatalogVideo(card.getAttribute("data-id")); });
          })(cards[i]);
        }
      })
      .catch(function () { videosBox.innerHTML = "<p class=\"mm-videos-empty\">Chưa tải được danh sách video.</p>"; });
  }
  function playCatalogVideo(publicId) {
    var card = videosBox ? videosBox.querySelector(".mm-video-card[data-id=\"" + publicId + "\"]") : null;
    var title = card ? card.getAttribute("aria-label") : "";
    fetch("/api/v2/vod/video/" + encodeURIComponent(publicId) + "/play")
      .then(function (r) { return r.json().then(function (d) { return { status: r.status, data: d }; }); })
      .then(function (res) {
        if (res.status !== 200 || !res.data.url) { showMsg("Không phát được video này (" + (res.data.error || res.status) + ")."); return; }
        stopAll();
        videoTitle = title;
        setMode("video");
        setBadgeVideo();
        if (videoEl) videoEl.style.display = "block";
        if (radioArt) radioArt.style.display = "none";
        if (audioEl) audioEl.style.display = "none";
        if (videoEl && window.playDirect) videoHandle = window.playDirect(videoEl, res.data.url, showMsg);
        else showMsg("Không tải được trình phát. Vui lòng tải lại trang.");
      })
      .catch(function () { showMsg("Không phát được video này (lỗi mạng)."); });
  }
  if (liveBtn) liveBtn.addEventListener("click", backToLive);
  if (dateSel) dateSel.addEventListener("change", function () {
    // Doi ngay chi tai lai lich, tuyet doi khong cham vao player
    // (ke ca khi dang xem lai) — giong trang truyen-hinh.
    loadSchedule();
  });
  if (audioEl) {
    audioEl.addEventListener("play", function () { if (radioArt) radioArt.classList.add("playing"); });
    audioEl.addEventListener("pause", function () { if (radioArt) radioArt.classList.remove("playing"); });
  }
  // Theo doi chieu cao cot Player de khoa khung lich theo dung (ke
  // ca khi badge doi chu hoac thong bao hien/an); chi dong bo, khong
  // tu cuon lai khi resize de khoi giat vi tri nguoi dang xem lich.
  if (window.ResizeObserver && playerBox) {
    new ResizeObserver(function () { syncSchedHeight(); }).observe(playerBox);
  }
  syncSchedHeight();
  buildDateOptions();
  fetch("/api/v1/channels")
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (d.vtcaio_error) showMsg(d.vtcaio_error);
      channels = (d.items || []).filter(function (c) { return !c.status || c.status === "RUNNING"; });
      if (!channels.length) { showMsg("Không có kênh đang phát."); loadVideos(); return; }
      var firstTv = null, first = channels[0];
      for (var i = 0; i < channels.length; i++) { if (channels[i].kind !== "radio") { firstTv = channels[i]; break; } }
      current = firstTv || first;
      renderChannels();
      startLive();
      setBadgeLive(null);
      loadSchedule();
      loadVideos();
    })
    .catch(function () { showMsg("Không tải được danh sách kênh. Vui lòng tải lại trang."); loadVideos(); });
})();
