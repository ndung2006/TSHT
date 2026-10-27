-- LAICHAU ghi sau-encode: timeshift phai kem ?src=after (giong ANGIANG1, VOV1).
-- Khong co src=after -> AIO tra loi 400, xem lai that bai.
-- Kiem chung live 10/10/2026: ANGIANG1 (src='after') tra playlist day du,
-- LAICHAU (src NULL) tra 400 cung khung gio.
UPDATE channel_overrides
SET timeshift_src = 'after'
WHERE channel_key = 'LAICHAU';
