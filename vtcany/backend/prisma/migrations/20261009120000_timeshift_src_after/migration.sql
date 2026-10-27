-- ANGIANG1 ghi sau-encode: timeshift phai kem ?src=after (theo xac nhan AIO 09/10/2026).
-- Khong co src=after -> AIO tra playlist rong -> player xoay mai 0:00.
UPDATE channel_overrides
SET timeshift_src = 'after'
WHERE channel_key = 'ANGIANG1';
