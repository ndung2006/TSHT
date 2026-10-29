// Test quy tac Zone/Widget Manager — Goi 1A. Chay truc tiep bang
// node --test, khong can build (Node strip type cua file .ts thuan,
// theo mau phase1b-workspaces.test.mjs).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ZONE_DEFS,
  buildBlockItems,
  isZoneKey,
  naturalSource,
  nextSortOrder,
  zoneDef,
} from './zone-rules.ts';
import { visibleMenu } from '../../../../apps/cms/utils/workspaces.ts';

const keyOf = (a) => a.publicId;
const art = (publicId) => ({ publicId, title: publicId });

test('seed dung 2 vung theo layout that trang chu: Tieu diem 4 slot, Tin moi nhat 8 slot', () => {
  assert.equal(ZONE_DEFS.length, 2);
  assert.deepEqual(
    ZONE_DEFS.map((z) => [z.key, z.slotLimit]),
    [['tieu-diem', 4], ['tin-moi-nhat', 8]],
  );
  assert.equal(new Set(ZONE_DEFS.map((z) => z.key)).size, 2);
});

test('isZoneKey / zoneDef / naturalSource dung dinh nghia vung', () => {
  assert.equal(isZoneKey('tieu-diem'), true);
  assert.equal(isZoneKey('tin-moi-nhat'), true);
  assert.equal(isZoneKey('khong-co'), false);
  assert.equal(zoneDef('tieu-diem')?.slotLimit, 4);
  assert.equal(zoneDef('khong-co'), null);
  assert.equal(naturalSource('tieu-diem'), 'featured');
  assert.equal(naturalSource('tin-moi-nhat'), 'latest');
});

test('buildBlockItems: bai ghim truoc theo thu tu, lap day tu nhien, du slot thi dung', () => {
  const out = buildBlockItems(
    [art('g1'), art('g2')],
    [art('n1'), art('g1'), art('n2'), art('n3')],
    4,
    keyOf,
  );
  // g1 trong nguon tu nhien bi loai (da ghim), n3 bi cat do du slot.
  assert.deepEqual(out.map((a) => a.publicId), ['g1', 'g2', 'n1', 'n2']);
});

test('buildBlockItems: vung rong thi khoi bang nguon tu nhien (hanh vi cu)', () => {
  const out = buildBlockItems([], [art('n1'), art('n2')], 4, keyOf);
  assert.deepEqual(out.map((a) => a.publicId), ['n1', 'n2']);
});

test('buildBlockItems: bai ghim trung lap va qua slot deu bi cat', () => {
  const out = buildBlockItems([art('g1'), art('g1')], [art('g1')], 1, keyOf);
  assert.deepEqual(out.map((a) => a.publicId), ['g1']);
});

test('nextSortOrder: rong -> 1, khac rong -> max + 1', () => {
  assert.equal(nextSortOrder([]), 1);
  assert.equal(nextSortOrder([{ sortOrder: 1 }, { sortOrder: 4 }, { sortOrder: 2 }]), 5);
});

test('menu CMS co muc Vung hien thi o workspace Bao dien tu, gate theo module zones', () => {
  const groups = visibleMenu(['zones:view']);
  const online = groups.find((g) => g.label === 'Xuất bản Báo điện tử');
  assert.ok(online.items.some((i) => i.to === '/vung-hien-thi'));
  const noZones = visibleMenu(['articles:view']);
  const onlineNoZones = noZones.find((g) => g.label === 'Xuất bản Báo điện tử');
  assert.ok(!onlineNoZones.items.some((i) => i.to === '/vung-hien-thi'));
});
