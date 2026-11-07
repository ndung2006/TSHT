// Test vnDateForDb: ngay VN -> Date ghi cot @db.Date phai giu dung ngay VN
// bat ke session DB o mui gio nao. Chay truc tiep bang node --test,
// khong can build (Node strip type cua file .ts thuan).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  vnDateForDb,
  vnTodayStr,
  vnDayRange,
  periodRange,
} from './dashboard-helpers.ts';

test('vnDateForDb: ngay UTC cua instant bang dung ngay VN', () => {
  assert.equal(vnDateForDb('2026-11-04').toISOString(), '2026-11-04T12:00:00.000Z');
  assert.equal(vnDateForDb('2026-01-01').toISOString(), '2026-01-01T12:00:00.000Z');
});

test('vnDateForDb: dinh dang lai theo gio VN van ra dung ngay', () => {
  assert.equal(vnTodayStr(vnDateForDb('2026-11-04')), '2026-11-04');
});

test('cach cu (nua dem +07:00) bi cat ve ngay hom truoc o UTC — tai sao phai doi', () => {
  const old = new Date('2026-11-04T00:00:00+07:00');
  assert.equal(old.toISOString(), '2026-11-03T17:00:00.000Z');
  // Ngay UTC cua instant cu la ngay hom truoc -> cot DATE luu sai nhan.
  assert.equal(old.toISOString().slice(0, 10), '2026-11-03');
  assert.notEqual(old.toISOString().slice(0, 10), '2026-11-04');
});

test('vnDayRange van dung moc instant (khong doi): loc tho theo khoang +07', () => {
  const { from, to } = vnDayRange('2026-11-04');
  assert.equal(from.toISOString(), '2026-11-03T17:00:00.000Z');
  assert.equal(to.toISOString(), '2026-11-04T17:00:00.000Z');
});

// --- Goi "Chuan ngay VN" (07/11/2026): dac ta test 12.5, moc 17:00 UTC ---
// Moi test ngay VN deu co case o ca hai phia cua moc (truoc 17:00 va tu
// 17:00 tro di); test SQL (vn_date) va test JS dung cung bo moc nay.
test('12.5 vnTodayStr: 16:59:59Z thuoc ngay cu, 17:00:00Z thuoc ngay moi', () => {
  assert.equal(vnTodayStr(new Date('2026-11-04T16:59:59Z')), '2026-11-04');
  assert.equal(vnTodayStr(new Date('2026-11-04T17:00:00Z')), '2026-11-05');
  assert.equal(vnTodayStr(new Date('2026-11-04T00:30:00Z')), '2026-11-04');
});

test('12.5 vnDayRange: ngay VN 05/11 = [17:00Z 04/11, 17:00Z 05/11)', () => {
  const r = vnDayRange('2026-11-05');
  assert.equal(r.from.toISOString(), '2026-11-04T17:00:00.000Z');
  assert.equal(r.to.toISOString(), '2026-11-05T17:00:00.000Z');
  // 2026-11-04T17:00:00Z nam TRONG ngay VN 05/11 va NGOAI ngay VN 04/11.
  const atBoundary = new Date('2026-11-04T17:00:00Z');
  assert.ok(atBoundary >= r.from && atBoundary < r.to);
  const r4 = vnDayRange('2026-11-04');
  assert.ok(!(atBoundary >= r4.from && atBoundary < r4.to));
  // 16:59:59Z thuoc ngay VN 04/11.
  const before = new Date('2026-11-04T16:59:59Z');
  assert.ok(before >= r4.from && before < r4.to);
});

test('12.5 periodRange custom: 01/11-03/11 = dung 3 ngay VN (to bao ham)', () => {
  const r = periodRange('custom', '2026-11-01', '2026-11-03');
  assert.equal(r.from.toISOString(), '2026-10-31T17:00:00.000Z');
  assert.equal(r.to.toISOString(), '2026-11-03T17:00:00.000Z');
  // So ngay VN trong ky = 3 (01, 02, 03/11) — khong phai 4 ngay nhu khi
  // CMS gui to = customTo+1 (cach cu) va backend coi to la bao ham.
  const days = Math.round((r.to.getTime() - r.from.getTime()) / 86400000);
  assert.equal(days, 3);
});

test('12.5 periodRange today/7d/30d: ket thuc hom nay (bao gom hom nay)', () => {
  // now co dinh: 2026-11-07T10:00:00Z = 17:00 VN 07/11 -> today = 07/11.
  const now = new Date('2026-11-07T10:00:00Z');
  const today = periodRange('today', undefined, undefined, now);
  assert.equal(today.from.toISOString(), '2026-11-06T17:00:00.000Z');
  assert.equal(today.to.toISOString(), '2026-11-07T17:00:00.000Z');
  const d7 = periodRange('7d', undefined, undefined, now);
  assert.equal(d7.from.toISOString(), '2026-10-31T17:00:00.000Z');
  assert.equal(d7.to.toISOString(), '2026-11-07T17:00:00.000Z');
  assert.equal(Math.round((d7.to.getTime() - d7.from.getTime()) / 86400000), 7);
  const d30 = periodRange('30d', undefined, undefined, now);
  assert.equal(d30.from.toISOString(), '2026-10-08T17:00:00.000Z');
  assert.equal(d30.to.toISOString(), '2026-11-07T17:00:00.000Z');
  assert.equal(Math.round((d30.to.getTime() - d30.from.getTime()) / 86400000), 30);
});
