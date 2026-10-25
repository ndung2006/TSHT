-- ============================================================================
-- Phase 1: Bao in noi bo — CMS rieng kieu Tuyen Quang TV
-- Viewer: StPageFlip (MIT) + PDF.js, mo hinh 2 che do Lat / Doc
-- Database: PostgreSQL 16+
-- Nguyen tac:
--   * 1 so bao = 1 ban ghi issues + 1 PDF goc. Anh trang la du lieu dan xuat.
--   * Khong luu file (PDF/anh) dang BLOB trong DB, chi luu duong dan tuong doi.
--   * File chi phuc vu qua BE co kiem tra quyen, khong expose link truc tiep.
--   * Slug khong doi sau khi xuat ban (rang buoc bang trigger o cuoi file).
-- Cach chay: psql -d <db> -f schema-epaper-phase1.sql
-- ============================================================================

CREATE TYPE issue_type AS ENUM ('thuong', 'vung_cao');
CREATE TYPE issue_status AS ENUM ('draft', 'pending_review', 'published', 'unpublished', 'archived');
CREATE TYPE user_role AS ENUM ('admin', 'publisher', 'reviewer', 'reader');
CREATE TYPE job_status AS ENUM ('pending', 'processing', 'done', 'failed');

-- ----------------------------------------------------------------------------
-- Nguoi dung noi bo. Quyen tai PDF goc tach rieng khoi vai tro doc (B5/D5):
-- mot reader van co the bi cam tai, mot publisher van co the khong duoc tai.
-- Mat khau chi luu dang hash (argon2/bcrypt), khong bao gio luu plaintext.
-- ----------------------------------------------------------------------------
CREATE TABLE users (
    id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username          VARCHAR(100) NOT NULL UNIQUE,
    display_name      VARCHAR(200) NOT NULL,
    email             VARCHAR(255) UNIQUE,
    password_hash     VARCHAR(255) NOT NULL,
    role              user_role NOT NULL DEFAULT 'reader',
    can_download_pdf  BOOLEAN NOT NULL DEFAULT FALSE,
    is_active         BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at     TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE users IS 'Tai khoan noi bo: admin / publisher (nguoi dang) / reviewer (nguoi duyet) / reader (nguoi doc)';

-- ----------------------------------------------------------------------------
-- So bao. Day la bang trung tam cua phase 1.
--   issue_number: so bao in tren trang 1, chay rieng theo tung loai
--     (so thuong va so vung cao la 2 day so doc lap).
--   publish_date: ngay phat hanh (DATE, khong phai timestamp dang bai).
--   scheduled_publish_at: hen gio xuat ban (vd rang sang); khi toi gio,
--     job hen gio chuyen pending_review -> published va set published_at.
--   pdf_original_path: ban goc chua nen, chi admin/kho duoc tai.
--   pdf_web_path: ban web da nen (neu co), dung cho che do Doc / tai co quyen.
--   cover_image_path: anh bia = anh trang 1, luu denormalize de trang
--     danh sach /bao-in khong phai JOIN issue_pages (15 so/trang).
--   page_count: do worker dem tu PDF, khong nhap tay.
-- ----------------------------------------------------------------------------
CREATE TABLE issues (
    id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    issue_number         INTEGER NOT NULL CHECK (issue_number > 0),
    issue_type           issue_type NOT NULL DEFAULT 'thuong',
    publish_date         DATE NOT NULL,
    title                VARCHAR(500) NOT NULL,
    slug                 VARCHAR(500) NOT NULL UNIQUE,
    status               issue_status NOT NULL DEFAULT 'draft',
    pdf_original_path    VARCHAR(1000) NOT NULL,
    pdf_web_path         VARCHAR(1000),
    pdf_original_size    BIGINT CHECK (pdf_original_size > 0),
    pdf_web_size         BIGINT CHECK (pdf_web_size > 0),
    pdf_sha256           CHAR(64),
    page_count           INTEGER NOT NULL DEFAULT 0 CHECK (page_count >= 0),
    cover_image_path     VARCHAR(1000),
    cover_thumbnail_path VARCHAR(1000),
    created_by           BIGINT NOT NULL REFERENCES users (id),
    reviewed_by          BIGINT REFERENCES users (id),
    published_at         TIMESTAMPTZ,
    scheduled_publish_at TIMESTAMPTZ,
    unpublished_at       TIMESTAMPTZ,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Moi loai so chi co 1 so bao cho 1 so hieu: khong the co 2 "so 319 thuong".
    -- LUU Y NHAP KHO CU (bang viec J2): rang buoc nay khong co nam, nen neu
    -- so hieu reset theo nam thi kho cu se co trung (issue_type, issue_number)
    -- va import se loi. Phai quet trung truoc khi nhap, neu co trung thi lam
    -- migration truoc, khong tu doi so hieu hay ghi de.
    CONSTRAINT uq_issue_number_per_type UNIQUE (issue_type, issue_number),
    CONSTRAINT chk_published_has_date CHECK (
        status <> 'published' OR published_at IS NOT NULL
    )
);
COMMENT ON TABLE issues IS '1 ban ghi = 1 so bao = 1 PDF goc. URL doc: /bao-tuyen-quang-so-<so>-<id>.html';

-- Trang danh sach: chi lay so published, moi nhat truoc, 15/trang (E1-E4).
CREATE INDEX idx_issues_list_published
    ON issues (status, publish_date DESC, id DESC);
CREATE INDEX idx_issues_list_by_type
    ON issues (status, issue_type, publish_date DESC, id DESC);
CREATE INDEX idx_issues_search_number
    ON issues (issue_type, issue_number DESC);
CREATE INDEX idx_issues_scheduled
    ON issues (scheduled_publish_at) WHERE status = 'pending_review';

-- ----------------------------------------------------------------------------
-- Trang cua 1 so bao. Anh la san pham cua worker (C2/C3), khong nhap tay.
--   page_number: thu tu hien thi (1..N), dung cho StPageFlip va o go so trang.
--   pdf_page_number: trang that trong PDF. CHOT 2026-10-24: KHONG chen trang
--     trang dem. StPageFlip showCover=true tu xu ly: trang dau + trang cuoi
--     dung mot minh, trang giua ghep spread. Do do pdf_page_number LUON
--     bang page_number (1..N), page_count = so trang that cua PDF.
--   is_cover: trang 1, StPageFlip showCover, dung mot minh.
--   is_padding: CHI giu lai cho tuong thich, KHONG dung cho so moi nhap:
--     worker khong duoc tao ban ghi is_padding = TRUE.
--   flip_image_path: anh Lat ~150 dpi, nap ngay khi mo viewer.
--   read_image_path: anh Doc mac dinh 300 dpi, CHI nap khi vao che do Doc
--     (G, I4). Anh Doc nang hon anh 200 dpi nen khi nhap kho cu hang loat
--     phai tinh dung luong truoc (bang viec muc J4).
--   thumbnail_path: anh nho cho panel thumbnail desktop.
-- ----------------------------------------------------------------------------
CREATE TABLE issue_pages (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    issue_id         BIGINT NOT NULL REFERENCES issues (id) ON DELETE CASCADE,
    page_number      INTEGER NOT NULL CHECK (page_number >= 1),
    pdf_page_number  INTEGER CHECK (pdf_page_number >= 1),
    is_cover         BOOLEAN NOT NULL DEFAULT FALSE,
    is_padding       BOOLEAN NOT NULL DEFAULT FALSE,
    flip_image_path  VARCHAR(1000),
    read_image_path  VARCHAR(1000),
    thumbnail_path   VARCHAR(1000),
    width_px         INTEGER CHECK (width_px > 0),
    height_px        INTEGER CHECK (height_px > 0),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_page_per_issue UNIQUE (issue_id, page_number)
);
CREATE INDEX idx_issue_pages_issue_order
    ON issue_pages (issue_id, page_number);

-- ----------------------------------------------------------------------------
-- Worker xu ly PDF (C1-C6). Nguoi dang chi thay trang thai, khong doan.
-- steps: validate -> render_flip -> render_read -> thumbnail -> cover -> done
-- payload: jsonb luu cau hinh lan chay (dpi, co nen web khong...).
-- ----------------------------------------------------------------------------
CREATE TABLE processing_jobs (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    issue_id      BIGINT NOT NULL REFERENCES issues (id) ON DELETE CASCADE,
    job_type      VARCHAR(50) NOT NULL DEFAULT 'render_pages',
    status        job_status NOT NULL DEFAULT 'pending',
    current_step  VARCHAR(100),
    error_message TEXT,
    attempts      INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
    started_at    TIMESTAMPTZ,
    finished_at   TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_processing_jobs_issue
    ON processing_jobs (issue_id, created_at DESC);
CREATE INDEX idx_processing_jobs_pending
    ON processing_jobs (status, created_at) WHERE status IN ('pending', 'processing');

-- ----------------------------------------------------------------------------
-- Vet thay doi sau xuat ban (B2/D3/D4): sua metadata hay thay PDF sau khi
-- published deu phai luu ban snapshot cu, khong ghi de len.
-- snapshot: jsonb gom title, issue_number, publish_date, pdf paths, page_count
--   truoc khi sua. change_reason: bat buoc nhap khi sua ban da xuat ban.
-- ----------------------------------------------------------------------------
CREATE TABLE issue_revisions (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    issue_id      BIGINT NOT NULL REFERENCES issues (id) ON DELETE CASCADE,
    revision_no   INTEGER NOT NULL CHECK (revision_no >= 1),
    changed_by    BIGINT NOT NULL REFERENCES users (id),
    change_reason VARCHAR(1000),
    snapshot      JSONB NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_revision_per_issue UNIQUE (issue_id, revision_no)
);

-- ----------------------------------------------------------------------------
-- Checklist duyet truoc xuat ban (D6): 6 muc phai tick du moi cho xuat ban.
-- BE chan publish khi all_checked = FALSE, tru khi ghi checklist_override
-- vao audit_logs. Cot all_checked tu tinh, khong nhap tay.
-- ----------------------------------------------------------------------------
CREATE TABLE publication_checklists (
    issue_id               BIGINT PRIMARY KEY REFERENCES issues (id) ON DELETE CASCADE,
    check_number_date      BOOLEAN NOT NULL DEFAULT FALSE, -- so/ngay dung
    check_open_fast        BOOLEAN NOT NULL DEFAULT FALSE, -- mo < 3 giay
    check_flip_all_pages   BOOLEAN NOT NULL DEFAULT FALSE, -- lat het trang
    check_zoom_title_clear BOOLEAN NOT NULL DEFAULT FALSE, -- zoom doc ro tit trang 1
    check_thumbnails_full  BOOLEAN NOT NULL DEFAULT FALSE, -- thumbnail du
    check_mobile_ok        BOOLEAN NOT NULL DEFAULT FALSE, -- thu mobile
    all_checked            BOOLEAN GENERATED ALWAYS AS (
        check_number_date AND check_open_fast AND check_flip_all_pages
        AND check_zoom_title_clear AND check_thumbnails_full AND check_mobile_ok
    ) STORED,
    checked_by             BIGINT REFERENCES users (id) ON DELETE SET NULL,
    checked_at             TIMESTAMPTZ,
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- View phuc vu API danh sach (B3/B4): chi so published, khong chua
-- pdf_original_path / pdf_web_path. API chi tiet moi JOIN issue_pages.
CREATE VIEW v_published_issues AS
SELECT i.id, i.slug, i.title, i.issue_number, i.issue_type,
       i.publish_date, i.published_at, i.page_count,
       i.cover_image_path, i.cover_thumbnail_path
FROM issues i
WHERE i.status = 'published';

-- ----------------------------------------------------------------------------
-- Nhat ky nghiep vu (A4/H4): dang, duyet, xuat ban, go xuong, sua, tai PDF.
-- Khong ghi log "xem trang" o day (se pho DB); thong ke doc de phase 4.
-- details: jsonb, vd {"from":"draft","to":"published"} hoac {"file":"web.pdf"}.
-- ----------------------------------------------------------------------------
CREATE TABLE audit_logs (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    actor_id    BIGINT REFERENCES users (id),
    entity_type VARCHAR(50) NOT NULL,          -- 'issue' | 'user' | ...
    entity_id   BIGINT NOT NULL,
    action      VARCHAR(100) NOT NULL,         -- 'create','submit_review',
    -- 'approve','publish','unpublish','update','replace_pdf','download_pdf'
    details     JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_logs_entity
    ON audit_logs (entity_type, entity_id, created_at DESC);
CREATE INDEX idx_audit_logs_actor
    ON audit_logs (actor_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- Rang buoc: khong doi slug sau khi da xuat ban lan dau (muc 1 bang viec:
-- URL khong doi) — ke ca sau khi so do bi go xuong, vi published_at van con.
-- Chan theo published_at thay vi status='published' hien tai, neu khong
-- go xuong roi doi slug se lot qua. BE cung phai chan, trigger la lop
-- phong thu cuoi o DB.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION forbid_slug_change_after_publish()
RETURNS trigger AS $$
BEGIN
    IF OLD.published_at IS NOT NULL AND NEW.slug IS DISTINCT FROM OLD.slug THEN
        RAISE EXCEPTION 'Khong doi slug cua so bao da xuat ban (id=%)', OLD.id;
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_issues_no_slug_change
    BEFORE UPDATE ON issues
    FOR EACH ROW EXECUTE FUNCTION forbid_slug_change_after_publish();

CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_touch
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER trg_checklists_touch
    BEFORE UPDATE ON publication_checklists
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ============================================================================
-- Quy uoc luu file (tuong doi, khong luu duong dan tuyet doi vao DB):
--   storage/epaper/<YYYY>/<MM>/<issue_id>/
--     original.pdf            <- pdf_original_path
--     web.pdf                 <- pdf_web_path
--     pages/flip/p001.jpg     <- flip_image_path  (~150 dpi)
--     pages/read/p001.jpg     <- read_image_path  (300 dpi mac dinh, lazy)
--     pages/thumb/p001.jpg    <- thumbnail_path
--     cover.jpg               <- cover_image_path (= pages/flip/p001.jpg copy)
-- ============================================================================
-- Vi du truy van dev se dung (khong phai phan schema, de tham khao):
--   Danh sach: SELECT id, issue_number, issue_type, publish_date, title,
--     slug, cover_thumbnail_path FROM issues
--     WHERE status='published' [AND issue_type=$1]
--     ORDER BY publish_date DESC, id DESC LIMIT 15 OFFSET $2;
--   Tim theo so: ... WHERE status='published' AND issue_number=$1
--     [AND issue_type=$2] ORDER BY publish_date DESC;
--   Tim theo ngay: ... WHERE status='published' AND publish_date=$1;
--   Trang doc: SELECT * FROM issue_pages WHERE issue_id=$1
--     ORDER BY page_number;  -- khong tra pdf_original_path cho reader
-- ============================================================================
