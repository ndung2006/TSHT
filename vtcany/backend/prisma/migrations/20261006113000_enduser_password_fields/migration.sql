-- Nguoi dung cuoi: them mat khau + ten hien thi + provider_id (quan ly user trong CMS)
ALTER TABLE "users" ADD COLUMN "password_hash" TEXT;
ALTER TABLE "users" ADD COLUMN "display_name" TEXT;
ALTER TABLE "users" ADD COLUMN "provider_id" TEXT;
