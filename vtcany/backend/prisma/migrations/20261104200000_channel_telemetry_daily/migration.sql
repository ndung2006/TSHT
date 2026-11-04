-- Telemetry kenh + tong hop ngay (GĐ3 nen, 2026-11-04): heartbeat tu player
-- ghi DB (khong in-memory) + bang gop ngay cho PageView va telemetry kenh.
-- PostgreSQL: chi dung TIMESTAMP, khong DATETIME. Bang moi hoan toan,
-- khong dong cot cu, khong can backfill.
CREATE TABLE "channel_heartbeats" (
    "id" TEXT NOT NULL,
    "session_id" TEXT,
    "channel_public_id" TEXT,
    "channel_name" TEXT,
    "content_id" TEXT,
    "view_type" TEXT NOT NULL,
    "is_clean" BOOLEAN,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "channel_heartbeats_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "channel_heartbeats_channel_public_id_created_at_idx" ON "channel_heartbeats"("channel_public_id", "created_at");
CREATE INDEX "channel_heartbeats_session_id_created_at_idx" ON "channel_heartbeats"("session_id", "created_at");
CREATE TABLE "pageview_daily" (
    "id" TEXT NOT NULL,
    "vn_date" DATE NOT NULL,
    "content_type" TEXT NOT NULL,
    "content_key" TEXT NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "unique_sessions" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "pageview_daily_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pageview_daily_vn_date_content_type_content_key_key" UNIQUE ("vn_date", "content_type", "content_key")
);
CREATE INDEX "pageview_daily_vn_date_idx" ON "pageview_daily"("vn_date");
CREATE TABLE "channel_telemetry_daily" (
    "id" TEXT NOT NULL,
    "vn_date" DATE NOT NULL,
    "channel_public_id" TEXT,
    "channel_name" TEXT,
    "content_id" TEXT,
    "view_type" TEXT NOT NULL,
    "heartbeats" INTEGER NOT NULL DEFAULT 0,
    "unique_sessions" INTEGER NOT NULL DEFAULT 0,
    "watched_minutes" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "channel_telemetry_daily_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "channel_telemetry_daily_vn_date_channel_public_id_view_type_key" UNIQUE ("vn_date", "channel_public_id", "view_type"),
    CONSTRAINT "channel_telemetry_daily_vn_date_content_id_view_type_key" UNIQUE ("vn_date", "content_id", "view_type")
);
CREATE INDEX "channel_telemetry_daily_vn_date_idx" ON "channel_telemetry_daily"("vn_date");
