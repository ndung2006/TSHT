-- Goi "Chuan ngay VN" 2026-11-07: ham dung chung tinh ngay VN tu cot
-- `timestamp without time zone` luu gio UTC (xem phuong-an-dashboard §12).
-- Ngay VN = (ts + interval '7 hours')::date. IMMUTABLE vi Viet Nam la
-- UTC+7 quanh nam (khong DST) nen cong 7 gio la hang so.
-- CHI dung voi timestamp without time zone luu gio UTC. KHONG dung
-- AT TIME ZONE tren kieu cot nay (sai — xem §12.2).
-- Chi them ham, KHONG doi du lieu, KHONG doi kieu cot (timestamptz de
-- sau go-live). Chay bang `prisma migrate deploy` o entrypoint backend.
CREATE OR REPLACE FUNCTION public.vn_date(ts timestamp without time zone)
RETURNS date
LANGUAGE sql IMMUTABLE AS $$
  SELECT (ts + interval '7 hours')::date;
$$;

-- Test 12.5 (chay ngay sau khi ap migration, cung bo moc voi test JS):
--   SELECT vn_date('2026-11-04 16:59:59'::timestamp); -- ky vong 2026-11-04
--   SELECT vn_date('2026-11-04 17:00:00'::timestamp); -- ky vong 2026-11-05
--   SELECT vn_date('2026-11-04 00:30:00'::timestamp); -- ky vong 2026-11-04
