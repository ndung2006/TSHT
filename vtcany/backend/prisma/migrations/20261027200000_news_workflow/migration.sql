-- Quy trinh duyet bai viet tin tuc — them ngay 2026-10-27, thuoc repo TSHT.
-- Chay bang: prisma migrate deploy (sau prisma generate).
-- Chi them cot/bang moi: bai da xuat ban tu truoc giu nguyen status +
-- workflow_step = 0, khong doi trang thai cong khai hien tai.
ALTER TABLE "news_articles" ADD COLUMN "workflow_step" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "news_article_approvals" (
    "id" TEXT NOT NULL,
    "article_id" TEXT NOT NULL,
    "step" INTEGER NOT NULL,
    "step_label" TEXT,
    "actor_id" TEXT,
    "actor_role" TEXT,
    "action" TEXT NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "news_article_approvals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "news_article_approvals_article_id_created_at_idx" ON "news_article_approvals"("article_id", "created_at");
ALTER TABLE "news_article_approvals" ADD CONSTRAINT "news_article_approvals_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "news_articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
