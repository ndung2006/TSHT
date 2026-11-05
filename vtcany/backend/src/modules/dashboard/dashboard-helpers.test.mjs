// Test vnDateForDb: ngay VN -> Date ghi cot @db.Date phai giu dung ngay VN
// bat ke session DB o mui gio nao. Chay truc tiep bang node --test,
// khong can build (Node strip type cua file .ts thuan).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  vnDateForDb,
  vnTodayStr,
  vnDayRange,
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
