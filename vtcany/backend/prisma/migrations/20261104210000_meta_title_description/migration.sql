-- Meta title/description rieng cho bai viet + chuyen muc (goi khep nho).
-- PostgreSQL: chi dung TIMESTAMP, khong DATETIME. Cot nullable, khong
-- can backfill: de trong = dung title/sapo (bai) hoac ten muc (chuyen muc).
ALTER TABLE "news_articles" ADD COLUMN "meta_title" TEXT;
ALTER TABLE "news_articles" ADD COLUMN "meta_description" TEXT;
ALTER TABLE "news_categories" ADD COLUMN "meta_title" TEXT;
ALTER TABLE "news_categories" ADD COLUMN "meta_description" TEXT;
