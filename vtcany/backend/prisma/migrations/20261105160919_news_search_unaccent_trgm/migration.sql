-- Tim kiem tin bai khong dau (Buoc 0 tim kiem portal, Q1-Q5 da chot).
-- unaccent + pg_trgm: chuan hoa khong dau roi khop chuoi con / do tuong tu
-- trigram. RUI RO: CREATE EXTENSION can quyen DB; user postgres tren
-- Coolify thuong la superuser nhung chua xac minh — neu migration fail
-- o buoc nay thi phai tao extension bang tay bang tai khoan superuser
-- truoc khi deploy lai backend (khong sua quyen DB trong migration).
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- unaccent() mac dinh la STABLE, khong dung truc tiep duoc trong bieu
-- thuc chi muc. Ham boc IMMUTABLE nay la buoc bat buoc truoc khi tao index.
CREATE OR REPLACE FUNCTION public.immutable_unaccent(text)
RETURNS text LANGUAGE sql IMMUTABLE AS
$$ SELECT public.unaccent('public.unaccent', $1) $$;

-- Chi muc trigram cho tieu de + sapo (duong tim nong nhat). Body giai
-- doan 1 tim bang bieu thuc khong chi muc (regexp_replace tru the HTML);
-- them cot body_text + chi muc sau neu do thay cham (xem Buoc 0 §2.2).
CREATE INDEX IF NOT EXISTS idx_news_title_search
  ON "news_articles" USING gin (immutable_unaccent(lower("title")) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_news_sapo_search
  ON "news_articles" USING gin (immutable_unaccent(lower("sapo")) gin_trgm_ops);
