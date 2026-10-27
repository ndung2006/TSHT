-- Tin bai (toà soan bao dien tu, theo mau CMS Dien Bien) — module moi trong CMS, thuoc repo TSHT.
-- Chay bang: prisma migrate deploy (sau prisma generate).
CREATE TABLE "news_categories" (
    "id" TEXT NOT NULL,
    "public_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "parent_id" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_visible" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "news_categories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "news_categories_public_id_key" ON "news_categories"("public_id");
CREATE UNIQUE INDEX "news_categories_slug_key" ON "news_categories"("slug");
CREATE INDEX "news_categories_parent_id_sort_order_idx" ON "news_categories"("parent_id", "sort_order");

CREATE TABLE "news_articles" (
    "id" TEXT NOT NULL,
    "public_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sapo" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL DEFAULT '',
    "category_id" TEXT,
    "cover_path" TEXT,
    "authors" TEXT[],
    "tags" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'draft',
    "publish_at" TIMESTAMP(3),
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "created_by" TEXT,
    "updated_by" TEXT,
    "updated_by_role" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "news_articles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "news_articles_public_id_key" ON "news_articles"("public_id");
CREATE UNIQUE INDEX "news_articles_slug_key" ON "news_articles"("slug");
CREATE INDEX "news_articles_status_publish_at_idx" ON "news_articles"("status", "publish_at");
CREATE INDEX "news_articles_category_id_publish_at_idx" ON "news_articles"("category_id", "publish_at");

ALTER TABLE "news_categories" ADD CONSTRAINT "news_categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "news_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "news_articles" ADD CONSTRAINT "news_articles_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "news_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
