-- Quan tri vien: them anh dai dien (giong CMS VTC Play)
ALTER TABLE "admin_users" ADD COLUMN "avatar_url" TEXT;
-- Vai tro: them ngay tao (hien thi tren CMS)
ALTER TABLE "roles" ADD COLUMN "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW();
