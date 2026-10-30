# Facebook — kết nối thật (Gói 2D-3)

Trạng thái: code hoàn thiện (OAuth Meta + đăng Page qua Graph API).
Chưa cấu hình env thì CMS báo rõ "Chưa cấu hình" ở đầu trang Phân phối —
không có nút bấm giả, không trạng thái "đã đăng" bịa: target chỉ chuyển
`posted` sau khi Graph API trả về id bài đăng thật.

## Điều phối viên cần chuẩn bị (một lần)

1. Tạo Meta App tại developers.facebook.com (loại "Doanh nghiệp"),
   gắn với Page Facebook chính thức của tòa soạn.
2. Trong App: thêm sản phẩm **Facebook Login**, đặt **Valid OAuth
   Redirect URI** đúng một dòng:
   `https://vtcany-api.vtctech.xyz/api/v1/admin/distribution/facebook/callback`
3. Quyền cần xin cho App (App Review nếu App ở chế độ Live):
   `pages_manage_posts`, `pages_read_engagement`.
   (Chế độ Development chỉ đăng được lên Page mà chủ App có vai trò —
   đủ cho vòng đăng thử nghiệm thu.)
4. Đặt env cho app BACKEND trên Coolify rồi redeploy backend:
   - `FB_APP_ID`, `FB_APP_SECRET` (từ App > Settings > Basic)
   - `FB_REDIRECT_URI` = đúng URI ở bước 2
   - `FB_PAGE_ID` (không bắt buộc): điền khi tài khoản quản lý nhiều
     Page và muốn khóa đúng 1 Page; để trống thì lấy Page đầu tiên.

## Luồng dùng trong CMS

1. Trang **Phân phối** (tài khoản có quyền `distribution:publish`):
   thẻ Facebook ở đầu trang → **Kết nối Page** → đăng nhập Meta, chọn
   Page, cấp quyền → trình duyệt hiện "Đã kết nối Page: ...".
2. Quay lại CMS, tải lại trang Phân phối: thẻ hiện "Đã kết nối".
3. Xuất bản một bài phân phối có tick **Facebook** (đích thành
   "Sẵn sàng") → bấm **Đăng Facebook** → thành công: đích thành
   "Đã đăng" + link bài thật trên Page; thất bại: đích "Lỗi" + dòng
   lỗi Graph hiển thị ngay cạnh, bấm Đăng lại được.
4. Ngắt kết nối: nút **Ngắt kết nối** trên thẻ (xóa Page token trong DB).

## Ghi chú kỹ thuật

- Page token lưu ở bảng `social_connections` (1 dòng/platform), không
  bao giờ trả ra API — endpoint status chỉ trả pageId/pageName.
- Ảnh: đăng qua `/{page}/photos` khi mediaUrl là ảnh có URL tuyệt đối
  (ghép từ `PUBLIC_MEDIA_BASE_URL`/`VOD_PUBLIC_BASE_URL`/origin API).
  Video: đăng bài feed kèm link (chưa upload video trực tiếp lên Graph).
- TikTok/YouTube giữ nguyên cơ chế đăng tay + dán link, không đụng.
