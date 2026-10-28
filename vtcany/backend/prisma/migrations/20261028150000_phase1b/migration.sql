-- Dot 1b (CMS Toa soan hoi tu) — log ngoai le tin nong cho tach nhiem vu.
-- Chay bang: prisma migrate deploy (sau prisma generate).
-- Chi them cot, khong doi field hien co; ban ghi cu ve is_exception = false.
ALTER TABLE "news_article_approvals" ADD COLUMN "is_exception" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "news_article_approvals" ADD COLUMN "exception_reason" TEXT;
ALTER TABLE "epaper_issue_approvals" ADD COLUMN "is_exception" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "epaper_issue_approvals" ADD COLUMN "exception_reason" TEXT;
