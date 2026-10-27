import test from 'node:test';
import assert from 'node:assert/strict';
import { TelemetryService } from './dist/modules/telemetry/telemetry.service.js';

test('heartbeat saves position for continue watching', () => {
  const t = new TelemetryService();
  t.heartbeat({ userId: 'u1', sessionId: 's1', contentId: 'vid-1', positionSec: 125 });
  const list = t.continueWatching('u1');
  assert.equal(list[0].contentId, 'vid-1');
  assert.equal(list[0].positionSec, 125);
});

test('third concurrent device gets 403', () => {
  const t = new TelemetryService();
  t.heartbeat({ userId: 'u1', sessionId: 's1', contentId: 'v', positionSec: 1 });
  t.heartbeat({ userId: 'u1', sessionId: 's2', contentId: 'v', positionSec: 2 });
  assert.throws(() => t.heartbeat({ userId: 'u1', sessionId: 's3', contentId: 'v', positionSec: 3 }), /concurrency/);
});
