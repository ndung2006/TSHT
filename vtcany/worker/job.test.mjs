import test from 'node:test';
import assert from 'node:assert/strict';
import { JobQueue } from './dist/queue.js';

test('enqueue -> processing -> done', () => {
  const q = new JobQueue();
  const job = q.enqueue('s3://raw/a.mp4', ['p480']);
  assert.equal(job.status, 'queued');
  q.mark(job.id, 'processing');
  q.mark(job.id, 'done');
  assert.equal(q.get(job.id).status, 'done');
  assert.deepEqual(q.pending(), []);
});
