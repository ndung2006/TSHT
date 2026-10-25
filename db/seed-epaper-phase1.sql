-- ============================================================================
-- Seed toi thieu de kiem tra DB phase 1 (KHONG phai du lieu that).
-- Chay SAU schema-epaper-phase1.sql, tren DB rong:
--   psql -d epaper_phase1 -f schema-epaper-phase1.sql
--   psql -d epaper_phase1 -f seed-epaper-phase1.sql
-- Luu y: cac duong dan file chi la gia tri mau theo quy uoc
-- storage/epaper/<YYYY>/<MM>/<issue_id>/, file PDF/anh that chua co.
-- Mat khau trong seed la hash gia (NOT a real password) - thay bang
-- argon2/bcrypt that khi tao tai khoan that, khong dung seed nay o production.
-- ============================================================================
BEGIN;

INSERT INTO users (username, display_name, email, password_hash, role, can_download_pdf)
VALUES
  ('admin',     'Quan tri vien', 'admin@noi-bo.local',     'HASH_PLACEHOLDER_DO_NOT_USE', 'admin',     TRUE),
  ('nguoi-dang','Nguoi dang',    'dang@noi-bo.local',      'HASH_PLACEHOLDER_DO_NOT_USE', 'publisher', FALSE),
  ('nguoi-duyet','Nguoi duyet',  'duyet@noi-bo.local',     'HASH_PLACEHOLDER_DO_NOT_USE', 'reviewer',  FALSE),
  ('nguoi-doc', 'Nguoi doc',     'doc@noi-bo.local',       'HASH_PLACEHOLDER_DO_NOT_USE', 'reader',    FALSE)
ON CONFLICT (username) DO NOTHING;

-- So thuong 319, 12 trang, da xuat ban (mau kieu Tuyen Quang).
INSERT INTO issues (issue_number, issue_type, publish_date, title, slug, status,
  pdf_original_path, pdf_web_path, pdf_original_size, pdf_web_size,
  pdf_sha256, page_count, cover_image_path, cover_thumbnail_path,
  created_by, reviewed_by, published_at)
VALUES (
  319, 'thuong', DATE '2026-10-24', 'Bao Tuyen Quang so 319',
  'bao-tuyen-quang-so-319-1.html', 'published',
  'storage/epaper/2026/10/1/original.pdf', 'storage/epaper/2026/10/1/web.pdf',
  12582912, 8388608,
  '0000000000000000000000000000000000000000000000000000000000000000',
  12,
  'storage/epaper/2026/10/1/cover.jpg', 'storage/epaper/2026/10/1/pages/thumb/p001.jpg',
  2, 3, now()
) ON CONFLICT (issue_type, issue_number) DO NOTHING;

-- So vung cao 558, 4 trang, da xuat ban.
INSERT INTO issues (issue_number, issue_type, publish_date, title, slug, status,
  pdf_original_path, page_count, cover_image_path, cover_thumbnail_path,
  created_by, reviewed_by, published_at)
VALUES (
  558, 'vung_cao', DATE '2026-10-24', 'Bao Tuyen Quang vung cao so 558',
  'bao-tuyen-quang-vung-cao-so-558-2.html', 'published',
  'storage/epaper/2026/10/2/original.pdf',
  4,
  'storage/epaper/2026/10/2/cover.jpg', 'storage/epaper/2026/10/2/pages/thumb/p001.jpg',
  2, 3, now()
) ON CONFLICT (issue_type, issue_number) DO NOTHING;

-- Trang cua so 319: 12 trang, trang 1 la bia (showCover).
INSERT INTO issue_pages (issue_id, page_number, pdf_page_number, is_cover,
  flip_image_path, read_image_path, thumbnail_path, width_px, height_px)
SELECT 1, n, n, (n = 1),
  'storage/epaper/2026/10/1/pages/flip/p' || lpad(n::text, 3, '0') || '.jpg',
  'storage/epaper/2026/10/1/pages/read/p' || lpad(n::text, 3, '0') || '.jpg',
  'storage/epaper/2026/10/1/pages/thumb/p' || lpad(n::text, 3, '0') || '.jpg',
  1240, 1754
FROM generate_series(1, 12) AS n
ON CONFLICT (issue_id, page_number) DO NOTHING;

-- Trang cua so vung cao 558: 4 trang.
INSERT INTO issue_pages (issue_id, page_number, pdf_page_number, is_cover,
  flip_image_path, read_image_path, thumbnail_path, width_px, height_px)
SELECT 2, n, n, (n = 1),
  'storage/epaper/2026/10/2/pages/flip/p' || lpad(n::text, 3, '0') || '.jpg',
  'storage/epaper/2026/10/2/pages/read/p' || lpad(n::text, 3, '0') || '.jpg',
  'storage/epaper/2026/10/2/pages/thumb/p' || lpad(n::text, 3, '0') || '.jpg',
  1240, 1754
FROM generate_series(1, 4) AS n
ON CONFLICT (issue_id, page_number) DO NOTHING;

-- Checklist D6: so 319 du 6 muc -> all_checked tu tinh = TRUE.
INSERT INTO publication_checklists
  (issue_id, check_number_date, check_open_fast, check_flip_all_pages,
   check_zoom_title_clear, check_thumbnails_full, check_mobile_ok, checked_by, checked_at)
VALUES (1, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 3, now())
ON CONFLICT (issue_id) DO NOTHING;

-- So 558 chua du checklist (chi tick 5/6) -> all_checked = FALSE, chua du
-- dieu kien xuat ban theo BE (nhung seed nay de published san de test view;
-- BE that phai chan publish khi all_checked = FALSE).
INSERT INTO publication_checklists
  (issue_id, check_number_date, check_open_fast, check_flip_all_pages,
   check_zoom_title_clear, check_thumbnails_full, check_mobile_ok, checked_by, checked_at)
VALUES (2, TRUE, TRUE, TRUE, TRUE, TRUE, FALSE, 3, now())
ON CONFLICT (issue_id) DO NOTHING;

INSERT INTO audit_logs (actor_id, entity_type, entity_id, action, details)
VALUES
  (2, 'issue', 1, 'publish', '{"from":"pending_review","to":"published"}'::jsonb),
  (2, 'issue', 2, 'publish', '{"from":"pending_review","to":"published"}'::jsonb);

COMMIT;

-- Kiem tra nhanh sau khi seed (chay rieng, khong phai phan seed):
--   SELECT * FROM v_published_issues ORDER BY publish_date DESC, id DESC;
--   SELECT issue_id, page_number FROM issue_pages WHERE issue_id = 1 ORDER BY page_number;
--   SELECT issue_id, all_checked FROM publication_checklists ORDER BY issue_id;
-- Ket qua mong doi: 2 dong view, 12 trang so 319, all_checked = TRUE / FALSE.
