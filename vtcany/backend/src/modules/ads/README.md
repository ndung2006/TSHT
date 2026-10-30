# Module ads — Quảng cáo tòa soạn (Gói 2B, giai đoạn 1)

Backend + API cho quảng cáo tòa soạn. Sao khuôn module events (2A).

- Chuỗi duyệt 1 bước: QL-QC tạo + gửi duyệt → TBT duyệt = xuất bản
  (xem `ads-workflow.ts` — logic thuần, test ở `backend/ads-workflow.test.mjs`).
- Tách hẳn banner catalog OTT (quyền `banners`, trang `banner.vue`):
  ở đây dùng quyền `newsroom_ads`, route admin `/admin/ads`.
- Hai loại: `image` (ảnh + link đích, link chỉ nhận http/https) và `html`
  (mã HTML/JS của đối tác). Mã HTML/JS chỉ được phía hiển thị (portal,
  gói của Người 1) nhúng trong **iframe sandbox**; API công khai chỉ trả
  quảng cáo đã duyệt + đang trong lịch chạy.
- API công khai: `GET /api/v1/ads?placement=&page=&limit=` — sắp theo
  sortOrder ASC, publishAt DESC; không lộ trường nội bộ.
- `placement` là khóa chuỗi tự do (gợi ý: home_top, home_sidebar,
  article_top, article_sidebar, article_inbody) để khớp gói hiển thị sau
  mà không cần đổi schema.
