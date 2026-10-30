-- Goi "Quan ly giao dien": 4 bang MOI, khong dung bang cu, khong backfill.
-- PostgreSQL: chi dung TIMESTAMP, khong DATETIME.
-- categoryId/articleId chi la chuoi (khong FK) de tranh P1012, giong
-- print-articles: service tu tra cuu ten/slug luc doc.

CREATE TABLE "nav_menu_items" (
    "id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nav_menu_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "nav_menu_items_category_id_key" ON "nav_menu_items"("category_id");
CREATE INDEX "nav_menu_items_sort_order_idx" ON "nav_menu_items"("sort_order");

CREATE TABLE "home_sections" (
    "id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "home_sections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "home_sections_category_id_key" ON "home_sections"("category_id");
CREATE INDEX "home_sections_sort_order_idx" ON "home_sections"("sort_order");

CREATE TABLE "hot_links" (
    "id" TEXT NOT NULL,
    "article_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hot_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "hot_links_article_id_key" ON "hot_links"("article_id");
CREATE INDEX "hot_links_sort_order_idx" ON "hot_links"("sort_order");

CREATE TABLE "site_settings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "site_settings_key_key" ON "site_settings"("key");
