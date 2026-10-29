-- Zone/Widget Manager — Goi 1A. Vung hien thi trang chu + bai ghim.
-- CHUA APPLY: migration nay xep hang SAU dot 1 cua Nguoi 2 (2A
-- events/liveblog, dang cho dieu phoi vien chot) theo luat 4.2.
-- Chi chay bang prisma migrate deploy sau khi dot 1 cua 2A len main
-- va rebase nhanh p1-zone-widget (ten migration co the phai doi neu
-- dot 1 cua 2A lay timestamp gan hon).
-- PostgreSQL: chi dung TIMESTAMP, khong DATETIME (bai hoc dot Phan phoi).
CREATE TABLE "zones" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "slot_limit" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "zones_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "zones_key_key" ON "zones"("key");

CREATE TABLE "zone_items" (
    "id" TEXT NOT NULL,
    "zone_id" TEXT NOT NULL,
    "article_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "zone_items_pkey" PRIMARY KEY ("id")
);

-- Mot bai chi ghim o toi da mot vung: bai da ghim khong hien lai trong
-- danh sach chon cua vung khac.
CREATE UNIQUE INDEX "zone_items_article_id_key" ON "zone_items"("article_id");
CREATE INDEX "zone_items_zone_id_sort_order_idx" ON "zone_items"("zone_id", "sort_order");

ALTER TABLE "zone_items" ADD CONSTRAINT "zone_items_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "zones"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "zone_items" ADD CONSTRAINT "zone_items_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "news_articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed 2 vung theo layout that trang chu (slot: Tin noi bat = 4,
-- Tin moi nhat = 8). Khong seed bai ghim: khi vung rong, khoi cong khai
-- tu lap day tu nguon tu nhien (noi bat / moi nhat) nen hanh vi cu
-- duoc giu nguyen ngay sau deploy.
INSERT INTO "zones" ("id", "key", "name", "description", "slot_limit", "sort_order") VALUES
    ('3fa85f64-5717-4562-b3fc-2c963f66afa6', 'tieu-diem', 'Tiêu điểm', 'Khối Tin nổi bật trên trang chủ', 4, 1),
    ('7c9e6679-7425-40de-944b-e07fc1f90ae7', 'tin-moi-nhat', 'Tin mới nhất', 'Khối Tin mới nhất trên trang chủ (dòng sự kiện)', 8, 2);
