-- Goi 2D (Nguoi 2) — Ha tang dung chung: thu muc logic cho Thu vien
-- media (2D-1), 2FA TOTP cho admin_users (2D-2), bang ket noi mang xa
-- hoi cho Facebook (2D-3). Xep hang: chay SAU
-- 20261030150000_article_royalties (moi nhat tren main khi tao).
-- PostgreSQL: chi dung TIMESTAMP, khong DATETIME.
-- 2D-1: chi THEM cot folder_id + bang media_folders; khong di chuyen
-- du lieu/file vat ly — moi ban ghi cu mac dinh chua phan loai (NULL).

-- CreateTable
CREATE TABLE "media_folders" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parent_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "media_folders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_connections" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "page_id" TEXT NOT NULL,
    "page_name" TEXT,
    "access_token" TEXT NOT NULL,
    "connected_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "social_connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "media_folders_parent_id_idx" ON "media_folders"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "social_connections_platform_key" ON "social_connections"("platform");

-- AlterTable: thu muc logic cua media_assets
ALTER TABLE "media_assets" ADD COLUMN "folder_id" TEXT;

-- CreateIndex
CREATE INDEX "media_assets_folder_id_idx" ON "media_assets"("folder_id");

-- AlterTable: 2FA TOTP cho admin (opt-in, mac dinh tat — khong khoa
-- ngoai bat ky tai khoan cu nao)
ALTER TABLE "admin_users" ADD COLUMN "totp_secret" TEXT;
ALTER TABLE "admin_users" ADD COLUMN "totp_pending_secret" TEXT;
ALTER TABLE "admin_users" ADD COLUMN "totp_enabled" BOOLEAN NOT NULL DEFAULT false;

-- AddForeignKey
ALTER TABLE "media_folders" ADD CONSTRAINT "media_folders_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "media_folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "media_folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
