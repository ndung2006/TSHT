-- Giai doan 2 nen tang so: module Phan phoi da nen tang (app/Facebook/TikTok).
-- Chay bang: prisma migrate deploy (sau prisma generate).
-- Chi them bang moi, khong doi bang hien co.
CREATE TABLE "distribution_posts" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "public_id" TEXT NOT NULL UNIQUE,
  "title" TEXT NOT NULL,
  "caption" TEXT,
  "media_url" TEXT,
  "media_type" TEXT NOT NULL DEFAULT 'image',
  "status" TEXT NOT NULL DEFAULT 'draft',
  "published_at" DATETIME,
  "created_by" TEXT,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "distribution_posts_status_published_at_idx" ON "distribution_posts"("status", "published_at");
CREATE TABLE "distribution_targets" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "post_id" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "url" TEXT,
  "posted_at" DATETIME,
  "note" TEXT,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "distribution_targets_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "distribution_posts" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "distribution_targets_post_id_platform_key" UNIQUE ("post_id", "platform")
);
