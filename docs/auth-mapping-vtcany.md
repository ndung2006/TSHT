# TSHT CMS — chuyển xác thực sang tài khoản VTCANY (chuẩn bị, chưa cắt sang)

> Trạng thái: code đã viết xong, **mặc định TẮT** (`VTCANY_AUTH_ENABLED` khác `'1'`
> thì mọi thứ giữ nguyên như cũ). Tài liệu này là bản chuẩn bị cắt sang:
> chưa có tài khoản nào bị xóa, di chuyển hay tạo tự động, chưa push,
> chưa redeploy. Đọc hết mục "Cắt sang (checklist)" trước khi bật.

## 1. Hai hệ tài khoản, tóm tắt đúng code

### TSHT hiện tại (cũ, vẫn chạy khi tắt)

- Đăng nhập: `POST /api/v1/auth/login {username, password}`, mật khẩu
  scrypt trong bảng `users` (PostgreSQL), session 8 giờ lưu trong RAM
  của server TSHT (mất khi restart/redeploy), cookie `epaper_session`.
- Vai trò TSHT: `admin` (4), `reviewer` (3), `publisher` (2), `reader` (1).
  `isStaff` = mọi vai trò trừ `reader`. Kiểm tra quyền ở cả API và file.
- Tài khoản CMS admin hiện tại là tài khoản **nội bộ TSHT**, do người
  dùng tự đặt qua Secure Vault. Code mới **không xóa, không đổi mật khẩu,
  không di chuyển** tài khoản này. Nó vẫn đăng nhập được ngay khi đặt
  `VTCANY_AUTH_ENABLED=0` và restart/redeploy (xem mục 5).

### VTCANY (hệ chính theo quyết định, backend `https://vtcany-api.vtctech.xyz`)

- Prefix toàn cục `/api/v1`, cổng 3001. CMS login:
  `POST /api/v1/auth/admin/login {email, password}` (ưu tiên, dùng email),
  `POST /api/v1/auth/login {username, password}` (tương thích cũ).
  Cả hai đều trả `{access_token, refresh_token, token_type:'Bearer',
  expires_in:3600, role, permissions}`.
- Xác minh: `GET /api/v1/auth/me` với header `Authorization: Bearer <JWT>`
  trả `{kind:'cms', user:{id, username, email, fullName, role},
  permissions:[...]}` cho tài khoản CMS, hoặc `{kind:'enduser', ...}` cho
  tài khoản app người dùng cuối. **Tài khoản end-user không bao giờ được
  vào CMS TSHT** (xem mục 3).
- Làm mới: `POST /api/v1/auth/refresh {refresh_token}`. Refresh token
  lưu trong `Map` trong RAM của backend VTCANY, TTL 7 ngày nhưng **mất
  khi backend restart** (xem mục 4).
- Ma trận quyền: `Role.permissions` dạng `{ "<module>": ["view","create",
  "update","publish","delete"] }` hoặc `{ "*": ["*" ] }`. Các module có
  sẵn (xem `permissions.catalog.ts`): categories, genres, playlists,
  actors, tv, epg, videos, shorts, movies, seasons, episodes, articles,
  events, keywords, banners, layout, bannedwords, notifications, cache,
  livestream, plans, catalog, users (không có publish), roles, admins,
  settings (chỉ view/update), audit (chỉ view/delete).
- Vai trò mặc định trong VTCANY:
  - `Super Admin` / `Admin`: `{ "*": ["*"] }` — toàn quyền.
  - `Editor` (bản DB, `roles.service.ts`): videos view/create/update/
    publish, epg view/create/update/publish/delete, categories
    view/create/update, layout view, catalog view/create/update/publish/
    delete, users view. **Không có quyền `articles` nào.**
    Cột "Editor" trong bảng mục 2 dùng bản DB này. Bản Editor trong
    store in-memory cũ (`users.store.ts`) dùng dạng legacy
    (`video:read`, `epg:write`, ...) — kết luận "không làm được báo
    in" vẫn giống nhau, và TSHT vẫn chặn Editor ở lịch/kênh vì cửa
    admin TSHT, nên kết luận cuối cùng trong bảng không đổi dù dùng
    bản nào.
  - `Moderators` / `Khởi tạo`: `{}` — không có quyền nào.
- **VTCANY không có module `issues`/`epaper`.** Vì vậy bảng dưới là
  **quy ước phía TSHT**: hành động báo in được map sang module
  `articles` (Bài viết — module nội dung CMS gần nhất). Đây không phải
  quyền báo in gốc của VTCANY, và một vai trò VTCANY muốn làm báo in
  phải được cấp `articles` một cách tường minh (xem cảnh báo Editor).
- JWT: `auth.module.ts` lấy `JWT_SECRET`, **mặc định là một giá trị dev
  đã biết nếu không đặt**. Chưa đặt `JWT_SECRET` thật thì **tuyệt đối
  không bật** tích hợp này (xem checklist).

## 2. Bảng map: hành động TSHT → quyền VTCANY

Nguyên tắc áp dụng cho mọi dòng dưới (code `server.mjs` + `lib/vtcany-auth.mjs`):

1. **Quyền VTCANY là cửa đầu tiên, không phải cửa duy nhất.** Một hành
   động chỉ được phép khi (a) có đủ quyền VTCANY trong bảng, **và**
   (b) vẫn qua được kiểm tra vai trò/trạng thái/quyền sở hữu cũ của
   TSHT (admin/publisher-owner/reviewer, trạng thái draft/pending...,
   checklist đủ 6 mục...). Thiếu một trong hai đều 403, không bao giờ
   "mở rộng" quyền cũ chỉ vì đã đăng nhập bằng VTCANY.
2. **Thiếu quyền = 403 rõ ràng, không cho qua lén.** Không có trường
   hợp nào thiếu quyền VTCANY mà vẫn được làm vì "đã đăng nhập".
3. **Lỗi backend = từ chối, không cấp quyền.** Backend không truy cập
   được khi xác minh thì CMS call trả 503, session được giữ để thử lại
   (xem mục 4). Không có đường "backend lỗi thì cho làm tạm".

| Hành động TSHT (route) | Quyền VTCANY bắt buộc | Super Admin / Admin (`*`) | Editor mặc định VTCANY | Vai trò thiếu quyền đó | Tài khoản end-user |
|---|---|---|---|---|---|
| Đăng số mới — upload PDF, tạo nháp (`POST /api/v1/issues`) | `articles:create` | Cho phép (và phải liên kết local, xem chú thích *) | **403** — Editor không có `articles` nào | 403 | Không có session CMS |
| Sửa metadata số (nháp/chờ duyệt) (`PATCH /api/v1/issues/:id`) | `articles:update` | Cho phép | **403** | 403 | Không có session CMS |
| Sửa số đã xuất bản (lưu revision, bắt buộc `change_reason`) | `articles:update` + cửa admin TSHT (xem chú thích **) | Cho phép | **403** | 403 | Không có session CMS |
| Gửi duyệt (`POST .../submit`) | `articles:update` | Cho phép | **403** | 403 | Không có session CMS |
| Trả lại (`POST .../reject`) | `articles:update` | Cho phép | **403** | 403 | Không có session CMS |
| Xuất bản (`POST .../publish`) | `articles:publish` | Cho phép (vẫn cần checklist đủ 6 mục) | **403** | 403 | Không có session CMS |
| Gỡ xuống (`POST .../unpublish`) | `articles:publish` (VTCANY không có action unpublish riêng; publish bao trạng thái công khai/gỡ) | Cho phép | **403** | 403 | Không có session CMS |
| Tick checklist 6 mục (`POST .../checklist`) | `articles:update` | Cho phép | **403** | 403 | Không có session CMS |
| Render lại trang (`POST .../retry-processing`) | `articles:update` | Cho phép | **403** | 403 | Không có session CMS |
| Thay PDF (`POST .../replace-pdf`) | `articles:update` + cửa admin TSHT | Cho phép | **403** (cả hai cửa đều chặn) | 403 | Không có session CMS |
| Tải PDF gốc (`GET .../download`) | **Không có quyền VTCANY nào tự cấp.** Cần cờ `can_download_pdf` của TSHT (xem chú thích *) | Chỉ khi tài khoản đã liên kết local và cờ đó bật; nếu không, 403 dù là `*` | 403 | 403 | Không có session CMS |
| Quản lý tài khoản — tạo user (`POST /api/v1/users`) | `users:create` + cửa admin TSHT | Cho phép | **403** (Editor chỉ có `users:view`) | 403 | Không có session CMS |
| Quản lý tài khoản — sửa / đặt lại mật khẩu (`PATCH /api/v1/users/:id`, `.../reset-password`) | `users:update` + cửa admin TSHT | Cho phép | **403** | 403 | Không có session CMS |
| Xem danh sách tài khoản (`GET /api/v1/users`) | Cửa admin TSHT (vai trò map ra `admin` chỉ xảy ra khi có `*`, nên tương đương) | Cho phép | 403 (không phải admin TSHT) | 403 | Không có session CMS |
| Kênh TV/Radio — tạo (`POST /api/v1/channels`) | `tv:create` + cửa admin TSHT | Cho phép | **403** (Editor không có `tv`) | 403 | Không có session CMS |
| Kênh TV/Radio — sửa (`PATCH /api/v1/channels/:id`) | `tv:update` + cửa admin TSHT | Cho phép | **403** | 403 | Không có session CMS |
| Lịch — tạo chương trình (`POST /api/v1/schedule`) | `epg:create` + cửa admin TSHT | Cho phép | **403** — dù Editor có `epg:create`, cửa admin TSHT vẫn chặn (lịch/kênh TSHT hiện chỉ admin) | 403 | Không có session CMS |
| Lịch — xóa chương trình (`DELETE /api/v1/schedule/:id`) | `epg:delete` + cửa admin TSHT | Cho phép | **403** (cửa admin chặn) | 403 | Không có session CMS |
| Xem nháp / audit / jobs (`GET .../audit`, `.../jobs`, xem số chưa xuất bản) | Đọc: bất kỳ quyền `articles:*` nào (xem mục 3, quy tắc đọc) + cửa staff TSHT | Cho phép | 403 cho nháp/audit (map ra `reader`, không phải staff) | 403 cho nháp/audit | Không có session CMS |
| Đọc số đã xuất bản, xem TV/radio/lịch công khai | Không cần đăng nhập (public như cũ) | — | — | — | — |

\* **Liên kết local (quan trọng, không phải lỗi):** bảng `issues.created_by`
là `BIGINT NOT NULL REFERENCES users(id)`, và `audit_logs.actor_id`
trỏ về `users(id)`. Vì vậy khi đăng nhập bằng VTCANY, TSHT tìm một
dòng `users` nội bộ có **cùng email** và đang hoạt động để lấy
`id` (làm `created_by`/`actor_id`) và cờ `can_download_pdf`. Nếu không
tìm thấy: session vẫn tạo được (để xem/xuất bản/duyệt, với `actor_id`
NULL cho phép), nhưng **đăng số mới bị 403** với thông báo "chưa liên
kết với tài khoản TSHT nội bộ theo email", và **tải PDF gốc bị 403**
vì cờ mặc định false. **Không có dòng local nào được tạo tự động**
khi đăng nhập VTCANY — admin phải tạo/liên kết thủ công (xem checklist
bước 3). Đây là thiết kế an toàn, không phải bug.

\** **Cửa admin TSHT cho số đã xuất bản và thay PDF:** code TSHT cũ đã
quy định sửa số đã xuất bản (qua `canEdit`) và thay PDF chỉ dành cho
admin (publisher chỉ sửa được nháp/chờ duyệt của chính mình). Cửa này
vẫn giữ nguyên sau khi map: một vai trò VTCANY có `articles:update`
nhưng map ra `publisher`/`reviewer` vẫn bị chặn ở hai hành động này.

## 3. Cách login / xác minh / map vai trò hoạt động (code mới)

### Login (`POST /api/v1/auth/login`, `server.mjs`)

- Khi `VTCANY_AUTH_ENABLED` khác `'1'` (mặc định): chạy đúng nhánh cũ
  (scrypt, bảng `users`) — không một dòng VTCANY nào được gọi.
- Khi bằng `'1'`:
  1. Nhận `username` từ form (hoặc `email` nếu client gửi). Chứa `@`
     thì gọi `POST /api/v1/auth/admin/login {email, password}`, không
     thì gọi `POST /api/v1/auth/login {username, password}`. Cả hai
     đều ở phía VTCANY, gọi từ **server TSHT**, không từ trình duyệt.
  2. VTCANY trả 401 → TSHT trả 401 với đúng thông báo
     **"tài khoản VTCANY không đúng"**. Không thử đăng nhập cũ, không
     tạo tài khoản TSHT, không ghi log mật khẩu/token.
  3. Backend không truy cập được / lỗi 5xx → TSHT trả 503
     "backend VTCANY không truy cập được, vui lòng thử lại sau".
     Cũng **không** rơi về đăng nhập cũ một cách tự động.
  4. Đăng nhập thành công → gọi ngay `GET /api/v1/auth/me` để lấy
     identity chuẩn. `kind !== 'cms'` (tài khoản app end-user) → 403,
     không tạo session. `/me` lỗi 401 → 401 như trên; `/me` không tới
     được → 503, không tạo session trên token chưa xác minh.
  5. Map vai trò từ **quyền** (không map từ tên vai trò VTCANY):
     - `*` → `admin`
     - `articles:publish` → `reviewer` (lưu ý: người cần cả đăng số
       lẫn xuất bản thì cần `*` ở VTCANY, vì TSHT không có vai trò
       kết hợp publisher+reviewer)
     - `articles:create` hoặc `articles:update` → `publisher`
     - Có quyền xem (`articles`/`catalog`/`tv`/`epg`/`videos` view)
       → `reader`
     - Không có quyền xem nào (ví dụ vai trò `Moderators`/`Khởi tạo`
       với `{}`) → **từ chối đăng nhập 403**
       "chưa được cấp quyền báo in (cần cấp articles:view trở lên
       trong VTCANY)", không tạo session.
  6. Liên kết local theo email (mục 2, chú thích \*), tạo session
     TSHT như cũ (cookie `epaper_session`, 8 giờ). JWT và refresh
     token của VTCANY chỉ nằm trong Map session phía server TSHT,
     không bao giờ gửi ra trình duyệt, không nằm trong đối tượng
     `user` trả về (chỉ có `auth_source:'vtcany'`,
     `vtcany_user_id`, `vtcany_role`, `vtcany_permissions`,
     `can_download_pdf` từ local).
- Form đăng nhập (`public/login.html`) **không cần sửa**: nó vẫn gửi
  `{username, password}` và vẫn chuyển hướng theo `user.role`
  (reader → `/bao-in`, còn lại → `/admin.html`).

### Xác minh trên mỗi CMS API call (`server.mjs`, sau bước cần-login)

- Chỉ áp dụng cho route CMS cần đăng nhập (`needAuth`). Đọc công khai
  (báo in đã xuất bản, TV/radio, lịch công khai) không bị xác minh —
  chúng phải sống được khi backend VTCANY down. `GET /api/v1/auth/me`
  của TSHT chỉ trả thông tin session local, không phải là bước xác
  minh VTCANY.
- Session VTCANY được xác minh bằng `GET /auth/me` của VTCANY, cache
  **5 phút** trong session TSHT. Trong 5 phút, các call CMS tiếp theo
  không gọi backend lại. Hết 5 phút, call CMS tiếp theo xác minh lại.
- Xác minh thành công → vai trò và quyền trong session được **cập
  nhật ngay** (ví dụ admin bị hạ xuống reader thì call hiện tại và
  các call sau đều thấy vai trò mới, không chờ session 8 giờ hết hạn).
- Xác minh trả về `forbidden` (tài khoản còn hợp lệ nhưng không còn
  map ra vai trò TSHT nào, tức quyền đã bị thu hồi) → 403, session
  được giữ để khi được cấp lại quyền thì lần xác minh sau (hết cache)
  sẽ cho qua.
- Kiểm tra quyền theo hành động (bảng mục 2) chạy sau bước xác minh,
  trên quyền VTCANY **mới nhất** đã xác minh, và luôn đi kèm kiểm tra
  vai trò cũ của TSHT.

### Đọc (read) — quy tắc nới lỏng có chủ đích

Với các route **đọc** số chưa xuất bản / audit / jobs, TSHT chỉ cần
vai trò staff đã map (admin/publisher/reviewer). Không yêu cầu riêng
`articles:view` cho từng lần đọc, vì một vai trò chỉ có
`articles:create` (không có `view` tường minh) vẫn phải xem được nháp
mình vừa tạo để làm việc. Ngược lại, một vai trò map ra `reader` (chỉ
xem) vẫn bị chặn ở nháp/audit/jobs vì cửa staff chặn reader. Đọc số đã
xuất bản thì public như cũ, không cần quyền.

### Đăng xuất

`POST /api/v1/auth/logout` xóa session TSHT như cũ. Nó **không thu
hồi** JWT/refresh token bên VTCANY (VTCANY không có endpoint thu hồi
ngoài đổi mật khẩu, và đổi mật khẩu sẽ xóa refresh token cũ của tài
khoản đó). Sau đăng xuất, TSHT không còn giữ token nên token cũ không
dùng được qua TSHT nữa; bản thân JWT VTCANY hết hạn sau 3600 giây.

## 4. Giới hạn refresh token trong RAM của VTCANY — phải hiểu trước khi cắt

- Backend VTCANY lưu refresh token trong `Map` trong RAM. **Backend
  restart (redeploy, crash, scale) xóa sạch Map này.**
- TSHT xử lý đúng một lần refresh cho mỗi lần xác minh: `/me` trả 401
  → thử `POST /auth/refresh` một lần → nếu thành công thì gọi lại
  `/me` một lần; nếu refresh cũng 401 → **kết thúc, không lặp**.
  Server TSHT xóa session của mình và trả 401 với thông báo
  **"phiên VTCANY đã hết hạn, vui lòng đăng nhập lại"**. Người dùng
  đăng nhập lại là xong — không có vòng lặp làm mới vô hạn, không có
  lỗi im lặng.
- Hệ quả thực tế: **mỗi lần backend VTCANY restart, mọi phiên CMS
  TSHT đang đăng nhập bằng VTCANY đều phải đăng nhập lại**, ngay cả
  khi session TSHT 8 giờ chưa hết. Đây là giới hạn của backend VTCANY
  hiện tại, không phải lỗi của TSHT. Nếu muốn hết giới hạn này, backend
  VTCANY phải chuyển refresh token sang DB/Redis trước — đó là việc
  của backend, ngoài phạm vi bản chuẩn bị này, và không được làm lén
  trong đợt cắt sang.
- Access token VTCANY hết hạn sau 3600 giây, nên trong một phiên làm
  việc dài, TSHT sẽ tự refresh qua `/me` (khi backend còn sống) mà
  người dùng không cảm nhận được. Chỉ khi refresh thất bại (backend
  restart, token bị thu hồi khi đổi mật khẩu, tài khoản bị khóa) thì
  mới bắt đăng nhập lại.

## 5. Cắt sang (checklist) — làm theo đúng thứ tự, không bỏ bước

**Bước 0 — Chưa làm gì thì hệ thống vẫn chạy cũ.** Code mới đã deploy
mà `VTCANY_AUTH_ENABLED` chưa phải `'1'` thì không đổi gì cả. Đây là
điểm an toàn để quay lại bất cứ lúc nào (xem "Quay lại khẩn cấp").

**Bước 1 — Backend VTCANY phải sẵn sàng trước (làm trong Coolify, trực
tiếp, không gửi secret qua chat):**

- [ ] Đặt `JWT_SECRET` thành một secret ngẫu nhiên dài trong env của
      app `vtcany-backend`, rồi **redeploy backend**. Bắt buộc: nếu
      không đặt, JWT VTCANY được ký bằng giá trị dev mặc định đã biết,
      và bất kỳ ai biết giá trị đó đều có thể giả mạo token CMS.
- [ ] Đặt `VTC_PARTNER_KEY` (key AIO) trong env backend nếu chưa đặt,
      và redeploy nếu vừa đổi env (Coolify đổi env phải redeploy mới
      có hiệu lực). (Key này chỉ liên quan TV/radio, không liên quan
      trực tiếp xác thực, nhưng backend cần nó để kênh/EPG hoạt động.)
- [ ] Đặt `MEDIA_URL_SECRET`, `MEDIA_WEBHOOK_SECRET` nếu backend sẽ
      dùng media có ký (không bắt buộc cho riêng bước xác thực, nhưng
      nên đặt trước khi dùng backend làm hệ chính).
- [ ] Kiểm tra `GET https://vtcany-api.vtctech.xyz/api/v1/health` trả
      `status ok`, và `POST /api/v1/auth/admin/login` với mật khẩu sai
      trả 401 (chỉ kiểm tra sai mật khẩu, không thử tài khoản seed).

**Bước 2 — Tài khoản VTCANY (làm trong CMS/DB VTCANY, không tạo qua TSHT):**

- [ ] Xác nhận đã có tài khoản CMS VTCANY dùng cho tòa soạn (tạo trong
      CMS VTCANY hoặc DB VTCANY theo quy trình của VTCANY, gán vai trò
      có quyền `articles` phù hợp — ít nhất `*` cho admin tòa soạn,
      hoặc một vai trò báo in riêng với `articles` view/create/update/
      publish tùy người). **Không dùng mật khẩu seed mặc định trong
      repo để làm tài khoản chính: đổi mật khẩu ngay sau khi tạo/xác
      nhận tài khoản.** Tài liệu này không ghi, không đoán, không tạo
      email/mật khẩu nào cho bạn.
- [ ] Ghi lại email của tài khoản đó (email là khóa liên kết, xem
      bước 3). Tài khoản VTCANY đăng nhập CMS bằng **email**, không
      phải username cũ của TSHT (trừ khi dùng endpoint legacy bằng
      username — vẫn là tài khoản VTCANY, không phải tài khoản TSHT).

**Bước 3 — Liên kết local TSHT (làm trong CMS TSHT cũ, khi còn tắt):**

- [ ] Trong CMS TSHT (đang chạy nhánh cũ), tạo hoặc xác nhận đã có một
      dòng `users` có **cùng email** với tài khoản VTCANY ở bước 2,
      đang hoạt động (`is_active`). Đây là dòng cung cấp `created_by`
      và `can_download_pdf`.
- [ ] Nếu tài khoản đó cần tải PDF gốc, bật `can_download_pdf` cho
      dòng local đó. Nếu không bật, tài khoản VTCANY dù là admin vẫn
      bị 403 khi tải PDF gốc — đó là thiết kế, không phải lỗi.
- [ ] **Không xóa tài khoản admin TSHT cũ** ở bước này. Nó là đường
      quay lại (mục "Quay lại khẩn cấp").

**Bước 4 — Kiểm tra trên bản chạy thử (local/staging, chưa cắt live):**

- [ ] Chạy TSHT ở máy local/staging với `VTCANY_AUTH_ENABLED=1` và
      `VTCANY_API_BASE` trỏ backend VTCANY thật (hoặc staging tương
      đương). **Không bật trên live trước khi bước này pass.**
- [ ] Đăng nhập bằng tài khoản VTCANY ở bước 2 (nhập email + mật khẩu
      VTCANY vào form đăng nhập TSHT). Phải vào được `/admin.html`,
      thấy đúng vai trò đã map, và làm được đúng các hành động trong
      bảng mục 2 (đăng số thử, gửi duyệt, tick checklist, xuất bản
      thử, tải PDF gốc nếu đã bật cờ) — và bị 403 đúng ở các hành
      động không có quyền.
- [ ] Thử đăng nhập sai mật khẩu VTCANY: phải nhận đúng thông báo
      "tài khoản VTCANY không đúng", và **không** có tài khoản TSHT
      nào mới xuất hiện trong bảng `users`.
- [ ] Thử tài khoản app end-user (nếu có) đăng nhập CMS: phải bị từ
      chối, không có session CMS.
- [ ] Thử tắt backend VTCANY (hoặc trỏ sai base) rồi gọi một CMS API
      ghi: phải nhận 503, **không** được cho qua, và sau khi backend
      lên lại thì gọi lại được mà không cần đăng nhập lại (nếu session
      chưa hết hạn và refresh còn hiệu lực).
- [ ] Thử restart backend VTCANY rồi gọi CMS API: phải nhận 401
      "phiên VTCANY đã hết hạn, vui lòng đăng nhập lại", đăng nhập
      lại thì làm việc bình thường (đây là giới hạn đã biết, mục 4).

**Bước 5 — Cắt live (chỉ khi bước 4 pass hết):**

- [ ] Đặt `VTCANY_AUTH_ENABLED=1` trong env của app TSHT trên Coolify,
      redeploy TSHT.
- [ ] Đăng nhập live bằng tài khoản VTCANY, kiểm tra lại nhanh các
      hành động chính như bước 4. Giữ tài khoản admin TSHT cũ nguyên
      vẹn trong ít nhất một chu kỳ làm việc, cho đến khi tòa soạn xác
      nhận đã làm việc ổn bằng tài khoản VTCANY.
- [ ] Chỉ sau khi đã xác nhận ổn, mới quyết định (bằng một quyết định
      riêng, có ghi lại) có khóa/xóa tài khoản admin TSHT cũ hay
      không. **Bản chuẩn bị này không tự làm việc đó.**

**Quay lại khẩn cấp (bất cứ lúc nào, kể cả giữa ca trực):**

- Đặt `VTCANY_AUTH_ENABLED=0` trong env app TSHT, redeploy. Đăng nhập
  CMS lập tức trở về nhánh scrypt cũ, tài khoản admin TSHT cũ vẫn còn
  nguyên và đăng nhập được ngay. Không cần sửa code, không cần chạm
  database VTCANY. **Các session VTCANY đang mở bị từ chối ngay lập
  tức** (server hủy session đó và trả 401 khi gặp cookie VTCANY trong
  lúc cờ tắt, kể cả ở route đọc công khai) — người dùng chỉ cần đăng
  nhập lại bằng tài khoản cũ, không cần đăng xuất thủ công hay chờ
  session hết hạn. Đây là hành vi có chủ đích của công tắc cờ, khác
  với session cũ trong RAM (session cũ chỉ mất khi restart).

## 6. Những gì code mới KHÔNG làm (để khỏi hiểu nhầm)

- Không tự tạo tài khoản TSHT nào khi đăng nhập VTCANY thành công hay
  thất bại. Liên kết local phải tạo thủ công (bước 3).
- Không xóa, đổi mật khẩu, hay khóa tài khoản admin TSHT cũ.
- Không đổi vai trò/quyền trong VTCANY, không tạo vai trò "Báo in" sẵn
  trong VTCANY — việc cấp `articles` là việc của admin VTCANY, làm
  trong CMS/DB VTCANY.
- Không dùng refresh token của VTCANY để "giữ đăng nhập mãi mãi" qua
  restart backend. Restart backend = đăng nhập lại (mục 4).
- Không đưa JWT, refresh token, mật khẩu, hay key AIO ra trình duyệt
  hay vào log. Không lưu secret nào trong code, file, hay tài liệu này.
- Không thay đổi trang đọc báo in, trang TV/radio, trang lịch công
  khai, hay luồng đọc công khai (không cần đăng nhập).

## 7. Còn cần kiểm chứng live (chưa làm được ở bản chuẩn bị này)

- [ ] Hình dạng thật của `GET /api/v1/auth/me` cho tài khoản admin
      VTCANY đang chạy trên Coolify (bản backend hiện đã tự deploy
      thêm commit mới qua webhook, mới hơn bản clone đã đọc ở máy
      này): `kind`, `user` (id/username/email/fullName/role) và
      `permissions` có đúng như code đã đọc không, đặc biệt vai trò
      thật của tài khoản admin tòa soạn có phải `*` không.
- [ ] Ma trận quyền thật của vai trò đó trong DB VTCANY (Role.permissions),
      vì `/auth/me` trả quyền từ DB trước, fallback vai trò cứng sau —
      nếu DB có vai trò tùy chỉnh thì bảng mục 2 phải đối chiếu lại
      với quyền thật đó.
- [ ] Đăng nhập thật bằng tài khoản VTCANY trên bản chạy thử (bước 4)
      và trên live (bước 5), bao gồm cả trường hợp tài khoản chưa liên
      kết local (phải 403 khi đăng số, nhưng vẫn duyệt/xuất bản được
      với `actor_id` NULL).
- [ ] Hành vi khi backend VTCANY restart giữa ca làm việc (401 bắt
      đăng nhập lại) và khi backend down tạm thời (503, không cấp
      quyền, gọi lại được sau khi lên).
- [ ] Tài khoản end-user thật (nếu có) bị từ chối ở CMS như thiết kế.
