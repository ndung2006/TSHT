# services/worker — Media Worker (FFmpeg transcode HLS)

Implementation hiện tại nằm ở `../../worker/` (poll loop + FFmpeg local ở Phase 1/2).

Bước 6 sẽ xây dựng full: BullMQ queue `transcode:queue` (Redis), 3 bitrate
1080p/720p/480p → `vod/{asset_id}/master.m3u8` trên MinIO, Dockerfile
`jrottenberg/ffmpeg`, Coolify limit 2 CPU / 4GB.
