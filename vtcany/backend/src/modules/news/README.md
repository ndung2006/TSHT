# Tin bài (toà soạn báo điện tử)

Module tin tức theo mẫu CMS Điện Biên (Toà Soạn Hội Tụ), làm trước
quy trình duyệt tin bài.

## Mô hình

- `NewsCategory`: chuyên mục 2 cấp (cha/con qua `parentId`), slug duy
  nhất, `sortOrder`, `isVisible`. Riêng với `Category` OTT của catalog.
- `NewsArticle`: tiêu đề, slug duy nhất (tự sinh từ tiêu đề nếu để
  trống, trùng thì thêm `-2`, `-3`…), sapo ≤ 500 ký tự, nội dung HTML
  từ editor CMS, chuyên mục, ảnh bìa (`coverPath` từ `PUT /uploads/image`,
  ≤ 10 MB), tác giả + từ khóa (mảng chuỗi), cờ tin nổi bật.
- Trạng thái: `draft` | `published` | `unpublished` (hạ xuất bản).
  Bài `published` có `publishAt` trong tương lai hiển thị là "Chờ xuất
  bản" và public API tự ẩn đến giờ hẹn — không cần cron.
- Cột audit: `updatedBy` (username/sub người sửa cuối) +
  `updatedByRole` (tên Role lúc sửa) + `updatedAt`.
- Xóa chỉ bài nháp hoặc đã hạ xuất bản (bài đang xuất bản phải gỡ
  xuống trước, giống quy tắc của báo in).

## Quyền (ma trận sẵn có, không thêm quyền mới)

- Bài viết dùng `articles:view/create/update/publish/delete`.
- Chuyên mục dùng `category:create/update/delete` (danh sách cho form
  tin bài chỉ cần `articles:view`).
- V1 chưa có quy trình duyệt: ai có `articles:publish` cũng xuất bản
  trực tiếp được. Khi làm workflow tin bài (PV → TP → PBĐT → BBT →
  XB), sẽ gate lại giống `epaper-workflow.ts`.

## API

- Admin (JWT): `GET/POST /admin/news`, `GET/PATCH/DELETE
  /admin/news/:publicId`, `POST .../publish|unpublish`,
  `GET/POST /admin/news-categories`, `PATCH/DELETE
  /admin/news-categories/:publicId`.
- Công khai: `GET /api/v1/news` (lọc `category` theo slug — gồm cả
  chuyên mục con, `q`, `featured=1`, phân trang), `GET
  /api/v1/news/:slug` (kèm `related` cùng chuyên mục, tối đa 4),
  `GET /api/v1/news-categories` (cây cha/con, chỉ mục hiện).
- Public API không bao giờ trả `createdBy`/`updatedBy` và không trả
  bài chưa xuất bản (nháp/hẹn giờ/hạ xuất bản đều 404 ở detail).
