-- Admin login bang username/email + role dang string (permissionsFor dung roleName).
-- email cho phep NULL: tai khoan seed chi co username (admin/editor) khong bat buoc co email.
ALTER TABLE "admin_users" ADD COLUMN "username" TEXT;
ALTER TABLE "admin_users" ADD COLUMN "role_name" TEXT;
ALTER TABLE "admin_users" ALTER COLUMN "email" DROP NOT NULL;

CREATE UNIQUE INDEX "admin_users_username_key" ON "admin_users" ("username");
