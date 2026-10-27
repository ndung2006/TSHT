// Test AioSourceService: CRUD nguon VTCAIO, kich hoat doc quyen, che token key, quet kenh.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AioSourceService } from './dist/modules/playback/aio-source.service.js';

function fakePrisma() {
  const rows = new Map();
  return {
    tvAioSource: {
      findMany: async () => [...rows.values()],
      findFirst: async ({ where }) => [...rows.values()].find((r) => r.isActive === where.isActive) || null,
      findUnique: async ({ where }) => rows.get(where.id) || null,
      create: async ({ data }) => { rows.set(data.id, { ...data }); return rows.get(data.id); },
      update: async ({ where, data }) => { const r = rows.get(where.id); Object.assign(r, data); return r; },
      updateMany: async ({ where, data }) => {
        let n = 0;
        for (const r of rows.values()) {
          if (r.isActive === where.isActive) { Object.assign(r, data); n += 1; }
        }
        return { count: n };
      },
      delete: async ({ where }) => { rows.delete(where.id); },
    },
    _rows: rows,
  };
}

test('CRUD nguon VTCAIO + che token key', async () => {
  const svc = new AioSourceService(fakePrisma());
  assert.deepEqual(await svc.list(), []);
  const s = await svc.create({ name: 'Luuchieu1', domain: 'https://luuchieu1.vtcplay.vn/', tokenKey: 'secret-key-1234' });
  assert.equal(s.domain, 'https://luuchieu1.vtcplay.vn'); // chuan hoa trailing slash
  assert.equal(s.isActive, false);
  assert.equal(s.hasKey, true);
  assert.equal(s.keyHint, '****1234');
  // list khong lo token key that
  const listed = (await svc.list())[0];
  assert.ok(!('tokenKey' in listed));
  // update khong gui key -> giu nguyen
  const u1 = await svc.update(s.id, { name: 'LC1' });
  assert.equal(u1.name, 'LC1');
  // doi key
  const u2 = await svc.update(s.id, { tokenKey: 'new-key-9999' });
  assert.equal(u2.keyHint, '****9999');
  await assert.rejects(svc.create({ name: 'X', domain: 'not-a-url', tokenKey: 'k' }), /domain phai bat dau/);
  await assert.rejects(svc.create({ name: 'X', domain: 'https://x.vn', tokenKey: '' }), /tokenKey is required/);
});

test('setActive: chi 1 nguon active tai 1 thoi diem', async () => {
  const svc = new AioSourceService(fakePrisma());
  const a = await svc.create({ name: 'A', domain: 'https://a.vn', tokenKey: 'k1' });
  const b = await svc.create({ name: 'B', domain: 'https://b.vn', tokenKey: 'k2' });
  await svc.setActive(a.id);
  assert.equal((await svc.list()).find((s) => s.id === a.id).isActive, true);
  await svc.setActive(b.id);
  const all = await svc.list();
  assert.equal(all.find((s) => s.id === a.id).isActive, false);
  assert.equal(all.find((s) => s.id === b.id).isActive, true);
  // getActiveConfig tra key that cho runtime
  const cfg = await svc.getActiveConfig();
  assert.equal(cfg.baseUrl, 'https://b.vn');
  assert.equal(cfg.partnerKey, 'k2');
  await svc.remove(a.id);
  assert.equal((await svc.list()).length, 1);
});

test('getActiveConfig: null khi chua co nguon active', async () => {
  const svc = new AioSourceService(fakePrisma());
  assert.equal(await svc.getActiveConfig(), null);
  await svc.create({ name: 'A', domain: 'https://a.vn', tokenKey: 'k1' });
  assert.equal(await svc.getActiveConfig(), null); // chua kich hoat
});

test('scan: loi duoc map thanh thong bao tieng Viet', async () => {
  const svc = new AioSourceService(fakePrisma());
  await assert.rejects(svc.scan('https://127.0.0.1:9', 'k'), /Khong ket noi duoc toi domain/);
  await assert.rejects(svc.scan('not-a-url', 'k'), /domain phai bat dau/);
  await assert.rejects(svc.scan('https://x.vn', ''), /tokenKey is required/);
  await assert.rejects(svc.scanSaved('nope'), /not found/);
});
