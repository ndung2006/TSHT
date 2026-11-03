-- Quy trinh duyet dong: 2 bang MOI (workflow_definitions + workflow_steps)
-- + seed NGUYEN TRANG 8 dinh nghia (7 luong hien co + video).
-- PostgreSQL: chi dung TIMESTAMP, khong DATETIME.
-- Seed chay 1 lan theo co che migrate deploy; ON CONFLICT DO NOTHING nen
-- chay lai khong ghi de cau hinh admin da sua. Neu migration chua ap dung
-- thi backend dung mang STEPS cung trong cac file *-workflow.ts (fallback).
-- returnTo mac dinh 'creator' = dung hanh vi tra lai hien tai (ve nhap);
-- allowEmergency mac dinh false (khong buoc nao duoc duyet khan tru khi
-- admin bat len). Video mac dinh enabled=false (gi nguyen co che hien thi
-- nhanh bang quyen, chi bat luong duyet khi admin bat cong tac).

CREATE TABLE "workflow_definitions" (
    "id" TEXT NOT NULL,
    "module_key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "author_role" TEXT,
    "author_label" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_definitions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workflow_definitions_module_key_key" ON "workflow_definitions"("module_key");

CREATE TABLE "workflow_steps" (
    "id" TEXT NOT NULL,
    "definition_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "role_name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "return_to" TEXT NOT NULL DEFAULT 'creator',
    "allow_emergency" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_steps_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "workflow_steps_definition_id_fkey" FOREIGN KEY ("definition_id") REFERENCES "workflow_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "workflow_steps_definition_id_key_key" ON "workflow_steps"("definition_id", "key");
CREATE INDEX "workflow_steps_definition_id_sort_order_idx" ON "workflow_steps"("definition_id", "sort_order");

INSERT INTO "workflow_definitions" ("id", "module_key", "label", "author_role", "author_label", "enabled") VALUES
  ('wf-epaper', 'epaper', 'Báo in', 'KTV', 'KTV — Kỹ thuật viên (Chế bản/Dàn trang)', true),
  ('wf-news', 'news', 'Báo điện tử', 'PV', 'PV — Phóng viên (tác giả)', true),
  ('wf-print-article', 'print-article', 'Bài báo in', 'KTV', 'KTV — Kỹ thuật viên (Chế bản/Dàn trang)', true),
  ('wf-events', 'events', 'Sự kiện tòa soạn', 'QLSK', 'QLSK', true),
  ('wf-liveblog', 'liveblog', 'Tường thuật trực tiếp', 'PVTT', 'PVTT', true),
  ('wf-ads', 'ads', 'Quảng cáo tòa soạn', 'QL-QC', 'QL-QC', true),
  ('wf-royalties', 'royalties', 'Nhuận bút', 'TP', 'TP', true),
  ('wf-video', 'video', 'Video/Truyền hình/Phát thanh', NULL, NULL, false)
ON CONFLICT ("module_key") DO NOTHING;

INSERT INTO "workflow_steps" ("id", "definition_id", "key", "label", "role_name", "sort_order", "return_to", "allow_emergency") VALUES
  ('wf-epaper-md', 'wf-epaper', 'md', 'MD — Duyệt Mo-rát', 'MD', 0, 'creator', false),
  ('wf-epaper-tpp', 'wf-epaper', 'tpp', 'T.PP — Trưởng/Phó phòng (Thư ký tòa soạn)', 'T.PP', 1, 'creator', false),
  ('wf-epaper-ptbt', 'wf-epaper', 'ptbt', 'P.TBT — Phó Tổng Biên tập', 'P.TBT', 2, 'creator', false),
  ('wf-epaper-tbt', 'wf-epaper', 'tbt', 'TBT — Tổng Biên tập', 'TBT', 3, 'creator', false),
  ('wf-news-tp', 'wf-news', 'tp', 'TP — Trưởng phòng', 'TP', 0, 'creator', false),
  ('wf-news-pbdt', 'wf-news', 'pbdt', 'PBĐT — Phó Ban điện tử', 'PBĐT', 1, 'creator', false),
  ('wf-news-bbt', 'wf-news', 'bbt', 'BBT — Ban biên tập', 'BBT', 2, 'creator', false),
  ('wf-news-xb', 'wf-news', 'xb', 'XB — Xuất bản', 'XB', 3, 'creator', false),
  ('wf-print-article-md', 'wf-print-article', 'md', 'MD — Duyệt Mo-rát', 'MD', 0, 'creator', false),
  ('wf-print-article-tpp', 'wf-print-article', 'tpp', 'T.PP — Trưởng/Phó phòng (Thư ký tòa soạn)', 'T.PP', 1, 'creator', false),
  ('wf-print-article-ptbt', 'wf-print-article', 'ptbt', 'P.TBT — Phó Tổng Biên tập', 'P.TBT', 2, 'creator', false),
  ('wf-print-article-tbt', 'wf-print-article', 'tbt', 'TBT — Tổng Biên tập', 'TBT', 3, 'creator', false),
  ('wf-events-tbt', 'wf-events', 'tbt', 'TBT — Tổng Biên tập', 'TBT', 0, 'creator', false),
  ('wf-liveblog-pttt', 'wf-liveblog', 'pttt', 'PTTT — Phó phòng tường thuật', 'PTTT', 0, 'creator', false),
  ('wf-ads-tbt', 'wf-ads', 'tbt', 'TBT — Tổng Biên tập', 'TBT', 0, 'creator', false),
  ('wf-royalties-bbt', 'wf-royalties', 'bbt', 'BBT — Ban Biên tập', 'BBT', 0, 'creator', false),
  ('wf-video-tbt', 'wf-video', 'tbt', 'TBT — Tổng Biên tập', 'TBT', 0, 'creator', false)
ON CONFLICT ("definition_id", "key") DO NOTHING;
