-- Quy trinh duyet so bao in (E-paper) — them ngay 2026-10-27, thuoc repo TSHT.
-- Chay bang: prisma migrate deploy (sau prisma generate).
-- Chi them cot/bang moi: so da xuat ban tu truoc giu nguyen status +
-- workflow_step = 0, khong doi trang thai cong khai hien tai.
ALTER TABLE "epaper_issues" ADD COLUMN "workflow_step" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "epaper_issue_approvals" (
    "id" TEXT NOT NULL,
    "issue_id" TEXT NOT NULL,
    "step" INTEGER NOT NULL,
    "step_label" TEXT,
    "actor_id" TEXT,
    "actor_role" TEXT,
    "action" TEXT NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "epaper_issue_approvals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "epaper_issue_approvals_issue_id_created_at_idx" ON "epaper_issue_approvals"("issue_id", "created_at");
ALTER TABLE "epaper_issue_approvals" ADD CONSTRAINT "epaper_issue_approvals_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "epaper_issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
