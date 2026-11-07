-- Beat cuoi VOD (3c-final-beat): ghi so giay thuc su phat theo phien.
-- Chi them cot (khong ghi du lieu cu, khong backfill) nen khong can
-- pg_dump truoc khi ap migration nay.
-- channel_heartbeats.watched_seconds: so giay thuc phat cua beat cuoi
-- (chi beat cuoi moi co gia tri; beat thuong de NULL).
-- channel_heartbeats.is_final: danh dau day la beat cuoi (ended /
-- pause lau / pagehide); beat cuoi dedupe theo MAX cho cung phien.
-- channel_telemetry_daily.watched_seconds: tong so giay thuc phat
-- cua nhom (phien co beat cuoi -> max(watchedSeconds); phien khong
-- co beat cuoi -> so beat x 60). KHONG lam tron khi luu;
-- watched_minutes giu nhu cu (= heartbeats) de tuong thich.
ALTER TABLE "channel_heartbeats" ADD COLUMN "watched_seconds" INTEGER;
ALTER TABLE "channel_heartbeats" ADD COLUMN "is_final" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "channel_telemetry_daily" ADD COLUMN "watched_seconds" INTEGER NOT NULL DEFAULT 0;
