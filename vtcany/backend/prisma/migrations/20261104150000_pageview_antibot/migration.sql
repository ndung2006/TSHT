-- Chong bot PageView khi dong GĐ1 (2026-11-04): dedupe theo phien +
-- danh dau du lieu sach cho dashboard tang C (GĐ3).
-- session_id / is_clean: nullable (dong cu khong can backfill, khong co
-- gia tri mac dinh sai lech: row cu giu is_clean = NULL de phan biet voi
-- row sach ghi tu ban nay).
-- PostgreSQL: chi dung TIMESTAMP, khong DATETIME.
ALTER TABLE "page_views" ADD COLUMN "session_id" TEXT;
ALTER TABLE "page_views" ADD COLUMN "is_clean" BOOLEAN;
CREATE INDEX "page_views_session_id_created_at_idx" ON "page_views"("session_id", "created_at");
