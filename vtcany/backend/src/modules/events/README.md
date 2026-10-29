# Sự kiện tòa soạn (Gói 2A — Người 2)

Module sự kiện của tòa soạn báo điện tử, giai đoạn 1: backend + CMS + API
(hiển thị công khai do gói 1E của Người 1 tích hợp). Sao khuôn module
`news` (tin bài). **Riêng với sự kiện catalog OTT** (key quyền `events`,
trang `su-kien.vue` sẵn có): ở đây dùng model `NewsroomEvent` + key
quyền `newsroom_events` + trang CMS `su-kien-toa-soan.vue`.

## Mô hình

- `NewsroomEvent` (bảng `newsroom_events`): tiêu đề, slug duy nhất (tự
  sinh từ tiêu đề, trùng thì thêm `-2`, `-3`…), mô tả, ảnh bìa
  (`coverPath` đường dẫn tương đối từ uploads), chuyên mục tin bài
  (`NewsCategory`, xóa chuyên mục thì SetNull), thời gian diễn ra
  (`startsAt`/`endsAt`, kiểm tra kết thúc không trước bắt đầu).
- Trạng thái: `draft` | `pending_review` | `published` | `unpublished`.
  Bản `published` có `publishAt` trong tương lai thì public API tự ẩn
  đến giờ hẹn — không cần cron (theo mẫu news).
- `NewsroomEventApproval` (bảng `newsroom_event_approvals`): mọi hành
  động gửi duyệt / duyệt / trả lại / xuất bản / gỡ xuống ghi 1 dòng;
  API lịch sử trả ASC (người xử lý bước trước = phần tử cuối).
- Xóa chỉ bản nháp hoặc đã hạ xuất bản.

## Quy trình duyệt

- QLSK (tác giả — Quản lý sự kiện) tạo + gửi duyệt → **TBT** duyệt =
  xuất bản. Logic thuần ở `events-workflow.ts`, test ở
  `events-workflow.test.mjs`.
- Bước nộp chỉ cần quyền `newsroom_events:update` (giữ mẫu news/epaper,
  chốt thiết kế 29/10/2026) — không khóa theo role tác giả.
- Bước duyệt khóa theo `roleName` của bước (fail-closed: role không
  tồn tại/không trùng thì không ai ngoài toàn quyền duyệt được).
- **Tách nhiệm vụ (SoD)**: người xử lý bước trước (ở chuỗi 1 bước là
  người submit) không được duyệt bước hiện tại — áp dụng cả tài khoản
  toàn quyền. Ngoại lệ duy nhất: tin nóng (`breakingNews: true` + lý
  do), được ghi `isException`/`exceptionReason` vào lịch sử duyệt.

## Quyền

`newsroom_events:view/create/update/publish/delete` (thêm vào
`permissions.catalog.ts`). Ánh xạ: view = list/chi tiết/lịch sử duyệt;
create = tạo; update = sửa + submit; publish = approve/return/publish/
unpublish; delete = xóa.

## API

- Admin (JWT + PermissionsGuard): `GET/POST /api/v1/admin/events`,
  `GET/PATCH/DELETE /api/v1/admin/events/:publicId`,
  `POST .../:publicId/submit|approve|return|publish|unpublish`,
  `GET .../:publicId/approvals`.
- Công khai (không guard): `GET /api/v1/events`, `GET /api/v1/events/:slug`
  — chỉ trả bản đã published, không lộ trường nội bộ.
