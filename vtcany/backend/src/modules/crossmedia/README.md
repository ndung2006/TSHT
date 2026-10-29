# Chuyển đổi chéo (Gói 1C)

Nút “Tạo bản nháp Báo điện tử” trên nguồn đã duyệt → tạo bản nháp tin bài
(trạng thái `draft`, đi quy trình tin bài bình thường PV → TP → PBĐT → BBT
→ XB từ đầu). Không đổi trạng thái hay quy trình của nguồn gốc.

## Nguồn hợp lệ (fail-closed)

- Video / short của catalog: “đã duyệt” = `isVisible === true` (catalog
  không có chuỗi duyệt biên tập riêng; nút Xuất bản chỉ bật/tắt hiển thị).
  Chưa hiển thị → 400, không tạo nháp.
- Số báo in: “đã duyệt” = `status === 'published'` (đã qua chuỗi
  KTV → MD → T.PP → P.TBT → TBT). Chưa xuất bản → 400, không tạo nháp.
- Nguồn không tồn tại → 404.

## Kế thừa

- Tiêu đề (bắt buộc, thiếu → 400), mô tả → sapo (cắt 500 ký tự) + body
  (HTML đã escape), ảnh bìa chỉ khi là đường dẫn tương đối `/...`.
- Số báo: body có tóm tắt + link về số gốc `/bao-in/<slug>`.
- Video/short: **không** kèm URL phát — video catalog phát qua HLS ký
  HMAC (hết hạn nhanh), file MP4 gốc không có endpoint công khai; nhét URL
  ký vào `formatData` sẽ hỏng sau vài phút nên bản nháp để
  `contentType: 'text'`. Bản DAM Proxy MP4 là việc tiếp theo, không bịa
  URL ở đây.
- Tác giả: nguồn không có tên tác giả (catalog không có trường author; số
  báo chỉ có `createdBy` là id) nên `authors = []` — không gán bừa người
  chuyển đổi làm tác giả; liên thông nhuận bút theo tác giả là việc sau.
- Chuyên mục: `categoryId = null` (không có ánh xạ catalog → chuyên mục
  tin bài); biên tập gán khi duyệt nháp.
- Nguồn gốc lưu ở cột `source_ref` (JSONB, migration
  `20261029190000_crossmedia_source_ref`): `{ type, id, title, ... }`,
  chỉ admin thấy qua `toItem`, không hiện công khai.

## Endpoint (đều gate `articles:create`, không thêm quyền mới)

- `POST /api/v1/admin/crossmedia/from-tv` — body `{ entity: 'videos' |
  'shorts', id }`.
- `POST /api/v1/admin/crossmedia/from-epaper` — body `{ publicId }`.

## Nút CMS

- `videos.vue` / `short.vue`: nút chỉ hiện khi `isVisible` và tài khoản có
  `articles:create`.
- `bao-in.vue`: nút chỉ hiện khi số `published` và tài khoản có
  `articles:create`.
- Thành công → toast + về `/tin-bai`; lỗi → toast với message server.

## File

- `crossmedia-map.ts` — logic thuần (test được bằng `node --test`).
- `crossmedia.service.ts` — điều phối: đọc nguồn → map → `NewsService.create`.
- `crossmedia.controller.ts`, `crossmedia.module.ts` — endpoint + wiring.
- `crossmedia-map.test.mjs` — 10 test logic thuần.
