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
(function () {
  "use strict";
  function isSafeLink(url) {
    return typeof url === "string" && /^https?:\/\//i.test(url.trim());
  }
  function renderImage(doc, item) {
    var img = doc.createElement("img");
    img.setAttribute("src", item.imagePath || "");
    img.setAttribute("alt", item.name || "");
    img.setAttribute("loading", "lazy");
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
  function renderHtml(doc, item) {
    var f = doc.createElement("iframe");
    f.setAttribute("sandbox", "allow-scripts allow-popups");
    f.setAttribute("title", item.name || "Quảng cáo");
    f.style.width = "100%";
    f.style.height = "250px";
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
          if (item.type === "html") node = renderHtml(document, item);
          else if (item.imagePath) node = renderImage(document, item);
          if (node) el.appendChild(node);
        });
        if (el.childNodes.length) el.hidden = false;
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
