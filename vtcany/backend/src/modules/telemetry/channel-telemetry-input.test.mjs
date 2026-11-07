// Test validate/normalize heartbeat kenh. Chay truc tiep bang node --test,
// khong can build (Node strip type cua file .ts thuan).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  HEARTBEAT_DEDUPE_WINDOW_MS,
  MAX_WATCHED_SECONDS,
  WATCHED_SECONDS_DURATION_FACTOR,
  decideFinalBeat,
  normalizeChannelHeartbeatInput,
} from './channel-telemetry-input.ts';

test('live hop le: ten kenh trim, session giu nguyen', () => {
  const out = normalizeChannelHeartbeatInput({ sessionId: '  sid-1 ', channel: '  TUYENQUANG ', type: 'live' });
  assert.equal(out.sessionId, 'sid-1');
  assert.equal(out.channelName, 'TUYENQUANG');
  assert.equal(out.viewType, 'live');
  assert.equal(out.contentId, null);
});

test('timeshift bat buoc co ten kenh; thieu -> throw', () => {
  assert.throws(() => normalizeChannelHeartbeatInput({ type: 'timeshift' }), /kenh/);
  assert.throws(() => normalizeChannelHeartbeatInput({ channel: '   ', type: 'live' }), /kenh/);
});

test('vod bat buoc co contentId, khong can ten kenh', () => {
  const out = normalizeChannelHeartbeatInput({ type: 'vod', contentId: 'abcdef0123456789abcdef01' });
  assert.equal(out.viewType, 'vod');
  assert.equal(out.contentId, 'abcdef0123456789abcdef01');
  assert.equal(out.channelName, null);
  assert.throws(() => normalizeChannelHeartbeatInput({ type: 'vod' }), /contentId/);
});

test('loai xem ngoai 3 gia tri -> throw', () => {
  assert.throws(() => normalizeChannelHeartbeatInput({ channel: 'X', type: 'radio' }), /loai xem/);
  assert.throws(() => normalizeChannelHeartbeatInput({ channel: 'X' }), /loai xem/);
});

test('chuoi dai bi cat o 128 ky tu', () => {
  const out = normalizeChannelHeartbeatInput({ sessionId: 's'.repeat(200), channel: 'c'.repeat(200), type: 'live' });
  assert.equal(out.sessionId.length, 128);
  assert.equal(out.channelName.length, 128);
});

test('cua so dedupe heartbeat la 45 giay (ngan hon nhip gui 60 giay)', () => {
  assert.equal(HEARTBEAT_DEDUPE_WINDOW_MS, 45 * 1000);
});

// ---- Beat cuoi VOD (3c-final-beat) ----
test('beat cuoi hop le: watchedSeconds + durationSec trong nguong thi giu nguyen', () => {
  const out = normalizeChannelHeartbeatInput({ type: 'vod', contentId: 'abcdef0123456789abcdef01', sessionId: 's1', watchedSeconds: 111, final: true, durationSec: 111 });
  assert.equal(out.isFinal, true);
  assert.equal(out.watchedSeconds, 111);
  assert.equal(out.durationSec, 111);
  assert.equal(out.clamped, false);
});

test('beat thuong khong co watchedSeconds/final thi mac dinh null/false', () => {
  const out = normalizeChannelHeartbeatInput({ type: 'vod', contentId: 'abcdef0123456789abcdef01', sessionId: 's1' });
  assert.equal(out.isFinal, false);
  assert.equal(out.watchedSeconds, null);
  assert.equal(out.durationSec, null);
  assert.equal(out.clamped, false);
});

test('watchedSeconds vuot duration x 1,5 thi cat ve nguong (lam tron xuong) + clamped', () => {
  // duration 111 giay -> toi da floor(111 x 1,5) = 166 giay.
  const out = normalizeChannelHeartbeatInput({ type: 'vod', contentId: 'abcdef0123456789abcdef01', sessionId: 's1', watchedSeconds: 222, final: true, durationSec: 111 });
  assert.equal(out.watchedSeconds, 166);
  assert.equal(out.clamped, true);
  assert.equal(out.isFinal, true);
  // Dung bang nguong thi khong bi cat.
  const atCap = normalizeChannelHeartbeatInput({ type: 'vod', contentId: 'abcdef0123456789abcdef01', sessionId: 's1', watchedSeconds: 166, final: true, durationSec: 111 });
  assert.equal(atCap.watchedSeconds, 166);
  assert.equal(atCap.clamped, false);
});

test('khong biet thoi luong thi watchedSeconds toi da 3600', () => {
  assert.equal(MAX_WATCHED_SECONDS, 3600);
  const out = normalizeChannelHeartbeatInput({ type: 'vod', contentId: 'abcdef0123456789abcdef01', sessionId: 's1', watchedSeconds: 9999, final: true });
  assert.equal(out.watchedSeconds, 3600);
  assert.equal(out.clamped, true);
  const ok = normalizeChannelHeartbeatInput({ type: 'vod', contentId: 'abcdef0123456789abcdef01', sessionId: 's1', watchedSeconds: 3600, final: true });
  assert.equal(ok.watchedSeconds, 3600);
  assert.equal(ok.clamped, false);
});

test('watchedSeconds sai kieu / am / NaN thi bo qua (null), khong throw', () => {
  for (const bad of ['30', -5, NaN, Infinity, null, undefined, {}]) {
    const out = normalizeChannelHeartbeatInput({ type: 'vod', contentId: 'abcdef0123456789abcdef01', sessionId: 's1', watchedSeconds: bad, final: true, durationSec: 100 });
    assert.equal(out.watchedSeconds, null, `watchedSeconds=${String(bad)} phai ve null`);
    assert.equal(out.clamped, false);
    assert.equal(out.isFinal, true, 'beat cuoi van duoc ghi nhan du watchedSeconds sai');
  }
});

test('durationSec duoc lam tron xuong; 0 / am / sai kieu thi coi nhu khong biet', () => {
  const out = normalizeChannelHeartbeatInput({ type: 'vod', contentId: 'abcdef0123456789abcdef01', sessionId: 's1', watchedSeconds: 30, final: true, durationSec: 111.9 });
  assert.equal(out.durationSec, 111);
  for (const bad of [0, -10, NaN, Infinity, '111', null, undefined]) {
    const o = normalizeChannelHeartbeatInput({ type: 'vod', contentId: 'abcdef0123456789abcdef01', sessionId: 's1', watchedSeconds: 30, final: true, durationSec: bad });
    assert.equal(o.durationSec, null, `durationSec=${String(bad)} phai ve null`);
  }
});

test('he so chan watchedSeconds la 1,5 lan thoi luong', () => {
  assert.equal(WATCHED_SECONDS_DURATION_FACTOR, 1.5);
});

test('decideFinalBeat: chua co beat cuoi thi chen moi', () => {
  assert.deepEqual(decideFinalBeat(null, 30), { action: 'create', watchedSeconds: 30 });
  assert.deepEqual(decideFinalBeat(null, null), { action: 'create', watchedSeconds: null });
});

test('decideFinalBeat: da co beat cuoi thi chi cap nhat khi gia tri moi lon hon (MAX)', () => {
  assert.deepEqual(decideFinalBeat({ watchedSeconds: 30 }, 45), { action: 'update', watchedSeconds: 45 });
  assert.deepEqual(decideFinalBeat({ watchedSeconds: 30 }, 30), { action: 'skip' });
  assert.deepEqual(decideFinalBeat({ watchedSeconds: 30 }, 20), { action: 'skip' });
  assert.deepEqual(decideFinalBeat({ watchedSeconds: 30 }, null), { action: 'skip' });
  // Beat cuoi cu khong co so giay -> cap nhat khi co gia tri moi.
  assert.deepEqual(decideFinalBeat({ watchedSeconds: null }, 30), { action: 'update', watchedSeconds: 30 });
  assert.deepEqual(decideFinalBeat({ watchedSeconds: null }, null), { action: 'skip' });
});
