-- Dong bo nhan hien thi vung 'tieu-diem' voi o tick "Tieu diem" trong
-- form bai viet (tin-bai.vue). Chi doi description hien thi tren trang
-- Quan ly vung: khong doi key, khong doi name (von da la 'Tieu diem'),
-- khong doi slot_limit/sort_order. Trang Quan ly vung doc description
-- tu DB nen phai UPDATE dong seed cu (20261029160000_zones) moi hien
-- dung tren live; doi ZONE_DEFS trong zone-rules.ts di kem de fallback
-- khi dong chua co trong DB cung hien cung nhan.
-- PostgreSQL: chi dung TIMESTAMP, khong DATETIME.
UPDATE "zones"
SET "description" = 'Khối Tiêu điểm trên trang chủ',
    "updated_at" = CURRENT_TIMESTAMP
WHERE "key" = 'tieu-diem';
