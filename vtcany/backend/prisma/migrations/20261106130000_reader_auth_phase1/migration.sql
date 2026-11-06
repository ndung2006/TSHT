-- Dang nhap / dang ky ban doc Giai doan 1 (2026-11-06): xac nhan email,
-- dong y dieu khoan, vo hieu phien cu khi doi mat khau, yeu cau xoa tai
-- khoan; refresh token + token email dung mot lan luu DB dang bam
-- (SHA-256), ben qua restart/deploy thay cho Map bo nho.
-- Tat ca cot moi nullable: tai khoan cu khong doi hanh vi.
ALTER TABLE "users" ADD COLUMN "email_verified_at" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "terms_accepted_at" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "password_changed_at" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "deletion_requested_at" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "deletion_request_reason" TEXT;

CREATE TABLE "user_refresh_tokens" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_refresh_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_refresh_tokens_token_hash_key" ON "user_refresh_tokens"("token_hash");
CREATE INDEX "user_refresh_tokens_user_id_idx" ON "user_refresh_tokens"("user_id");

CREATE TABLE "user_email_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_email_tokens_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "user_email_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "user_email_tokens_token_hash_key" ON "user_email_tokens"("token_hash");
CREATE INDEX "user_email_tokens_user_id_idx" ON "user_email_tokens"("user_id");
