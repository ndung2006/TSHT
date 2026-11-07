import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  HOME_SLOT_BLOCKS,
  blockFlag,
  blockLabel,
  defaultMaxSlots,
  findDuplicatePublicIds,
  isHomeSlotBlockKey,
  isVersionMatch,
  maxSlotsError,
  type HomeSlotBlockKey,
} from './home-slot-rules';

// Sap xep Tin noi bat / Tin tieu diem — Buoc 0 2026-11-05, phuong an A:
// moi khoi mot danh sach co thu tu duy nhat (HomeSlotList + HomeSlotItem).
// Tick trong form bai chi dua bai vao KHO; thu tu hien thi chi quyet
// dinh o man hinh sap xep. Trang chu chi doc GET /home-slots/:block
// (cong khai), khong tu lap day khi danh sach rong.
// - Q1: noi-bat max 10 (goi C 2026-11-07, truoc do 4), tieu-diem max 3; maxSlots doi duoc trong cau hinh
//   (chi zones:publish, guard o controller). Q2: mot bai duoc o ca hai
//   khoi, cam trung trong cung mot khoi (UNIQUE + kiem tra o day).
// - Q3: bai ha xuat ban GIU hang trong danh sach admin, chi an khoi
//   khoi cong khai (loc status o getPublicBlock) — khoi hien cho trong.
// - Q6: giam maxSlots xuong duoi so bai dang co -> chan luu.
// - Khoa lac quan: PUT gui version cu -> 409 (chua co mau optimistic
//   locking nao trong codebase truoc day).
// - Q8: moi lan luu ghi audit_logs (ben vung) + AuditService.record()
//   (in-memory, de hien o trang Nhat ky) — record in-memory goi o
//   controller sau khi luu thanh cong.

export interface HomeSlotActor {
  id: string | null;
  username: string | null;
  roleName: string | null;
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
    isSpotlight: row.isSpotlight ?? false,
    contentType: row.contentType ?? 'text',
  };
}

@Injectable()
export class HomeSlotService {
  constructor(private readonly prisma: PrismaService) {}

  private get listsDb(): any {
    return (this.prisma as any).homeSlotList;
  }

  private get itemsDb(): any {
    return (this.prisma as any).homeSlotItem;
  }

  private get auditDb(): any {
    return (this.prisma as any).auditLog;
  }

  private visibleWhere(now: Date) {
    return { status: 'published', publishAt: { lte: now } };
  }

  private requireBlock(block: string): HomeSlotBlockKey {
    if (!isHomeSlotBlockKey(block)) throw new NotFoundException('khong tim thay khoi sap xep');
    return block;
  }

  /** Lay dong danh sach, tu tao voi gia tri mac dinh neu chua co (vd truoc khi migration seed chay). */
  private async ensureList(blockKey: HomeSlotBlockKey) {
    let list = await this.listsDb.findUnique({ where: { blockKey } });
    if (!list) {
      list = await this.listsDb.create({
        data: { blockKey, maxSlots: defaultMaxSlots(blockKey), version: 0 },
      });
    }
    return list;
  }

  private async listItemsAdmin(listId: string) {
    const rows = await this.itemsDb.findMany({
      where: { listId },
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

  async getList(block: string) {
    const blockKey = this.requireBlock(block);
    const list = await this.ensureList(blockKey);
    return {
      blockKey: list.blockKey,
      name: blockLabel(blockKey),
      maxSlots: list.maxSlots,
      version: list.version,
      items: await this.listItemsAdmin(list.id),
    };
  }

  /** Kho (cot trai man hinh sap xep): bai da xuat ban + tick co cua khoi + publishAt <= now, moi nhat truoc, tru bai da trong danh sach.
   *  (f) KHONG ap luat pham vi hep cua tin bai: role nao co zones:view deu thay toan bo kho. */
  async listPool(block: string, q?: string, page = 1, limit = 20) {
    const blockKey = this.requireBlock(block);
    const list = await this.ensureList(blockKey);
    const listed = await this.itemsDb.findMany({ where: { listId: list.id }, select: { articleId: true } });
    const listedIds = new Set(listed.map((r: any) => r.articleId));
    const now = new Date();
    const where: any = { ...this.visibleWhere(now), [blockFlag(blockKey)]: true };
    if (q && q.trim()) {
      where.OR = [
        { title: { contains: q.trim(), mode: 'insensitive' } },
        { sapo: { contains: q.trim(), mode: 'insensitive' } },
      ];
    }
    const take = Math.min(100, Math.max(1, Number(limit) || 20));
    const pg = Math.max(1, Number(page) || 1);
    const [rows, total] = await Promise.all([
      this.prisma.newsArticle.findMany({
        where,
        include: { category: true },
        orderBy: { publishAt: 'desc' },
        skip: (pg - 1) * take,
        take,
      }),
      this.prisma.newsArticle.count({ where }),
    ]);
    const items = rows.filter((r: any) => !listedIds.has(r.id)).map(publicArticle);
    return { items, total, page: pg, limit: take };
  }

  /** Luu bulk mot lan: thay toan bo item + tang version + ghi audit, trong MOT transaction. */
  async save(
    block: string,
    dto: { items: string[]; version: number; maxSlots?: number },
    actor: HomeSlotActor,
  ) {
    const blockKey = this.requireBlock(block);
    const items = Array.isArray(dto.items) ? dto.items : [];
    if (!items.every((x) => typeof x === 'string' && x.trim())) {
      throw new BadRequestException('danh sach bai khong hop le');
    }
    const dups = findDuplicatePublicIds(items);
    if (dups.length) throw new BadRequestException(`mot bai chi xuat hien toi da mot lan trong cung mot khoi (trung: ${dups.join(', ')})`);
    const list = await this.ensureList(blockKey);
    if (!isVersionMatch(dto.version, list.version)) {
      throw new ConflictException('danh sach da duoc thay doi boi nguoi khac — hay tai lai danh sach moi nhat roi luu lai');
    }
    const effectiveMax = dto.maxSlots !== undefined ? dto.maxSlots : list.maxSlots;
    const maxErr = maxSlotsError(effectiveMax, items.length);
    if (maxErr) throw new BadRequestException(maxErr);
    // Bai phai ton tai (khong ep bai phai con trong kho: bai ha xuat ban
    // van giu hang theo Q3, va bai bi bo tick da bi hook o news.patch
    // xoa truoc do; version check bao ve truong hop dong thoi).
    const articles = await this.prisma.newsArticle.findMany({
      where: { publicId: { in: items } },
      select: { id: true, publicId: true },
    });
    const found = new Set(articles.map((a: any) => a.publicId));
    const missing = items.filter((x) => !found.has(x));
    if (missing.length) throw new NotFoundException(`khong tim thay bai viet: ${missing.join(', ')}`);
    const byPublicId = new Map(articles.map((a: any) => [a.publicId, a.id]));
    const oldIds = (await this.listItemsAdmin(list.id)).map((x: any) => x.articlePublicId);
    await this.prisma.$transaction(async (tx: any) => {
      const t = tx as any;
      await t.homeSlotItem.deleteMany({ where: { listId: list.id } });
      if (items.length) {
        await t.homeSlotItem.createMany({
          data: items.map((publicId, idx) => ({
            listId: list.id,
            articleId: byPublicId.get(publicId),
            sortOrder: idx,
          })),
        });
      }
      await t.homeSlotList.update({
        where: { id: list.id },
        data: { version: { increment: 1 }, maxSlots: effectiveMax },
      });
      await t.auditLog.create({
        data: {
          adminId: actor.id || null,
          action: 'home-slots.save',
          module: 'zones',
          targetId: blockKey,
          oldValue: { items: oldIds, maxSlots: list.maxSlots },
          newValue: { items, maxSlots: effectiveMax },
        },
      });
    });
    return this.getList(blockKey);
  }

  /** Hook Q4: bo tick khoi kho -> xoa bai khoi danh sach khoi + TANG version (de man hinh sap xep dang mo nhan xung dot 409 khi luu).
   *  Chi tang version khi that su xoa duoc hang; bai khong co trong danh sach thi khong doi gi. */
  async removeArticleFromBlock(blockKey: HomeSlotBlockKey, articleId: string, articlePublicId: string) {
    const list = await this.listsDb.findUnique({ where: { blockKey } });
    if (!list) return { removed: false };
    const item = await this.itemsDb.findFirst({ where: { listId: list.id, articleId } });
    if (!item) return { removed: false };
    const remaining = (await this.listItemsAdmin(list.id))
      .map((x: any) => x.articlePublicId)
      .filter((x: string) => x !== articlePublicId);
    await this.prisma.$transaction(async (tx: any) => {
      const t = tx as any;
      await t.homeSlotItem.delete({ where: { id: item.id } });
      await t.homeSlotList.update({ where: { id: list.id }, data: { version: { increment: 1 } } });
      await t.auditLog.create({
        data: {
          adminId: null,
          action: 'home-slots.untick-remove',
          module: 'zones',
          targetId: blockKey,
          oldValue: { items: [...remaining, articlePublicId] },
          newValue: { items: remaining },
        },
      });
    });
    return { removed: true };
  }

  /** Khoi cong khai trang chu doc: dung thu tu da sap, chi bai dang xuat ban (Q3: bai ha xuat ban de cho trong, khong lap). Rong la hop le. */
  async getPublicBlock(block: string) {
    const blockKey = this.requireBlock(block);
    const list = await this.listsDb.findUnique({ where: { blockKey } });
    if (!list) {
      return { key: blockKey, name: blockLabel(blockKey), slotLimit: defaultMaxSlots(blockKey), items: [] };
    }
    const now = new Date();
    const rows = await this.itemsDb.findMany({
      where: { listId: list.id },
      include: { article: { include: { category: true } } },
      orderBy: { sortOrder: 'asc' },
    });
    const items = rows
      .map((r: any) => r.article)
      .filter((a: any) => a.status === 'published' && a.publishAt && a.publishAt <= now)
      .map(publicArticle);
    return { key: list.blockKey, name: blockLabel(blockKey), slotLimit: list.maxSlots, items };
  }
}
