// Hien thi quang cao toa soan tren portal (goi tiep noi 2B, kieu 1E).
// Slot khai bao trong HTML, mac dinh hidden:
//   <div class="ad-slot" data-ad-placement="home_top" hidden></div>
// Script tu render moi slot khi DOM san; trang bai viet chen them slot
// article_inbody giua than bai roi goi truc tiep TSHTAds.renderSlot.
//
// QUY TAC CUNG (bao mat):
// - Quang cao anh: <img>; chi boc <a> khi linkUrl bat dau http:// hoac
//   https:// — moi dang khac thi anh hien khong link.
// - Quang cao html: CHI trong <iframe sandbox="allow-scripts
//   allow-popups">, KHONG allow-same-origin (origin mo: script doi tac
//   chay duoc nhung khong cham duoc trang cha), noi dung dua qua
//   srcdoc — KHONG BAO GIO gan html cua doi tac vao DOM trang bang
//   innerHTML. Vi origin mo nen khong tu do chieu cao iframe duoc:
//   chieu cao co dinh 250px, rong 100%.
// - Slot khong co quang cao (hoac loi mang) giu nguyen hidden: khong
//   hop trong, khong lam dich layout.
// - Kich thuoc vi tri moi (goi slot trang chu kieu Dien Bien, 8 khoa
//   web_home_*): iframe HTML lay chieu cao dung bang kich thuoc vi tri,
//   container slot lay max-width dung chieu rong vi tri (slot ngang thi
//   can giua, slot phai thi can phai). 5 vi tri cu (home_top,
//   home_sidebar, article_top, article_sidebar, article_inbody) KHONG co
//   trong bang nay nen giu nguyen cach render cu (iframe cao 250px).
//   Anh: max-width 100% (da co trong CSS .ad-slot img) + display block
//   cho vi tri moi, khong crop bang object-fit.
(function () {
  "use strict";
  var PLACEMENT_SIZES = {
    web_home_under_menu: { w: 1200, h: 146 },
    web_home_under_focus: { w: 1200, h: 146 },
    web_home_media_right: { w: 301, h: 238 },
    web_home_under_media: { w: 1200, h: 430 },
    web_home_weather_right: { w: 301, h: 180 },
    web_home_below_weather_1: { w: 301, h: 228 },
    web_home_below_weather_2: { w: 301, h: 300 },
    web_home_focus_right: { w: 263, h: 210 }
  };
  var RIGHT_SLOTS = {
    web_home_media_right: true,
    web_home_weather_right: true,
    web_home_below_weather_1: true,
    web_home_below_weather_2: true,
    web_home_focus_right: true
  };
  function isSafeLink(url) {
    return typeof url === "string" && /^https?:\/\//i.test(url.trim());
  }
  function renderImage(doc, item, placement) {
    var img = doc.createElement("img");
    img.setAttribute("src", item.imagePath || "");
    img.setAttribute("alt", item.name || "");
    img.setAttribute("loading", "lazy");
    if (PLACEMENT_SIZES[placement]) { img.style.display = "block"; img.style.maxWidth = "100%"; }
    if (isSafeLink(item.linkUrl)) {
      var a = doc.createElement("a");
      a.setAttribute("href", item.linkUrl.trim());
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noopener sponsored");
      a.appendChild(img);
      return a;
    }
    return img;
  }
  function renderHtml(doc, item, placement) {
    var f = doc.createElement("iframe");
    f.setAttribute("sandbox", "allow-scripts allow-popups");
    f.setAttribute("title", item.name || "Quảng cáo");
    f.style.width = "100%";
    f.style.height = (PLACEMENT_SIZES[placement] ? PLACEMENT_SIZES[placement].h : 250) + "px";
    f.style.border = "0";
    f.srcdoc = item.htmlContent || "";
    return f;
  }
  function renderSlot(el) {
    var placement = el.getAttribute("data-ad-placement") || "";
    if (!placement) return;
    fetch("/api/v2/ads?placement=" + encodeURIComponent(placement) + "&limit=50")
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (d) {
        var items = (d && d.items) || [];
        if (!items.length) return; // giu hidden
        items.forEach(function (item) {
          var node = null;
          if (item.type === "html") node = renderHtml(document, item, placement);
          else if (item.imagePath) node = renderImage(document, item, placement);
          if (node) el.appendChild(node);
        });
        if (el.childNodes.length) {
          // Chi ap kich thuoc khi slot that su co quang cao (truoc khi
          // bo hidden) de slot rong khong lam dich layout.
          var size = PLACEMENT_SIZES[placement];
          if (size) {
            el.style.maxWidth = size.w + "px";
            if (RIGHT_SLOTS[placement]) {
              el.style.marginLeft = "auto";
              el.style.marginRight = "0";
              el.style.textAlign = "right";
            } else {
              el.style.marginLeft = "auto";
              el.style.marginRight = "auto";
            }
          }
          el.hidden = false;
        }
      })
      .catch(function () { /* loi mang: giu hidden, khong lam vo trang */ });
  }
  function renderAll() {
    document.querySelectorAll("[data-ad-placement]").forEach(renderSlot);
  }
  window.TSHTAds = { renderSlot: renderSlot, renderAll: renderAll, isSafeLink: isSafeLink };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", renderAll);
  else renderAll();
})();
