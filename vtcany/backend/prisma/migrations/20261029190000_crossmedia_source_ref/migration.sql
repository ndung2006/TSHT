-- Goi 1C: them cot source_ref (JSONB, nullable) cho bai viet chuyen doi cheo.
-- Luu nguon goc ban nhap: { type: 'tv-video' | 'tv-short' | 'epaper', id, title, ... }.
-- Xep hang SAU migration 1B (20261029180000) va migration 2A cua Nguoi 2
-- (20261029170000, chua push): khac bang/cot nen khong xung dot, chi can
-- thu tu thoi gian khac nhau. PostgreSQL: chi dung JSONB, khong co cot
-- thoi gian moi nen khong lien quan quy tac TIMESTAMP.
-- source_ref chi admin thay (news.service.ts toItem), khong hien cong khai.
ALTER TABLE "news_articles" ADD COLUMN "source_ref" JSONB;
