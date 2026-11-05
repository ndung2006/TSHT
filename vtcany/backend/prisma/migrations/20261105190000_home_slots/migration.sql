-- Sap xep Tin noi bat / Tin tieu diem (Buoc 0 2026-11-05, phuong an A):
-- bang sap xep rieng HomeSlotList + HomeSlotItem thay cho co che zone +
-- co tick rieng le. Moi khoi mot danh sach co thu tu duy nhat; tick
-- trong form bai chi dua bai vao kho, khong tu len trang chu.
-- Mot bai duoc o ca hai khoi (Q2), chi cam trung trong cung mot khoi
-- (UNIQUE list_id + article_id). Bai ha xuat ban GIU hang (Q3).
--
-- SEED (2026-11-05 18:47 +07): lay dung thu tu dang hien thi tren trang
-- chu luc seed. Kiem tra CMS luc 18:46-18:48 +07 cho thay zone
-- tieu-diem ghim 0 bai (0/4 slot) va tin-moi-nhat ghim 0 bai (0/8 slot)
-- nen 4 bai hero hoan toan la phan lap day tu nhien tu isFeatured moi
-- nhat truoc (publishAt desc); 3 link tieu diem la 3 bai isSpotlight
-- moi nhat. Seed chi chen khi bai con ton tai trong news_articles
-- (INSERT ... SELECT) va khi danh sach chua co (ON CONFLICT DO NOTHING).
--   noi-bat (max 4): 92c3a0643105905f90e3d630 "Mon an tinh than cua
--     nguoi cao tuoi" (05/11), 2e3dfb3e78307885ffb3cb3c "Chuan bi chu
--     dao hoat dong Ky niem 80 nam Ngay Thuong binh - Liet sy" (03/11),
--     d3adc6945af65f008ce000dd "Ban giai phap thao go kho khan phat
--     trien kinh te dem" (03/11), 38bc6979ecb8182a914d4f14 "So ket giai
--     doan 1 Chien dich 500 ngay dem" (02/11).
--   tieu-diem (max 3): 383da5e2c64be662f39dc83a "Ba nghi quyet ve xay
--     dung Dang..." (02/11), d6b002a26a8be3c6438e38ce "Nghi quyet so
--     31-NQ/TW..." (02/11), 560c519f23611a612f06db71 "Huong dan cham
--     diem san pham cong nghiep nong thon tieu bieu nam 2026" (01/11).
CREATE TABLE "home_slot_lists" (
  "id" TEXT NOT NULL,
  "block_key" TEXT NOT NULL,
  "max_slots" INTEGER NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "home_slot_lists_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "home_slot_lists_block_key_key" ON "home_slot_lists"("block_key");

CREATE TABLE "home_slot_items" (
  "id" TEXT NOT NULL,
  "list_id" TEXT NOT NULL,
  "article_id" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "home_slot_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "home_slot_items_list_id_article_id_key" ON "home_slot_items"("list_id", "article_id");
CREATE INDEX "home_slot_items_list_id_sort_order_idx" ON "home_slot_items"("list_id", "sort_order");

ALTER TABLE "home_slot_items" ADD CONSTRAINT "home_slot_items_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "home_slot_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "home_slot_items" ADD CONSTRAINT "home_slot_items_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "news_articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "home_slot_lists" ("id", "block_key", "max_slots", "version", "created_at", "updated_at")
VALUES (gen_random_uuid(), 'noi-bat', 4, 0, NOW(), NOW()), (gen_random_uuid(), 'tieu-diem', 3, 0, NOW(), NOW())
ON CONFLICT ("block_key") DO NOTHING;

INSERT INTO "home_slot_items" ("id", "list_id", "article_id", "sort_order", "created_at")
SELECT gen_random_uuid(), l."id", a."id", v.ord, NOW()
FROM (VALUES
  ('noi-bat', '92c3a0643105905f90e3d630', 0),
  ('noi-bat', '2e3dfb3e78307885ffb3cb3c', 1),
  ('noi-bat', 'd3adc6945af65f008ce000dd', 2),
  ('noi-bat', '38bc6979ecb8182a914d4f14', 3),
  ('tieu-diem', '383da5e2c64be662f39dc83a', 0),
  ('tieu-diem', 'd6b002a26a8be3c6438e38ce', 1),
  ('tieu-diem', '560c519f23611a612f06db71', 2)
) AS v(block_key, public_id, ord)
JOIN "home_slot_lists" l ON l."block_key" = v.block_key
JOIN "news_articles" a ON a."public_id" = v.public_id
ON CONFLICT ("list_id", "article_id") DO NOTHING;
