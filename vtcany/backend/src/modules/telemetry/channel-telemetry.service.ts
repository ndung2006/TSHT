import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TvService } from '../tv/tv.service';
import { isBotUserAgent } from '../news/pageview-input';
import { rollupDaily as runRollupDaily } from './rollup-daily';
import {
  HEARTBEAT_DEDUPE_WINDOW_MS,
  normalizeChannelHeartbeatInput,
} from './channel-telemetry-input';

// Thu heartbeat kenh + gop ngay (GĐ3 nen, chi thu thap, chua dashboard).
// - Bot UA -> tra { ok: true } gia nhu ghi thanh cong nhung KHONG ghi
//   row (giong PageView); UA khong bao gio duoc luu.
// - Kênh: backend tu quy doi ten kenh client gui -> ma kenh chuan qua
//   danh sach kenh (cache 10 phut, kem override tu DB). Doi chieu theo
//   ten CHUAN HOA (bo dau, bo khoang trang, viet hoa — cung quy tac
//   normKey cua portal): portal gui ten kieu AIO (TUYENQUANG,
//   TUYENQUANGRadio) trong khi listGroups tra ten hien thi sau
//   override (Tuyen Quang, Tuyen Quang Radio); doi chieu thuong
//   (lowercase) lech dau/cach nen live bi bo dong im lang.
//   Ten khong co trong danh sach (kenh khong ton tai / da dung) ->
//   tra { ok: true } nhung KHONG ghi row. AIO loi + cache rong ->
//   tam thoi khong ghi
//   (fail-closed; telemetry mat vai nhip la chap nhan duoc, khong phai
//   billing). Khong luu IP/user id.
// - Gop ngay: chi gop ngay VN < hom nay (ngay hom nay chua du), chi row
//   isClean = true, upsert ghi de tuyet doi theo khoa duy nhat nen
//   chay lai an toan. Moi lan goi TINH LAI TOAN BO cac ngay da qua
//   (khong dung co "ngay co dong la xong"): dong tho den muon cung
//   ngay se tu sua so daily o lan gop sau. Ngay khong co dong tho thi
//   khong sinh dong daily ao. Ngoai le: ngay dang bi prune do chi
//   con mot phan du lieu tho thi khong ghi de so daily da co.
//   Worker tick goi endpoint internal moi gio; vong lap bat dau tu
//   ngay co row tho som nhat con lai (du lieu tho prune sau 90 ngay
//   nen vong lap tu gioi han).
// - Tia row tho > 90 ngay trong cung luot gop; bang gop giu vinh vien.
// - Moc du lieu sach = ngay bo gui len live (ghi trong phuong an +
//   memory), KHONG dung 04/11 (ngay do endpoint pageview moi chi co
//   mat, chua co caller gui that).

const CHANNEL_CACHE_TTL_MS = 10 * 60 * 1000;
// Chuan hoa ten kenh de doi chieu (xem ghi chu dau file). Chu Đ
// khong bi tach dau boi NFD nen khong gay khop nham voi D.
function normalizeChannelKey(s: string): string {
  return String(s || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^A-Z0-9]/gi, '')
    .toUpperCase();
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
          const rawName = typeof item?.name === 'string' ? item.name.trim() : '';
          const pid = typeof item?.public_id === 'string' ? item.public_id : '';
          const name = normalizeChannelKey(rawName);
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
      const hit = known.get(normalizeChannelKey(data.channelName || ''));
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

  async rollupDaily(onlyDate?: string): Promise<{ dates: string[]; pruned: { pageViews: number; heartbeats: number } }> {
    return runRollupDaily(this.prisma as any, onlyDate !== undefined ? { onlyDate } : undefined);
  }
}
