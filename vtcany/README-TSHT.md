# Thư mục vtcany/ trong repo TSHT — đọc trước khi sửa

Thư mục này là bản copy mã nguồn hệ VTCANY (backend NestJS + CMS Nuxt + các app
kèm theo), được tách ra ngày 2026-10-27 từ bản clone khảo sát ở máy này
(HEAD gốc b7caa73) để trở thành **repo mới nằm trong repo TSHT**.

Quy tắc bắt buộc:

- Thư mục này thuộc về **repo TSHT (ndung2006/TSHT)**. Mọi commit/push của
  thư mục này đi chung với repo TSHT.
- **TUYỆT ĐỐI KHÔNG push, commit hay đồng bộ gì từ thư mục này sang repo gốc
  ndung2006/VTCANY.** Repo gốc đó chỉ là tài liệu khảo sát, không phải đích
  triển khai của thư mục này. Thư mục này đã gỡ sạch `.git` của bản gốc và
  không còn remote nào trỏ về repo gốc.
- Thư mục này KHÔNG ảnh hưởng tới app TSHT đang chạy: Dockerfile ở gốc repo
  TSHT chỉ COPY server.mjs, lib, public, test, tools, db — không COPY thư mục
  vtcany/ này vào image TSHT.
- Không có secret thật trong thư mục này: các file `.env.example` của bản gốc
  đã được lược bỏ khi copy. Mọi key/token/secret khi triển khai phải đặt bằng
  biến môi trường của Coolify, không ghi vào code.

Mục đích hiện tại của thư mục này: xây module nhập liệu báo in mới trong CMS
VTCANY (trang báo in + nhập tay kênh TV/radio), thay cho CMS TSHT cũ tại
`/admin.html` — theo quyết định ngày 2026-10-27 của chủ dự án.
