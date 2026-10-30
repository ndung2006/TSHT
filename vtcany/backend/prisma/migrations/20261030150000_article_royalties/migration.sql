-- Goi 2C (Nguoi 2) — Nhuan but: diem he so theo thanh phan + dashboard
-- + xuat Excel. Them 2 bang MOI, khong dung bang cu, khong backfill.
-- Xep hang: chay SAU 20261030120000_newsroom_ads (moi nhat tren main
-- khi tao); cac dot tao bang doc lap nen khong xung dot.
-- PostgreSQL: chi dung TIMESTAMP, khong DATETIME (bai hoc dot Phan phoi).
-- Quyet dinh thiet ke 30/10/2026 (xem thiet-ke-2c-nhuan-but.md): chuoi
-- Truong phong de xuat -> BBT duyet = khoa diem; diem theo 5 thanh phan
-- (noi dung/anh/video/audio/khac), moi thanh phan nguyen 0..3 theo file
-- thong ke that cua toa soan; bai nhieu tac gia chia theo ti le %,
-- mac dinh chia deu.

CREATE TABLE "article_royalties" (
    "id" TEXT NOT NULL,
    "article_id" TEXT NOT NULL,
    "content_score" INTEGER NOT NULL DEFAULT 0,
    "image_score" INTEGER NOT NULL DEFAULT 0,
    "video_score" INTEGER NOT NULL DEFAULT 0,
    "audio_score" INTEGER NOT NULL DEFAULT 0,
    "other_score" INTEGER NOT NULL DEFAULT 0,
    "shares" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "workflow_step" INTEGER NOT NULL DEFAULT 0,
    "created_by" TEXT,
    "updated_by" TEXT,
    "updated_by_role" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "article_royalties_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "article_royalty_approvals" (
    "id" TEXT NOT NULL,
    "royalty_id" TEXT NOT NULL,
    "step" INTEGER NOT NULL,
    "step_label" TEXT,
    "actor_id" TEXT,
    "actor_role" TEXT,
    "action" TEXT NOT NULL,
    "comment" TEXT,
    "is_exception" BOOLEAN NOT NULL DEFAULT false,
    "exception_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "article_royalty_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "article_royalties_article_id_key" ON "article_royalties"("article_id");

-- CreateIndex
CREATE INDEX "article_royalties_status_idx" ON "article_royalties"("status");

-- CreateIndex
CREATE INDEX "article_royalty_approvals_royalty_id_created_at_idx" ON "article_royalty_approvals"("royalty_id", "created_at");

-- AddForeignKey
ALTER TABLE "article_royalties" ADD CONSTRAINT "article_royalties_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "news_articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "article_royalty_approvals" ADD CONSTRAINT "article_royalty_approvals_royalty_id_fkey" FOREIGN KEY ("royalty_id") REFERENCES "article_royalties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
