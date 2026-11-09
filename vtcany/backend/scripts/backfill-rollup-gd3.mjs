// Backfill rollup GĐ3 Buoc 0.4: goi rollup bu tung ngay VN roi doi soat
// daily = tho cho cac ngay can kiem (mac dinh 05/11, 08/11, 09/11).
//
//   cd /app && node scripts/backfill-rollup-gd3.mjs [--from YYYY-MM-DD] [--to YYYY-MM-DD]
//       [--dates 2026-11-05,2026-11-08,2026-11-09] [--api-base URL]
//       [--reconcile-only] --backup <duong-dan-file-pg_dump> [--skip-backup-check]
//
// Mac dinh: from=2026-11-05, to=ngay VN hom qua; doi soat 05/11, 08/11,
// 09/11 (chi cac ngay trong [from..to]). API base mac dinh
// http://127.0.0.1:3001/api/v1 (backend trong cung container, co prefix
// /api/v1 — main.ts setGlobalPrefix('api/v1')); secret lay tu env
// MEDIA_WEBHOOK_SECRET (giong endpoint internal, giong script chan doan
// 0.1). DATABASE_URL lay tu env container cho phan doi soat.
//
// TRUOC KHI CHAY (bat buoc, theo quy tac user): pg_dump 2 bang daily ra
// /app/storage va XAC MINH file ton tai, roi truyen --backup <duong dan>.
// Rollup la upsert tinh lai tuyet doi tu du lieu tho (chay lai an toan)
// nhung van ghi hang loat vao bang daily nen can backup truoc. Khong co
// file backup -> script dung lai, tru khi truyen --skip-backup-check
// (chi dung khi da co backup o cho khac va ghi ro ly do vao bao cao).
//
// Script CHI DOC + goi endpoint rollup (khong tu ghi DB ngoai endpoint):
//   - Buoc 1: POST /internal/rollup-daily?date=YYYY-MM-DD tung ngay.
//   - Buoc 2: doi soat bang SQL doc: so tho dem theo chuan ngay VN §12
//     (created_at la timestamp without time zone chua UTC ->
//     (created_at + interval '7 hours')::date; KHONG dung AT TIME ZONE)
//     so voi tong o bang daily (vn_date = ngay VN, cot @db.Date).
//     Chi tieu doi soat: heartbeat (tho) = sum(heartbeats) (daily);
//     pageview (tho) = sum(views) (daily). Them cot daily watched_seconds
//     + so beat cuoi tho de mat thay trieu chung 0.1 (watched_seconds
//     toan 0) — khong doi soat giay chi tiet theo phien o script nay.
// Ma thoat: 0 = rollup xong + doi soat khop het; 1 = co ngay rollup loi
//   hoac doi soat lech; 2 = tham so / thieu env / thieu backup.
import { existsSync } from 'node:fs';

// PrismaClient import DONG (giong backfill-d3-storage.mjs): client chi co
// sau khi `npx prisma generate` (Dockerfile backend chay san luc build);
// import tinh o dau file se loi ngay ca khi chi chay --help hoac chi goi
// rollup ma khong can DB.
async function loadPrismaClient() {
  try {
    const mod = await import('@prisma/client');
    return mod.PrismaClient;
  } catch (e) {
    throw new Error(
      'Khong import duoc @prisma/client — chay `npx prisma generate` trong vtcany/backend truoc.\n' +
      String(e?.message || e),
    );
  }
}

const VN_TZ = 'Asia/Ho_Chi_Minh';
const DEFAULT_FROM = '2026-11-05';
const DEFAULT_RECONCILE = ['2026-11-05', '2026-11-08', '2026-11-09'];

function vnTodayStr(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: VN_TZ,
  }).format(now);
}

function vnDayStrOffset(offsetDays, now = new Date()) {
  return vnTodayStr(new Date(now.getTime() + offsetDays * 24 * 60 * 60 * 1000));
}

function isValidDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00+07:00`);
  return !Number.isNaN(d.getTime()) && vnTodayStr(d) === s;
}

function dateRange(from, to) {
  const out = [];
  let d = from;
  while (d <= to) {
    out.push(d);
    const next = new Date(`${d}T00:00:00+07:00`);
    d = vnTodayStr(new Date(next.getTime() + 24 * 60 * 60 * 1000));
  }
  return out;
}

function parseArgs(argv) {
  const opts = { from: DEFAULT_FROM, to: null, dates: null, apiBase: 'http://127.0.0.1:3001/api/v1', reconcileOnly: false, backup: null, skipBackupCheck: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = (name) => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`thieu gia tri cho ${name}`);
      return v;
    };
    if (a === '--from') opts.from = val(a);
    else if (a === '--to') opts.to = val(a);
    else if (a === '--dates') opts.dates = val(a).split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--api-base') opts.apiBase = val(a).replace(/\/$/, '');
    else if (a === '--backup') opts.backup = val(a);
    else if (a === '--reconcile-only') opts.reconcileOnly = true;
    else if (a === '--skip-backup-check') opts.skipBackupCheck = true;
    else if (a === '--help' || a === '-h') { opts.help = true; return opts; }
    else throw new Error(`tham so la: ${a}`);
  }
  return opts;
}

function usage() {
  console.log([
    'Dung: node scripts/backfill-rollup-gd3.mjs [--from YYYY-MM-DD] [--to YYYY-MM-DD]',
    '      [--dates 2026-11-05,2026-11-08,2026-11-09] [--api-base URL]',
    '      [--reconcile-only] --backup <file-pg_dump> [--skip-backup-check]',
    '  from mac dinh 2026-11-05, to mac dinh ngay VN hom qua.',
    '  Truoc khi chay: pg_dump 2 bang daily ra /app/storage, vd:',
    '    pg_dump "$DATABASE_URL" -t pageview_daily -t channel_telemetry_daily -f /app/storage/daily-before-gd3-backfill.dump',
    '  roi truyen --backup /app/storage/daily-before-gd3-backfill.dump',
  ].join('\n'));
}

async function rollupOne(apiBase, secret, date) {
  const url = `${apiBase}/internal/rollup-daily?date=${date}`;
  const res = await fetch(url, { method: 'POST', headers: { 'x-webhook-secret': secret } });
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch { /* body khong phai JSON */ }
  return { date, ok: res.ok, status: res.status, body, raw: text.slice(0, 500) };
}

async function reconcileOne(db, date) {
  // So tho theo chuan ngay VN §12: (created_at + interval '7 hours')::date.
  const rawHb = await db.$queryRaw`SELECT COUNT(*)::int AS n FROM channel_heartbeats WHERE is_clean IS TRUE AND (created_at + interval '7 hours')::date = ${date}::date`;
  const rawPv = await db.$queryRaw`SELECT COUNT(*)::int AS n FROM page_views WHERE is_clean IS TRUE AND (created_at + interval '7 hours')::date = ${date}::date`;
  const rawFinal = await db.$queryRaw`SELECT COUNT(*)::int AS n FROM channel_heartbeats WHERE is_clean IS TRUE AND is_final IS TRUE AND (created_at + interval '7 hours')::date = ${date}::date`;
  const dailyHb = await db.$queryRaw`SELECT COALESCE(SUM(heartbeats), 0)::int AS n, COALESCE(SUM(watched_seconds), 0)::int AS ws FROM channel_telemetry_daily WHERE vn_date = ${date}::date`;
  const dailyPv = await db.$queryRaw`SELECT COALESCE(SUM(views), 0)::int AS n FROM pageview_daily WHERE vn_date = ${date}::date`;
  return {
    date,
    rawHeartbeats: Number(rawHb[0]?.n ?? 0),
    dailyHeartbeats: Number(dailyHb[0]?.n ?? 0),
    dailyWatchedSeconds: Number(dailyHb[0]?.ws ?? 0),
    rawFinalBeats: Number(rawFinal[0]?.n ?? 0),
    rawPageviews: Number(rawPv[0]?.n ?? 0),
    dailyPageviews: Number(dailyPv[0]?.n ?? 0),
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) { usage(); return 0; }
  if (!isValidDate(opts.from)) throw new Error(`--from khong hop le: ${opts.from}`);
  const to = opts.to || vnDayStrOffset(-1);
  if (!isValidDate(to)) throw new Error(`--to khong hop le: ${to}`);
  if (opts.from > to) throw new Error(`--from (${opts.from}) phai <= --to (${to})`);
  const today = vnTodayStr();
  if (to >= today) throw new Error(`--to (${to}) phai la ngay da ket thuc (hom nay VN la ${today})`);
  const dates = dateRange(opts.from, to);
  const reconcileDates = (opts.dates || DEFAULT_RECONCILE).filter((d) => {
    if (!isValidDate(d)) throw new Error(`ngay doi soat khong hop le: ${d}`);
    return d >= opts.from && d <= to;
  });
  const secret = process.env.MEDIA_WEBHOOK_SECRET || '';
  if (!opts.reconcileOnly && !secret) throw new Error('thieu env MEDIA_WEBHOOK_SECRET (can de goi /internal/rollup-daily)');
  if (!process.env.DATABASE_URL) throw new Error('thieu env DATABASE_URL (can cho phan doi soat)');

  // Cua bao ve backup (xem dau file): chi bo qua khi co --skip-backup-check.
  if (!opts.reconcileOnly && !opts.skipBackupCheck) {
    if (!opts.backup) {
      console.error('DUNG LAI: chua truyen --backup. Hay pg_dump 2 bang daily ra /app/storage truoc,');
      console.error('  pg_dump "$DATABASE_URL" -t pageview_daily -t channel_telemetry_daily -f /app/storage/daily-before-gd3-backfill.dump');
      console.error('roi chay lai kem --backup /app/storage/daily-before-gd3-backfill.dump (hoac --skip-backup-check neu da co backup o cho khac).');
      return 2;
    }
    if (!existsSync(opts.backup)) {
      console.error(`DUNG LAI: file backup khong ton tai: ${opts.backup}`);
      return 2;
    }
    console.log(`Backup daily da xac minh ton tai: ${opts.backup}`);
  }

  let failed = false;
  if (!opts.reconcileOnly) {
    console.log(`Rollup bu ${dates.length} ngay VN: ${opts.from} -> ${to} (qua ${opts.apiBase})`);
    for (const d of dates) {
      let r;
      try {
        r = await rollupOne(opts.apiBase, secret, d);
      } catch (e) {
        failed = true;
        console.error(`  ${d}: LOI ket noi ${e?.name || 'Error'}: ${e?.message || e}`);
        continue;
      }
      if (r.ok) {
        console.log(`  ${d}: OK ${r.status} dates=${JSON.stringify(r.body?.dates ?? null)} pruned=${JSON.stringify(r.body?.pruned ?? null)}`);
      } else {
        failed = true;
        console.error(`  ${d}: LOI ${r.status} ${r.body ? JSON.stringify(r.body) : r.raw}`);
      }
    }
  } else {
    console.log('--reconcile-only: bo qua buoc goi rollup, chi doi soat.');
  }

  const PrismaClient = await loadPrismaClient();
  const db = new PrismaClient();
  try {
    console.log(`Doi soat daily = tho cho ${reconcileDates.join(', ') || '(khong co ngay nao trong khoang)'}`);
    console.log('date       | tho hb | daily hb | lech hb | tho pv | daily pv | lech pv | daily watched_sec | tho final beats');
    for (const d of reconcileDates) {
      const r = await reconcileOne(db, d);
      const dhb = r.dailyHeartbeats - r.rawHeartbeats;
      const dpv = r.dailyPageviews - r.rawPageviews;
      const ok = dhb === 0 && dpv === 0;
      if (!ok) failed = true;
      console.log(
        `${r.date} | ${String(r.rawHeartbeats).padStart(6)} | ${String(r.dailyHeartbeats).padStart(8)} | ${String(dhb).padStart(7)} | ${String(r.rawPageviews).padStart(6)} | ${String(r.dailyPageviews).padStart(8)} | ${String(dpv).padStart(7)} | ${String(r.dailyWatchedSeconds).padStart(17)} | ${String(r.rawFinalBeats).padStart(15)}${ok ? '' : '  <-- LECH'}`,
      );
    }
  } finally {
    await db.$disconnect();
  }
  if (failed) {
    console.error('KET QUA: CO LOI/LECH (xem tren).');
    return 1;
  }
  console.log('KET QUA: OK — rollup xong, doi soat khop het.');
  return 0;
}

main()
  .then((code) => { process.exitCode = code; })
  .catch((e) => { console.error(`LOI: ${e?.name || 'Error'}: ${e?.message || e}`); process.exitCode = 2; });
