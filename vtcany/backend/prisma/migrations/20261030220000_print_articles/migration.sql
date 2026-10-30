-- Goi "Chuyen sang bao in": bai bao in (ban sao bai bao dien tu, duyet
-- lai theo quy trinh bao in KTV -> MD -> T.PP -> P.TBT -> TBT, TBT duyet
-- xong = "Da duyet, cho dan trang", khong xuat ban cong khai).
-- Them 2 bang MOI, khong dung bang cu, khong backfill.
-- PostgreSQL: chi dung TIMESTAMP, khong DATETIME.
-- Quan he duy nhat la approvals -> print_articles (khuon epaper);
-- categoryId va sourceNewsPublicId chi la chuoi (khong FK) de tranh P1012.

CREATE TABLE "print_articles" (
    "id" TEXT NOT NULL,
    "public_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sapo" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL DEFAULT '',
    "category_id" TEXT,
    "cover_path" TEXT,
    "authors" TEXT[] NOT NULL DEFAULT '{}',
    "tags" TEXT[] NOT NULL DEFAULT '{}',
    "source_news_public_id" TEXT NOT NULL,
    "source_news_slug" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "workflow_step" INTEGER NOT NULL DEFAULT 0,
    "created_by" TEXT,
    "updated_by" TEXT,
    "updated_by_role" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "print_articles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "print_article_approvals" (
    "id" TEXT NOT NULL,
    "article_id" TEXT NOT NULL,
    "step" INTEGER NOT NULL,
    "step_label" TEXT,
    "actor_id" TEXT,
    "actor_role" TEXT,
    "action" TEXT NOT NULL,
    "comment" TEXT,
    "is_exception" BOOLEAN NOT NULL DEFAULT false,
    "exception_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "print_article_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "print_articles_public_id_key" ON "print_articles"("public_id");
CREATE UNIQUE INDEX "print_articles_slug_key" ON "print_articles"("slug");
CREATE UNIQUE INDEX "print_articles_source_news_public_id_key" ON "print_articles"("source_news_public_id");
CREATE INDEX "print_articles_status_created_at_idx" ON "print_articles"("status", "created_at");
CREATE INDEX "print_article_approvals_article_id_created_at_idx" ON "print_article_approvals"("article_id", "created_at");

-- AddForeignKey
ALTER TABLE "print_article_approvals" ADD CONSTRAINT "print_article_approvals_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "print_articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
