-- Cho phep tat viec lay EPG tu VTC AIO theo tung kenh (mac dinh: lay).
ALTER TABLE "channel_overrides" ADD COLUMN "use_aio_epg" BOOLEAN NOT NULL DEFAULT true;
