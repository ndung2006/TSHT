-- Bo sung field danh muc theo form CMS VTCPlay: Code, Anh thumbnail SEO,
-- Hien thi noi dung theo (created | manual).
-- (Bang categories da co tu migration init 20251001110000_init.)
ALTER TABLE "categories" ADD COLUMN "code" TEXT;
ALTER TABLE "categories" ADD COLUMN "seo_thumbnail" TEXT;
ALTER TABLE "categories" ADD COLUMN "content_sort" TEXT NOT NULL DEFAULT 'created';
