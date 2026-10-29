import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ZONE_DEFS, buildBlockItems, naturalSource, nextSortOrder, zoneDef } from './zone-rules';

// Zone/Widget Manager — Gói 1A. Quan ly bai ghim vao cac vung trang chu.
// Nguyen tac (theo tai lieu chia viec 2 nguoi):
// - Chi bai DA XUAT BAN moi duoc ghim (khoi cong khai chi hien bai xuat ban).
// - Mot bai chi ghim o toi da MOT vung: ghim o vung nay thi khong hien
//   trong danh sach chon cua vung khac (ràng buoc UNIQUE o DB + kiem tra
//   o service). Khong pha workflow duyet/SoD cua tin bai: zone khong doi
//   trang thai hay buoc duyet cua bai, chi tham chieu bai da xuat ban.
// - Khoi cong khai = bai ghim (theo thu tu) + lap day tu nguon tu nhien
//   (noi bat / moi nhat) den du slot, tru bai da ghim — de trang chu
//   khong trong khi vung chua du bai ghim, va hanh vi cu duoc giu nguyen
//   khi vung rong (truoc 1A: Tin noi bat = isFeatured, Tin moi = moi nhat).
// - Bai bi go xuat ban sau khi ghim se tu bien khoi khoi cong khai
//   (render cong khai loc lai theo dieu kien hien thi), khong can xoa tay.

export interface ZoneAdminItem {
  key: string;
  name: string;
  description: string;
  slotLimit: number;
  sortOrder: number;
  count: number;
  items: any[];
}

function publicArticle(row: any) {
  return {
    publicId: row.publicId,
    title: row.title,
    slug: row.slug,
    sapo: row.sapo,
    coverPath: row.coverPath,
    category: row.category
      ? { publicId: row.category.publicId, name: row.category.name, slug: row.category.slug }
      : null,
    authors: row.authors || [],
    publishAt: row.publishAt ? row.publishAt.toISOString() : null,
    isFeatured: row.isFeatured ?? false,
  };
}

@Injectable()
export class ZoneService {
  constructor(private readonly prisma: PrismaService) {}

  private visibleWhere(now: Date) {
    return { status: 'published', publishAt: { lte: now } };
  }

  private async zoneRow(key: string) {
    const zone = await this.prisma.zone.findUnique({ where: { key } });
    if (!zone) throw new NotFoundException('khong tim thay vung hien thi');
    return zone;
  }

  private async zoneItemsAdmin(zoneId: string) {
    const rows = await this.prisma.zoneItem.findMany({
      where: { zoneId },
      include: { article: { include: { category: true } } },
      orderBy: { sortOrder: 'asc' },
    });
    return rows.map((r: any) => ({
      articlePublicId: r.article.publicId,
      sortOrder: r.sortOrder,
      article: publicArticle(r.article),
      articleStatus: r.article.status,
    }));
  }

  async listAdmin(): Promise<ZoneAdminItem[]> {
    const zones = await this.prisma.zone.findMany({ orderBy: { sortOrder: 'asc' } });
    const defs = new Map(ZONE_DEFS.map((d) => [d.key, d]));
    const out: ZoneAdminItem[] = [];
    for (const z of zones) {
      const def = defs.get(z.key);
      const items = await this.zoneItemsAdmin(z.id);
      out.push({
        key: z.key,
        name: z.name,
        description: z.description,
        slotLimit: z.slotLimit,
        sortOrder: z.sortOrder,
        count: items.length,
        items,
      });
    }
    // Vung seed nao chua co trong DB (migration chua chay) thi van hien
    // o CMS o dang rong de nguoi dung biet, nhung khong ghim duoc.
    for (const d of ZONE_DEFS) {
      if (!out.some((o) => o.key === d.key)) {
        out.push({ ...d, count: 0, items: [] });
      }
    }
    return out.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  /** Bai xuat ban chua ghim o bat ky vung nao (danh sach chon cua CMS). */
  async listCandidates(q?: string, limit = 50) {
    const now = new Date();
    const pinned = await this.prisma.zoneItem.findMany({ select: { articleId: true } });
    const pinnedIds = new Set(pinned.map((p: any) => p.articleId));
    const where: any = this.visibleWhere(now);
    if (q) {
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { sapo: { contains: q, mode: 'insensitive' } },
      ];
    }
    const rows = await this.prisma.newsArticle.findMany({
      where,
      include: { category: true },
      orderBy: { publishAt: 'desc' },
      take: Math.min(200, Math.max(1, Number(limit) || 50)),
    });
    return rows.filter((r: any) => !pinnedIds.has(r.id)).map(publicArticle);
  }

  async pin(zoneKey: string, articlePublicId: string) {
    const zone = await this.zoneRow(zoneKey);
    const def = zoneDef(zoneKey);
    const limit = def ? def.slotLimit : zone.slotLimit;
    const article = await this.prisma.newsArticle.findUnique({
      where: { publicId: articlePublicId },
    });
    if (!article) throw new NotFoundException('khong tim thay bai viet');
    if (article.status !== 'published' || !article.publishAt || article.publishAt > new Date()) {
      throw new BadRequestException('chi bai da xuat ban moi duoc ghim len trang chu');
    }
    const already = await this.prisma.zoneItem.findUnique({ where: { articleId: article.id } });
    if (already) throw new BadRequestException('bai viet da duoc ghim o mot vung khac');
    const count = await this.prisma.zoneItem.count({ where: { zoneId: zone.id } });
    if (count >= limit) throw new BadRequestException('vung hien thi da du so slot');
    const items = await this.prisma.zoneItem.findMany({
      where: { zoneId: zone.id },
      select: { sortOrder: true },
    });
    return this.prisma.zoneItem.create({
      data: { zoneId: zone.id, articleId: article.id, sortOrder: nextSortOrder(items) },
    });
  }

  async unpin(zoneKey: string, articlePublicId: string) {
    const zone = await this.zoneRow(zoneKey);
    const article = await this.prisma.newsArticle.findUnique({
      where: { publicId: articlePublicId },
    });
    if (!article) throw new NotFoundException('khong tim thay bai viet');
    const item = await this.prisma.zoneItem.findFirst({
      where: { zoneId: zone.id, articleId: article.id },
    });
    if (!item) throw new NotFoundException('bai viet khong co trong vung nay');
    await this.prisma.zoneItem.delete({ where: { id: item.id } });
    return { ok: true };
  }

  async move(zoneKey: string, articlePublicId: string, direction: 'up' | 'down') {
    const zone = await this.zoneRow(zoneKey);
    const article = await this.prisma.newsArticle.findUnique({
      where: { publicId: articlePublicId },
    });
    if (!article) throw new NotFoundException('khong tim thay bai viet');
    const rows = await this.prisma.zoneItem.findMany({
      where: { zoneId: zone.id },
      orderBy: { sortOrder: 'asc' },
    });
    const idx = rows.findIndex((r: any) => r.articleId === article.id);
    if (idx < 0) throw new NotFoundException('bai viet khong co trong vung nay');
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= rows.length) return { ok: true, moved: false };
    const a = rows[idx];
    const b = rows[swapIdx];
    // Doi sortOrder bang 2 lenh rieng (khong rang buoc UNIQUE tren
    // sortOrder nen khong can gia tri tam).
    await this.prisma.zoneItem.update({ where: { id: a.id }, data: { sortOrder: b.sortOrder } });
    await this.prisma.zoneItem.update({ where: { id: b.id }, data: { sortOrder: a.sortOrder } });
    return { ok: true, moved: true };
  }

  /** Khoi cong khai cua mot vung: bai ghim + lap day tu nhien, du slot. */
  async getPublicBlock(zoneKey: string) {
    const zone = await this.zoneRow(zoneKey);
    const def = zoneDef(zoneKey);
    const limit = def ? def.slotLimit : zone.slotLimit;
    const now = new Date();
    const pinnedRows = await this.prisma.zoneItem.findMany({
      where: { zoneId: zone.id },
      include: { article: { include: { category: true } } },
      orderBy: { sortOrder: 'asc' },
    });
    const pinned = pinnedRows
      .map((r: any) => r.article)
      .filter((a: any) => a.status === 'published' && a.publishAt && a.publishAt <= now)
      .map(publicArticle);
    let natural: any[] = [];
    if (pinned.length < limit) {
      const where: any = this.visibleWhere(now);
      if (naturalSource(zoneKey) === 'featured') where.isFeatured = true;
      const rows = await this.prisma.newsArticle.findMany({
        where,
        include: { category: true },
        orderBy: { publishAt: 'desc' },
        take: limit,
      });
      natural = rows.map(publicArticle);
    }
    return {
      key: zone.key,
      name: zone.name,
      slotLimit: limit,
      items: buildBlockItems(pinned, natural, limit, (a: any) => a.publicId),
    };
  }
}
