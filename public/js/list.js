let page = 1;
async function load() {
  const qs = new URLSearchParams({
    page, type: document.getElementById("type").value,
    q: document.getElementById("q").value, date: document.getElementById("date").value,
  });
  // Trang /bao-in hien chi doc so moi tu he moi (qua proxy /api/v2/epaper);
  // 4 so cu o he cu khong di tru theo quyet dinh ngay 2026-10-27.
  const r = await fetch("/api/v2/epaper?" + qs);
  // Public reader: danh sach so da xuat ban khong can login, khong redirect ve login.
  if (!r.ok) { document.getElementById("list").innerHTML = "<p>Không tải được danh sách số báo.</p>"; return; }
  const data = await r.json();
  document.getElementById("list").innerHTML = data.items.map((it) => `
    <div class="card"><a href="${it.url}">
      <img src="${it.cover}" alt="Bìa ${it.title}">
      <div><b>${it.title}</b></div><div>${it.publish_date} — ${it.page_count} trang</div>
    </a></div>`).join("") || "<p>Không tìm thấy số báo.</p>";
  document.getElementById("pageinfo").textContent =
    `Trang ${data.page}/${data.total_pages} — ${data.total} số`;
  document.getElementById("prev").disabled = page <= 1;
  document.getElementById("next").disabled = page >= data.total_pages;
}
document.getElementById("search").onclick = () => { page = 1; load(); };
document.getElementById("prev").onclick = () => { page--; load(); };
document.getElementById("next").onclick = () => { page++; load(); };
load();
