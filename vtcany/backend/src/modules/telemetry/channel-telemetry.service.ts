import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TvService } from '../tv/tv.service';
import { isBotUserAgent } from '../news/pageview-input';
import { vnTodayStr, vnDayRange } from '../dashboard/dashboard-helpers';
import {
  HEARTBEAT_DEDUPE_WINDOW_MS,
  normalizeChannelHeartbeatInput,
} from './channel-telemetry-input';

// Thu heartbeat kenh + gop ngay (GĐ3 nen, chi thu thap, chua dashboard).
// - Bot UA -> tra { ok: true } gia nhu ghi thanh cong nhung KHONG ghi
//   row (giong PageView); UA khong bao gio duoc luu.
// - Kênh: backend tu quy doi ten kenh client gui -> ma kenh chuan qua
//   danh sach kenh (cache 10 phut, kem override tu DB). Ten khong co
//   trong danh sach (kenh khong ton tai / da dung) -> tra { ok: true }
//   nhung KHONG ghi row. AIO loi + cache rong -> tam thoi khong ghi
//   (fail-closed; telemetry mat vai nhip la chap nhan duoc, khong phai
//   billing). Khong luu IP/user id.
// - Gop ngay: chi gop ngay VN < hom nay (ngay hom nay chua du), chi row
//   isClean = true, upsert theo khoa duy nhat nen chay lai an toan.
//   Worker tick goi endpoint internal moi gio; job tu quet cac ngay
//   con thieu tu ngay co row tho som nhat (tu phuc hoi neu worker nghi).
// - Tia row tho > 90 ngay trong cung luot gop; bang gop giu vinh vien.
// - Moc du lieu sach = ngay bo gui len live (ghi trong phuong an +
//   memory), KHONG dung 04/11 (ngay do endpoint pageview moi chi co
//   mat, chua co caller gui that).

const CHANNEL_CACHE_TTL_MS = 10 * 60 * 1000;
const RAW_RETENTION_DAYS = 90;

function nextVnDay(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00+07:00`);
  return vnTodayStr(new Date(d.getTime() + 24 * 60 * 60 * 1000));
}

@Injectable()
export class ChannelTelemetryService {
  private channelCache: { byName: Map<string, string>; at: number } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tv: TvService,
  ) {}

  private async knownChannels(): Promise<Map<string, string>> {
    const now = Date.now();
    if (this.channelCache && now - this.channelCache.at < CHANNEL_CACHE_TTL_MS) {
      return this.channelCache.byName;
    }
    const byName = new Map<string, string>();
    try {
      const g = await this.tv.listGroups();
      for (const grp of g.groups || []) {
        for (const c of (grp as any).channels || []) {
          const item = (c as any)?.item || c;
          const name = typeof item?.name === 'string' ? item.name.trim().toLowerCase() : '';
          const pid = typeof item?.public_id === 'string' ? item.public_id : '';
          if (name && pid) byName.set(name, pid);
        }
      }
      this.channelCache = { byName, at: now };
    } catch {
      // AIO loi: giu cache cu neu co; chua co cache thi tra tap rong
      // (fail-closed tam thoi, xem ghi chu dau file).
      if (this.channelCache) return this.channelCache.byName;
      return byName;
    }
    return byName;
  }

  async heartbeat(input: any, userAgent?: unknown): Promise<{ ok: true }> {
    let data;
    try {
      data = normalizeChannelHeartbeatInput(input);
    } catch (e: any) {
      throw new BadRequestException(e?.message || 'heartbeat khong hop le');
    }
    if (isBotUserAgent(userAgent)) return { ok: true };
    const db: any = this.prisma as any;
    let channelPublicId: string | null = null;
    if (data.viewType !== 'vod') {
      const known = await this.knownChannels();
      const hit = known.get((data.channelName || '').toLowerCase());
      if (!hit) return { ok: true };
      channelPublicId = hit;
    }
    if (data.sessionId) {
      const since = new Date(Date.now() - HEARTBEAT_DEDUPE_WINDOW_MS);
      const seen = await db.channelHeartbeat
        .findFirst({
          where: {
            sessionId: data.sessionId,
            channelPublicId,
            contentId: data.contentId,
            viewType: data.viewType,
            createdAt: { gte: since },
          },
          select: { id: true },
        })
        .catch(() => null);
      if (seen) return { ok: true };
    }
    await db.channelHeartbeat.create({
      data: {
        sessionId: data.sessionId,
        channelPublicId,
        channelName: data.viewType === 'vod' ? null : data.channelName,
        contentId: data.contentId,
        viewType: data.viewType,
        isClean: true,
      },
    });
    return { ok: true };
  }

  private async rollupPageViewDay(db: any, vnDate: string, from: Date, to: Date): Promise<void> {
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
    const day = new Date(`${vnDate}T00:00:00+07:00`);
    for (const g of groups.values()) {
      await db.pageViewDaily.upsert({
        where: { vnDate_contentType_contentKey: { vnDate: day, contentType: g.contentType, contentKey: g.contentKey } },
        update: { views: g.views, uniqueSessions: g.sessions.size },
        create: { vnDate: day, contentType: g.contentType, contentKey: g.contentKey, views: g.views, uniqueSessions: g.sessions.size },
      });
    }
  }

  private async rollupChannelDay(db: any, vnDate: string, from: Date, to: Date): Promise<void> {
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
    const day = new Date(`${vnDate}T00:00:00+07:00`);
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

  async rollupDaily(): Promise<{ dates: string[]; pruned: { pageViews: number; heartbeats: number } }> {
    const db: any = this.prisma as any;
    const today = vnTodayStr();
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
        const day = new Date(`${d}T00:00:00+07:00`);
        const pvDone = await db.pageViewDaily.findFirst({ where: { vnDate: day }, select: { id: true } }).catch(() => null);
        const chDone = await db.channelTelemetryDaily.findFirst({ where: { vnDate: day }, select: { id: true } }).catch(() => null);
        // Ngay khong co row tho thi khong co gi de gop (bo qua vinh vien,
        // khong phai ngay thieu); ngay co row tho nhung thieu dong tong
        // thi gop bu (tu phuc hoi neu job crash giua chung).
        const pvNeeds = !pvDone && (await db.pageView.count({ where: { isClean: true, createdAt: { gte: from, lt: to } } }).catch(() => 0)) > 0;
        const chNeeds = !chDone && (await db.channelHeartbeat.count({ where: { isClean: true, createdAt: { gte: from, lt: to } } }).catch(() => 0)) > 0;
        if (pvNeeds || chNeeds) {
          if (pvNeeds) await this.rollupPageViewDay(db, d, from, to);
          if (chNeeds) await this.rollupChannelDay(db, d, from, to);
          dates.push(d);
        }
        d = nextVnDay(d);
      }
    }
    const cutoff = new Date(Date.now() - RAW_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const pv = await db.pageView.deleteMany({ where: { createdAt: { lt: cutoff } } }).catch(() => ({ count: 0 }));
    const hb = await db.channelHeartbeat.deleteMany({ where: { createdAt: { lt: cutoff } } }).catch(() => ({ count: 0 }));
    return { dates, pruned: { pageViews: pv.count || 0, heartbeats: hb.count || 0 } };
  }
}
