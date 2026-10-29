-- Goi 2A (Nguoi 2) — Su kien toa soan + Tuong thuat truc tiep (liveblog),
-- giai doan 1: backend + CMS + API. Them 5 bang MOI, khong dung bang cu,
-- khong backfill (bang moi rong).
-- Xep hang: chay SAU 20261029160000_zones (1A da merge len main e4899d8);
-- 2 dot tao bang doc lap nen khong xung dot.
-- PostgreSQL: chi dung TIMESTAMP, khong DATETIME (bai hoc dot Phan phoi).
-- Quyet dinh da chot 29/10/2026: Liveblog.event_id NULLABLE (liveblog gan
-- su kien hoac dung doc lap); KHONG realtime o 2A; buoc nop giu mau.

CREATE TABLE "newsroom_events" (
    "id" TEXT NOT NULL,
    "public_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "cover_path" TEXT,
    "category_id" TEXT,
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

    CONSTRAINT "newsroom_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "newsroom_event_approvals" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "step" INTEGER NOT NULL,
    "step_label" TEXT,
    "actor_id" TEXT,
    "actor_role" TEXT,
    "action" TEXT NOT NULL,
    "comment" TEXT,
    "is_exception" BOOLEAN NOT NULL DEFAULT false,
    "exception_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "newsroom_event_approvals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "liveblogs" (
    "id" TEXT NOT NULL,
    "public_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "cover_path" TEXT,
    "event_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "workflow_step" INTEGER NOT NULL DEFAULT 0,
    "publish_at" TIMESTAMP(3),
    "created_by" TEXT,
    "updated_by" TEXT,
    "updated_by_role" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "liveblogs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "liveblog_approvals" (
    "id" TEXT NOT NULL,
    "liveblog_id" TEXT NOT NULL,
    "step" INTEGER NOT NULL,
    "step_label" TEXT,
    "actor_id" TEXT,
    "actor_role" TEXT,
    "action" TEXT NOT NULL,
    "comment" TEXT,
    "is_exception" BOOLEAN NOT NULL DEFAULT false,
    "exception_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "liveblog_approvals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "liveblog_entries" (
    "id" TEXT NOT NULL,
    "liveblog_id" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "media_path" TEXT,
    "is_pinned" BOOLEAN NOT NULL DEFAULT false,
    "created_by" TEXT,
    "updated_by" TEXT,
    "updated_by_role" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "liveblog_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "newsroom_events_public_id_key" ON "newsroom_events"("public_id");
CREATE UNIQUE INDEX "newsroom_events_slug_key" ON "newsroom_events"("slug");
CREATE INDEX "newsroom_events_status_publish_at_idx" ON "newsroom_events"("status", "publish_at");

CREATE INDEX "newsroom_event_approvals_event_id_created_at_idx" ON "newsroom_event_approvals"("event_id", "created_at");

CREATE UNIQUE INDEX "liveblogs_public_id_key" ON "liveblogs"("public_id");
CREATE UNIQUE INDEX "liveblogs_slug_key" ON "liveblogs"("slug");
CREATE INDEX "liveblogs_status_publish_at_idx" ON "liveblogs"("status", "publish_at");
CREATE INDEX "liveblogs_event_id_idx" ON "liveblogs"("event_id");

CREATE INDEX "liveblog_approvals_liveblog_id_created_at_idx" ON "liveblog_approvals"("liveblog_id", "created_at");

CREATE INDEX "liveblog_entries_liveblog_id_created_at_idx" ON "liveblog_entries"("liveblog_id", "created_at");

ALTER TABLE "newsroom_events" ADD CONSTRAINT "newsroom_events_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "news_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "newsroom_event_approvals" ADD CONSTRAINT "newsroom_event_approvals_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "newsroom_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "liveblogs" ADD CONSTRAINT "liveblogs_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "newsroom_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "liveblog_approvals" ADD CONSTRAINT "liveblog_approvals_liveblog_id_fkey" FOREIGN KEY ("liveblog_id") REFERENCES "liveblogs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "liveblog_entries" ADD CONSTRAINT "liveblog_entries_liveblog_id_fkey" FOREIGN KEY ("liveblog_id") REFERENCES "liveblogs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
