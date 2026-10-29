-- Goi 1B: them cot format_data (JSONB, nullable) cho bai viet da dinh dang.
-- Xep hang SAU migration zones da fix (20261029160000, main c07512d).
-- Timestamp 180000 tranh trung voi migration 20261029170000_events_liveblog
-- cua Nguoi 2 (chua push, dang tam dung): 2 migration khac bang/cot nen
-- khong xung dot, chi can thu tu thoi gian khac nhau. Neu dot 1 cua 2A
-- len main truoc thi migration nay van chay sau nho timestamp lon hon.
-- PostgreSQL: khong co cot thoi gian moi nen khong lien quan quy tac TIMESTAMP.
-- format_data chi chua URL media da host { videoUrl?, audioUrl?, imageUrl?,
-- images? } — xem news-format-data.ts (normalize loc key la, chan base64).
ALTER TABLE "news_articles" ADD COLUMN "format_data" JSONB;
