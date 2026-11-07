// Test logic thuan home slots (Buoc 0, phuong an A).
// Chay: node --test --import ./test-hooks-register.mjs src/modules/home-slots/home-slots.test.mjs
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  HOME_SLOT_BLOCKS,
  blockFlag,
  defaultMaxSlots,
  findDuplicatePublicIds,
  isHomeSlotBlockKey,
  isMainArticleInSpotlight,
  isVersionMatch,
  maxSlotsError,
} from './home-slot-rules';

describe('home-slot-rules: khoi + co tick', () => {
  test('2 khoi dung Q1: noi-bat max 10 co Bai chinh, tieu-diem max 3 khong Bai chinh', () => {
    assert.equal(defaultMaxSlots('noi-bat'), 10);
    assert.equal(defaultMaxSlots('tieu-diem'), 3);
    assert.equal(HOME_SLOT_BLOCKS['noi-bat'].hasMainArticle, true);
    assert.equal(HOME_SLOT_BLOCKS['tieu-diem'].hasMainArticle, false);
  });
  test('co tick kho: noi-bat = isFeatured, tieu-diem = isSpotlight', () => {
    assert.equal(blockFlag('noi-bat'), 'isFeatured');
    assert.equal(blockFlag('tieu-diem'), 'isSpotlight');
  });
  test('chi 2 blockKey hop le', () => {
    assert.equal(isHomeSlotBlockKey('noi-bat'), true);
    assert.equal(isHomeSlotBlockKey('tieu-diem'), true);
    assert.equal(isHomeSlotBlockKey('tieu-diem-link'), false);
    assert.equal(isHomeSlotBlockKey('tin-moi-nhat'), false);
    assert.equal(isHomeSlotBlockKey(''), false);
    assert.equal(isHomeSlotBlockKey(null), false);
  });
});

describe('home-slot-rules: trung trong khoi (Q2)', () => {
  test('khong trung -> rong', () => {
    assert.deepEqual(findDuplicatePublicIds(['a', 'b', 'c']), []);
    assert.deepEqual(findDuplicatePublicIds([]), []);
  });
  test('trung 1 bai -> tra bai do 1 lan', () => {
    assert.deepEqual(findDuplicatePublicIds(['a', 'b', 'a']), ['a']);
    assert.deepEqual(findDuplicatePublicIds(['a', 'a', 'a']), ['a']);
  });
  test('trung nhieu bai -> tra theo thu tu xuat hien lan 2', () => {
    assert.deepEqual(findDuplicatePublicIds(['a', 'b', 'a', 'c', 'b']), ['a', 'b']);
  });
});

describe('home-slot-rules: version/409', () => {
  test('version khop (so hoac chuoi so) -> duoc luu', () => {
    assert.equal(isVersionMatch(3, 3), true);
    assert.equal(isVersionMatch('3', 3), true);
    assert.equal(isVersionMatch(0, 0), true);
  });
  test('version lech -> 409', () => {
    assert.equal(isVersionMatch(2, 3), false);
    assert.equal(isVersionMatch('x', 3), false);
    assert.equal(isVersionMatch(undefined, 0), false);
  });
});

describe('home-slot-rules: maxSlots (Q1/Q6)', () => {
  test('du slot -> null', () => {
    assert.equal(maxSlotsError(4, 4), null);
    assert.equal(maxSlotsError(3, 2), null);
    assert.equal(maxSlotsError(4, 0), null);
  });
  test('noi-bat max moi 10: du 10 -> null, 11 -> bao go bot 1 bai', () => {
    assert.equal(maxSlotsError(10, 10), null);
    assert.equal(maxSlotsError(10, 9), null);
    const msg = maxSlotsError(10, 11);
    assert.ok(msg && msg.includes('11 bai') && msg.includes('10') && msg.includes('go bot 1 bai'));
  });
  test('vuot max -> bao go bot truoc', () => {
    const msg = maxSlotsError(3, 5);
    assert.ok(msg && msg.includes('5 bai') && msg.includes('3') && msg.includes('go bot 2 bai'));
  });
  test('maxSlots khong hop le -> bao loi', () => {
    assert.ok(maxSlotsError(0, 0));
    assert.ok(maxSlotsError(-1, 0));
    assert.ok(maxSlotsError(2.5, 0));
    assert.ok(maxSlotsError('x', 0));
  });
});

describe('home-slot-rules: Bai chinh trung tieu diem (c)', () => {
  test('Bai chinh co trong tieu diem -> trang chu bo link trung', () => {
    assert.equal(isMainArticleInSpotlight('a', ['b', 'a', 'c']), true);
    assert.equal(isMainArticleInSpotlight('a', ['b', 'c']), false);
    assert.equal(isMainArticleInSpotlight(null, ['a']), false);
    assert.equal(isMainArticleInSpotlight('a', []), false);
  });
});
