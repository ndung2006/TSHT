-- ============================================================
-- RA DATA &nbsp; / U+00A0 — CHI DOC, KHONG SUA GI
-- ============================================================
-- Muc dich: dem theo tung bang/o co bao nhieu ban ghi chua khoang
-- trang khong ngat dong (thuc the &nbsp; / &#160; / &#xa0; — khong
-- phan biet hoa thuong — hoac ky tu tho U+00A0 = chr(160)), kem 2-3
-- mau trich doan moi o chinh, de user duyet TRUOC khi quyet dinh
-- sua hang loat.
--
-- Chay trong terminal postgres cua Coolify (database vtc_any):
--   psql -U postgres -d vtc_any -f audit-nbsp-save.sql
-- hoac copy tung khoi SELECT vao terminal. File nay CHI co SELECT
-- (khong co UPDATE/DELETE/INSERT) — chay an toan, khong doi du lieu.
--
-- Ghi chu:
-- * newsroom_ads.html_content KHONG co trong danh sach nay: do la ma
--   HTML/JS nhung san cua ben thu ba, helper chuan hoa luc luu co
--   tinh khong dung vao (chi chuan hoa ten quang cao).
-- * layout_blocks.config va news_categories.* duoc dem de tham khao
--   (khong phai o Quill, helper khong chuan hoa khi luu).
-- * Mau trich doan lay cua so 120 ky tu quanh vi tri &nbsp; dau tien;
--   vi tri tim bang lower() nen bat ca &NBSP; viet hoa.
-- ============================================================

-- ================= A. DEM TONG HOP (1 dong / bang / o) =================
SELECT 'news_articles.title' AS o, count(*) AS so_ban_ghi
FROM news_articles
WHERE title ILIKE '%&nbsp;%' OR title ILIKE '%&#160;%' OR title ILIKE '%&#xa0;%' OR title LIKE '%' || chr(160) || '%'
UNION ALL
SELECT 'news_articles.sapo', count(*)
FROM news_articles
WHERE sapo ILIKE '%&nbsp;%' OR sapo ILIKE '%&#160;%' OR sapo ILIKE '%&#xa0;%' OR sapo LIKE '%' || chr(160) || '%'
UNION ALL
SELECT 'news_articles.body', count(*)
FROM news_articles
WHERE body ILIKE '%&nbsp;%' OR body ILIKE '%&#160;%' OR body ILIKE '%&#xa0;%' OR body LIKE '%' || chr(160) || '%'
UNION ALL
SELECT 'news_articles.meta_title', count(*)
FROM news_articles
WHERE meta_title ILIKE '%&nbsp;%' OR meta_title ILIKE '%&#160;%' OR meta_title ILIKE '%&#xa0;%' OR meta_title LIKE '%' || chr(160) || '%'
UNION ALL
SELECT 'news_articles.meta_description', count(*)
FROM news_articles
WHERE meta_description ILIKE '%&nbsp;%' OR meta_description ILIKE '%&#160;%' OR meta_description ILIKE '%&#xa0;%' OR meta_description LIKE '%' || chr(160) || '%'
UNION ALL
SELECT 'print_articles.title', count(*)
FROM print_articles
WHERE title ILIKE '%&nbsp;%' OR title ILIKE '%&#160;%' OR title ILIKE '%&#xa0;%' OR title LIKE '%' || chr(160) || '%'
UNION ALL
SELECT 'print_articles.sapo', count(*)
FROM print_articles
WHERE sapo ILIKE '%&nbsp;%' OR sapo ILIKE '%&#160;%' OR sapo ILIKE '%&#xa0;%' OR sapo LIKE '%' || chr(160) || '%'
UNION ALL
SELECT 'print_articles.body', count(*)
FROM print_articles
WHERE body ILIKE '%&nbsp;%' OR body ILIKE '%&#160;%' OR body ILIKE '%&#xa0;%' OR body LIKE '%' || chr(160) || '%'
UNION ALL
SELECT 'site_settings.footer.description', count(*)
FROM site_settings
WHERE key = 'footer.description'
  AND (value ILIKE '%&nbsp;%' OR value ILIKE '%&#160;%' OR value ILIKE '%&#xa0;%' OR value LIKE '%' || chr(160) || '%')
UNION ALL
SELECT 'site_settings.footer.copyright', count(*)
FROM site_settings
WHERE key = 'footer.copyright'
  AND (value ILIKE '%&nbsp;%' OR value ILIKE '%&#160;%' OR value ILIKE '%&#xa0;%' OR value LIKE '%' || chr(160) || '%')
UNION ALL
SELECT 'newsroom_events.title', count(*)
FROM newsroom_events
WHERE title ILIKE '%&nbsp;%' OR title ILIKE '%&#160;%' OR title ILIKE '%&#xa0;%' OR title LIKE '%' || chr(160) || '%'
UNION ALL
SELECT 'newsroom_events.description', count(*)
FROM newsroom_events
WHERE description ILIKE '%&nbsp;%' OR description ILIKE '%&#160;%' OR description ILIKE '%&#xa0;%' OR description LIKE '%' || chr(160) || '%'
UNION ALL
SELECT 'liveblogs.title', count(*)
FROM liveblogs
WHERE title ILIKE '%&nbsp;%' OR title ILIKE '%&#160;%' OR title ILIKE '%&#xa0;%' OR title LIKE '%' || chr(160) || '%'
UNION ALL
SELECT 'liveblogs.description', count(*)
FROM liveblogs
WHERE description ILIKE '%&nbsp;%' OR description ILIKE '%&#160;%' OR description ILIKE '%&#xa0;%' OR description LIKE '%' || chr(160) || '%'
UNION ALL
SELECT 'liveblog_entries.body', count(*)
FROM liveblog_entries
WHERE body ILIKE '%&nbsp;%' OR body ILIKE '%&#160;%' OR body ILIKE '%&#xa0;%' OR body LIKE '%' || chr(160) || '%'
UNION ALL
SELECT 'distribution_posts.title', count(*)
FROM distribution_posts
WHERE title ILIKE '%&nbsp;%' OR title ILIKE '%&#160;%' OR title ILIKE '%&#xa0;%' OR title LIKE '%' || chr(160) || '%'
UNION ALL
SELECT 'distribution_posts.caption', count(*)
FROM distribution_posts
WHERE caption ILIKE '%&nbsp;%' OR caption ILIKE '%&#160;%' OR caption ILIKE '%&#xa0;%' OR caption LIKE '%' || chr(160) || '%'
UNION ALL
SELECT 'newsroom_ads.name', count(*)
FROM newsroom_ads
WHERE name ILIKE '%&nbsp;%' OR name ILIKE '%&#160;%' OR name ILIKE '%&#xa0;%' OR name LIKE '%' || chr(160) || '%'
UNION ALL
SELECT 'catalog_items.data (theo entity)', count(*)
FROM catalog_items
WHERE data::text ILIKE '%&nbsp;%' OR data::text ILIKE '%&#160;%' OR data::text ILIKE '%&#xa0;%' OR data::text LIKE '%' || chr(160) || '%'
UNION ALL
SELECT 'catalog_episodes.data', count(*)
FROM catalog_episodes
WHERE data::text ILIKE '%&nbsp;%' OR data::text ILIKE '%&#160;%' OR data::text ILIKE '%&#xa0;%' OR data::text LIKE '%' || chr(160) || '%'
UNION ALL
SELECT 'catalog_seasons.data', count(*)
FROM catalog_seasons
WHERE data::text ILIKE '%&nbsp;%' OR data::text ILIKE '%&#160;%' OR data::text ILIKE '%&#xa0;%' OR data::text LIKE '%' || chr(160) || '%'
UNION ALL
SELECT 'catalog_trailers.data', count(*)
FROM catalog_trailers
WHERE data::text ILIKE '%&nbsp;%' OR data::text ILIKE '%&#160;%' OR data::text ILIKE '%&#xa0;%' OR data::text LIKE '%' || chr(160) || '%'
UNION ALL
SELECT 'news_categories.name', count(*)
FROM news_categories
WHERE name ILIKE '%&nbsp;%' OR name ILIKE '%&#160;%' OR name ILIKE '%&#xa0;%' OR name LIKE '%' || chr(160) || '%'
UNION ALL
SELECT 'layout_blocks.title', count(*)
FROM layout_blocks
WHERE title ILIKE '%&nbsp;%' OR title ILIKE '%&#160;%' OR title ILIKE '%&#xa0;%' OR title LIKE '%' || chr(160) || '%'
ORDER BY 1;

-- Dem rieng catalog_items theo entity (de biet o nao cua entity nao):
SELECT entity, count(*) AS so_ban_ghi
FROM catalog_items
WHERE data::text ILIKE '%&nbsp;%' OR data::text ILIKE '%&#160;%' OR data::text ILIKE '%&#xa0;%' OR data::text LIKE '%' || chr(160) || '%'
GROUP BY entity
ORDER BY 2 DESC, 1;

-- ================= B. MAU TRICH DOAN (2-3 / o chinh) =================
-- news_articles.body
SELECT id AS news_id, substring(body from greatest(1, pos - 40) for 120) AS mau
FROM (
  SELECT id, body,
    least(
      nullif(strpos(lower(body), '&nbsp;'), 0),
      nullif(strpos(lower(body), '&#160;'), 0),
      nullif(strpos(lower(body), '&#xa0;'), 0),
      nullif(strpos(body, chr(160)), 0)
    ) AS pos
  FROM news_articles
  WHERE body ILIKE '%&nbsp;%' OR body ILIKE '%&#160;%' OR body ILIKE '%&#xa0;%' OR body LIKE '%' || chr(160) || '%'
) h
ORDER BY id LIMIT 3;

-- news_articles.sapo
SELECT id AS news_id, substring(sapo from greatest(1, pos - 40) for 120) AS mau
FROM (
  SELECT id, sapo,
    least(
      nullif(strpos(lower(sapo), '&nbsp;'), 0),
      nullif(strpos(lower(sapo), '&#160;'), 0),
      nullif(strpos(lower(sapo), '&#xa0;'), 0),
      nullif(strpos(sapo, chr(160)), 0)
    ) AS pos
  FROM news_articles
  WHERE sapo ILIKE '%&nbsp;%' OR sapo ILIKE '%&#160;%' OR sapo ILIKE '%&#xa0;%' OR sapo LIKE '%' || chr(160) || '%'
) h
ORDER BY id LIMIT 3;

-- site_settings.footer.description (mo ta footer — goc cua loi cat chu)
SELECT key, substring(value from greatest(1, pos - 40) for 120) AS mau
FROM (
  SELECT key, value,
    least(
      nullif(strpos(lower(value), '&nbsp;'), 0),
      nullif(strpos(lower(value), '&#160;'), 0),
      nullif(strpos(lower(value), '&#xa0;'), 0),
      nullif(strpos(value, chr(160)), 0)
    ) AS pos
  FROM site_settings
  WHERE key IN ('footer.description', 'footer.copyright')
    AND (value ILIKE '%&nbsp;%' OR value ILIKE '%&#160;%' OR value ILIKE '%&#xa0;%' OR value LIKE '%' || chr(160) || '%')
) h
ORDER BY key LIMIT 3;

-- print_articles.body
SELECT id AS print_id, substring(body from greatest(1, pos - 40) for 120) AS mau
FROM (
  SELECT id, body,
    least(
      nullif(strpos(lower(body), '&nbsp;'), 0),
      nullif(strpos(lower(body), '&#160;'), 0),
      nullif(strpos(lower(body), '&#xa0;'), 0),
      nullif(strpos(body, chr(160)), 0)
    ) AS pos
  FROM print_articles
  WHERE body ILIKE '%&nbsp;%' OR body ILIKE '%&#160;%' OR body ILIKE '%&#xa0;%' OR body LIKE '%' || chr(160) || '%'
) h
ORDER BY id LIMIT 3;

-- liveblog_entries.body
SELECT id AS entry_id, substring(body from greatest(1, pos - 40) for 120) AS mau
FROM (
  SELECT id, body,
    least(
      nullif(strpos(lower(body), '&nbsp;'), 0),
      nullif(strpos(lower(body), '&#160;'), 0),
      nullif(strpos(lower(body), '&#xa0;'), 0),
      nullif(strpos(body, chr(160)), 0)
    ) AS pos
  FROM liveblog_entries
  WHERE body ILIKE '%&nbsp;%' OR body ILIKE '%&#160;%' OR body ILIKE '%&#xa0;%' OR body LIKE '%' || chr(160) || '%'
) h
ORDER BY id LIMIT 3;

-- newsroom_events.description
SELECT id AS event_id, substring(description from greatest(1, pos - 40) for 120) AS mau
FROM (
  SELECT id, description,
    least(
      nullif(strpos(lower(description), '&nbsp;'), 0),
      nullif(strpos(lower(description), '&#160;'), 0),
      nullif(strpos(lower(description), '&#xa0;'), 0),
      nullif(strpos(description, chr(160)), 0)
    ) AS pos
  FROM newsroom_events
  WHERE description ILIKE '%&nbsp;%' OR description ILIKE '%&#160;%' OR description ILIKE '%&#xa0;%' OR description LIKE '%' || chr(160) || '%'
) h
ORDER BY id LIMIT 3;

-- distribution_posts.caption
SELECT id AS post_id, substring(caption from greatest(1, pos - 40) for 120) AS mau
FROM (
  SELECT id, caption,
    least(
      nullif(strpos(lower(caption), '&nbsp;'), 0),
      nullif(strpos(lower(caption), '&#160;'), 0),
      nullif(strpos(lower(caption), '&#xa0;'), 0),
      nullif(strpos(caption, chr(160)), 0)
    ) AS pos
  FROM distribution_posts
  WHERE caption ILIKE '%&nbsp;%' OR caption ILIKE '%&#160;%' OR caption ILIKE '%&#xa0;%' OR caption LIKE '%' || chr(160) || '%'
) h
ORDER BY id LIMIT 3;

-- catalog_items.data (JSON — trich doan JSON tho)
SELECT id AS item_id, entity, substring(txt from greatest(1, pos - 40) for 120) AS mau
FROM (
  SELECT id, entity, data::text AS txt,
    least(
      nullif(strpos(lower(data::text), '&nbsp;'), 0),
      nullif(strpos(lower(data::text), '&#160;'), 0),
      nullif(strpos(lower(data::text), '&#xa0;'), 0),
      nullif(strpos(data::text, chr(160)), 0)
    ) AS pos
  FROM catalog_items
  WHERE data::text ILIKE '%&nbsp;%' OR data::text ILIKE '%&#160;%' OR data::text ILIKE '%&#xa0;%' OR data::text LIKE '%' || chr(160) || '%'
) h
ORDER BY entity, id LIMIT 3;

-- ============================================================
-- C. BUOC SUA HANG LOAT DE XUAT (CHI MO TA — CHUA CHAY, CAN USER DUYET)
-- ============================================================
-- Sau khi user xem ket qua phan A/B va duyet, buoc sua se la 1 script
-- Node rieng (vd vtcany/backend/scripts/backfill-nbsp-save.mjs,
-- theo mau backfill-image-variants.mjs: mac dinh --dry-run, chi ghi
-- khi co --apply), chay tren may chu backend voi Prisma:
--
-- 1. Doc tung ban ghi cua cac bang/o o phan A (tru newsroom_ads.
--    html_content va layout_blocks.config — khong thuoc pham vi).
-- 2. Ap dung CUNG helper normalizeNbspForSave (src/common/
--    normalize-nbsp.ts) cho tung o — nghia la so dien thoai va
--    so + don vi duoc GIU nguyen khong ngat (entity &nbsp; trong do
--    doi thanh ky tu U+00A0 tho), cac &nbsp; khac thanh khoang
--    trang thuong.
-- 3. Chi UPDATE nhung ban ghi co ket qua khac ban goc (so sanh
--    chuoi truoc/sau); ghi log id + o + so luong &nbsp; da doi.
-- 4. Chay --dry-run truoc, bao user so ban ghi se doi theo tung
--    bang/o; chi --apply khi user duyet con so do.
-- 5. Kiem chung sau apply: chay lai phan A (so luong phai ve 0 o
--    cac o da sua, tru cac &nbsp; duoc giu lai hop le trong so dien
--    thoai / so + don vi — cac truong hop nay van dem duoc vi van
--    chua U+00A0 tho; kiem tra bang mau o phan B thay vi dem 0),
--    mo 2-3 ban ghi tren CMS/portal kiem tra hien thi.
--
-- Luu y: sau bulk-fix, so dien thoai se luu dang ky tu U+00A0 tho
-- thay vi thuc the &nbsp; (cung hien thi, cung khong ngat; lop render
-- e31684b chi viet lai entity &nbsp; nen U+00A0 tho khong bi anh
-- huong). Neu user muon giu nguyen dang thuc the &nbsp; trong so
-- dien thoai thi bao truoc de doi helper.
-- ============================================================
