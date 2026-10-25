# E-paper phase 1 — Báo in nội bộ

Viewer StPageFlip MIT + PDF.js (2 chế độ Lật/Đọc), server Node nối
PostgreSQL thật, CMS đăng/duyệt số báo tại `/admin.html`.

- **Deploy lên Coolify: đọc `HUONG-DAN-DEPLOY-COOLIFY.md` trước.**
  Tóm tắt: tạo PostgreSQL `epaper_phase1` trên Coolify, tạo app từ repo
  này bằng Dockerfile, đặt `DATABASE_URL` / `PORT=3000` /
  `STORAGE_DIR=/app/storage`, mount volume vào `/app/storage`, chạy
  `db/schema-epaper-phase1.sql` rồi `db/seed-epaper-phase1.sql` trên DB
  rỗng, bootstrap tài khoản bằng `tools/set-dev-passwords.mjs` (1 lần),
  rồi kiểm thử ở `/bao-in` và `/admin.html`.
- Chạy local không Docker: `npm ci` rồi `DATABASE_URL=... node server.mjs`,
  mở `http://localhost:3000/bao-in`. Cần cài `poppler-utils`
  (`pdfinfo`, `pdftoppm`) để upload/render qua CMS.
- Thử local bằng Docker: xem mục 9 của hướng dẫn Coolify.
- Test logic viewer: `npm test` (6 test: zoom ×1,5, pan chỉ khi zoom,
  số lẻ không trang đệm, ô gõ trang, spread với `showCover`).

## Cấu trúc repo

```
server.mjs            Server Stage 2 (API + CMS + auth, cổng PORT, mặc định 3000)
lib/                  db.mjs (PostgreSQL, STORAGE_DIR), auth.mjs (session scrypt), worker.mjs (pdfinfo/pdftoppm)
public/               index.html (/bao-in), reader.html, admin.html, login.html, css/, js/
db/                   schema-epaper-phase1.sql, seed-epaper-phase1.sql (319 = 12 trang, 558 vung cao = 4 trang)
storage-seed/         Anh/PDF mau cua 2 so seed; entrypoint copy vao volume storage neu volume trong
tools/                set-dev-passwords.mjs (bootstrap tai khoan lan dau, mat khau lay tu bien moi truong)
Dockerfile            Node 22 + poppler-utils, healthcheck /health
docker-entrypoint.sh  Copy du lieu seed vao storage neu thieu, roi chay server
docker-compose.yml    Thu local: app + PostgreSQL 16
```

## Chưa làm — không hiểu nhầm là xong go-live

Session trong bộ nhớ (redeploy là đăng xuất hết), chưa nén PDF web,
chưa render trước ảnh Đọc 300 dpi, chưa backup tự động, chưa nhập kho
cũ, chưa nghiệm thu bằng chuột thật. Chi tiết ở mục 8 của hướng dẫn
Coolify.

## Bảo mật — đọc trước khi push/deploy

- Không commit `.env` (đã có trong `.gitignore`). Mật khẩu chỉ nhập ở
  Environment Variables của Coolify hoặc biến môi trường khi chạy lệnh.
- Không dùng lại tài khoản/mật khẩu dev ở máy local trên máy Coolify.
- Seed chỉ chứa hash placeholder, không chứa mật khẩu thật.
