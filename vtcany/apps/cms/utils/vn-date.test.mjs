// Test cong/tru ngay tren chuoi YYYY-MM-DD (goi "Chuan ngay VN" 07/11/2026).
// Chay truc tiep bang node --test (Node strip type cua file .ts thuan):
//   node --test apps/cms/utils/vn-date.test.mjs
// Kiem ca tinh khong phu thuoc mui gio: chay lai voi TZ khac nhau
// (TZ=America/New_York, TZ=Asia/Ho_Chi_Minh, TZ=UTC) — ket qua phai
// giong het nhau vi ham chi dung phuong thuc UTC (khong getDate/setDate
// local). Quy tac 12.5: co case o ca hai phia cua moc 17:00 UTC.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addDaysStr } from './vn-date.ts';

test('addDaysStr: cong/tru ngay dung, ke ca qua thang', () => {
  assert.equal(addDaysStr('2026-11-04', 1), '2026-11-05');
  assert.equal(addDaysStr('2026-11-05', -1), '2026-11-04');
  assert.equal(addDaysStr('2026-11-01', -1), '2026-10-31');
  assert.equal(addDaysStr('2026-11-30', 1), '2026-12-01');
  assert.equal(addDaysStr('2026-11-07', 0), '2026-11-07');
});

test('addDaysStr: ky loc dashboard — 7d = 7 ngay, 30d = 30 ngay, to bao ham', () => {
  // today = 2026-11-07 (VN). Ky 7d: from = today-6, to = today.
  const today = '2026-11-07';
  assert.equal(addDaysStr(today, -6), '2026-11-01');
  assert.equal(addDaysStr(today, -29), '2026-10-09');
  // So ngay trong ky = (to - from) + 1 (to bao ham): 7d = 7 ngay,
  // khong phai 8 ngay nhu khi gui to = ngay mai (cach cu).
  const daysIn = (from, to) => {
    const f = new Date(`${from}T00:00:00Z`).getTime();
    const t = new Date(`${to}T00:00:00Z`).getTime();
    return Math.round((t - f) / 86400000) + 1;
  };
  assert.equal(daysIn(addDaysStr(today, -6), today), 7);
  assert.equal(daysIn(addDaysStr(today, -29), today), 30);
  assert.equal(daysIn(today, today), 1);
  // Custom 01/11–03/11 = dung 3 ngay VN.
  assert.equal(daysIn('2026-11-01', '2026-11-03'), 3);
});

test('addDaysStr: moc 12.5 — ngay VN doi o 17:00 UTC, khong phu thuoc gio local', () => {
  // 2026-11-04T16:59:59Z = 23:59:59 VN 04/11; 2026-11-04T17:00:00Z =
  // 00:00:00 VN 05/11. Cong 1 ngay (lich VN) tu 04/11 ra 05/11 o ca
  // hai phia cua moc — ham chi lam so hoc tren chuoi nen khong lech.
  assert.equal(addDaysStr('2026-11-04', 1), '2026-11-05');
  assert.equal(addDaysStr('2026-11-05', -1), '2026-11-04');
  // Qua moc DST o mui gio khac (My bat dau DST 2026-03-08): so hoc UTC
  // van dung — setDate local se lech 1 gio o bien (khong dung o day).
  assert.equal(addDaysStr('2026-03-07', 1), '2026-03-08');
  assert.equal(addDaysStr('2026-03-08', 1), '2026-03-09');
  assert.equal(addDaysStr('2026-11-01', 1), '2026-11-02');
});
