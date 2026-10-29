# Tường thuật trực tiếp — Liveblog (Gói 2A — Người 2)

Module tường thuật trực tiếp, giai đoạn 1: backend + CMS + API (hiển thị
công khai do gói 1E của Người 1 tích hợp). Sao khuôn module `news`.

## Mô hình

- `Liveblog` (bảng `liveblogs`): tiêu đề, slug duy nhất, mô tả, ảnh bìa,
  sự kiện gắn kèm **tùy chọn** — `eventId` NULLABLE, liveblog gắn một
  `NewsroomEvent` hoặc đứng độc lập (chốt thiết kế 29/10/2026; xóa sự
  kiện thì SetNull).
- `LiveblogEntry` (bảng `liveblog_entries`): dòng tường thuật — nội
  dung HTML, `mediaPath` (file đã upload qua /uploads, không nhúng
  base64), cờ ghim `isPinned`. Timeline sắp theo `createdAt` ASC.
  Entry **không duyệt riêng**: chuỗi duyệt áp cho cả liveblog.
- `LiveblogApproval` (bảng `liveblog_approvals`): khuôn giống hệt
  `NewsArticleApproval`; API lịch sử trả ASC.
- Trạng thái + hẹn giờ `publishAt` theo mẫu news (public API tự ẩn đến
  giờ hẹn). **Không realtime ở 2A** (chốt 29/10/2026): trang công khai
  đọc bằng GET thông thường.
- Xóa liveblog chỉ khi nháp/đã hạ xuất bản; entries đi theo Cascade.

## Quy trình duyệt

- PVTT (tác giả — Phóng viên tường thuật) tạo + gửi duyệt → **PTTT**
  (Phó phòng tường thuật) duyệt = xuất bản. Logic thuần ở
  `liveblog-workflow.ts`, test ở `liveblog-workflow.test.mjs`.
- Bước nộp chỉ cần quyền `liveblog:update` (giữ mẫu). Bước duyệt khóa
  roleName fail-closed; SoD chặn người submit tự duyệt (kể cả toàn
  quyền), ngoại lệ tin nóng ghi `isException`/`exceptionReason`.

## Quyền

`liveblog:view/create/update/publish/delete`. Entries: xem = view,
thêm/sửa = update, xóa = delete.

## API

- Admin: `GET/POST /api/v1/admin/liveblogs`, `GET/PATCH/DELETE
  /api/v1/admin/liveblogs/:publicId`, `POST
  .../:publicId/submit|approve|return|publish|unpublish`, `GET
  .../:publicId/approvals`, entries: `GET/POST
  .../:publicId/entries`, `PATCH/DELETE .../:publicId/entries/:entryId`.
- Công khai: `GET /api/v1/liveblogs`, `GET /api/v1/liveblogs/:slug`
  (chi tiết kèm entries ASC) — chỉ bản published, không lộ trường nội bộ.
