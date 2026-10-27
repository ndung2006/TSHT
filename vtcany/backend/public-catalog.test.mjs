// Test API cong khai catalog (public_id/slug/ban cong khai) — chay sau `npm run build`.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  catalogPublicId,
  slugifyVi,
  toPublicItem,
} from './dist/modules/catalog/catalog.service.js';

test('catalogPublicId: 24-hex, on dinh, khac id khac hash', () => {
  const a = catalogPublicId('sh-mup4jshb-9jtjmej4');
  assert.match(a, /^[0-9a-f]{24}$/);
  assert.equal(a, catalogPublicId('sh-mup4jshb-9jtjmej4'));
  assert.notEqual(a, catalogPublicId('sh-khac'));
});

test('slugifyVi: bo dau tieng Viet, gach ngang', () => {
  assert.equal(slugifyVi('Đảo Thanh Lân - Quảng Ninh'), 'dao-thanh-lan-quang-ninh');
  assert.equal(slugifyVi('Hậu trường: Kẻ Truy Kích!'), 'hau-truong-ke-truy-kich');
  assert.equal(slugifyVi(''), '');
});

test('toPublicItem: map field hien thi, khong lo field noi bo', () => {
  const p = toPublicItem({
    id: 'sh-1', title: 'Đảo Thanh Lân', description: 'dep',
    thumbnailUrl: 'https://x/t.jpg', videoFileId: 'upl-secret', isVisible: true, duration: '00:00:30',
  });
  assert.equal(p.public_id, catalogPublicId('sh-1'));
  assert.equal(p.slug, 'dao-thanh-lan');
  assert.equal(p.thumbnail, 'https://x/t.jpg'); // fallback thumbnailUrl
  assert.equal(p.duration, '00:00:30');
  assert.equal('videoFileId' in p, false);
  assert.equal('isVisible' in p, false);
});
