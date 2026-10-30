# Module royalties — Nhuận bút (Gói 2C, Người 2)

Điểm hệ số theo THÀNH PHẦN cho bài viết đã xuất bản — chỉ tính điểm, không tính tiền.
Thiết kế: `~/workspace/tsht-2b-2c-draft/thiet-ke-2c-nhuan-but.md` (chốt với điều phối viên 30/10/2026,
kèm file mẫu thật `Th_ng_K__Nhu_n_B_t_Market.xlsx`).

- Điểm: 5 thành phần (nội dung / ảnh / video / audio / khác), số nguyên 0–3 mỗi thành phần
  (`SCORE_MAX` trong `royalties-score.ts`; quan sát từ file thống kê hiện hành của tòa soạn).
- Bài nhiều tác giả: chia theo tỉ lệ % trong panel, mặc định chia đều, tổng = 100.
  Điểm tác giả = điểm thành phần × tỉ lệ (làm tròn 2 chữ số thập phân).
- Workflow (`royalties-workflow.ts`, sao khuôn ads): Trưởng phòng đề xuất →
  BBT duyệt = KHÓA điểm. Bước nộp cần `royalties:update`; bước duyệt khóa theo
  TÊN role `BBT` + `royalties:publish`, kèm tách nhiệm vụ (SoD) và ngoại lệ
  tin nóng ghi log như 2A/2B. Sửa điểm đã khóa: BBT mở khóa ngoại lệ
  (bắt buộc lý do, ghi `isException`) → bản chấm về nháp, nộp/duyệt lại.
- Dashboard (`GET /admin/royalties/dashboard`): tổng điểm theo tác giả (chỉ
  bản đã khóa), số bài xuất bản theo ngày, top bài theo lượt xem (PageView).
- Xuất Excel (`GET /admin/royalties/export`): đúng mẫu file thật —
  sheet "Thống kê nhuận bút", cột STT | Tiêu đề bài viết | Tác giả | Nội dung |
  Ảnh | Video | Audio | Khác, 1 dòng/bài×tác giả, chỉ bản đã khóa.
- Không có API công khai. Quyền: `royalties` (catalog quyền).
- Cấp phát nghiệm thu: role TP = royalties Xem/Thêm/Cập nhật; role BBT =
  royalties Xem/Công khai; tài khoản test-tp + test-bbt.
