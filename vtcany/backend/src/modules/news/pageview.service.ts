import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { isBotUserAgent, normalizePageViewInput } from './pageview-input';

// Bo thu luot xem (Dot 1a + chong bot khi dong GĐ1, 2026-11-04): CHI thu
// thap, chua dashboard tang C.
// - Loc UA bot: tra { ok: true } giong nhu ghi thanh cong nhung KHONG ghi
//   row (bot khong phan biet duoc bi loc hay khong); UA khong bao gio
//   duoc luu.
// - Chong gui lap tu cung phien: neu client gui sessionId, 1 phien chi
//   tinh 1 luot cho cung bai/duong dan trong 30 phut (gui lap -> tra
//   { ok: true } nhung khong ghi them row).
// - Du lieu sach: moi row ghi tu ban nay co is_clean = true; row cu
//   (truoc ban nay) co is_clean = NULL. Dashboard tang C (GĐ3) chi tinh
//   row is_clean = true; ngay bat dau thu sach = MIN(createdAt) trong so
//   row do (chinh la ngay deploy ban nay) — khong can bang phu.
// Endpoint cong khai, khong can auth, body JSON nho (nam trong gioi han
// 256kb hien tai, khong tang gioi han). Chua rate-limit.
export const PAGEVIEW_DEDUPE_WINDOW_MS = 30 * 60 * 1000;

@Injectable()
export class PageViewService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: { articlePublicId?: unknown; path?: unknown; sessionId?: unknown }, userAgent?: unknown) {
    let data;
    try {
      data = normalizePageViewInput(input);
    } catch (e: any) {
      throw new BadRequestException(e?.message || 'pageview khong hop le');
    }
    if (isBotUserAgent(userAgent)) return { ok: true };
    const db: any = this.prisma as any;
    if (data.sessionId) {
      const since = new Date(Date.now() - PAGEVIEW_DEDUPE_WINDOW_MS);
      const seen = await db.pageView.findFirst({
        where: {
          sessionId: data.sessionId,
          articlePublicId: data.articlePublicId,
          path: data.path,
          createdAt: { gte: since },
        },
        select: { id: true },
      }).catch(() => null);
      if (seen) return { ok: true };
    }
    await db.pageView.create({
      data: {
        articlePublicId: data.articlePublicId,
        path: data.path,
        sessionId: data.sessionId,
        isClean: true,
      },
    });
    return { ok: true };
  }
}
