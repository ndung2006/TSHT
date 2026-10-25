# Hướng dẫn deploy e-paper phase 1 lên Coolify

Repo này là bản Stage 1 + Stage 2 đã build ở máy local: viewer StPageFlip MIT +
PDF.js (2 chế độ Lật/Đọc), server Node nối PostgreSQL thật, CMS đăng/duyệt
số báo tại `/admin.html`. Đây là **bản thử trên Coolify, chưa đủ go-live**
(xem mục 8).

## 1. App cần những gì (không chỉ code)

| Thành phần | Ghi chú |
|---|---|
| App Node (repo này) | Nghe cổng 3000, cần `poppler-utils` (`pdfinfo`, `pdftoppm`) — đã cài trong `Dockerfile` |
| PostgreSQL 16 | Database `epaper_phase1`, role `epaper_app` |
| Volume bền vững | Mount vào `/app/storage`, nếu không redeploy sẽ mất PDF/ảnh đã upload qua CMS |
| Biến môi trường | `DATABASE_URL`, `PORT=3000`, `STORAGE_DIR=/app/storage` |

Tuyệt đối **không** copy file `.env` hay tài khoản dev từ máy local sang đây.
DB và tài khoản trên máy local là tạm, phải tạo lại trên Coolify.

## 2. Tạo PostgreSQL trên Coolify

1. Trên Coolify, tạo một Database resource loại PostgreSQL.
2. Đặt database là `epaper_phase1`, user là `epaper_app`, đặt mật khẩu mới
   và mạnh, ghi lại.
3. Lấy connection string **nội bộ** mà Coolify cấp cho database đó, dạng:

```
postgres://epaper_app:<mat-khau-moi>@<host-noi-bo-cua-coolify>:5432/epaper_phase1
```

Dùng host nội bộ, không dùng public host/port nếu Coolify có cả hai.

## 3. Tạo app trên Coolify

1. Tạo Application từ Git: repo `https://github.com/ndung2006/TSHT`,
   nhánh `main`.
2. Build Pack: **Dockerfile**, đường dẫn Dockerfile: `/Dockerfile`.
3. Port: `3000`. Health Check Path: `/health` (trả `{"ok":true}`).
4. Environment Variables của app:

```
DATABASE_URL=postgres://epaper_app:<mat-khau-moi>@<host-noi-bo-cua-coolify>:5432/epaper_phase1
PORT=3000
STORAGE_DIR=/app/storage
```

5. Persistent Storage: thêm một volume, đường dẫn trong container là
   `/app/storage`. Bước này bắt buộc.
6. Deploy.

Lưu ý về volume và dữ liệu seed: khi volume còn trống, entrypoint của
container (`docker-entrypoint.sh`) sẽ tự copy dữ liệu mẫu của 2 số seed
(319 = 12 trang, 558 vùng cao = 4 trang) từ `/app/storage-seed` vào
`/app/storage`. Việc copy chỉ chạy khi thiếu file cover của số 319, nên
các file upload sau đó không bị ghi đè khi redeploy. Nếu không mount
volume, dữ liệu upload sẽ nằm trong container và mất khi redeploy.

## 4. Khởi tạo DB (chạy 1 lần, trên DB rỗng)

File SQL nằm trong repo, thư mục `db/`. Chạy theo đúng thứ tự, từ một
máy có `psql` và có quyền tới database của Coolify (ví dụ terminal của
database resource trên Coolify, hoặc máy local đã mở quyền tới DB đó):

```sh
psql "postgres://epaper_app:<mat-khau-moi>@<host-noi-bo-cua-coolify>:5432/epaper_phase1" -v ON_ERROR_STOP=1 -f db/schema-epaper-phase1.sql
psql "postgres://epaper_app:<mat-khau-moi>@<host-noi-bo-cua-coolify>:5432/epaper_phase1" -v ON_ERROR_STOP=1 -f db/seed-epaper-phase1.sql
```

- `schema-epaper-phase1.sql`: 7 bảng `users, issues, issue_pages,
  processing_jobs, issue_revisions, publication_checklists, audit_logs`
  + view `v_published_issues`, trigger chặn đổi slug sau xuất bản,
  `UNIQUE (issue_type, issue_number)`.
- `seed-epaper-phase1.sql`: 4 tài khoản mẫu, số 319 và số vùng cao 558.
- Chỉ chạy trên DB rỗng. Seed ghi cố định issue id 1 và 2, nên chạy
  seed lên DB đã có số báo khác có thể làm lệch liên kết trang.
- Nếu chạy lại seed trên DB đã seed rồi, các lệnh `ON CONFLICT DO NOTHING`
  sẽ bỏ qua, không đè dữ liệu.

## 5. Tạo tài khoản đăng nhập đầu tiên (bắt buộc, chạy 1 lần)

Seed chỉ chứa hash placeholder (`HASH_PLACEHOLDER_DO_NOT_USE`) nên **chưa
tài khoản nào đăng nhập được**. Đây là bước bootstrap tài khoản đầu tiên
cho bản thử; sau đó mọi tài khoản khác tạo và quản lý qua CMS.

1. Mở Terminal của app trên Coolify (container đang chạy, đã có
   `DATABASE_URL` từ Environment Variables).
2. Chạy, thay 4 mật khẩu bằng mật khẩu mạnh do bạn tự đặt (không dùng
   lại mật khẩu dev ở máy local):

```sh
DEV_ADMIN_PASSWORD='<mat-khau-admin>' \
DEV_PUBLISHER_PASSWORD='<mat-khau-nguoi-dang>' \
DEV_REVIEWER_PASSWORD='<mat-khau-nguoi-duyet>' \
DEV_READER_PASSWORD='<mat-khau-nguoi-doc>' \
node tools/set-dev-passwords.mjs
```

3. Kết quả mong đợi: mỗi dòng in `password updated`. Dòng
   `USER NOT FOUND` nghĩa là DB chưa chạy seed (quay lại mục 4).
4. Đăng nhập `/admin.html` bằng tài khoản `admin` và mật khẩu vừa đặt.
   Từ đây, tạo tài khoản thật cho người dùng qua CMS; mật khẩu bootstrap
   này chính là mật khẩu admin của bản thử, đặt mạnh ngay từ đầu.

## 6. Kiểm thử sau deploy

1. `https://<domain-cua-ban>/health` trả `{"ok":true,"service":"epaper-phase1"}`.
2. `/bao-in` hiện 2 số seed: 319 (12 trang) và 558 vùng cao (4 trang),
   có ảnh bìa, lọc loại số đúng.
3. Mở một số: lật được bằng nút ‹ ›, phím ←/→, thumbnail, ô gõ số trang.
4. Đăng nhập `/admin.html`, upload 1 PDF thử, gửi duyệt, tick đủ 6 mục
   checklist rồi xuất bản; số mới phải hiện ở `/bao-in`.
5. **Nghiệm thu bằng chuột thật** (test tự động không thay thế được):
   cuộn chuột lên/xuống = zoom ×1,5/nấc, tâm zoom theo con trỏ; đang
   zoom thì bấm giữ kéo trang = pan tới vị trí đọc, không lật trang;
   thu về vừa khung mới lật tiếp được; số trang lẻ không chèn trang trắng.

## 7. Khắc phục sự cố thường gặp

| Triệu chứng | Nguyên nhân thường gặp / cách xử lý |
|---|---|
| Log có `password authentication failed for user "epaper_app"` | `DATABASE_URL` sai mật khẩu/host/DB. Sửa env rồi redeploy. |
| `/health` 200 nhưng `/bao-in` không có số, API lỗi 500 | DB chưa chạy schema/seed, hoặc app trỏ nhầm DB. Kiểm tra mục 4 và log app. |
| `/bao-in` có số nhưng bìa/trang 404 | Volume `/app/storage` trống và entrypoint chưa copy seed. Xem log container có dòng `storage trong: copy du lieu seed...` không; nếu volume đã mount sai đường dẫn, sửa lại thành `/app/storage` rồi redeploy. |
| Đăng nhập báo sai mật khẩu với cả 4 tài khoản seed | Chưa chạy bước 5, hoặc chạy khi `DATABASE_URL` trong terminal khác DB của app. |
| Upload PDF báo lỗi `pdfinfo`/`pdftoppm` | Image build không có poppler-utils. Deploy từ `Dockerfile` của repo này thì đã có; đừng đổi sang build pack khác mà không cài thêm gói này. |
| Redeploy xong bị đăng xuất hết | Bình thường ở bản này: session lưu trong bộ nhớ (xem mục 8). Đăng nhập lại là được. |

## 8. Giới hạn của bản thử này — chưa đủ go-live

- Session lưu trong bộ nhớ: restart/redeploy là đăng xuất hết. Trước
  go-live phải chuyển session sang DB/Redis.
- Chưa nén PDF web (C5): hiện `web.pdf` = bản gốc copy.
- Chưa render trước ảnh Đọc 300 dpi (C3): chế độ Đọc vẫn render PDF
  trực tiếp bằng PDF.js ở ~300 dpi khi mở, tương đương độ nét khi zoom.
- Chưa có backup tự động cho DB và volume storage.
- Chưa nhập kho cũ (phạm vi ngày/số lượng và cách xử lý số hiệu trùng
  theo năm vẫn chưa chốt, vì schema khóa `UNIQUE (issue_type, issue_number)`
  không có năm).
- Chưa nghiệm thu bằng chuột thật trên trình duyệt và điện thoại thật.

## 9. Thử local bằng Docker (không bắt buộc)

```sh
POSTGRES_PASSWORD='<mat-khau-manh>' docker compose up --build
# Mo http://localhost:3000/bao-in
# Bootstrap tai khoan (trong container app):
docker compose exec app sh -c 'DEV_ADMIN_PASSWORD="<mat-khau-admin>" DEV_PUBLISHER_PASSWORD="<mat-khau-nguoi-dang>" DEV_REVIEWER_PASSWORD="<mat-khau-nguoi-duyet>" DEV_READER_PASSWORD="<mat-khau-nguoi-doc>" node tools/set-dev-passwords.mjs'
```

`docker-compose.yml` tự tạo DB từ `db/*.sql` khi volume `pgdata` còn
trống; muốn tạo lại DB từ đầu thì `docker compose down -v` (xóa cả dữ
liệu) rồi chạy lại.
