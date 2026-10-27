# Module Báo in (E-paper) — CMS VTCANY, thuộc repo TSHT

Nhập liệu số báo trong CMS VTCANY, thay cho CMS TSHT cũ (`/admin.html`).
Không bao gồm trình đọc công khai `/bao-in` — đó là giai đoạn riêng.

## Chạy migration

```bash
cd backend
npm run prisma:generate
npm run prisma:migrate   # prisma migrate deploy; file: prisma/migrations/20261027090000_epaper/migration.sql
```

## API (prefix chung `api/v1`, đều cần JWT admin)

| Phương thức | Route | Quyền |
|---|---|---|
| GET | `/admin/epaper?issueType=&q=&page=&limit=` | `epaper:view` |
| GET | `/admin/epaper/:publicId` (kèm 50 revision mới nhất) | `epaper:view` |
| POST | `/admin/epaper` | `epaper:create` |
| PATCH | `/admin/epaper/:publicId` | `epaper:update` |
| POST | `/admin/epaper/:publicId/publish` | `epaper:publish` |
| POST | `/admin/epaper/:publicId/unpublish` | `epaper:publish` |
| DELETE | `/admin/epaper/:publicId` (chỉ số nháp) | `epaper:delete` |
| POST | `/admin/epaper/:publicId/submit` (nháp → chờ duyệt bước 1) | `epaper:update` |
| POST | `/admin/epaper/:publicId/approve` (duyệt bước hiện tại; bước cuối = xuất bản) | `epaper:publish` |
| POST | `/admin/epaper/:publicId/return` `{reason}` (trả về nháp, bắt buộc lý do) | `epaper:publish` |
| GET | `/admin/epaper/:publicId/approvals` (lịch sử duyệt theo bước) | `epaper:view` |
| GET | `/admin/epaper/:publicId/pdf` (stream file PDF gốc, không phục vụ công khai) | `epaper:view` |

## Quy trình duyệt (thêm 2026-10-27, migration `20261027160000_epaper_workflow`)

- Trạng thái: `draft` → `pending_review` (kèm `workflowStep` 1..4) → `published`.
- Chuỗi bước (theo khảo sát CMS Điện Biên, nhánh maket): người nhập (KTV)
  gửi duyệt → **MD** → **T.PP** → **P.TBT** → **TBT** (duyệt bước cuối =
  xuất bản). Nhãn bước hiện là viết tắt như CMS gốc; tên đầy đủ của
  MD/T.PP/P.TBT/TBT cần xác nhận trước khi đổi nhãn (xem `epaper-workflow.ts`).
- Chặn theo vai: mỗi bước chỉ đúng Role trùng tên bước đó (không phân biệt
  hoa/thường) hoặc tài khoản toàn quyền (`*`: `*`) mới duyệt được; Role
  chưa tồn tại → fail-closed (chỉ toàn quyền duyệt được). Tạo Role đúng tên
  trong trang Quản lý quyền của CMS rồi gán cho tài khoản là chạy.
- Xuất bản trực tiếp từ nháp chỉ dành cho toàn quyền (giữ hành vi cũ cho
  admin); tài khoản thường bắt buộc gửi duyệt. Số đang chờ duyệt không
  xuất bản tắt được và không xóa được (phải trả lại hoặc duyệt xong).
- Trả lại bắt buộc lý do, ghi vào cả `epaper_issue_approvals` và revision.
- Danh sách trả thêm `workflowStep`, `workflowStepLabel`,
  `workflowTotalSteps` và `lastApproval` (người duyệt gần nhất: hành động,
  vai trò, thời gian) để CMS hiển thị cột audit kiểu Điện Biên.
- Logic chuyển trạng thái thuần nằm ở `epaper-workflow.ts`, test bằng
  `node --test epaper-workflow.test.mjs` (không cần DB, không cần build).
- Số đã xuất bản từ trước migration giữ nguyên `status = published`,
  `workflowStep = 0` nên độc giả công khai không bị ảnh hưởng.
| PUT | `/uploads/pdf` (nhị phân `application/pdf`, header `x-file-name`, tối đa 100MB) | `epaper:create` |

Quyền `epaper` đã đăng ký trong `permissions.catalog.ts` (đủ 5 hành động
view/create/update/publish/delete) nên trang Quản lý quyền của CMS cấp được
ngay; tài khoản `*` vốn đã qua mọi kiểm tra.

## Quy tắc nghiệp vụ (đã khóa bằng logic trong `epaper.utils.ts` + service)

- `issueType` chỉ nhận `thuong` | `vung_cao`; cặp `(issueType, issueNumber)`
  là duy nhất (UNIQUE ở DB).
- Số đã xuất bản **không đổi được `issueNumber`**; mọi sửa khác trên số đã
  xuất bản bắt buộc `changeReason` và ghi một dòng `epaper_issue_revisions`
  lưu snapshot trước khi sửa.
- Slug gắn với `publicId` (24 hex): `bao-tuyen-quang-so-<number>-<publicId>`
  nên đổi loại/tiêu đề/ngày không đổi slug và URL (`/bao-in/<slug>`).
- `pageCount` do biên tập nhập tay: repo hiện **không có trình đọc PDF** để
  đếm trang tự động, nên không bao giờ tự suy ra con số. TODO: thay bằng
  đếm thật khi có pdf parser (xem `epaper.service.ts`).
- File PDF lưu dưới `STORAGE_DIR/documents/`, chỉ tải qua route admin có JWT;
  không thêm route static công khai nào cho PDF gốc.
- Nhật ký: revision lưu bền trong DB; `AuditService` (in-memory, theo mẫu
  của module TV) chỉ ghi thêm best-effort, không làm hỏng request chính.

## CMS

Trang `apps/cms/pages/bao-in.vue` (route `/bao-in`, mục “Báo in” trong nhóm
“Nội dung” của `layouts/admin.vue`): danh sách lọc loại số + tìm số/tiêu đề,
form tạo/sửa (tải PDF trước qua `/uploads/pdf` rồi gắn `pdfPath` vào số),
dialog “Sửa loại số” riêng cho số đã xuất bản (bắt buộc lý do, ghi rõ
số/slug/URL không đổi), xuất bản/gỡ xuống, tải PDF gốc, xóa số nháp.

## Kênh TV/radio nhập tay

Đã có sẵn và không sửa trong đợt này: trang “Truyền hình & EPG” của CMS
(`truyen-hinh.vue`) có nút “Thêm kênh / sự kiện” tạo kênh tự thêm
(`ChannelOverride.isCustom = true`) với tên hiển thị, link HLS/DASH/xem lại,
logo/banner, nhóm, ẩn/hiện — nhập tay hoàn toàn, không phụ thuộc quét AIO.
Logic quét AIO và phát live không bị đụng tới.
