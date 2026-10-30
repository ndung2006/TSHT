-- Goi 2B (Nguoi 2) — Quang cao toa soan, giai doan 1: backend + CMS + API.
-- Them 2 bang MOI, khong dung bang cu, khong backfill (bang moi rong).
-- Xep hang: chay SAU 20261029210000_seo_slug_redirects (moi nhat tren main
-- khi tao); cac dot tao bang doc lap nen khong xung dot.
-- PostgreSQL: chi dung TIMESTAMP, khong DATETIME (bai hoc dot Phan phoi).
-- Quyet dinh thiet ke 30/10/2026 (xem thiet-ke-2b-quang-cao.md): chuoi
-- QL-QC -> TBT 1 buoc; tach han banner catalog OTT; ma HTML/JS chi hien
-- thi trong iframe sandbox phia portal; placement la khoa chuoi tu do.

CREATE TABLE "newsroom_ads" (
    "id" TEXT NOT NULL,
    "public_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "placement" TEXT NOT NULL DEFAULT '',
    "type" TEXT NOT NULL DEFAULT 'image',
    "image_path" TEXT,
    "link_url" TEXT,
    "html_content" TEXT NOT NULL DEFAULT '',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'draft',
    "workflow_step" INTEGER NOT NULL DEFAULT 0,
    "publish_at" TIMESTAMP(3),
    "created_by" TEXT,
    "updated_by" TEXT,
    "updated_by_role" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "newsroom_ads_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "newsroom_ad_approvals" (
    "id" TEXT NOT NULL,
    "ad_id" TEXT NOT NULL,
    "step" INTEGER NOT NULL,
    "step_label" TEXT,
    "actor_id" TEXT,
    "actor_role" TEXT,
    "action" TEXT NOT NULL,
    "comment" TEXT,
    "is_exception" BOOLEAN NOT NULL DEFAULT false,
    "exception_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "newsroom_ad_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "newsroom_ads_public_id_key" ON "newsroom_ads"("public_id");

-- CreateIndex
CREATE INDEX "newsroom_ads_status_publish_at_idx" ON "newsroom_ads"("status", "publish_at");

-- CreateIndex
CREATE INDEX "newsroom_ads_placement_status_idx" ON "newsroom_ads"("placement", "status");

-- CreateIndex
CREATE INDEX "newsroom_ad_approvals_ad_id_created_at_idx" ON "newsroom_ad_approvals"("ad_id", "created_at");

-- AddForeignKey
ALTER TABLE "newsroom_ad_approvals" ADD CONSTRAINT "newsroom_ad_approvals_ad_id_fkey" FOREIGN KEY ("ad_id") REFERENCES "newsroom_ads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
