-- Upload VOD tu CMS: bo sung cot cho bang media_assets (da co tu init).
ALTER TABLE "media_assets" ADD COLUMN "filename" TEXT;
ALTER TABLE "media_assets" ADD COLUMN "size_bytes" BIGINT;
ALTER TABLE "media_assets" ADD COLUMN "content_type" TEXT;
ALTER TABLE "media_assets" ADD COLUMN "video_id" TEXT;

-- CreateIndex
CREATE INDEX "media_assets_status_created_at_idx" ON "media_assets"("status", "created_at");
