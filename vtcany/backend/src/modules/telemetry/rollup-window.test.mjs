// Test cua so tinh lai rollup: job gio chi quet 7 ngay VN gan nhat,
// goi tay ?date= thi gop dung 1 ngay cu trong pham vi 90 ngay.
// Chay: node --test --import ./test-hooks-register.mjs src/modules/telemetry/rollup-window.test.mjs
// (can resolve hook vi helper import kieu extensionless giong code Nest).
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { rollupDaily } from './rollup-daily';
import { vnDateForDb } from '../dashboard/dashboard-helpers';

// Gio VN viet duoi dang ISO +07:00, vd vn('2026-11-04T10:00:00').
const vn = (s) => new Date(`${s}+07:00`);

// DB gia toi thieu theo dung cac query ma rollup-daily.ts goi
// (ban sao harness cua rollup-recompute.test.mjs).
function makeDb() {
  const tables = { pageViews: [], pageViewDaily: [], channelHeartbeats: [], channelTelemetryDaily: [] };
  const matchWhere = (row, where) => {
    if (!where) return true;
    if ('isClean' in where && row.isClean !== where.isClean) return false;
    if (where.createdAt) {
      if (where.createdAt.gte && !(row.createdAt >= where.createdAt.gte)) return false;
      if (where.createdAt.lt && !(row.createdAt < where.createdAt.lt)) return false;
    }
    if (where.vnDate && row.vnDate?.getTime() !== where.vnDate.getTime()) return false;
    return true;
  };
  const matchKey = (row, key) => Object.entries(key).every(([k, v]) => (v instanceof Date ? row[k]?.getTime() === v.getTime() : row[k] === v));
  const model = (rows) => ({
    findFirst: async (q) => {
      const found = rows.filter((r) => matchWhere(r, q?.where));
      if (q?.orderBy?.createdAt === 'asc') found.sort((a, b) => a.createdAt - b.createdAt);
      return found[0] ?? null;
    },
    count: async (q) => rows.filter((r) => matchWhere(r, q?.where)).length,
    findMany: async (q) => rows.filter((r) => matchWhere(r, q?.where)),
    upsert: async (q) => {
      const key = Object.values(q.where)[0];
      const found = rows.find((r) => matchKey(r, key));
      if (found) return Object.assign(found, q.update);
      const created = { ...q.create };
      rows.push(created);
      return created;
    },
    deleteMany: async (q) => {
      let n = 0;
      for (let i = rows.length - 1; i >= 0; i--) {
        if (matchWhere(rows[i], q?.where)) {
          rows.splice(i, 1);
          n++;
        }
      }
      return { count: n };
    },
  });
  return {
    tables,
    pageView: model(tables.pageViews),
    pageViewDaily: model(tables.pageViewDaily),
    channelHeartbeat: model(tables.channelHeartbeats),
    channelTelemetryDaily: model(tables.channelTelemetryDaily),
    addPageView: (r) => tables.pageViews.push({ articlePublicId: null, path: '', sessionId: null, ...r }),
    addHeartbeat: (r) => tables.channelHeartbeats.push({ channelPublicId: null, channelName: null, contentId: null, viewType: 'live', sessionId: null, ...r }),
  };
}

// today = 2026-11-06 -> cua so tu dong mac dinh 7 ngay = 10-30..11-05.
const OPTS = { today: '2026-11-06', now: vn('2026-11-06T10:00:00') };

function dailyChannel(db, vnDate, channelPublicId, viewType) {
  return db.tables.channelTelemetryDaily.find(
    (r) => r.vnDate.getTime() === vnDateForDb(vnDate).getTime() && r.channelPublicId === channelPublicId && r.viewType === viewType,
  );
}
function dailyPage(db, vnDate, contentType, contentKey) {
  return db.tables.pageViewDaily.find(
    (r) => r.vnDate.getTime() === vnDateForDb(vnDate).getTime() && r.contentType === contentType && r.contentKey === contentKey,
  );
}

// Du lieu: ngay 10-27 nam NGOAI cua so 7 ngay; 10-30 la bien cua so
// (dung today-7); 11-04 nam trong cua so. Dong daily 10-27 co san
// voi so CŨ SAI (999) de chung minh job tu dong khong dong vao no.
function seedOldAndNew(db) {
  db.addHeartbeat({ channelPublicId: 'ch-1', viewType: 'live', sessionId: 'o1', createdAt: vn('2026-10-27T10:00:00'), isClean: true });
  db.addHeartbeat({ channelPublicId: 'ch-1', viewType: 'live', sessionId: 'o2', createdAt: vn('2026-10-27T10:01:00'), isClean: true });
  db.addHeartbeat({ channelPublicId: 'ch-1', viewType: 'live', sessionId: 'e1', createdAt: vn('2026-10-30T10:00:00'), isClean: true });
  db.addHeartbeat({ channelPublicId: 'ch-1', viewType: 'live', sessionId: 'e2', createdAt: vn('2026-10-30T10:01:00'), isClean: true });
  db.addHeartbeat({ channelPublicId: 'ch-1', viewType: 'live', sessionId: 'e3', createdAt: vn('2026-10-30T10:02:00'), isClean: true });
  db.addHeartbeat({ channelPublicId: 'ch-1', viewType: 'live', sessionId: 'n1', createdAt: vn('2026-11-04T10:00:00'), isClean: true });
  db.addPageView({ path: '/tin', sessionId: 'po', createdAt: vn('2026-10-27T10:00:00'), isClean: true });
  db.addPageView({ path: '/tin', sessionId: 'pn1', createdAt: vn('2026-11-04T10:00:00'), isClean: true });
  db.addPageView({ path: '/tin', sessionId: 'pn2', createdAt: vn('2026-11-04T10:01:00'), isClean: true });
  db.tables.channelTelemetryDaily.push({
    vnDate: vnDateForDb('2026-10-27'), channelPublicId: 'ch-1', channelName: 'TUYENQUANG',
    contentId: null, viewType: 'live', heartbeats: 999, uniqueSessions: 999, watchedMinutes: 999,
  });
  db.tables.pageViewDaily.push({
    vnDate: vnDateForDb('2026-10-27'), contentType: 'page', contentKey: '/tin', views: 999, uniqueSessions: 999,
  });
}

describe('rollupDaily: cua so tu dong 7 ngay', () => {
  test('ngay cu hon 7 ngay khong bi tinh lai tu dong, so daily cu sai giu nguyen', async () => {
    const db = makeDb();
    seedOldAndNew(db);
    const res = await rollupDaily(db, OPTS);
    assert.ok(!res.dates.includes('2026-10-27'));
    assert.ok(res.dates.includes('2026-10-30'));
    assert.ok(res.dates.includes('2026-11-04'));
    assert.equal(dailyChannel(db, '2026-10-27', 'ch-1', 'live').heartbeats, 999);
    assert.equal(dailyPage(db, '2026-10-27', 'page', '/tin').views, 999);
    assert.equal(dailyChannel(db, '2026-10-30', 'ch-1', 'live').heartbeats, 3);
    assert.equal(dailyChannel(db, '2026-11-04', 'ch-1', 'live').heartbeats, 1);
    assert.equal(dailyPage(db, '2026-11-04', 'page', '/tin').views, 2);
  });

  test('so ngay cua so lay tu cau hinh (recomputeDays) chu khong cung', async () => {
    const db = makeDb();
    seedOldAndNew(db);
    const res = await rollupDaily(db, { ...OPTS, recomputeDays: 3 });
    assert.ok(!res.dates.includes('2026-10-30'));
    assert.ok(res.dates.includes('2026-11-04'));
    assert.equal(dailyChannel(db, '2026-10-30', 'ch-1', 'live'), undefined);
  });
});

describe('rollupDaily: goi tay 1 ngay cu (?date=)', () => {
  test('chi tinh lai dung ngay duoc chi dinh, ngay khac khong bi dong vao', async () => {
    const db = makeDb();
    seedOldAndNew(db);
    const res = await rollupDaily(db, { ...OPTS, onlyDate: '2026-10-27' });
    assert.deepEqual(res.dates, ['2026-10-27']);
    assert.equal(dailyChannel(db, '2026-10-27', 'ch-1', 'live').heartbeats, 2);
    assert.equal(dailyChannel(db, '2026-10-27', 'ch-1', 'live').uniqueSessions, 2);
    assert.equal(dailyPage(db, '2026-10-27', 'page', '/tin').views, 1);
    assert.equal(dailyChannel(db, '2026-10-30', 'ch-1', 'live'), undefined);
    assert.equal(dailyChannel(db, '2026-11-04', 'ch-1', 'live'), undefined);
  });

  test('ngay trong pham vi giu lieu nhung khong co dong tho thi khong sinh dong daily', async () => {
    const db = makeDb();
    seedOldAndNew(db);
    const res = await rollupDaily(db, { ...OPTS, onlyDate: '2026-10-28' });
    assert.deepEqual(res.dates, []);
    assert.equal(db.tables.channelTelemetryDaily.filter((r) => r.vnDate.getTime() === vnDateForDb('2026-10-28').getTime()).length, 0);
  });

  test('ngay o bien pham vi giu lieu (2026-08-08) van gop duoc', async () => {
    const db = makeDb();
    db.addHeartbeat({ channelPublicId: 'ch-1', viewType: 'live', sessionId: 's1', createdAt: vn('2026-08-08T12:00:00'), isClean: true });
    const res = await rollupDaily(db, { ...OPTS, onlyDate: '2026-08-08' });
    assert.deepEqual(res.dates, ['2026-08-08']);
    assert.equal(dailyChannel(db, '2026-08-08', 'ch-1', 'live').heartbeats, 1);
  });
});

describe('rollupDaily: tu choi ngay go tay khong hop le', () => {
  test('ngay hom nay, ngay tuong lai, ngay khong ton tai, ngay qua 90 ngay, chuoi rac deu bi tu choi', async () => {
    const db = makeDb();
    for (const bad of ['2026-11-06', '2026-11-07', '2026-02-30', '2026-08-07', '', 'not-a-date', '2026-11-4']) {
      await assert.rejects(rollupDaily(db, { ...OPTS, onlyDate: bad }), /INVALID_DATE/);
    }
  });
});
