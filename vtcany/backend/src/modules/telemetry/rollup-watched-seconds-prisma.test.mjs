// Test hoi quy Buoc 0.2: rollup channel truyen watchedSeconds qua Prisma
// THAT (khong mock db kieu `any`) — loi 0.1: model ChannelTelemetryDaily
// thieu field watchedSeconds nen PrismaClientValidationError "Unknown
// argument `watchedSeconds`" lam rollup 500, trong khi cac suite mock
// (rollup-recompute.test.mjs) van xanh vi mock chap nhan moi field.
// Voi client Prisma cu (generate tu schema thieu field) test nay FAIL
// dung cho loi 0.1; voi schema moi + generate lai thi PASS.
//
// Chay (CHI trong container backend, sau deploy — can DB that):
//   cd /app && ROLLUP_PRISMA_TEST=1 node --test --import=./test-hooks-register.mjs src/modules/telemetry/rollup-watched-seconds-prisma.test.mjs
// (DATABASE_URL da co san trong env container; khong can truyen them.)
// Thieu DATABASE_URL hoac ROLLUP_PRISMA_TEST != 1 thi test TU SKIP,
// khong fail — co opt-in rieng de khong bao gio vo tinh ghi DB that khi
// chay bo test thuong. Test chi ghi row tho/daily mang khoa test
// (test-ws-*) cua ngay VN hom qua roi xoa sach o finally.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { rollupDaily } from './rollup-daily';
import { vnDateForDb, vnDayRange, vnDayStrOffset } from '../dashboard/dashboard-helpers';

const SKIP_REASON = !process.env.DATABASE_URL
  ? 'skip: can DATABASE_URL (chi chay trong container backend, xem dau file)'
  : process.env.ROLLUP_PRISMA_TEST !== '1'
    ? 'skip: can ROLLUP_PRISMA_TEST=1 (opt-in, tranh ghi nham DB that)'
    : false;

describe('rollupDaily qua Prisma that: watchedSeconds (hoi quy Buoc 0.2)', () => {
  test('upsert channelTelemetryDaily voi watchedSeconds khong loi Prisma', { skip: SKIP_REASON }, async () => {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    const suffix = Date.now().toString(36);
    const vodContentId = `test-ws-vod-${suffix}`;
    const chId = `test-ws-ch-${suffix}`;
    // Ngay VN hom qua: nam trong cua so gop tay ?date= (da ket thuc,
    // trong 90 ngay du lieu tho) va khong phai ngay hom nay.
    const yesterday = vnDayStrOffset(-1);
    const { from } = vnDayRange(yesterday);
    const at = (mins) => new Date(from.getTime() + mins * 60_000);
    try {
      await prisma.channelHeartbeat.createMany({
        data: [
          // VOD s1: 2 beat thuong + beat cuoi 30 giay -> watchedSeconds=30.
          { sessionId: 'tws-s1', contentId: vodContentId, viewType: 'vod', isClean: true, createdAt: at(600) },
          { sessionId: 'tws-s1', contentId: vodContentId, viewType: 'vod', isClean: true, createdAt: at(601) },
          { sessionId: 'tws-s1', contentId: vodContentId, viewType: 'vod', isClean: true, isFinal: true, watchedSeconds: 30, createdAt: at(601) },
          // Live s2: 2 beat, khong beat cuoi -> watchedSeconds=2*60=120.
          { sessionId: 'tws-s2', channelPublicId: chId, channelName: 'TEST-WS', viewType: 'live', isClean: true, createdAt: at(610) },
          { sessionId: 'tws-s2', channelPublicId: chId, channelName: 'TEST-WS', viewType: 'live', isClean: true, createdAt: at(611) },
        ],
      });
      await rollupDaily(prisma, { onlyDate: yesterday });

      const vod = await prisma.channelTelemetryDaily.findFirst({
        where: { vnDate: vnDateForDb(yesterday), contentId: vodContentId, viewType: 'vod' },
      });
      assert.ok(vod, 'phai co dong daily VOD sau rollup');
      assert.equal(vod.heartbeats, 3);
      assert.equal(vod.watchedMinutes, 3, 'watchedMinutes giu nhu cu (= heartbeats)');
      assert.equal(vod.watchedSeconds, 30, 'phien co beat cuoi -> max(watchedSeconds), khong phai beat x 60');

      const live = await prisma.channelTelemetryDaily.findFirst({
        where: { vnDate: vnDateForDb(yesterday), channelPublicId: chId, viewType: 'live' },
      });
      assert.ok(live, 'phai co dong daily live sau rollup');
      assert.equal(live.heartbeats, 2);
      assert.equal(live.watchedMinutes, 2);
      assert.equal(live.watchedSeconds, 120, 'khong beat cuoi -> heartbeats x 60');
    } finally {
      await prisma.channelHeartbeat.deleteMany({
        where: { OR: [{ contentId: vodContentId }, { channelPublicId: chId }] },
      });
      await prisma.channelTelemetryDaily.deleteMany({
        where: { OR: [{ contentId: vodContentId }, { channelPublicId: chId }] },
      });
      await prisma.$disconnect();
    }
  });
});
