import test from 'node:test';
import assert from 'node:assert/strict';
import { TV_GROUPS, channelPublicId, dateLabel, epgDateWindow, groupForChannel, normalizeVi } from './dist/modules/tv/tv.catalog.js';
import { SearchService } from './dist/modules/search/search.service.js';

test('channel grouping follows spec groups', () => {
  assert.deepEqual(TV_GROUPS, ['Kênh VTV', 'KÊNH ĐỊA PHƯƠNG', 'RADIO', 'ANTV-Truyền hình CAND', 'QPVN']);
  assert.equal(groupForChannel('VTV1'), 'Kênh VTV');
  assert.equal(groupForChannel('PHUTHO'), 'KÊNH ĐỊA PHƯƠNG');
  assert.equal(groupForChannel('VOV1'), 'RADIO');
  assert.equal(groupForChannel('LAICHAURadio'), 'RADIO');
  assert.equal(groupForChannel('ANTV'), 'ANTV-Truyền hình CAND');
  assert.equal(groupForChannel('QPVN'), 'QPVN');
  assert.match(channelPublicId('PHUTHO'), /^[0-9a-f]{24}$/);
  assert.equal(channelPublicId('phutho'), channelPublicId('PHUTHO'));
});

test('epg window is 5 days with Hom nay label', () => {
  const win = epgDateWindow(new Date('2026-09-29T12:00:00'));
  assert.deepEqual(win, ['2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30']);
  assert.equal(dateLabel('2026-09-29', '2026-09-29'), 'Hôm nay');
  assert.equal(dateLabel('2026-09-26', '2026-09-29'), '26/09');
});

test('normalizeVi strips diacritics', () => {
  assert.equal(normalizeVi('Thâm Tình'), 'tham tinh');
  assert.equal(normalizeVi('KICK - OFF Thể thao'), 'kick - off the thao');
});

test('search finds without diacritics, grouped by type', () => {
  const svc = new SearchService();
  const r = svc.search('tham tinh');
  assert.equal(r.query, 'tham tinh');
  const phim = r.groups.find((g) => g.type === 'Phim');
  assert.ok(phim && phim.items.some((i) => i.title === 'Thâm Tình'));
  assert.deepEqual(svc.search('').groups, []);
  const short = svc.search('hai ngan');
  assert.ok(short.groups.some((g) => g.type === 'Short'));
});
