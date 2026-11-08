-- Goi "Binh luan dot 1" (2026-11-08, thiet ke thiet-ke-binh-luan-dot-1.md §2):
-- bang comments + comment_reports + seed quyen comments:view/publish
-- cho role PBĐT + T.PP + seed 8 key cai dat mac dinh (comments.enabled
-- mac dinh 'false' — cong tac portal TAT khi deploy).
-- Chi them bang + seed, KHONG sua/xoa du lieu hien co.

CREATE TABLE "comments" (
    "id" TEXT NOT NULL,
    "article_id" TEXT NOT NULL,
    "user_id" TEXT,
    "admin_id" TEXT,
    "parent_id" TEXT,
    "author_name" TEXT NOT NULL,
    "is_newsroom" BOOLEAN NOT NULL DEFAULT false,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "moderation_reason" TEXT,
    "moderated_by" TEXT,
    "moderated_at" TIMESTAMP(3),
    "flagged_banned_word" BOOLEAN NOT NULL DEFAULT false,
    "report_count" INTEGER NOT NULL DEFAULT 0,
    "auto_hidden_by_reports" BOOLEAN NOT NULL DEFAULT false,
    "ip" TEXT,
    "user_agent" TEXT,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "comments_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "news_articles"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "comments_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "comments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "comments_article_id_status_created_at_idx" ON "comments"("article_id", "status", "created_at");
CREATE INDEX "comments_user_id_created_at_idx" ON "comments"("user_id", "created_at");
CREATE INDEX "comments_status_created_at_idx" ON "comments"("status", "created_at");
CREATE INDEX "comments_parent_id_idx" ON "comments"("parent_id");

CREATE TABLE "comment_reports" (
    "id" TEXT NOT NULL,
    "comment_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comment_reports_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "comment_reports_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "comment_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "comment_reports_comment_id_user_id_key" ON "comment_reports"("comment_id", "user_id");
CREATE INDEX "comment_reports_comment_id_created_at_idx" ON "comment_reports"("comment_id", "created_at");

-- Seed quyen mac dinh: them {"comments": ["view", "publish"]} vao
-- permissions (JSONB) cua role 'PBĐT' va 'T.PP' neu row ton tai.
-- Dung toan tu || de merge, khong mat quyen cu. Neu 2 role nay chua co
-- row trong bang roles thi lenh khong anh huong row nao, admin gan tay
-- tren trang Phan quyen CMS. Super Admin khong can seed ('*': ['*']).
UPDATE "roles"
SET "permissions" = COALESCE("permissions", '{}'::jsonb) || '{"comments": ["view", "publish"]}'::jsonb
WHERE "name" IN ('PBĐT', 'T.PP');

-- Seed cai dat mac dinh (8 key — khong co comments.bannedWords: tu cam
-- dung chung entity 'banned' cua catalog, xem thiet ke §2.3).
-- LUU Y: cot id va updated_at cua site_settings la NOT NULL va KHONG co
-- default o DB (Prisma @default(uuid()) / @updatedAt chi sinh o client),
-- nen INSERT tho phai ghi ro id = gen_random_uuid()::text va
-- updated_at = NOW() (created_at co DEFAULT CURRENT_TIMESTAMP nhung
-- ghi ro NOW() luon cho chac); bo sot se loi P3018 (null violates
-- not-null) va ca migration bi rollback. (Sua 2026-11-08 ~22:46 sau
-- khi resolve lan 1 chay migrate deploy van loi P3018 o updated_at.)
INSERT INTO "site_settings" ("id", "key", "value", "created_at", "updated_at") VALUES
  (gen_random_uuid()::text, 'comments.enabled', 'false', NOW(), NOW()),
  (gen_random_uuid()::text, 'comments.moderationMode', 'pre', NOW(), NOW()),
  (gen_random_uuid()::text, 'comments.turnstileEnabled', 'false', NOW(), NOW()),
  (gen_random_uuid()::text, 'comments.requirePhoneVerified', 'false', NOW(), NOW()),
  (gen_random_uuid()::text, 'comments.maxLength', '1000', NOW(), NOW()),
  (gen_random_uuid()::text, 'comments.dailyLimit', '20', NOW(), NOW()),
  (gen_random_uuid()::text, 'comments.ipDailyLimit', '200', NOW(), NOW()),
  (gen_random_uuid()::text, 'comments.ipBurstLimit', '20', NOW(), NOW())
ON CONFLICT ("key") DO NOTHING;
