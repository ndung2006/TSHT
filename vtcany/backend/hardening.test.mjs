import test from 'node:test';
import assert from 'node:assert/strict';
import { hasPermission } from './dist/modules/auth/users.store.js';
import { RateLimiter } from './dist/modules/auth/rate-limit.js';
import { AuditService } from './dist/modules/audit/audit.service.js';

test('editor can submit but cannot publish', () => {
  assert.equal(hasPermission('editor', 'video:submit'), true);
  assert.equal(hasPermission('editor', 'video:publish'), false);
  assert.equal(hasPermission('admin', 'video:publish'), true);
});

test('rate limiter blocks over quota in window', () => {
  const r = new RateLimiter();
  assert.equal(r.tick('k', 2, 60_000, 0), true);
  assert.equal(r.tick('k', 2, 60_000, 1), true);
  assert.equal(r.tick('k', 2, 60_000, 2), false);
  assert.equal(r.tick('k', 2, 60_000, 61_000), true);
});

test('audit keeps newest-first list', () => {
  const a = new AuditService();
  a.record({ at: 1, actor: 'editor', action: 'video.submit', resource: 'v1' });
  a.record({ at: 2, actor: 'admin', action: 'video.publish', resource: 'v1' });
  const list = a.list();
  assert.equal(list[0].action, 'video.publish');
  assert.equal(list.length, 2);
});
