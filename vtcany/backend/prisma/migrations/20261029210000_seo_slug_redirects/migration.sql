-- Goi 1D: bang lich su slug cu cua bai viet (chuyen huong 301 khi doi slug).
-- Xep hang SAU migration 1C (20261029190000) va migration 2A cua Nguoi 2
-- (20261029170000, chua push): bang moi, khong dung bang/cot nao cu nen
-- khong xung dot, chi can thu tu thoi gian khac nhau.
-- PostgreSQL: chi dung TIMESTAMP(3), khong DATETIME (bai hoc dot Phan phoi).
-- Ghi chu: created_at co DEFAULT CURRENT_TIMESTAMP (kieu Prisma @default(now())).
CREATE TABLE "news_slug_redirects" (
    "id" TEXT NOT NULL,
    "old_slug" TEXT NOT NULL,
    "article_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "news_slug_redirects_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "news_slug_redirects_old_slug_key" ON "news_slug_redirects"("old_slug");

ALTER TABLE "news_slug_redirects" ADD CONSTRAINT "news_slug_redirects_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "news_articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
