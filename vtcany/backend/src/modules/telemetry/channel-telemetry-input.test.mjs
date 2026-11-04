// Test validate/normalize heartbeat kenh. Chay truc tiep bang node --test,
// khong can build (Node strip type cua file .ts thuan).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  HEARTBEAT_DEDUPE_WINDOW_MS,
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
