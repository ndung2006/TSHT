import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aioEpgAllowed, applyChannelOverrides, channelKeyOf } from './dist/modules/tv/tv.catalog.js';

const AIO = [
  { name: 'VTV1', audioOnly: false },
  { name: 'VTV3', audioOnly: false },
  { name: 'PHUTHO', audioOnly: false },
  { name: 'VOV1', audioOnly: true },
];

function flat(groups) {
  return groups.flatMap((g) => g.channels.map((c) => ({ group: g.name, ...c })));
}

test('khong override: giu nguyen nhom mac dinh theo ten kenh', () => {
  const { groups } = applyChannelOverrides(AIO, []);
  const all = flat(groups);
  assert.equal(all.length, 4);
  assert.equal(all.find((c) => c.name === 'VTV1').group, 'Kênh VTV');
  assert.equal(all.find((c) => c.name === 'VOV1').group, 'RADIO');
  assert.equal(all.find((c) => c.name === 'PHUTHO').group, 'KÊNH ĐỊA PHƯƠNG');
});

test('isVisible=false an kenh khoi danh sach cong khai', () => {
  const { groups } = applyChannelOverrides(AIO, [{ channelKey: 'VTV3', isVisible: false }]);
  const names = flat(groups).map((c) => c.name);
  assert.ok(!names.includes('VTV3'));
  assert.equal(names.length, 3);
});

test('override doi nhom, ten hien thi, logo, thu tu', () => {
  const { groups } = applyChannelOverrides(AIO, [
    { channelKey: 'vtv3', displayName: 'VTV3 HD', logoUrl: 'https://x/logo.png', groupName: 'Kênh VTV', sortOrder: 1 },
    { channelKey: 'VTV1', sortOrder: 2 },
  ]);
  const vtv = groups.find((g) => g.name === 'Kênh VTV');
  assert.deepEqual(vtv.channels.map((c) => c.name), ['VTV3 HD', 'VTV1']);
  assert.equal(vtv.channels[0].logo, 'https://x/logo.png');
});

test('kenh tu them (isCustom) xuat hien, ke ca khi AIO khong co', () => {
  const { groups } = applyChannelOverrides(AIO, [
    { channelKey: 'LTV2', isCustom: true, displayName: 'Kênh truyền hình LTV2', hlsUrl: 'https://x/index.m3u8', groupName: 'KÊNH ĐỊA PHƯƠNG' },
  ]);
  const all = flat(groups);
  const custom = all.find((c) => c.is_custom);
  assert.ok(custom);
  assert.equal(custom.name, 'Kênh truyền hình LTV2');
  assert.equal(all.length, 5);
});

test('aioEpgAllowed: mac dinh lay EPG AIO, chi tat khi useAioEpg=false', () => {
  assert.equal(aioEpgAllowed(null), true);
  assert.equal(aioEpgAllowed(undefined), true);
  assert.equal(aioEpgAllowed({ channelKey: 'VTV1' }), true);
  assert.equal(aioEpgAllowed({ channelKey: 'VTV1', useAioEpg: true }), true);
  assert.equal(aioEpgAllowed({ channelKey: 'VTV1', useAioEpg: false }), false);
});

test('kenh tu them bi an khi isVisible=false; key khong phan biet hoa thuong', () => {
  const { groups } = applyChannelOverrides(AIO, [
    { channelKey: 'ltv2', isCustom: true, displayName: 'LTV2', isVisible: false },
    { channelKey: 'VoV1', isVisible: false },
  ]);
  const names = flat(groups).map((c) => c.name);
  assert.ok(!names.includes('LTV2'));
  assert.ok(!names.includes('VOV1'));
  assert.equal(channelKeyOf(' vtv1 '), 'VTV1');
});
