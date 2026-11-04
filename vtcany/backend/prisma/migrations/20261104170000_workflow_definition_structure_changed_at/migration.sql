-- Moc doi cau truc quy trinh (2026-11-04): B7 bo qua approval truoc moc
-- nay vi so thu tu buoc cu khong con map dung buoc moi (doi chuoi bai
-- bao in 4 buoc -> 7 buoc). Nullable, khong backfill: dinh nghia cu giu
-- NULL nghia la khong loc (hanh vi cu giu nguyen cho toi khi cau truc
-- cua phan he do thay doi lan dau tien sau ban nay).
ALTER TABLE "workflow_definitions" ADD COLUMN "structure_changed_at" TIMESTAMP;
