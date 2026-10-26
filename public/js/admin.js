// CMS FE (Stage 2). All permission checks live on the server (H2);
// this page only hides buttons the current role cannot use.
let ME = null;
async function api(path, opts = {}) {
  const r = await fetch(path, opts);
  if (r.status === 401) { location.href = "/login.html"; throw new Error("unauthorized"); }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  return data;
}
const CHECKS = [
  ["check_number_date", "Số/ngày đúng"], ["check_open_fast", "Mở < 3 giây"],
  ["check_flip_all_pages", "Lật hết trang"], ["check_zoom_title_clear", "Zoom đọc rõ tít trang 1"],
  ["check_thumbnails_full", "Thumbnail đủ"], ["check_mobile_ok", "Thử mobile"],
];
async function loadIssues() {
  const qs = new URLSearchParams({ status: document.getElementById("status").value, q: document.getElementById("q").value, page: 1 });
  const data = await api("/api/v1/issues?" + qs);
  document.getElementById("issues").innerHTML = data.items.map((it) => `
    <div class="card" style="max-width:720px">
      <b>${it.title}</b> — ${it.issue_type} — ${it.publish_date} — ${it.page_count} trang — <b>${it.status}</b>
      <div><a href="${it.url}" target="_blank">Xem trước / đọc</a>
      ${it.status === "draft" && (ME.role === "publisher" || ME.role === "admin") ? `<button data-act="submit" data-id="${it.id}">Gửi duyệt</button>` : ""}
      ${it.status === "pending_review" && (ME.role === "reviewer" || ME.role === "admin") ? `<button data-act="publish" data-id="${it.id}">Xuất bản</button> <button data-act="reject" data-id="${it.id}">Trả lại nháp</button>` : ""}
      ${it.status === "published" && (ME.role === "reviewer" || ME.role === "admin") ? `<button data-act="unpublish" data-id="${it.id}">Gỡ xuống</button>` : ""}
      ${ME.role === "admin" ? `<button data-act="replace-pdf" data-id="${it.id}">Thay PDF</button>` : ""}
      ${it.status === "unpublished" && (ME.role === "reviewer" || ME.role === "admin") ? `<button data-act="publish" data-id="${it.id}">Xuất bản lại</button>` : ""}
      </div>
      <div class="checks" data-id="${it.id}">${CHECKS.map(([k, label]) => `<label><input type="checkbox" data-k="${k}"> ${label}</label>`).join(" ")}
      <button data-act="checklist" data-id="${it.id}">Lưu checklist</button></div>
      <div><button data-act="audit" data-id="${it.id}">Xem nhật ký</button> <span class="audit" data-id="${it.id}"></span></div>
    </div>`).join("") || "<p>Không có số nào.</p>";
  // Fill checklists for staff-visible issues (detail call per issue is cheap at 15/page).
  for (const it of data.items) {
    try {
      const d = await api(`/api/v1/issues/${it.id}`);
      if (d.checklist) for (const [k] of CHECKS) {
        const box = document.querySelector(`.checks[data-id="${it.id}"] input[data-k="${k}"]`);
        if (box) box.checked = !!d.checklist[k];
      }
    } catch { /* reader-role preview: skip */ }
  }
  document.querySelectorAll("[data-act]").forEach((btn) => btn.onclick = async () => {
    const id = btn.dataset.id, act = btn.dataset.act;
    try {
      if (act === "audit") {
        const d = await api(`/api/v1/issues/${id}/audit`);
        document.querySelector(`.audit[data-id="${id}"]`).textContent =
          d.items.map((a) => `${a.created_at} ${a.username || "?"}: ${a.action}`).join(" | ") || "(chưa có)";
      } else if (act === "replace-pdf") {
        const reason = prompt("Lý do thay PDF (bắt buộc):", "Thay file mẫu bằng file thật");
        if (!reason || !reason.trim()) return;
        const title = prompt("Tiêu đề mới (để trống = giữ nguyên tiêu đề cũ):", "");
        const pick = document.createElement("input");
        pick.type = "file"; pick.accept = "application/pdf";
        pick.onchange = async () => {
          if (!pick.files.length) return;
          const fd = new FormData();
          fd.append("pdf", pick.files[0]);
          fd.append("change_reason", reason.trim());
          if (title && title.trim()) fd.append("title", title.trim());
          try {
            const d = await api(`/api/v1/issues/${id}/replace-pdf`, { method: "POST", body: fd });
            alert(`Đã thay PDF số ${d.issue_number} (${d.page_count} trang, trạng thái ${d.status}). Xử lý: ${d.processing ? d.processing.status : "?"}`);
            await loadIssues();
          } catch (e) { alert(e.message); }
        };
        pick.click();
      } else if (act === "checklist") {
        const body = {};
        document.querySelectorAll(`.checks[data-id="${id}"] input`).forEach((b) => body[b.dataset.k] = b.checked);
        await api(`/api/v1/issues/${id}/checklist`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        alert("Đã lưu checklist.");
      } else {
        if (act === "reject" && !confirm("Trả số này về nháp?")) return;
        await api(`/api/v1/issues/${id}/${act}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
        await loadIssues();
      }
    } catch (e) { alert(e.message); }
  });
}
async function loadUsers() {
  if (ME.role !== "admin") return;
  document.getElementById("users-title").style.display = "block";
  const el = document.getElementById("users"); el.style.display = "block";
  const d = await api("/api/v1/users");
  el.innerHTML = `<form id="new-user" class="toolbar" style="flex-direction:column;align-items:flex-start">
    <label>Tài khoản: <input name="username" required></label>
    <label>Tên hiển thị: <input name="display_name" required></label>
    <label>Mật khẩu: <input name="password" type="password" required></label>
    <label>Vai trò: <select name="role"><option>publisher</option><option>reviewer</option><option>reader</option><option>admin</option></select></label>
    <label><input name="can_download_pdf" type="checkbox"> Được tải PDF gốc</label>
    <button type="submit">Tạo tài khoản</button></form>` +
    d.items.map((u) => `<div>${u.username} — ${u.display_name} — ${u.role} — tải PDF: ${u.can_download_pdf ? "có" : "không"} — ${u.is_active ? "đang hoạt động" : "đã khóa"}</div>`).join("");
  document.getElementById("new-user").onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      await api("/api/v1/users", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: f.get("username"), display_name: f.get("display_name"), password: f.get("password"), role: f.get("role"), can_download_pdf: !!f.get("can_download_pdf") }) });
      await loadUsers();
    } catch (err) { alert(err.message); }
  };
}
document.getElementById("create").onsubmit = async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const sched = fd.get("scheduled_publish_at");
  if (sched) fd.set("scheduled_publish_at", new Date(sched).toISOString());
  document.getElementById("create-msg").textContent = "Đang tải lên + render trang, chờ một lát…";
  try {
    const d = await api("/api/v1/issues", { method: "POST", body: fd });
    document.getElementById("create-msg").textContent =
      `Đã tạo số ${d.issue_number} (${d.page_count} trang, trạng thái ${d.status}). Xử lý: ${d.processing ? d.processing.status : "?"}${d.processing && d.processing.error_message ? " — lỗi: " + d.processing.error_message : ""}`;
    await loadIssues();
  } catch (err) { document.getElementById("create-msg").textContent = "Lỗi: " + err.message; }
};
document.getElementById("reload").onclick = loadIssues;
document.getElementById("logout").onclick = async () => { await api("/api/v1/auth/logout", { method: "POST" }); location.href = "/login.html"; };
ME = (await api("/api/v1/auth/me")).user;
document.getElementById("me").textContent = `${ME.display_name} (@${ME.username}) — vai trò: ${ME.role} — tải PDF gốc: ${ME.can_download_pdf ? "có" : "không"}`;
await loadIssues();
await loadUsers();
