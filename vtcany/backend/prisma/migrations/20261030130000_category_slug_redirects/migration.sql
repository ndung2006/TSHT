-- Goi 1D-2: bang lich su slug cu cua chuyen muc (chuyen huong 301 khi doi slug).
-- Sao khuon migration 1D (20261029210000_seo_slug_redirects). Xep hang SAU
-- migration 2B quang cao (20261030120000_newsroom_ads): bang moi, khong dung
-- bang/cot nao cu nen khong xung dot, chi can thu tu thoi gian khac nhau.
-- PostgreSQL: chi dung TIMESTAMP(3), khong DATETIME (bai hoc dot Phan phoi).
-- Ghi chu: created_at co DEFAULT CURRENT_TIMESTAMP (kieu Prisma @default(now())).
CREATE TABLE "category_slug_redirects" (
    "id" TEXT NOT NULL,
    "old_slug" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "category_slug_redirects_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "category_slug_redirects_old_slug_key" ON "category_slug_redirects"("old_slug");

ALTER TABLE "category_slug_redirects" ADD CONSTRAINT "category_slug_redirects_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "news_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
