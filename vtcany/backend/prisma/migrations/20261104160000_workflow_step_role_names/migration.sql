-- Buoc duyet nhieu Role (2026-11-04): buoc cuoi bai bao in (T.BT-PT.BT)
-- chap nhan ca TBT va P.TBT. role_names la JSON, nullable: row cu de
-- NULL nghia la [role_name] (mot Role duy nhat) — khong can backfill,
-- khong doi hanh vi cac buoc cu.
ALTER TABLE "workflow_steps" ADD COLUMN "role_names" JSONB;
