// Test ngay VN cho nhuan but (goi "Chuan ngay VN" 07/11/2026) — chay truc
// tiep bang node --test, khong can build (Node strip type cua file .ts
// thuan, giong royalties-workflow.test.mjs).
//   node --test --import ./test-hooks-register.mjs royalties-vn-date.test.mjs
//
// Chu y: RoyaltiesService import @nestjs/common (parameter properties) nen
// KHONG import truc tiep duoc trong test (ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX).
// Test o day nham vao module thuan royalties-range.ts ma service goi lai
// (rangeWhere -> royaltyPeriodRange, articlesByDay -> royaltyPublishDay),
// cong voi tinh nhat quan B4-vs-bang-ke qua cach gom ngay (ca hai deu
// dung vnTodayStr). Phan noi DB cua service la mong (truyen khoang xuong
// Prisma / loc theo publishAt) — can kiem live sau deploy.
//
// Quy tac 12.5: moi test ngay VN deu co case o ca hai phia cua moc
// 17:00 UTC (truoc 17:00 va tu 17:00 tro di).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { vnDayRange, vnTodayStr } from './src/modules/dashboard/dashboard-helpers.ts';
import { royaltyPeriodRange, royaltyPublishDay } from './src/modules/royalties/royalties-range.ts';

// Bai viet lam moc: xuat ban 2026-10-31T17:30:00Z = 00:30 gio VN 01/11.
const BOUNDARY_ARTICLE = new Date('2026-10-31T17:30:00Z');

test('ky thang 11 (VN): bai 00:30 VN 01/11 thuoc ky 11, khong thuoc ky 10', () => {
  const nov = royaltyPeriodRange('2026-11-01', '2026-11-30');
  assert.ok(nov);
  assert.equal(nov.gte?.toISOString(), '2026-10-31T17:00:00.000Z');
  assert.equal(nov.lt?.toISOString(), '2026-11-30T17:00:00.000Z');
  // Bai o trong khoang [gte, lt) cua thang 11.
  assert.ok(BOUNDARY_ARTICLE >= nov.gte, 'bai >= dau ky 11 (VN)');
  assert.ok(BOUNDARY_ARTICLE < nov.lt, 'bai < cuoi ky 11 (VN)');
  // Nhom theo ngay VN -> 2026-11-01 (khong phai 2026-10-31 nhu ngay UTC).
  assert.equal(royaltyPublishDay(BOUNDARY_ARTICLE), '2026-11-01');

  const oct = royaltyPeriodRange('2026-10-01', '2026-10-31');
  assert.ok(oct);
  assert.equal(oct.lt?.toISOString(), '2026-10-31T17:00:00.000Z');
  assert.ok(BOUNDARY_ARTICLE >= oct.lt, 'bai nam NGOAI ky 10 (sau cuoi ky 10 VN)');
});

test('cach cu (ngay UTC) loai bai 00:30 VN 01/11 khoi ky 11 — day la loi da sua', () => {
  // rangeWhere cu: gte = new Date('2026-11-01T00:00:00.000') (gio local
  // server = UTC trong container) -> 2026-11-01T00:00:00Z, sau bai 17:30Z
  // nen bai bi loai khoi ky 11.
  // (Ghi 'Z' tuong minh de test khong phu thuoc TZ cua may chay test;
  // code cu chay tren server UTC nen gia tri nay la dung. Truoc day test
  // nay do duoi TZ=Asia/Saigon vi new Date('...00.000') khong 'Z' bi
  // hieu la gio local.)
  const oldGte = new Date('2026-11-01T00:00:00.000Z');
  assert.equal(oldGte.toISOString(), '2026-11-01T00:00:00.000Z');
  assert.ok(BOUNDARY_ARTICLE < oldGte, 'cach cu loai bai khoi ky 11 (sai)');
  // Cach cu gom theo ngay UTC cung sai nhom: 2026-10-31 thay vi 2026-11-01.
  assert.equal(BOUNDARY_ARTICLE.toISOString().slice(0, 10), '2026-10-31');
});

test('dau cuoi nua mo (12.5): 16:59:59Z thuoc ngay cu, 17:00:00Z thuoc ngay moi', () => {
  // Bai 23:59:59 VN 30/11 thuoc ky 11; bai 00:00:00 VN 01/12 khong thuoc.
  const lastNov = new Date('2026-11-30T16:59:59Z');
  const firstDec = new Date('2026-11-30T17:00:00Z');
  const nov = royaltyPeriodRange('2026-11-01', '2026-11-30');
  assert.ok(nov);
  assert.ok(lastNov >= nov.gte && lastNov < nov.lt, '23:59:59 VN 30/11 thuoc ky 11');
  assert.ok(firstDec >= nov.lt, '00:00:00 VN 01/12 nam NGOAI ky 11');
  assert.equal(royaltyPublishDay(lastNov), '2026-11-30');
  assert.equal(royaltyPublishDay(firstDec), '2026-12-01');
  // Moc 12.5 goc (04/11): ca hai phia cua 17:00 UTC.
  assert.equal(royaltyPublishDay(new Date('2026-11-04T16:59:59Z')), '2026-11-04');
  assert.equal(royaltyPublishDay(new Date('2026-11-04T17:00:00Z')), '2026-11-05');
});

test('B4 dashboard va bang ke nhuan but cung ky tra ve CUNG so bai', () => {
  // Cung tap bai, cung ky thang 11 (VN): B4 gom theo vnTodayStr,
  // bang ke (articlesByDay) gom theo royaltyPublishDay (= vnTodayStr).
  // Ca hai phai cho cung so bai theo ngay va cung tong.
  const articles = [
    new Date('2026-10-31T17:30:00Z'), // 00:30 VN 01/11
    new Date('2026-11-05T02:00:00Z'), // 09:00 VN 05/11
    new Date('2026-11-05T10:00:00Z'), // 17:00 VN 05/11
    new Date('2026-11-30T16:59:59Z'), // 23:59:59 VN 30/11
    new Date('2026-11-30T17:00:00Z'), // 00:00:00 VN 01/12 (ngoai ky 11)
    new Date('2026-10-31T16:59:59Z'), // 23:59:59 VN 31/10 (ngoai ky 11)
  ];
  const nov = royaltyPeriodRange('2026-11-01', '2026-11-30');
  assert.ok(nov);
  const inPeriod = articles.filter((p) => p >= nov.gte && p < nov.lt);
  assert.equal(inPeriod.length, 4, '4 bai trong ky 11 (VN)');

  const bucket = (fn) => {
    const m = new Map();
    for (const p of inPeriod) {
      const d = fn(p);
      m.set(d, (m.get(d) || 0) + 1);
    }
    return [...m.entries()].sort();
  };
  // B4 (vnTodayStr) va bang ke (royaltyPublishDay) gom giong het nhau.
  assert.deepEqual(bucket(royaltyPublishDay), bucket((p) => vnTodayStr(p)));
  assert.deepEqual(bucket(royaltyPublishDay), [
    ['2026-11-01', 1], ['2026-11-05', 2], ['2026-11-30', 1],
  ]);
  // Cach gom cu (ngay UTC) lech: bai 00:30 VN 01/11 roi ve 31/10.
  const oldBucket = new Map();
  for (const p of inPeriod) {
    const d = p.toISOString().slice(0, 10);
    oldBucket.set(d, (oldBucket.get(d) || 0) + 1);
  }
  assert.deepEqual([...oldBucket.entries()].sort(), [
    ['2026-10-31', 1], ['2026-11-05', 2], ['2026-11-30', 1],
  ]);
  // vnDayRange dung moc instant: 2026-11-04T17:00Z thuoc ngay VN 05/11.
  const r5 = vnDayRange('2026-11-05');
  assert.equal(r5.from.toISOString(), '2026-11-04T17:00:00.000Z');
  assert.equal(r5.to.toISOString(), '2026-11-05T17:00:00.000Z');
  assert.ok(new Date('2026-11-04T17:00:00Z') >= r5.from && new Date('2026-11-04T17:00:00Z') < r5.to);
});

test('royaltyPeriodRange: chi from / chi to / khong co / khong hop le', () => {
  const onlyFrom = royaltyPeriodRange('2026-11-01');
  assert.ok(onlyFrom);
  assert.equal(onlyFrom.gte?.toISOString(), '2026-10-31T17:00:00.000Z');
  assert.equal(onlyFrom.lt, undefined);

  const onlyTo = royaltyPeriodRange(undefined, '2026-11-30');
  assert.ok(onlyTo);
  assert.equal(onlyTo.gte, undefined);
  assert.equal(onlyTo.lt?.toISOString(), '2026-11-30T17:00:00.000Z');

  assert.equal(royaltyPeriodRange(), null);
  assert.equal(royaltyPeriodRange('', ''), null);

  // Ngay khong hop le bi bo qua (giong hanh vi cu cua rangeWhere).
  const badFrom = royaltyPeriodRange('khong-hop-le', '2026-11-30');
  assert.ok(badFrom);
  assert.equal(badFrom.gte, undefined);
  assert.equal(badFrom.lt?.toISOString(), '2026-11-30T17:00:00.000Z');
  assert.equal(royaltyPeriodRange('khong-hop-le', 'cung-khong'), null);
});
