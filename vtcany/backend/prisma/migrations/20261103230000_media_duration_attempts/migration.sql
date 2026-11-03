-- Duration worker probe + dem lan thu/backoff cho transcode duong poll.
-- duration_seconds/next_retry_at: nullable (dong cu khong can backfill).
-- attempts: NOT NULL nhung CO DEFAULT 0 nen dong cu duoc backfill an toan
-- (bai hoc su co migration 2026-11-03: khong them cot NOT NULL khong default).
-- PostgreSQL: chi dung TIMESTAMP, khong DATETIME.
ALTER TABLE "media_assets" ADD COLUMN "duration_seconds" INTEGER;
ALTER TABLE "media_assets" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "media_assets" ADD COLUMN "next_retry_at" TIMESTAMP(3);
