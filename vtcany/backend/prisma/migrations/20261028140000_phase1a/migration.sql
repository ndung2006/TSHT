-- Dot 1a (CMS Toa soan hoi tu) — chuan hoa content_type + payload bai viet,
-- thuc the Phong ban, bo thu pageview. Thuoc repo TSHT.
-- Chay bang: prisma migrate deploy (sau prisma generate).
-- Chi them cot/bang moi, khong doi field cong khai hien co:
--   bai hien co -> content_type = 'text' (mac dinh cot), cac co moi = false,
--   allow_comments = true, local_news = NULL.

-- 1. Bai viet: dinh dang + co hien thi + nhan tin dia phuong.
ALTER TABLE "news_articles" ADD COLUMN "content_type" TEXT NOT NULL DEFAULT 'text';
ALTER TABLE "news_articles" ADD COLUMN "is_spotlight" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "news_articles" ADD COLUMN "is_photo" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "news_articles" ADD COLUMN "is_infographic" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "news_articles" ADD COLUMN "allow_comments" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "news_articles" ADD COLUMN "local_news" TEXT;

-- 2. Phong ban (chi du lieu nen o Dot 1a, chua logic loc).
CREATE TABLE "departments" (
    "id" TEXT NOT NULL,
    "public_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_visible" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "departments_public_id_key" ON "departments"("public_id");
CREATE UNIQUE INDEX "departments_slug_key" ON "departments"("slug");
CREATE INDEX "departments_sort_order_idx" ON "departments"("sort_order");

ALTER TABLE "admin_users" ADD COLUMN "department_id" TEXT;
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 3. Su kien luot xem (chi thu thap o Dot 1a, chua dashboard).
-- Khong luu IP, user-agent, user id.
CREATE TABLE "page_views" (
    "id" TEXT NOT NULL,
    "article_public_id" TEXT,
    "path" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "page_views_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "page_views_article_public_id_created_at_idx" ON "page_views"("article_public_id", "created_at");
