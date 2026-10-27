import test from 'node:test';
import assert from 'node:assert/strict';
import { LayoutService } from './dist/modules/layout/layout.service.js';

const svc = new LayoutService();

test('home returns 6 blocks: 1 hero + 5 rails (contract 3A)', () => {
  const home = svc.getHome('WEB');
  assert.equal(home.platform, 'WEB');
  assert.equal(home.layout_blocks.length, 6);
  const hero = home.layout_blocks[0];
  assert.equal(hero.type, 'HERO_CAROUSEL');
  // Hero moi: 3 banner/section, link truc tiep qua target_url; hero phim giu
  // target_id hop le de movies.catalog index (search).
  assert.equal(hero.items.length, 3);
  assert.ok(hero.items.every((it) => it.image_url && it.title));
  assert.match(hero.items[0].target_url, /^\/video\//);
  const movieHero = hero.items.find((it) => it.target_id);
  assert.match(movieHero.target_id, /-[0-9a-f]{24}$/);
  assert.match(movieHero.target_url, /^\/phim\//);
  const rails = home.layout_blocks.slice(1);
  assert.ok(rails.every((b) => b.type === 'HORIZONTAL_LIST'));
  assert.deepEqual(
    rails.map((b) => b.title),
    ['KICK-OFF THỂ THAO', 'Check in Việt Nam', 'Phim bộ', 'Short videos', 'Phim chiếu rạp'],
  );
  assert.ok(rails.every((b) => b.items.length === 8));
  assert.ok(rails.every((b) => /^\/danh-muc\/.+-[0-9a-f]{24}$/.test(b.target_url)));
  assert.ok(rails.every((b) => ['3:2', '3:4'].includes(b.card_aspect)));
  assert.ok(
    rails.every((b) => b.items.every((it) => /^[0-9a-f]{24}$/.test(it.public_id) && it.is_premium === false)),
  );
});

test('cache returns same object within 60s ttl', () => {
  assert.equal(svc.getHome('WEB'), svc.getHome('web'));
});

test('section hero: moi tab co banner rieng, fallback home khi section la', () => {
  const sections = { home: 3, movies: 2, video: 2, short: 2, entertainment: 2 };
  for (const [section, n] of Object.entries(sections)) {
    const hero = svc.getSectionHero(section);
    assert.equal(hero.length, n, section);
    assert.ok(hero.every((it) => it.image_url && it.title && it.target_url));
  }
  assert.deepEqual(svc.getSectionHero('khong-co'), svc.getSectionHero('home'));
  assert.deepEqual(svc.getSectionHero('MOVIES'), svc.getSectionHero('movies'));
});
