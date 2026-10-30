// Trang danh sach su kien (/su-kien) — doc qua proxy TSHT /api/v2/events.
// Chi su kien da xuat ban (backend tu loc publishAt <= now).
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
function fmtRange(s, e) {
  if (!s) return "";
  return e ? fmtDate(s) + " — " + fmtDate(e) : fmtDate(s);
}
async function load() {
  const r = await fetch("/api/v2/events?page=" + page + "&limit=20");
  if (!r.ok) { document.getElementById("list").innerHTML = "<p>Không tải được danh sách sự kiện.</p>"; return; }
  const data = await r.json();
  document.getElementById("list").innerHTML = data.items.map((it) => {
    const meta = [];
    if (it.category && it.category.name) meta.push(it.category.name);
    const range = fmtRange(it.startsAt, it.endsAt);
    if (range) meta.push(range);
    if (it.publishAt) meta.push("Đăng " + fmtDate(it.publishAt));
    return "<div class=\"news-card\"><a href=\"" + esc(it.url) + "\">" +
      (it.cover ? "<img src=\"" + esc(it.cover) + "\" alt=\"\" loading=\"lazy\">" : "") +
      "<h3>" + esc(it.title) + "</h3></a>" +
      (it.description ? "<p class=\"news-sapo\">" + esc(it.description) + "</p>" : "") +
      (meta.length ? "<p class=\"news-meta\">" + esc(meta.join(" · ")) + "</p>" : "") + "</div>";
  }).join("") || "<p>Chưa có sự kiện nào.</p>";
  document.getElementById("pageinfo").textContent =
    "Trang " + data.page + "/" + data.total_pages + " — " + data.total + " sự kiện";
  document.getElementById("prev").disabled = page <= 1;
  document.getElementById("next").disabled = page >= data.total_pages;
}
document.getElementById("prev").onclick = () => { page--; load(); };
document.getElementById("next").onclick = () => { page++; load(); };
load();
