// Test gop lai ngay (recompute) cho rollup telemetry.
// Chay: node --test --import ./test-hooks-register.mjs src/modules/telemetry/rollup-recompute.test.mjs
// (can resolve hook vi helper import kieu extensionless giong code Nest,
// cung kieu chay nhu cac suite dashboard).
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { rollupDaily } from './rollup-daily';
import { vnDateForDb } from '../dashboard/dashboard-helpers';

// Gio VN viet duoi dang ISO +07:00, vd vn('2026-11-04T10:00:00').
const vn = (s) => new Date(`${s}+07:00`);

// DB gia toi thieu theo dung cac query ma rollup-daily.ts goi:
// findFirst/count/findMany (where isClean, createdAt gte/lt, vnDate),
// upsert theo khoa duy nhat, deleteMany theo createdAt.
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

describe('rollupDaily: gop lai ngay da gop dở (hoi quy)', () => {
  test('dong tho den muon cung ngay da qua phai lam so daily tang o lan gop sau', async () => {
    const db = makeDb();
    db.addHeartbeat({ channelPublicId: 'ch-1', channelName: 'TUYENQUANG', viewType: 'live', sessionId: 's1', createdAt: vn('2026-11-04T10:00:00'), isClean: true });
    db.addHeartbeat({ channelPublicId: 'ch-1', channelName: 'TUYENQUANG', viewType: 'live', sessionId: 's2', createdAt: vn('2026-11-04T10:01:00'), isClean: true });
    db.addHeartbeat({ channelPublicId: 'ch-1', channelName: 'TUYENQUANG', viewType: 'live', sessionId: 's3', createdAt: vn('2026-11-04T10:02:00'), isClean: true });
    db.addPageView({ path: '/tin', sessionId: 'p1', createdAt: vn('2026-11-04T10:00:00'), isClean: true });
    db.addPageView({ path: '/tin', sessionId: 'p2', createdAt: vn('2026-11-04T10:05:00'), isClean: true });

    const first = await rollupDaily(db, OPTS);
    assert.ok(first.dates.includes('2026-11-04'));
    assert.equal(dailyChannel(db, '2026-11-04', 'ch-1', 'live').heartbeats, 3);
    assert.equal(dailyChannel(db, '2026-11-04', 'ch-1', 'live').uniqueSessions, 3);
    assert.equal(dailyPage(db, '2026-11-04', 'page', '/tin').views, 2);

    // Dong tho den muon: cung ngay VN da qua, sau lan gop thu nhat.
    db.addHeartbeat({ channelPublicId: 'ch-1', channelName: 'TUYENQUANG', viewType: 'live', sessionId: 's4', createdAt: vn('2026-11-04T23:30:00'), isClean: true });
    db.addHeartbeat({ channelPublicId: 'ch-1', channelName: 'TUYENQUANG', viewType: 'live', sessionId: 's5', createdAt: vn('2026-11-04T23:31:00'), isClean: true });
    db.addPageView({ path: '/tin', sessionId: 'p3', createdAt: vn('2026-11-04T23:32:00'), isClean: true });

    const second = await rollupDaily(db, OPTS);
    assert.ok(second.dates.includes('2026-11-04'));
    assert.equal(dailyChannel(db, '2026-11-04', 'ch-1', 'live').heartbeats, 5);
    assert.equal(dailyChannel(db, '2026-11-04', 'ch-1', 'live').uniqueSessions, 5);
    assert.equal(dailyPage(db, '2026-11-04', 'page', '/tin').views, 3);
    assert.equal(dailyPage(db, '2026-11-04', 'page', '/tin').uniqueSessions, 3);
  });
});

describe('rollupDaily: ranh gioi ngay VN', () => {
  test('23:59 VN, dung nua dem VN va 00:01 VN hom sau roi vao hai ngay daily khac nhau', async () => {
    const db = makeDb();
    db.addHeartbeat({ channelPublicId: 'ch-1', viewType: 'live', sessionId: 'a', createdAt: vn('2026-11-04T23:59:00'), isClean: true });
    db.addHeartbeat({ channelPublicId: 'ch-1', viewType: 'live', sessionId: 'b', createdAt: vn('2026-11-05T00:00:00'), isClean: true });
    db.addHeartbeat({ channelPublicId: 'ch-1', viewType: 'live', sessionId: 'c', createdAt: vn('2026-11-05T00:01:00'), isClean: true });
    await rollupDaily(db, OPTS);
    assert.equal(dailyChannel(db, '2026-11-04', 'ch-1', 'live').heartbeats, 1);
    assert.equal(dailyChannel(db, '2026-11-05', 'ch-1', 'live').heartbeats, 2);
  });
});

describe('rollupDaily: loc isClean va ngay khong co dong tho', () => {
  test('dong isClean=false/NULL khong vao daily; ngay chi co dong ban thi khong sinh dong daily', async () => {
    const db = makeDb();
    db.addPageView({ path: '/tin', sessionId: 'p1', createdAt: vn('2026-11-04T10:00:00'), isClean: true });
    db.addPageView({ path: '/tin', sessionId: 'p2', createdAt: vn('2026-11-04T10:01:00'), isClean: false });
    db.addPageView({ path: '/tin', sessionId: 'p3', createdAt: vn('2026-11-04T10:02:00'), isClean: null });
    db.addHeartbeat({ channelPublicId: 'ch-1', viewType: 'live', sessionId: 'x', createdAt: vn('2026-11-05T10:00:00'), isClean: false });
    await rollupDaily(db, OPTS);
    assert.equal(dailyPage(db, '2026-11-04', 'page', '/tin').views, 1);
    assert.equal(dailyPage(db, '2026-11-04', 'page', '/tin').uniqueSessions, 1);
    assert.equal(db.tables.channelTelemetryDaily.filter((r) => r.vnDate.getTime() === vnDateForDb('2026-11-05').getTime()).length, 0);
  });

  test('ngay khong co dong tho thi khong sinh dong daily ao', async () => {
    const db = makeDb();
    db.addHeartbeat({ channelPublicId: 'ch-1', viewType: 'live', sessionId: 'a', createdAt: vn('2026-11-04T10:00:00'), isClean: true });
    await rollupDaily(db, OPTS);
    assert.equal(db.tables.channelTelemetryDaily.filter((r) => r.vnDate.getTime() === vnDateForDb('2026-11-05').getTime()).length, 0);
    assert.equal(db.tables.pageViewDaily.length, 0);
  });

  test('ngay hien tai khong duoc gop', async () => {
    const db = makeDb();
    db.addHeartbeat({ channelPublicId: 'ch-1', viewType: 'live', sessionId: 'a', createdAt: vn('2026-11-06T09:00:00'), isClean: true });
    const res = await rollupDaily(db, OPTS);
    assert.equal(db.tables.channelTelemetryDaily.length, 0);
    assert.ok(!res.dates.includes('2026-11-06'));
  });
});

describe('rollupDaily: ngay dang bi prune do (from < cutoff < to)', () => {
  // now = 2026-11-06T10:00+07 -> cutoff = 2026-08-08T10:00+07, nam giua
  // ngay VN 2026-08-08 (00:00 -> 24:00). Dong tho sau cutoff van con,
  // dong truoc cutoff da bi prune o cac luot truoc.
  test('ngay da co dong daily thi khong bi ghi de bang du lieu tho con mot phan', async () => {
    const db = makeDb();
    db.tables.channelTelemetryDaily.push({
      vnDate: vnDateForDb('2026-08-08'), channelPublicId: 'ch-1', channelName: 'TUYENQUANG',
      contentId: null, viewType: 'live', heartbeats: 13, uniqueSessions: 13, watchedMinutes: 13,
    });
    db.addHeartbeat({ channelPublicId: 'ch-1', viewType: 'live', sessionId: 's1', createdAt: vn('2026-08-08T12:00:00'), isClean: true });
    db.addHeartbeat({ channelPublicId: 'ch-1', viewType: 'live', sessionId: 's2', createdAt: vn('2026-08-08T12:01:00'), isClean: true });
    db.addHeartbeat({ channelPublicId: 'ch-1', viewType: 'live', sessionId: 's3', createdAt: vn('2026-08-08T12:02:00'), isClean: true });
    const res = await rollupDaily(db, OPTS);
    assert.equal(dailyChannel(db, '2026-08-08', 'ch-1', 'live').heartbeats, 13);
    assert.ok(!res.dates.includes('2026-08-08'));
  });

  test('ngay dang bi prune do nhung chua co dong daily thi van gop phan con lai', async () => {
    const db = makeDb();
    db.addHeartbeat({ channelPublicId: 'ch-1', viewType: 'live', sessionId: 's1', createdAt: vn('2026-08-08T12:00:00'), isClean: true });
    db.addHeartbeat({ channelPublicId: 'ch-1', viewType: 'live', sessionId: 's2', createdAt: vn('2026-08-08T12:01:00'), isClean: true });
    await rollupDaily(db, OPTS);
    assert.equal(dailyChannel(db, '2026-08-08', 'ch-1', 'live').heartbeats, 2);
  });
});

describe('rollupDaily: prune du lieu tho qua 90 ngay van chay', () => {
  test('dong tho cu hon cutoff bi xoa, so prune duoc bao cao', async () => {
    const db = makeDb();
    db.addHeartbeat({ channelPublicId: 'ch-1', viewType: 'live', sessionId: 'old', createdAt: vn('2026-08-01T10:00:00'), isClean: true });
    db.addHeartbeat({ channelPublicId: 'ch-1', viewType: 'live', sessionId: 'new', createdAt: vn('2026-11-04T10:00:00'), isClean: true });
    const res = await rollupDaily(db, OPTS);
    assert.equal(db.tables.channelHeartbeats.filter((r) => r.sessionId === 'old').length, 0);
    assert.equal(db.tables.channelHeartbeats.filter((r) => r.sessionId === 'new').length, 1);
    assert.ok(res.pruned.heartbeats >= 1);
  });
});
