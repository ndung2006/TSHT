# VTCANY Backend API Reference (cho Android client native)

Tài liệu này được trích **trực tiếp từ source backend** (`backend/src`), phục vụ việc viết
Kotlin Retrofit client. Tên field ghi chính xác theo code (chủ yếu `snake_case`).

- **Base URL (prod):** `https://api.vtcrd.top`
- **Global prefix:** mọi endpoint đều bắt đầu bằng `/api/v1` (set trong `main.ts`).
- **Local dev:** `http://localhost:3001/api/v1`
- **Auth:** header `Authorization: Bearer <access_token>` (trích trong `jwt-auth.guard.ts`).
  Không có Bearer <redacted> → `401 {error:{code:"unauthorized",message:"missing Bearer <redacted>"}}`.
- **CORS:** bật (`app.enableCors()`).
- **Body:** JSON, giới hạn 256KB.

## Quy ước ID (quan trọng)

| Field | Dạng | Dùng ở đâu |
|---|---|---|
| `public_id` | 24 ký tự hex (`sha256("catalog:"+id)` cắt 24, hoặc `channelPublicId(name)`) | URL công khai, endpoint detail công khai (`/catalog/*/:publicId`, `/movies/:publicId`, `/channels/:publicId/epg`) |
| `id` | internal (`mv-…`, `ep-…`, uuid, …) | **chỉ** dùng cho endpoint phát VOD (`/vod/:kind/:id/play`) |
| `slug` | slug hoá tiếng Việt, không dấu | chỉ để hiển thị/SEO trong URL web, Android không cần parse |

Endpoint công khai trả cả `id` lẫn `public_id` → khi lấy link phát VOD phải dùng đúng `id`.

---

## 1. Health check

```
GET /api/v1/health            (không cần auth)
```

Response `200`:
```json
{ "status": "ok", "service": "vtc-any-backend", "phase": 1 }
```

## 2. Auth (end-user)

### 2.1 Đăng nhập email/SĐT + mật khẩu (app dùng chính)

```
POST /api/v1/auth/user/login          (không cần auth, rate-limit 30 req/phút)
Content-Type: application/json
{ "identifier": "user@example.com", "password": "******" }
```

`identifier` = email hoặc SĐT đã được admin cấp trong CMS. Response `201`:
```json
{
  "access_token": "eyJhbGciOi…",
  "refresh_token": "9f2c…(64 hex)",
  "token_type": "Bearer",
  "expires_in": 3600,
  "user": {
    "id": "u-…",
    "email": "user@example.com",
    "phone": "09…",
    "avatar": "https://…",
    "displayName": "Tên",
    "provider": "google",
    "providerId": "google:123…",
    "status": "active",
    "createdAt": "2026-10-06T…Z"
  }
}
```

Lỗi: `401 {error:{code:"unauthorized",message:"invalid credentials"}}`;
tài khoản bị khoá → `403` với message chứa `tai khoan bi khoa`.
Chưa cấu hình DB → `401` (message `chua cau hinh CSDL nguoi dung`).

### 2.2 OAuth (Google / Facebook)

```
POST /api/v1/auth/oauth/:provider      (provider = google | facebook)
{ "idToken": "<Google ID token hoặc Facebook access token>" }
```

Response `201`: cùng shape `issueEnduserPair` như 2.1
(`access_token`, `refresh_token`, `token_type`, `expires_in`, `user`).
Lỗi: `400` nếu provider không hỗ trợ, `401` nếu token sai.

### 2.3 Refresh token (rotation)

```
POST /api/v1/auth/refresh
{ "refresh_token": "<refresh_token>" }
```

Response `201`: cặp token **mới** (token cũ bị vô hiệu ngay sau khi đổi).
`refresh_token` TTL 7 ngày. Lỗi: `401 {error:{code:"unauthorized",message:"invalid refresh token"}}`.

### 2.4 Thông tin user hiện tại

```
GET /api/v1/auth/me                   (cần Bearer <redacted> end-user)
```

Response `200`:
```json
{
  "kind": "enduser",
  "user": { "id": "u-…", "email": "…", "phone": "…", "avatar": "…",
            "displayName": "…", "provider": "google", "providerId": "…",
            "status": "active", "createdAt": "…" },
  "profiles": [
    { "id": "p-…", "userId": "u-…", "name": "Tôi", "avatarUrl": "…", "isKidsProfile": false }
  ]
}
```

> Các endpoint `/auth/login`, `/auth/admin/login`, `/auth/admin/change-password` là của CMS —
> Android **không dùng**.

---

## 3. Catalog công khai (phim / video / short)

Không cần auth. Chỉ trả nội dung đã xuất bản (`isVisible !== false`).

### 3.1 Danh sách

```
GET /api/v1/catalog/movies?categoryId=<id>&page=1&limit=24
GET /api/v1/catalog/videos?categoryId=<id>&page=1&limit=24
GET /api/v1/catalog/shorts?categoryId=<id>&page=1&limit=24
```

`categoryId` là **internal id** của danh mục (lấy từ §3.3). `limit` tối đa 100, mặc định 24.

Response `200` — envelope phân trang chuẩn:
```json
{
  "data": [
    {
      "id": "mv-abc123",
      "public_id": "a1b2c3d4e5f60718293a4b5",
      "slug": "ten-phim-khong-dau",
      "title": "Tên Phim",
      "description": "Mô tả…",
      "thumbnail": "https://…/thumb.jpg",
      "poster": "https://…/poster.jpg",
      "duration": 5400,
      "ageLimit": null,
      "planId": null,
      "publishedAt": "2026-10-01T…Z",
      "createdAt": "2026-10-01T…Z"
    }
  ],
  "meta": { "page": 1, "limit": 24, "total": 137 }
}
```

Field `duration`: số (giây, có thể null) — với episode có thể là string, xem §4.

### 3.2 Chi tiết 1 item

```
GET /api/v1/catalog/movies/:publicId
GET /api/v1/catalog/videos/:publicId
GET /api/v1/catalog/shorts/:publicId
```

Response `200`: 1 object item như §3.1 (không bọc `data`).
Không tồn tại/chưa xuất bản → `404 {error:{code:"not_found",message:"noi dung khong ton tai hoac chua xuat ban"}}`.

### 3.3 Danh mục (categories)

```
GET /api/v1/catalog/categories?type=phim
```
`type` = `phim` | `video` | `short` | `truyen-hinh` (bỏ trống = tất cả).
Response:
```json
{ "data": [ { "id": "cat-…", "public_id": "24hex…", "name": "Phim bộ", "slug": "phim-bo" } ] }
```

```
GET /api/v1/catalog/categories/:id?page=1&limit=24
```
`:id` nhận cả internal `id` lẫn `public_id`. Response:
```json
{ "data": { "id": "cat-…", "public_id": "…", "name": "Phim bộ", "slug": "phim-bo",
            "type": "phim", "items": [ /* public items như §3.1 */ ] } }
```
Sai id → `404 {error:{code:"not_found",message:"danh muc khong ton tai"}}`.

### 3.4 Rails (khối giao diện trang chủ / tab)

```
GET /api/v1/catalog/rails?section=home&platform=web
```
- `section` = `home` | `tv` | `movies` | `video` | `short` | `entertainment` (bỏ trống = tất cả).
- `platform`: rail có field `platform` đơn (không phải mảng). CMS hiện cấu hình cho web →
  **Android nên gửi `platform=web`** (hoặc bỏ trống, mặc định `web`). Rails không set platform thì match mọi platform.

Response:
```json
{ "data": [
  { "id": "rail-…", "title": "Phim bộ", "section": "home", "platform": "web",
    "contentType": "movie", "style": "…", "sortOrder": 5,
    "category": { "id": "cat-…", "public_id": "…", "name": "Phim bộ", "slug": "phim-bo" },
    "items": [ /* public items như §3.1, tối đa 24 */ ] }
] }
```

`contentType` = `movie` | `video` | `short` | `tv` | `event`.
**Lưu ý:** rail `contentType: "tv"` thì `items` rỗng — client tự lấy kênh từ `GET /channels` (§6.1).
Rail không gắn danh mục thì `items` = 24 item mới nhất theo loại (fallback server).

### 3.5 Banners (CMS quản lý: HIỂN THỊ > Banner)

```
GET /api/v1/catalog/banners?page=home&platform=mobile
```
- `page` = `home` | `tv` | `movies` | `video` | `short` | `entertainment`.
- `platform` = `mobile` → lấy `imageMobile` (fallback `imageWeb`); `web` thì ngược lại.
  **Android luôn gửi `platform=mobile`.**

Response (đã lọc hiển thị + khung giờ, sort `sortOrder`):
```json
{ "data": [
  { "id": "bn-…",
    "image_url": "https://…/banner-mobile.jpg",
    "title": "World Cup 2026",
    "action": "OPEN_URL",
    "target_id": "",
    "target_url": "/phim/world-cup-2026-a1b2c3d4e5f60718293a4b5" }
] }
```

`target_url` đã được chuẩn hoá:
- URL tuyệt đối `https://…` hoặc path `/…` → giữ nguyên (mở WebView/browser).
- Link tới nội dung → dạng deep-link path:
  - `/phim/{slug}-{publicId}` (movie), `/video/{slug}-{publicId}`, `/short/{slug}-{publicId}`
  - `/danh-muc/{slug}-{publicId}` (category)
- `""` (rỗng) = không resolve được (nội dung bị xoá/ẩn) → banner không bấm được.

> Đây là nguồn banner chính cho app (thay cho hero seed cũ trong `/layout/*`).

---

## 4. Chi tiết phim + tập phim

### 4.1 Chi tiết phim

```
GET /api/v1/movies/:publicId          (không cần auth; kèm Bearer <redacted> để có is_favorited đúng user)
```

Response `200`:
```json
{
  "video_info": {
    "public_id": "a1b2c3…",
    "title": "Tên Phim",
    "release_year": 2026,
    "total_episodes": "12 / 12 Tập",
    "description": "…",
    "poster": "https://…",
    "backdrop": "https://…",
    "is_favorited": false,
    "tabs": ["Tập 1 - Tập 10", "Tập 11 - Tập cuối"]
  },
  "episodes": [
    { "episode_id": "ep-…", "episode_number": 1, "title": "Tập 1",
      "thumbnail": "https://…", "duration": "45:00", "description": "…",
      "hls_url": "https://vod.vtcrd.top/api/v1/media/<uploadId>/playlist.m3u8?exp=…&sig=…" }
  ],
  "related_videos": [
    { "id": "vid-ten-phim", "public_id": "…", "slug": "ten-phim", "title": "…",
      "thumbnail": "https://…", "aspect": "3:4", "is_premium": false, "type": "phim" }
  ]
}
```

- `tabs`: mảng string, mỗi tab gom 10 tập (`Tập 1 - Tập 10`, tab cuối `Tập 11 - Tập cuối`).
- `episodes[].hls_url`: **URL phát trực tiếp được** (đã ký HMAC, xem §7). Rỗng `""` = tập chưa có video → hiển thị thông báo.
- Phim seed cũ có thêm `video_info.stream_urls.hls` — bỏ qua, dùng `episodes[].hls_url`.
- Sai `publicId` → `404 {error:{code:"not_found"}}`.

### 4.2 Danh sách tập (endpoint riêng, FE hiện chưa dùng)

```
GET /api/v1/movies/:publicId/episodes
→ { "public_id": "…", "tabs": ["Tập 1 - Tập 10", …], "episodes": [ /* như §4.1 */ ] }
```

### 4.3 Yêu thích

```
POST /api/v1/movies/:publicId/favorite     (cần Bearer <redacted>, toggle)
→ 200 { "is_favorited": true }
```

---

## 5. Tìm kiếm

```
GET /api/v1/search?s=<query>              (không cần auth)
```

Tìm không dấu trên catalog Phim + Video/Short (tối đa 60 kết quả). Response:
```json
{ "query": "world cup",
  "groups": [
    { "type": "Phim",
      "items": [ { "public_id": "…", "slug": "…", "title": "…",
                   "thumbnail": "…", "aspect": "3:4", "type": "phim" } ] },
    { "type": "Video", "items": [ … ] },
    { "type": "Short", "items": [ … ] }
  ] }
```

`type` trong item = `phim` | `video` | `short`; `aspect` = `3:2` | `3:4`.
Query rỗng → `{query:"", groups:[]}`. Group nào không có kết quả thì vắng mặt.

---

## 6. Kênh truyền hình + EPG + phát live (quan trọng)

### 6.1 Danh sách kênh theo nhóm

```
GET /api/v1/channels                       (không cần auth)
```

Response:
```json
{ "groups": [
  { "name": "VTC",
    "channels": [
      { "public_id": "9f8e…(24hex)", "name": "VTC1",
        "logo": "https://…/logo.png", "audio_only": false }
    ] }
] }
```

- `public_id`: 24-hex ổn định theo tên kênh → dùng cho mọi endpoint kênh.
- `logo`: nullable. `audio_only`: true với kênh phát thanh (VOV…).
- Group rỗng có thể bị ẩn phía client (backend vẫn trả).

### 6.2 EPG + link phát của 1 kênh ⭐ (endpoint phát live chính)

```
GET /api/v1/channels/:publicId/epg?date=2026-10-08     (không cần auth)
```
- `:publicId` phải là 24 ký tự hex, sai định dạng → `400`, không tồn tại → `404`.
- `date=YYYY-MM-DD`, bỏ trống = hôm nay.

Response `200`:
```json
{
  "channel": {
    "public_id": "9f8e…",
    "name": "VTC1",
    "logo": "https://…/logo.png",
    "banner_url": null,
    "hls_url": "https://luuchieu1.vtcplay.vn/…/master.m3u8?exp=1780…&…",
    "hls_exp": 1780900000000,
    "dash_url": null,
    "catchup_hls_url": null
  },
  "epg_dates": ["2026-10-05","2026-10-06","2026-10-07","2026-10-08","2026-10-09"],
  "epg_source": "aio",
  "timeline": [
    { "time": "19:00", "title": "Thời sự 19h", "status": "LIVE" },
    { "time": "19:45", "title": "Phim truyện", "status": "UPCOMING" },
    { "time": "18:00", "title": "Bản tin trưa", "status": "REPLAY" }
  ]
}
```

**Luồng phát live:**
- `hls_url` là **master playlist HLS đa bitrate (ABR)** gồm các rendition `p360/p480/p720`
  (ưu tiên `hlsMasterRotating` từ AIO; fallback p720 → link đơn). ExoPlayer play trực tiếp,
  tự chọn bitrate — không cần parse rendition thủ công.
- `hls_exp`: **epoch milliseconds** — thời điểm link hết hạn. Được đọc từ query param `exp`
  trong URL (`giây → ms`, tự xử khi `exp` đã là ms); nếu URL không có `exp` thì fallback
  `now + TTL` (TTL cấu hình `PLAYBACK_TTL_MINUTES`, prod = **240 phút**).
- **Tự xin lại link trước khi hết hạn** (web làm ở phút 210/240, tức trước 30 phút):
  gọi lại endpoint EPG này; chỉ remount player khi có link mới **và** user vẫn đang xem đúng kênh.
- `hls_url: null` = kênh chưa có luồng phát (sau khi đã tải xong) → hiển thị "Kênh chưa có luồng phát."
- `timeline[].status` = `LIVE` | `UPCOMING` | `REPLAY`; `time` = `HH:mm` (giờ local server).
- `epg_dates`: 7 ngày `[hôm nay-3 … hôm nay+1]` để vẽ tab chọn ngày.
- `epg_source` = `aio` (lịch từ AIO) | `local` (lịch CMS nhập tay).

> `POST /api/v1/playback/token` yêu cầu JWT (CMS dùng) — Android **không dùng**,
> dùng endpoint EPG công khai ở trên thay thế (đây là phương án "scan-only" đã chốt).

### 6.3 Chi tiết kênh theo slug (phụ)

```
GET /api/v1/channels/:slug/detail?date=YYYY-MM-DD      (không cần auth)
→ { "channel": { "name": "VTC1", "slug": "vtc1" }, "audioOnly": false,
    "epgNow": {…}|null, "date": "…", "timeline": [ … ],
    "play": { "via": "POST /api/v1/playback/token {type:live, slug}" } }
```

Dùng khi đã biết slug tên kênh; để phát vẫn gọi §6.2.

> Biến thể `GET /channels/:slug/epg` (slug chữ, không phải 24hex) yêu cầu JWT quyền `epg:read`
> — chỉ dành cho CMS, Android không dùng.

---

## 7. Phát VOD (video / short / tập phim lẻ)

```
GET /api/v1/vod/:kind/:id/play            (không cần auth)
```
- `:kind` = `episode` | `video` | `short` (sai → `400 {error:{code:"bad_kind"}}`).
- `:id` = **internal `id`** (không phải `public_id`!). Với tập phim: `episode_id` từ §4.1.

Response `200`:
```json
{ "kind": "video", "id": "vid-…", "title": "…",
  "hls_path": "https://vod.vtcrd.top/api/v1/media/<uploadId>/playlist.m3u8?exp=…&sig=…" }
```

- `hls_path` là URL tuyệt đối (khi `VOD_PUBLIC_BASE_URL` được set, prod `https://vod.vtcrd.top`)
  hoặc relative `/api/v1/media/…` (dev) → nếu relative, nối với base API.
- URL đã ký HMAC: **playlist hiệu lực 15 phút** (`PLAYLIST_TTL_SEC`), segment bên trong
  hiệu lực 8 giờ. Client chỉ việc play, không tự ký.
- Chưa xuất bản → `404 {error:{code:"not_published"}}`;
  chưa có file/transcode chưa xong → `404 {error:{code:"vod_not_ready"}}`.

> Endpoint nội bộ `/api/v1/media/:uploadId/playlist.m3u8` và `/media/:uploadId/v/:variant`
> chỉ phục vụ rewrite playlist — client không gọi trực tiếp.

---

## 8. Layout / trang chủ (server-driven UI, cũ)

```
GET /api/v1/layout/home?platform=WEB       (không cần auth)
→ { "platform": "WEB",
    "layout_blocks": [
      { "id": "seed-block-1", "order": 1, "type": "HERO_CAROUSEL", "title": "…",
        "target_url": "…", "card_aspect": "16:9",
        "items": [ { "id": "…", "image_url": "…", "title": "…",
                     "action": "OPEN_MOVIE", "target_id": "{slug}-{24hex}", "target_url": "…" } ] },
      { "id": "seed-block-2", "order": 2, "type": "HORIZONTAL_LIST", "title": "Phim bộ",
        "items": [ { "id": "…", "public_id": "…", "slug": "…", "title": "…",
                     "thumbnail": "…", "aspect": "3:4", "is_premium": false, "type": "phim" } ] }
    ] }
```

```
GET /api/v1/layout/section/:section        (section = home|movies|video|short|entertainment)
→ { "platform": "WEB", "section": "home", "hero": [ /* HeroItem như trên */ ] }
```

> Đây là seed in-memory cũ. App mới nên dùng **`/catalog/banners` (§3.5) + `/catalog/rails` (§3.4)**
> (do CMS quản lý) thay cho `/layout/*`.

---

## 9. Telemetry (heartbeat + xem tiếp)

### 9.1 Heartbeat (ghi vị trí xem)

```
POST /api/v1/telemetry/heartbeat           (không bắt buộc auth; kèm Bearer <redacted> thì gắn user)
{ "session_id": "<uuid do client tự sinh, giữ suốt phiên xem>",
  "content_id": "<public_id hoặc id nội dung>",
  "current_time_seconds": 123,
  "bitrate": "720p",            // optional
  "device_type": "android" }    // optional
```

Response `200`: `{ "ok": true, "kicked": false }`.
Giới hạn **2 thiết bị đồng thời** / user (ẩn danh tính theo `session_id`);
vượt → `403 {error:{code:"forbidden",message:"device limit exceeded"}}`.

### 9.2 Xem tiếp

```
GET /api/v1/telemetry/continue-watching              (cần Bearer <redacted>)
GET /api/v1/telemetry/continue-watching/:userId      (không cần auth)
→ [ { "contentId": "…", "positionSec": 123, "updatedAt": 1780… } ]   // sort mới nhất trước
```

Lưu ý: store hiện tại là **in-memory** (mất khi backend restart) — giao diện giữ nguyên để sau
chuyển Redis/Postgres.

---

## 10. Envelope lỗi & mã HTTP

Mọi lỗi qua `ApiExceptionFilter` đều có dạng:
```json
{ "error": { "code": "not_found", "message": "noi dung khong ton tai" } }
```

| HTTP | `error.code` | Gặp khi |
|---|---|---|
| 400 | `bad_request` | sai param, validation DTO, `publicId` kênh sai định dạng |
| 401 | `unauthorized` | thiếu/sai Bearer, `invalid credentials`, `invalid refresh token`, `invalid token` |
| 403 | `forbidden` | tài khoản bị khoá/ban, vượt 2 thiết bị, thiếu quyền CMS, `/media` sai chữ ký (`media_forbidden`) |
| 404 | `not_found` | không tồn tại / chưa xuất bản; VOD: `not_published`, `vod_not_ready`, `bad_kind` (400) |
| 429 | `rate_limited` | quá 30 req/phút trên login/oauth/refresh |
| 502 | `upstream_error` | AIO lỗi (endpoint playback CMS) |
| 500 | `internal_error` / `error` | lỗi server |

Validation DTO sai (thiếu field bắt buộc) → `400 bad_request`.

## 11. Phân trang

Envelope chuẩn mọi list công khai:
```json
{ "data": [ … ], "meta": { "page": 1, "limit": 24, "total": 137 } }
```
- Query `page` (≥1), `limit` (1–100). Mặc định: catalog công khai `page=1, limit=24`.
- Ngoại lệ không phân trang: `/channels` (`{groups:[…]}`), `/search` (`{query, groups:[…]}`),
  `/catalog/banners`, `/catalog/rails` (`{data:[…]}`), `/movies/:id` (object), EPG (object).

---

## 12. Ghi chú cho Retrofit/Kotlin

- Dùng `@SerializedName` hoặc `FieldNamingPolicy.LOWER_CASE_WITH_UNDERSCORES` — field API là `snake_case`.
- `public_id` luôn 24-hex: validate bằng regex `^[0-9a-f]{24}$` trước khi gọi endpoint kênh.
- `hls_exp` là `Long` epoch **ms** → `System.currentTimeMillis()` so sánh trực tiếp;
  đặt lịch refresh link ở `hls_exp - 30*60*1000`.
- Live HLS master ABR → ExoPlayer `HlsMediaSource` play trực tiếp, không cần chọn rendition.
- VOD `hls_path` có thể relative → resolve với base URL khi không bắt đầu bằng `http`.
- Deep-link từ banner: parse path `/phim|video|short|danh-muc/{slug}-{24hex}` → tách `publicId`
  bằng regex `-([0-9a-f]{24})$`.
- Token: lưu `access_token` (dùng 3600s) + `refresh_token`; khi 401 → gọi `/auth/refresh`
  (rotation — **cập nhật cả cặp mới**, không dùng lại token cũ).
- Không gọi các endpoint `/admin/*`, `POST /playback/*`, `/channels/:slug/epg` (dạng slug),
  `/videos/*` (dạng không prefix `catalog`) — đều yêu cầu quyền CMS.
