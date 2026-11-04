// Test helper tick gop ngay cua transcode-worker (node --test).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { shouldCallRollup } from './transcode-worker.mjs';

describe('shouldCallRollup', () => {
  it('lan dau (chua goi bao gio) -> goi ngay', () => {
    assert.equal(shouldCallRollup(0, 1000000), true);
  });

  it('trong 1 gio tu lan goi truoc -> khong goi', () => {
    assert.equal(shouldCallRollup(1000000, 1000000 + 59 * 60 * 1000), false);
  });

  it('qua 1 gio tu lan goi truoc -> goi lai', () => {
    assert.equal(shouldCallRollup(1000000, 1000000 + 3600000), true);
    assert.equal(shouldCallRollup(1000000, 1000000 + 2 * 3600000), true);
  });

  it('khoang tuy chinh duoc ton trong', () => {
    assert.equal(shouldCallRollup(1000000, 1000000 + 10 * 60 * 1000, 10 * 60 * 1000), true);
    assert.equal(shouldCallRollup(1000000, 1000000 + 9 * 60 * 1000, 10 * 60 * 1000), false);
  });
});
