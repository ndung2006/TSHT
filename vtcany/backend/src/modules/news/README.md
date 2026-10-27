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
- Quy trình duyệt tin bài (từ 2026-10-27, làm theo mẫu
  `epaper-workflow.ts`): PV (tác giả) → TP → PBĐT → BBT → XB (duyệt
  bước cuối = xuất bản). Logic thuần ở `news-workflow.ts`, bảng
  `news_article_approvals` ghi mọi bước, migration
  `20261027200000_news_workflow`.
- Chặn bước bằng tên Role (`roleName`): chỉ Role trùng tên bước hoặc
  tài khoản toàn quyền (`*`) mới duyệt được bước đó; Role chưa tồn
  tại thì fail-closed. Tên Role trong CMS phải giữ nguyên viết tắt
  (TP/PBĐT/BBT/XB) — đổi tên sẽ vỡ chặn bước.
- Bài nháp chỉ toàn quyền mới xuất bản trực tiếp được; bài đang chờ
  duyệt không xuất bản tắt, không xóa được; trả lại bắt buộc có lý
  do và về nháp. Bài đã hạ xuất bản thì xuất bản lại trực tiếp được.
- CMS `/tin-bai` có lọc "Chờ duyệt", cột "Duyệt gần nhất", nút Gửi
  duyệt/Duyệt/Trả lại và hộp thoại Lịch sử duyệt.

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
