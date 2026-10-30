// Trang danh sach tuong thuat (/tuong-thuat) — doc qua proxy TSHT
// /api/v2/liveblogs. Chi tuong thuat da xuat ban (backend tu loc
// publishAt <= now).
let page = 1;
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}
function fmtDate(iso) {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  } catch (e) { return String(iso).slice(0, 16); }
}
async function load() {
  const r = await fetch("/api/v2/liveblogs?page=" + page + "&limit=20");
  if (!r.ok) { document.getElementById("list").innerHTML = "<p>Không tải được danh sách tường thuật.</p>"; return; }
  const data = await r.json();
  document.getElementById("list").innerHTML = data.items.map((it) => {
    const evLink = it.event && it.event.slug
      ? "<p class=\"news-meta\"><a href=\"/su-kien/" + esc(it.event.slug) + "\">Sự kiện: " + esc(it.event.title) + "</a>" +
        (it.publishAt ? " · Đăng " + esc(fmtDate(it.publishAt)) : "") + "</p>"
      : (it.publishAt ? "<p class=\"news-meta\">Đăng " + esc(fmtDate(it.publishAt)) + "</p>" : "");
    return "<div class=\"news-card\"><a href=\"" + esc(it.url) + "\">" +
      (it.cover ? "<img src=\"" + esc(it.cover) + "\" alt=\"\" loading=\"lazy\">" : "") +
      "<h3>" + esc(it.title) + "</h3></a>" +
      (it.description ? "<p class=\"news-sapo\">" + esc(it.description) + "</p>" : "") +
      evLink + "</div>";
  }).join("") || "<p>Chưa có tường thuật nào.</p>";
  document.getElementById("pageinfo").textContent =
    "Trang " + data.page + "/" + data.total_pages + " — " + data.total + " tường thuật";
  document.getElementById("prev").disabled = page <= 1;
  document.getElementById("next").disabled = page >= data.total_pages;
}
document.getElementById("prev").onclick = () => { page--; load(); };
document.getElementById("next").onclick = () => { page++; load(); };
load();
