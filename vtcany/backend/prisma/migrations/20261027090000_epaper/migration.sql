-- Bao in (E-paper) — module nhap lieu so bao trong CMS, thuoc repo TSHT.
-- Chay bang: prisma migrate deploy (sau prisma generate).
CREATE TABLE "epaper_issues" (
    "id" TEXT NOT NULL,
    "public_id" TEXT NOT NULL,
    "issue_number" INTEGER NOT NULL,
    "issue_type" TEXT NOT NULL,
    "publish_date" DATE NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "published_at" TIMESTAMP(3),
    "pdf_path" TEXT,
    "pdf_size_bytes" BIGINT,
    "page_count" INTEGER NOT NULL DEFAULT 0,
    "cover_path" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "epaper_issues_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "epaper_issues_public_id_key" ON "epaper_issues"("public_id");
CREATE UNIQUE INDEX "epaper_issues_slug_key" ON "epaper_issues"("slug");
CREATE UNIQUE INDEX "epaper_issues_issue_type_issue_number_key" ON "epaper_issues"("issue_type", "issue_number");
CREATE INDEX "epaper_issues_status_publish_date_idx" ON "epaper_issues"("status", "publish_date");

CREATE TABLE "epaper_issue_revisions" (
    "id" TEXT NOT NULL,
    "issue_id" TEXT NOT NULL,
    "revision_no" INTEGER NOT NULL,
    "changed_by" TEXT,
    "change_reason" TEXT,
    "snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "epaper_issue_revisions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "epaper_issue_revisions_issue_id_revision_no_key" ON "epaper_issue_revisions"("issue_id", "revision_no");
ALTER TABLE "epaper_issue_revisions" ADD CONSTRAINT "epaper_issue_revisions_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "epaper_issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
