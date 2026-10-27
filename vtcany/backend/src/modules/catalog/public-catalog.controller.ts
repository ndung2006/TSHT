import { Controller, Get, HttpException, HttpStatus, Param, Query } from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { CategoryService } from '../admin/category.service';

// API doc cong khai cho apps/web (khong can dang nhap): GET /api/v1/catalog/shorts|videos|movies
// Chi tra noi dung da xuat ban (isVisible !== false), danh tinh cong khai la
// public_id 24-hex; URL phat lay rieng qua /api/v1/vod/:kind/:id/play.
// Cac tab /phim|/video|/short hien thi rail theo "khoi giao dien" (rails) do CMS
// cau hinh thu cong theo tung muc — giong VTCPlay (HIEN THI > Giao dien).

// Loai noi dung cua khoi giao dien (VTCPlay) -> catalog entity
function entityForContentType(contentType?: string): 'movies' | 'videos' | 'shorts' | 'events' | null {
  switch ((contentType || '').toLowerCase()) {
    case 'movie':
    case 'movies':
      return 'movies';
    case 'video':
    case 'videos':
      return 'videos';
    case 'short':
    case 'shorts':
      return 'shorts';
    case 'event':
    case 'events':
      return 'events';
    default:
      return null; // 'tv' -> kenh truyen hinh (FE tu lay /channels)
  }
}

function entityForCategoryType(type?: string): 'movies' | 'videos' | 'shorts' | null {
  switch ((type || '').toLowerCase()) {
    case 'phim':
      return 'movies';
    case 'video':
      return 'videos';
    case 'short':
      return 'shorts';
    default:
      return null;
  }
}

@Controller('catalog')
export class PublicCatalogController {
  constructor(private catalog: CatalogService, private categories: CategoryService) {}

  // Danh muc cong khai theo loai noi dung: ?type=phim|video|short|truyen-hinh
  @Get('categories')
  async listCategories(@Query('type') type?: string) {
    const cats = await this.categories.listVisible(type || undefined);
    return {
      data: cats.map((c) => ({ id: c.id, public_id: c.publicId, name: c.name, slug: c.slug })),
    };
  }

  // Chi tiet 1 danh muc (theo id hoac publicId 24hex) + noi dung thuoc danh muc.
  // FE dung cho trang /danh-muc/<slug>-<id> (giong VTCPlay).
  @Get('categories/:id')
  async getCategory(@Param('id') id: string, @Query('page') page?: string, @Query('limit') limit?: string) {
    let cat;
    try {
      cat = await this.categories.get(id);
    } catch {
      try {
        cat = await this.categories.getByPublicId(id);
      } catch {
        throw new HttpException(
          { error: { code: 'not_found', message: 'danh muc khong ton tai' } },
          HttpStatus.NOT_FOUND,
        );
      }
    }
    if (cat.isVisible === false) {
      throw new HttpException(
        { error: { code: 'not_found', message: 'danh muc khong ton tai' } },
        HttpStatus.NOT_FOUND,
      );
    }
    const entity = entityForCategoryType((cat.appliesTo || [])[0]);
    const items = entity
      ? (await this.catalog.listPublic(entity, {
          page: Number(page) || 1,
          limit: Number(limit) || 24,
          categoryId: cat.id,
        })).data
      : [];
    return {
      data: {
        id: cat.id,
        public_id: cat.publicId,
        name: cat.name,
        slug: cat.slug,
        type: (cat.appliesTo || [])[0] || null,
        items,
      },
    };
  }

  // Khoi giao dien (rails) cong khai theo muc — CMS cau hinh thu cong nhu VTCPlay
  // (HIEN THI > Giao dien): ?section=home|tv|movies|video|short|entertainment & platform=web
  // Moi rail kem items da resolve tu danh muc + thong tin danh muc de FE link /danh-muc/<slug>-<id>.
  @Get('rails')
  async listRails(@Query('section') section?: string, @Query('platform') platform?: string) {
    const res = await this.catalog.list('rails', { page: 1, limit: 200 });
    const now = Date.now();
    const pf = (platform || 'web').toLowerCase();
    const rails = (res.data || [])
      .filter(
        (r: any) =>
          r.isVisible !== false &&
          (!section || r.section === section) &&
          (!r.platform || String(r.platform).toLowerCase() === pf) &&
          (!r.visibleFrom || new Date(r.visibleFrom).getTime() <= now) &&
          (!r.visibleTo || new Date(r.visibleTo).getTime() >= now),
      )
      .sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    const data = [];
    for (const r of rails) {
      const entity = entityForContentType(r.contentType);
      let category: any = null;
      let items: any[] = [];
      // categoryId uu tien; fallback theo categorySlug (khi seed chay truoc khi co danh muc).
      let categoryId: string | undefined = r.categoryId;
      if (!categoryId && r.categorySlug) {
        try {
          const bySlug = await this.categories.list();
          const found = bySlug.find((c: any) => c.slug === r.categorySlug);
          if (found) categoryId = found.id;
        } catch { /* bo qua */ }
      }
      if (categoryId) {
        try {
          const c = await this.categories.get(categoryId);
          if (c.isVisible !== false) {
            category = { id: c.id, public_id: c.publicId, name: c.name, slug: c.slug };
          }
        } catch {
          /* danh muc bi xoa -> rail khong co items */
        }
      }
      if (entity && entity !== 'events' && categoryId) {
        items = (await this.catalog.listPublic(entity, { page: 1, limit: 24, categoryId })).data;
      } else if (entity === 'events') {
        items = (await this.catalog.listPublic('events', { page: 1, limit: 24 })).data;
      } else if (entity) {
        // Rail khong gan danh muc cu the: lay noi dung moi nhat theo loai
        // (nhu VTCPlay) thay vi de trong vinh vien.
        items = (await this.catalog.listPublic(entity, { page: 1, limit: 24 })).data;
      }
      data.push({
        id: r.id,
        title: r.title,
        section: r.section,
        platform: r.platform,
        contentType: r.contentType,
        style: r.style,
        sortOrder: r.sortOrder ?? 0,
        category,
        items,
      });
    }
    return { data };
  }

  @Get('shorts')
  listShorts(@Query('page') page?: string, @Query('limit') limit?: string, @Query('categoryId') categoryId?: string) {
    return this.catalog.listPublic('shorts', { page: Number(page) || 1, limit: Number(limit) || 24, categoryId });
  }

  @Get('shorts/:publicId')
  async getShort(@Param('publicId') publicId: string) {
    return this.one('shorts', publicId);
  }

  @Get('videos')
  listVideos(@Query('page') page?: string, @Query('limit') limit?: string, @Query('categoryId') categoryId?: string) {
    return this.catalog.listPublic('videos', { page: Number(page) || 1, limit: Number(limit) || 24, categoryId });
  }

  @Get('videos/:publicId')
  async getVideo(@Param('publicId') publicId: string) {
    return this.one('videos', publicId);
  }

  @Get('movies')
  listMovies(@Query('page') page?: string, @Query('limit') limit?: string, @Query('categoryId') categoryId?: string) {
    return this.catalog.listPublic('movies', { page: Number(page) || 1, limit: Number(limit) || 24, categoryId });
  }

  @Get('movies/:publicId')
  async getMovie(@Param('publicId') publicId: string) {
    return this.one('movies', publicId);
  }

  private async one(entity: string, publicId: string) {
    try {
      return await this.catalog.getPublic(entity, publicId);
    } catch {
      throw new HttpException(
        { error: { code: 'not_found', message: 'noi dung khong ton tai hoac chua xuat ban' } },
        HttpStatus.NOT_FOUND,
      );
    }
  }

  // Banner trang chu / trang con do CMS quan ly (HIEN THI > Banner) — giong VTCPlay.
  // ?page=home|tv|movies|video|short|entertainment & platform=web|mobile.
  // Chi tra banner dang hien thi, dung nen tang, trong khung thoi gian; sap xep
  // theo sortOrder. Shape giong hero FE (image_url/title/target_url).
  @Get('banners')
  async listBanners(@Query('page') page?: string, @Query('platform') platform?: string) {
    const res = await this.catalog.list('banners', { page: 1, limit: 200 });
    const now = Date.now();
    const pf = (platform || 'web').toLowerCase();
    const items = (res.data || [])
      .filter((b: any) => {
        if (b.isVisible === false) return false;
        if (page && b.section !== page) return false;
        // platforms: mang (moi) hoac string platform (cu); rong = moi nen tang.
        const plats = Array.isArray(b.platforms)
          ? b.platforms
          : b.platform
            ? [b.platform]
            : [];
        if (plats.length > 0 && !plats.map((p: any) => String(p).toLowerCase()).includes(pf)) return false;
        if (b.visibleFrom && new Date(b.visibleFrom).getTime() > now) return false;
        if (b.visibleTo && new Date(b.visibleTo).getTime() < now) return false;
        return true;
      })
      .sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    const data = [];
    for (const b of items) {
      data.push({
        id: b.id,
        image_url: pf === 'mobile' ? b.imageMobile || b.imageWeb || '' : b.imageWeb || b.imageMobile || '',
        title: b.title || '',
        action: 'OPEN_URL',
        target_id: '',
        target_url: await this.resolveBannerTarget(b),
      });
    }
    return { data };
  }

  // Chuan hoa link banner ve URL FE hieu duoc:
  // - http(s)://... hoac /duong/dan -> giu nguyen
  // - movie|video|short + public_id 24hex hoac {slug}-{24hex} -> /phim|video|short/{slug}-{id}
  // - category + public_id -> /danh-muc/{slug}-{id}
  private async resolveBannerTarget(b: any): Promise<string> {
    const t = String(b.linkTarget || '').trim();
    const type = String(b.linkType || '').toLowerCase();
    if (!t) return '';
    if (/^https?:\/\//i.test(t) || t.startsWith('/')) return t;
    const m = t.match(/-([0-9a-f]{24})$/);
    const publicId = m ? m[1] : /^[0-9a-f]{24}$/.test(t) ? t : null;
    if (!publicId) return '';
    try {
      if (type === 'category') {
        const c = await this.categories.getByPublicId(publicId);
        return `/danh-muc/${c.slug}-${publicId}`;
      }
      const kindMap: Record<string, string> = { movie: 'phim', video: 'video', short: 'short' };
      const kind = kindMap[type];
      if (kind) {
        const it: any = await this.catalog.getPublic(`${type}s`, publicId);
        if (it?.slug) return `/${kind}/${it.slug}-${publicId}`;
      }
    } catch {
      /* noi dung bi xoa/an -> khong link */
    }
    return '';
  }
}
