import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';

// Danh mục (categories) — persist Prisma (bang categories), giu nguyen API shape.
// Moi loai noi dung co danh muc rieng (theo mau VTCPlay CMS): truyen-hinh / phim /
// video / short. CMS quan ly "khoi giao dien" (rails) thu cong theo tung muc;
// FE hien thi rail theo khoi da cau hinh.

export interface Category {
  id: string;
  publicId: string; // 24hex
  name: string;
  slug: string;
  parentId: string | null;
  icon?: string;
  thumbnail?: string;
  description?: string;
  sortOrder: number;
  isVisible: boolean;
  platforms: string[];
  appliesTo: string[];
  code?: string;
  seoThumbnail?: string;
  contentSort: string; // created | manual
  createdAt: string;
  updatedAt: string;
}

export interface CreateCategoryDto {
  name: string;
  slug?: string;
  parentId?: string | null;
  icon?: string;
  thumbnail?: string;
  description?: string;
  sortOrder?: number;
  isVisible?: boolean;
  platforms?: string[];
  appliesTo?: string[];
  code?: string;
  seoThumbnail?: string;
  contentSort?: string;
}

function generatePublicId(): string {
  return randomBytes(12).toString('hex');
}

export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

// Danh muc mac dinh theo dung CMS VTCPlay (Quan ly danh muc: Phim / Video / Short / Truyen hinh).
// Ten trung nhau giua cac loai -> slug rieng theo loai. 2 danh muc Short mac dinh An.
const SEED: Array<{ name: string; slug?: string; appliesTo: string[]; isVisible?: boolean }> = [
  // Phim (8)
  { name: 'Phim THVL', appliesTo: ['phim'] },
  { name: 'Phim chiếu rạp', appliesTo: ['phim'] },
  { name: 'Phim mới', appliesTo: ['phim'] },
  { name: 'Gameshow', appliesTo: ['phim'] },
  { name: 'Phim hoạt hình', appliesTo: ['phim'] },
  { name: 'Phim SCTV', appliesTo: ['phim'] },
  { name: 'Phim lẻ', appliesTo: ['phim'] },
  { name: 'Phim Bộ', appliesTo: ['phim'] },
  // Video (16)
  { name: 'World Cup 2026 - Chào buổi sáng', appliesTo: ['video'] },
  { name: 'KICK - OFF Thể thao', appliesTo: ['video'] },
  { name: 'Tin thể thao trong nước', appliesTo: ['video'] },
  { name: 'Check in Việt Nam', slug: 'check-in-viet-nam-video', appliesTo: ['video'] },
  { name: 'Thuốc Nam cho người Việt', appliesTo: ['video'] },
  { name: 'Bản tin dự báo thời tiết', appliesTo: ['video'] },
  { name: 'Tin tức ANTV', appliesTo: ['video'] },
  { name: 'Hoạt hình', appliesTo: ['video'] },
  { name: 'Gameshow', slug: 'gameshow-video', appliesTo: ['video'] },
  { name: 'Ca nhạc', appliesTo: ['video'] },
  { name: 'Tin thể thao Quốc tế', appliesTo: ['video'] },
  { name: 'Trailer phim', appliesTo: ['video'] },
  { name: 'Truyền hình số vệ tinh VTC', appliesTo: ['video'] },
  { name: 'Thời trang', slug: 'thoi-trang-video', appliesTo: ['video'] },
  { name: 'Khám phá thiên nhiên', appliesTo: ['video'] },
  { name: 'Tỉnh thành', appliesTo: ['video'] },
  // Short (11)
  { name: 'Phim Ngắn', appliesTo: ['short'] },
  { name: 'Check in Việt Nam', slug: 'check-in-viet-nam-short', appliesTo: ['short'] },
  { name: 'Short videos', appliesTo: ['short'] },
  { name: 'Thời trang', slug: 'thoi-trang-short', appliesTo: ['short'], isVisible: false },
  { name: 'Lịch sử', appliesTo: ['short'] },
  { name: 'Tin tức', slug: 'tin-tuc-short', appliesTo: ['short'] },
  { name: 'Kỹ năng số', appliesTo: ['short'] },
  { name: 'Động vật', appliesTo: ['short'] },
  { name: 'Quê hương bình yên', appliesTo: ['short'] },
  { name: 'Ẩm thực', appliesTo: ['short'] },
  { name: 'Hài hước', appliesTo: ['short'], isVisible: false },
  // Truyen hinh (2)
  { name: 'Tin tức', slug: 'tin-tuc-truyen-hinh', appliesTo: ['truyen-hinh'] },
  { name: 'Thể thao', appliesTo: ['truyen-hinh'] },
];

function toCategory(r: any): Category {
  return {
    id: r.id,
    publicId: r.publicId,
    name: r.name,
    slug: r.slug,
    parentId: r.parentId ?? null,
    icon: r.icon ?? undefined,
    thumbnail: r.thumbnail ?? undefined,
    description: r.description ?? undefined,
    sortOrder: r.sortOrder ?? 0,
    isVisible: r.isVisible !== false,
    platforms: r.platforms ?? ['WEB'],
    appliesTo: r.appliesTo ?? [],
    code: r.code ?? undefined,
    seoThumbnail: r.seoThumbnail ?? undefined,
    contentSort: r.contentSort ?? 'created',
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
    updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : r.updatedAt,
  };
}

@Injectable()
export class CategoryService implements OnModuleInit {
  private readonly logger = new Logger(CategoryService.name);

  constructor(private prisma: PrismaService) {}

  // NOTE: @prisma/client trong VM chua duoc regenerate (can mang de tai Prisma engine;
  // Docker build tren production tu chay `prisma generate` day du). Dung cast tam.
  private get db(): any { return (this.prisma as any).category; }

  async onModuleInit(): Promise<void> {
    try {
      const n = await this.db.count();
      if (n === 0) {
        let order = 0;
        for (const s of SEED) {
          order += 1;
          await this.create({
            name: s.name,
            slug: s.slug,
            appliesTo: s.appliesTo,
            sortOrder: order,
            platforms: ['WEB'],
            isVisible: s.isVisible !== false,
          });
        }
        this.logger.log(`Da seed ${SEED.length} danh muc mac dinh theo VTCPlay.`);
      }
    } catch (e) {
      this.logger.warn(`Bo qua seed categories (DB chua san sang?): ${(e as Error).message}`);
    }
  }

  async list(): Promise<Category[]> {
    const rows = await this.db.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
    return rows.map(toCategory);
  }

  async listVisible(type?: string): Promise<Category[]> {
    const rows = await this.db.findMany({
      where: { isVisible: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    const all = rows.map(toCategory);
    if (!type) return all;
    return all.filter((c) => (c.appliesTo || []).includes(type));
  }

  async get(id: string): Promise<Category> {
    const r = await this.db.findUnique({ where: { id } });
    if (!r) throw new Error('not found');
    return toCategory(r);
  }

  async getByPublicId(publicId: string): Promise<Category> {
    const r = await this.db.findUnique({ where: { publicId } });
    if (!r) throw new Error('not found');
    return toCategory(r);
  }

  async create(dto: CreateCategoryDto): Promise<Category> {
    if (!dto.name?.trim()) throw new Error('name is required');
    const slug = (dto.slug?.trim() || slugify(dto.name)) || `danh-muc-${Date.now().toString(36)}`;
    const dup = await this.db.findUnique({ where: { slug } });
    if (dup) throw new Error('slug already exists');
    if (dto.parentId) {
      const p = await this.db.findUnique({ where: { id: dto.parentId } });
      if (!p) throw new Error('parent not found');
    }
    const now = new Date();
    const r = await this.db.create({
      data: {
        id: `cat-${Date.now().toString(36)}${randomBytes(3).toString('hex')}`,
        publicId: generatePublicId(),
        name: dto.name.trim(),
        slug,
        parentId: dto.parentId ?? null,
        icon: dto.icon,
        thumbnail: dto.thumbnail,
        description: dto.description,
        sortOrder: dto.sortOrder ?? 0,
        // VTCPlay: mac dinh An khi them moi danh muc
        isVisible: dto.isVisible ?? false,
        platforms: dto.platforms ?? ['WEB'],
        appliesTo: dto.appliesTo ?? ['phim', 'video'],
        code: dto.code,
        seoThumbnail: dto.seoThumbnail,
        contentSort: dto.contentSort ?? 'created',
        createdAt: now,
        updatedAt: now,
      },
    });
    return toCategory(r);
  }

  async update(id: string, dto: Partial<CreateCategoryDto>): Promise<Category> {
    const cur = await this.get(id); // 404 neu khong ton tai
    const patch: any = {};
    if (dto.name !== undefined) {
      if (!dto.name.trim()) throw new Error('name is required');
      patch.name = dto.name.trim();
    }
    if (dto.slug !== undefined) {
      const slug = dto.slug.trim() || slugify(cur.name);
      const dup = await this.db.findUnique({ where: { slug } });
      if (dup && dup.id !== id) throw new Error('slug already exists');
      patch.slug = slug;
    }
    if (dto.parentId !== undefined) {
      if (dto.parentId) {
        if (dto.parentId === id) throw new Error('invalid parent');
        const p = await this.db.findUnique({ where: { id: dto.parentId } });
        if (!p) throw new Error('invalid parent');
      }
      patch.parentId = dto.parentId;
    }
    if (dto.icon !== undefined) patch.icon = dto.icon;
    if (dto.thumbnail !== undefined) patch.thumbnail = dto.thumbnail;
    if (dto.description !== undefined) patch.description = dto.description;
    if (dto.sortOrder !== undefined) patch.sortOrder = dto.sortOrder;
    if (dto.isVisible !== undefined) patch.isVisible = dto.isVisible;
    if (dto.platforms !== undefined) patch.platforms = dto.platforms;
    if (dto.appliesTo !== undefined) patch.appliesTo = dto.appliesTo;
    if (dto.code !== undefined) patch.code = dto.code;
    if (dto.seoThumbnail !== undefined) patch.seoThumbnail = dto.seoThumbnail;
    if (dto.contentSort !== undefined) patch.contentSort = dto.contentSort;
    patch.updatedAt = new Date();
    const r = await this.db.update({ where: { id }, data: patch });
    return toCategory(r);
  }

  async remove(id: string): Promise<{ id: string }> {
    await this.get(id); // 404 neu khong ton tai
    const kids = await this.db.count({ where: { parentId: id } });
    if (kids > 0) throw new Error('category has children');
    await this.db.delete({ where: { id } });
    return { id };
  }
}
