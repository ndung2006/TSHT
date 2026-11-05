-- Relabel cac dong daily cua ngay VN 2026-11-04 bi ghi nhan 2026-11-03.
-- Nguyen nhan: code gop ghi vn_date = new Date('YYYY-MM-DDT00:00:00+07:00')
-- (nua dem +07:00 = 17:00 UTC ngay hom truoc) nen session DB o UTC cat ve
-- ngay hom truoc khi luu vao cot DATE (phat hien 05/11/2026).
-- Da chung minh khong co dong tho sach nao thuoc ngay VN 2026-11-03 nen
-- moi dong nhan 2026-11-03 deu la dong ngay VN 2026-11-04. Chi doi nhan,
-- khong xoa dong, khong tinh lai so lieu. Khong co dong nhan 2026-11-04
-- truoc do nen khong vi pham khoa duy nhat.
UPDATE "pageview_daily" SET "vn_date" = DATE '2026-11-04' WHERE "vn_date" = DATE '2026-11-03';
UPDATE "channel_telemetry_daily" SET "vn_date" = DATE '2026-11-04' WHERE "vn_date" = DATE '2026-11-03';
