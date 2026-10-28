// Test tach nhiem vu Dot 1b — chay truc tiep bang node --test, khong can
// build (Node strip type cua file .ts thuan). Quy tac: nguoi xu ly buoc
// truoc khong duoc duyet buoc sau cua cung mot bai/so; ngoai le tin nong
// chi duoc chap nhan khi co co breakingNews va phai ghi log ngoai le.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkSeparationOfDuties as checkNews } from './src/modules/news/news-workflow.ts';
import { checkSeparationOfDuties as checkEpaper } from './src/modules/epaper/epaper-workflow.ts';

for (const [name, check] of [['tin bai', checkNews], ['bao in', checkEpaper]]) {
  test(`[${name}] nguoi khac xu ly buoc truoc thi duyet duoc, khong phai ngoai le`, () => {
    assert.deepEqual(check('user-a', 'user-b'), { allowed: true, isException: false });
  });
  test(`[${name}] cung nguoi xu ly buoc truoc thi bi chan`, () => {
    assert.deepEqual(check('user-a', 'user-a'), { allowed: false, isException: false });
  });
  test(`[${name}] cung nguoi + co tin nong thi duyet duoc va danh dau ngoai le`, () => {
    assert.deepEqual(check('user-a', 'user-a', true), { allowed: true, isException: true });
  });
  test(`[${name}] khac nguoi + co tin nong thi duyet duoc, KHONG danh dau ngoai le`, () => {
    assert.deepEqual(check('user-a', 'user-b', true), { allowed: true, isException: false });
  });
  test(`[${name}] ban ghi cu thieu actorId thi cho qua (khong chung minh duoc la cung nguoi)`, () => {
    assert.deepEqual(check(null, 'user-b'), { allowed: true, isException: false });
    assert.deepEqual(check('user-a', null), { allowed: true, isException: false });
    assert.deepEqual(check(null, null), { allowed: true, isException: false });
  });
}
