import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

// Khối trang chủ (FE tsht.vtctech.xyz) — KHÁC với 6 layout blocks video
// kiểu VTCPlay (HERO_CAROUSEL + 5 rails) đang chạy in-memory trong
// LayoutService. Khối trang chủ lưu THẬT vào bảng layout_blocks
// (platform='WEB', type thuộc HOME_BLOCK_TYPES), nên gạt công tắc /
// đổi thứ tự trên CMS có hiệu lực ngay và không mất khi backend restart.
// Hàng legacy trong bảng (type HERO_CAROUSEL/HORIZONTAL_LIST, nếu có)
// bị query này bỏ qua, không ảnh hưởng khối video cũ.
export const HOME_BLOCK_TYPES = [
  'HERO_NEWS',
  'MULTIMEDIA',
  'CATEGORY_NEWS',
  'WEATHER',
  'EPAPER',
] as const;
export type HomeBlockType = (typeof HOME_BLOCK_TYPES)[number];
export type HomeBlockColumn = 'full' | 'left' | 'right';
// Danh sách string[] cho query Prisma (tuple readonly không cast thẳng được).
const HOME_BLOCK_TYPE_VALUES: string[] = [...HOME_BLOCK_TYPES];

export interface HomeBlockSeed {
  order: number;
  type: HomeBlockType;
  title: string;
  column: HomeBlockColumn;
  categorySlug?: string;
}

// Thứ tự mặc định = bố cục user chốt: Hero -> Đa phương tiện ->
// vùng 2 cột (9 khối chuyên mục trái, Thời tiết phải) -> Báo in cuối.
const SEED: HomeBlockSeed[] = [
  { order: 1, type: 'HERO_NEWS', title: 'Hero — Tin nổi bật', column: 'full' },
  { order: 2, type: 'MULTIMEDIA', title: 'Đa phương tiện', column: 'full' },
  { order: 3, type: 'CATEGORY_NEWS', title: 'Chuyên mục: Chính trị', column: 'left', categorySlug: 'chinh-tri' },
  { order: 4, type: 'CATEGORY_NEWS', title: 'Chuyên mục: Xã hội', column: 'left', categorySlug: 'xa-hoi' },
  { order: 5, type: 'CATEGORY_NEWS', title: 'Chuyên mục: Kinh tế', column: 'left', categorySlug: 'kinh-te' },
  { order: 6, type: 'CATEGORY_NEWS', title: 'Chuyên mục: Quốc phòng', column: 'left', categorySlug: 'quoc-phong' },
  { order: 7, type: 'CATEGORY_NEWS', title: 'Chuyên mục: Văn hóa', column: 'left', categorySlug: 'van-hoa' },
  { order: 8, type: 'CATEGORY_NEWS', title: 'Chuyên mục: Giáo dục', column: 'left', categorySlug: 'giao-duc' },
  { order: 9, type: 'CATEGORY_NEWS', title: 'Chuyên mục: Y tế', column: 'left', categorySlug: 'y-te' },
  { order: 10, type: 'CATEGORY_NEWS', title: 'Chuyên mục: Pháp luật', column: 'left', categorySlug: 'phap-luat' },
  { order: 11, type: 'CATEGORY_NEWS', title: 'Chuyên mục: Du lịch', column: 'left', categorySlug: 'du-lich' },
  { order: 12, type: 'WEATHER', title: 'Thời tiết', column: 'right' },
  { order: 13, type: 'EPAPER', title: 'Báo in mới nhất', column: 'full' },
];

export interface HomeBlockDto {
  order?: number;
  type?: HomeBlockType;
  title?: string;
  column?: HomeBlockColumn;
  categorySlug?: string | null;
  isActive?: boolean;
}

function toPublic(r: any) {
  const cfg = (r.config || {}) as any;
  return {
    id: r.id,
    order: r.order,
    type: r.type,
    title: r.title,
    column: (cfg.column || 'full') as HomeBlockColumn,
    categorySlug: cfg.categorySlug || null,
    isActive: r.isActive,
  };
}

@Injectable()
export class HomeBlocksService implements OnModuleInit {
  private readonly logger = new Logger(HomeBlocksService.name);
  constructor(private prisma: PrismaService) {}

  // NOTE: @prisma/client trong VM chua duoc regenerate (can mang de tai
  // Prisma engine; Docker build tren production tu chay `prisma generate`
  // day du). Dung cast tam, giong CategoryService.
  private get db(): any { return (this.prisma as any).layoutBlock; }

  // Seed 1 lần duy nhất khi bảng chưa có khối trang chủ nào (giữ nguyên
  // mọi sửa đổi của admin sau đó, kể cả khi backend restart).
  async onModuleInit(): Promise<void> {
    try {
      const n = await this.db.count({
        where: { platform: 'WEB', type: { in: HOME_BLOCK_TYPE_VALUES } },
      });
      if (n > 0) return;
      for (const s of SEED) {
        await this.db.create({
          data: {
            platform: 'WEB',
            order: s.order,
            type: s.type,
            title: s.title,
            config: { column: s.column, categorySlug: s.categorySlug || null },
            isActive: true,
          },
        });
      }
      this.logger.log(`Da seed ${SEED.length} khoi trang chu vao layout_blocks.`);
    } catch (e) {
      this.logger.warn(`Bo qua seed home blocks (DB chua san sang?): ${(e as Error).message}`);
    }
  }

  async listAdmin() {
    const rows = await this.db.findMany({
      where: { platform: 'WEB', type: { in: HOME_BLOCK_TYPE_VALUES } },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map(toPublic);
  }

  // FE public: chỉ khối đang bật, xếp theo order.
  async listPublic() {
    const rows = await this.db.findMany({
      where: { platform: 'WEB', type: { in: HOME_BLOCK_TYPE_VALUES }, isActive: true },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });
    return { blocks: rows.map(toPublic) };
  }

  private checkDto(dto: HomeBlockDto, forCreate: boolean) {
    if (forCreate && !dto.type) throw new Error('type is required');
    if (dto.type !== undefined && !HOME_BLOCK_TYPE_VALUES.includes(dto.type))
      throw new Error('invalid type');
    if (dto.column !== undefined && !['full', 'left', 'right'].includes(dto.column))
      throw new Error('invalid column');
    if (dto.type === 'CATEGORY_NEWS' && forCreate && !dto.categorySlug?.trim())
      throw new Error('categorySlug is required for CATEGORY_NEWS');
  }

  async create(dto: HomeBlockDto) {
    this.checkDto(dto, true);
    const order =
      dto.order ??
      ((await this.db.aggregate({
        where: { platform: 'WEB', type: { in: HOME_BLOCK_TYPE_VALUES } },
        _max: { order: true },
      })._max.order) ?? 0) + 1;
    const r = await this.db.create({
      data: {
        platform: 'WEB',
        order,
        type: dto.type!,
        title: dto.title || dto.type!,
        config: { column: dto.column || 'full', categorySlug: dto.categorySlug || null },
        isActive: dto.isActive ?? true,
      },
    });
    return toPublic(r);
  }

  async update(id: string, dto: HomeBlockDto) {
    this.checkDto(dto, false);
    const cur = await this.db.findUnique({ where: { id } });
    if (!cur || cur.platform !== 'WEB' || !HOME_BLOCK_TYPE_VALUES.includes(cur.type))
      throw new Error('not found');
    const cfg = (cur.config || {}) as any;
    const nextCfg: any = { ...cfg };
    if (dto.column !== undefined) nextCfg.column = dto.column;
    if (dto.categorySlug !== undefined) nextCfg.categorySlug = dto.categorySlug || null;
    const r = await this.db.update({
      where: { id },
      data: {
        ...(dto.order !== undefined ? { order: dto.order } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        config: nextCfg,
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
    return toPublic(r);
  }

  async remove(id: string) {
    const cur = await this.db.findUnique({ where: { id } });
    if (!cur || cur.platform !== 'WEB' || !HOME_BLOCK_TYPE_VALUES.includes(cur.type))
      throw new Error('not found');
    await this.db.delete({ where: { id } });
    return { id };
  }
}
