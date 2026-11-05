// Logic gop ngay (rollup) cho telemetry GĐ3 — file thuan, KHONG import
// Nest/Prisma de test truc tiep bang node --test (kem resolve hook,
// giong cac suite dashboard). Service chi goi ham rollupDaily o day.
import { vnTodayStr, vnDayRange, vnDateForDb } from '../dashboard/dashboard-helpers';

const RAW_RETENTION_DAYS = 90;

function nextVnDay(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00+07:00`);
  return vnTodayStr(new Date(d.getTime() + 24 * 60 * 60 * 1000));
}

export async function rollupPageViewDay(db: any, vnDate: string, from: Date, to: Date): Promise<void> {
  const rows = await db.pageView.findMany({
    where: { isClean: true, createdAt: { gte: from, lt: to } },
    select: { articlePublicId: true, path: true, sessionId: true },
  });
  const groups = new Map<string, { contentType: string; contentKey: string; views: number; sessions: Set<string> }>();
  for (const r of rows) {
    const isArticle = !!r.articlePublicId;
    const key = isArticle ? `article:${r.articlePublicId}` : `page:${r.path || ''}`;
    let g = groups.get(key);
    if (!g) {
      g = { contentType: isArticle ? 'article' : 'page', contentKey: isArticle ? r.articlePublicId : r.path || '', views: 0, sessions: new Set() };
      groups.set(key, g);
    }
    g.views += 1;
    if (r.sessionId) g.sessions.add(r.sessionId);
  }
  const day = vnDateForDb(vnDate);
  for (const g of groups.values()) {
    await db.pageViewDaily.upsert({
      where: { vnDate_contentType_contentKey: { vnDate: day, contentType: g.contentType, contentKey: g.contentKey } },
      update: { views: g.views, uniqueSessions: g.sessions.size },
      create: { vnDate: day, contentType: g.contentType, contentKey: g.contentKey, views: g.views, uniqueSessions: g.sessions.size },
    });
  }
}

export async function rollupChannelDay(db: any, vnDate: string, from: Date, to: Date): Promise<void> {
  const rows = await db.channelHeartbeat.findMany({
    where: { isClean: true, createdAt: { gte: from, lt: to } },
    select: { channelPublicId: true, channelName: true, contentId: true, viewType: true, sessionId: true },
  });
  const groups = new Map<string, { channelPublicId: string | null; channelName: string | null; contentId: string | null; viewType: string; heartbeats: number; sessions: Set<string> }>();
  for (const r of rows) {
    const key = r.viewType === 'vod' ? `vod:${r.contentId || ''}` : `${r.channelPublicId || ''}|${r.viewType}`;
    let g = groups.get(key);
    if (!g) {
      g = { channelPublicId: r.channelPublicId ?? null, channelName: r.channelName ?? null, contentId: r.viewType === 'vod' ? r.contentId ?? null : null, viewType: r.viewType, heartbeats: 0, sessions: new Set() };
      groups.set(key, g);
    }
    g.heartbeats += 1;
    if (r.sessionId) g.sessions.add(r.sessionId);
  }
  const day = vnDateForDb(vnDate);
  for (const g of groups.values()) {
    // watchedMinutes ≈ so heartbeat x 1 phut (nhip 60 giay, chi gui khi dang phat).
    if (g.viewType === 'vod') {
      await db.channelTelemetryDaily.upsert({
        where: { vnDate_contentId_viewType: { vnDate: day, contentId: g.contentId, viewType: g.viewType } },
        update: { heartbeats: g.heartbeats, uniqueSessions: g.sessions.size, watchedMinutes: g.heartbeats },
        create: { vnDate: day, channelPublicId: null, channelName: null, contentId: g.contentId, viewType: g.viewType, heartbeats: g.heartbeats, uniqueSessions: g.sessions.size, watchedMinutes: g.heartbeats },
      });
    } else {
      await db.channelTelemetryDaily.upsert({
        where: { vnDate_channelPublicId_viewType: { vnDate: day, channelPublicId: g.channelPublicId, viewType: g.viewType } },
        update: { channelName: g.channelName, heartbeats: g.heartbeats, uniqueSessions: g.sessions.size, watchedMinutes: g.heartbeats },
        create: { vnDate: day, channelPublicId: g.channelPublicId, channelName: g.channelName, contentId: null, viewType: g.viewType, heartbeats: g.heartbeats, uniqueSessions: g.sessions.size, watchedMinutes: g.heartbeats },
      });
    }
  }
}

export async function rollupDaily(db: any, opts?: { today?: string; now?: Date }): Promise<{ dates: string[]; pruned: { pageViews: number; heartbeats: number } }> {
  const today = opts?.today ?? vnTodayStr();
  const now = opts?.now ?? new Date();
  const cutoff = new Date(now.getTime() - RAW_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const firstPv = await db.pageView
    .findFirst({ where: { isClean: true }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } })
    .catch(() => null);
  const firstHb = await db.channelHeartbeat
    .findFirst({ where: { isClean: true }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } })
    .catch(() => null);
  const starts: string[] = [];
  if (firstPv?.createdAt) starts.push(vnTodayStr(firstPv.createdAt));
  if (firstHb?.createdAt) starts.push(vnTodayStr(firstHb.createdAt));
  const dates: string[] = [];
  if (starts.length) {
    let d = starts.sort()[0];
    while (d < today) {
      const { from, to } = vnDayRange(d);
      const day = vnDateForDb(d);
      // TINH LAI TOAN BO moi lan goi (khong dung co "ngay co dong la
      // xong"): upsert ghi de tuyet doi nen dong tho den muon cung
      // ngay da qua se tu sua so daily o lan gop sau. Ngay khong co
      // dong tho thi khong sinh dong daily ao (khong co group de
      // upsert). Ngoai le duy nhat: ngay dang bi prune do
      // (from < cutoff < to) chi con mot phan du lieu tho — khong
      // ghi de so daily da co bang so tinh tu phan con lai (so cu
      // day du hon); ngay do neu chua co dong daily thi van gop
      // phan con lai (hon la khong co gi).
      const straddling = from < cutoff && cutoff < to;
      const pvDone = straddling
        ? await db.pageViewDaily.findFirst({ where: { vnDate: day }, select: { id: true } }).catch(() => null)
        : null;
      const chDone = straddling
        ? await db.channelTelemetryDaily.findFirst({ where: { vnDate: day }, select: { id: true } }).catch(() => null)
        : null;
      const pvNeeds = (await db.pageView.count({ where: { isClean: true, createdAt: { gte: from, lt: to } } }).catch(() => 0)) > 0 && !pvDone;
      const chNeeds = (await db.channelHeartbeat.count({ where: { isClean: true, createdAt: { gte: from, lt: to } } }).catch(() => 0)) > 0 && !chDone;
      if (pvNeeds || chNeeds) {
        if (pvNeeds) await rollupPageViewDay(db, d, from, to);
        if (chNeeds) await rollupChannelDay(db, d, from, to);
        dates.push(d);
      }
      d = nextVnDay(d);
    }
  }
  const pv = await db.pageView.deleteMany({ where: { createdAt: { lt: cutoff } } }).catch(() => ({ count: 0 }));
  const hb = await db.channelHeartbeat.deleteMany({ where: { createdAt: { lt: cutoff } } }).catch(() => ({ count: 0 }));
  return { dates, pruned: { pageViews: pv.count || 0, heartbeats: hb.count || 0 } };
}
