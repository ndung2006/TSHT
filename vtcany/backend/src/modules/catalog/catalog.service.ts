import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { UploadsService } from '../uploads/uploads.service';
import { SAMPLE_CATEGORIES, SAMPLE_ITEMS, SAMPLE_RAIL_LINKS, BANNER_SEEDS } from '../layout/seed-data';

// Catalog CMS theo mau VTCPlay — persist Postgres qua Prisma (bang catalog_items/
// catalog_episodes/catalog_settings, payload Json giu nguyen API shape linh hoat).
// Truoc day la in-memory Map: du lieu mat moi lan restart/redeploy.

export interface Movie {
  id: string;
  title: string;
  originalTitle?: string;
  description?: string;
  categoryIds?: string[];
  genreIds?: string[];
  actorIds?: string[];
  planId?: string;
  ageLimit?: string;
  publishDate?: string;
  duration?: string; // h:mm:ss
  year?: number;
  type?: 'single' | 'series' | 'short'; // Phim le / Phim bo / Short
  hasSubtitle?: boolean;
  hasDubbing?: boolean;
  isVisible?: boolean;
  distribution?: 'free' | 'paid';
  price?: number;
  poster?: string;
  thumbnail?: string;
  createdAt: string;
}

export interface Episode {
  id: string;
  movieId: string;
  seasonId?: string; // tap thuoc mua (phim bo); khong co = tap truc tiep cua phim (phim le)
  title: string;
  description?: string;
  order?: number;
  publishDate?: string;
  duration?: string;
  subtitleEn?: string;
  subtitleVi?: string;
  thumbnail?: string;
  videoFileId?: string;
  isVisible?: boolean;
  showAds?: boolean;
  distribution?: 'inherit' | 'free' | 'paid';
  price?: number;
  createdAt: string;
}

// Mua / phan cua phim bo (theo mau VTCPlay CMS).
export interface Season {
  id: string;
  movieId: string;
  title: string;
  description?: string;
  order?: number;
  year?: number;
  publishDate?: string;
  poster?: string;
  thumbnail?: string;
  isVisible?: boolean;
  createdAt: string;
}

// Trailer: cung cau truc nhu Episode; gan o cap phim (phim le) hoac cap mua (phim bo).
export interface Trailer extends Omit<Episode, 'movieId' | 'seasonId'> {
  movieId?: string;
  seasonId?: string;
}

export interface FlatVideo {
  id: string;
  title: string;
  description?: string;
  categoryId?: string;
  planId?: string;
  distribution?: 'free' | 'paid';
  price?: number;
  thumbnail?: string;
  videoFileId?: string;
  duration?: string;
  isVisible?: boolean;
  createdAt: string;
}

export interface ShortItem {
  id: string;
  title: string;
  description?: string;
  videoFileId?: string;
  thumbnail?: string;
  isVisible?: boolean;
  createdAt: string;
}

export interface Genre { id: string; title: string; isVisible?: boolean; createdAt: string }
export interface Actor { id: string; name: string; avatar?: string; bio?: string; createdAt: string }
export interface Playlist { id: string; title: string; description?: string; itemIds?: string[]; isVisible?: boolean; createdAt: string }
export interface Article { id: string; title: string; slug?: string; content?: string; thumbnail?: string; isVisible?: boolean; createdAt: string }
export interface CmsEvent { id: string; title: string; description?: string; thumbnail?: string; startDate?: string; endDate?: string; isVisible?: boolean; createdAt: string }
export interface Plan { id: string; name: string; isVisible?: boolean; createdAt: string }
export interface NotificationItem { id: string; title: string; body?: string; target?: string; createdAt: string }
export interface Keyword { id: string; keyword: string; createdAt: string }
export interface BannedWord { id: string; word: string; createdAt: string }
export interface Livestream { id: string; title: string; streamUrl?: string; thumbnail?: string; status?: 'scheduled' | 'live' | 'ended'; scheduledAt?: string; createdAt: string }

export interface Banner {
  id: string;
  section: string; // home | tv | movies | video | short | entertainment
  platform: string; // web | mobile
  title: string;
  linkType?: string;
  linkTarget?: string;
  sortOrder?: number;
  visibleFrom?: string;
  visibleTo?: string;
  isVisible?: boolean;
  imageWeb?: string;
  imageMobile?: string;
  createdAt: string;
}

export interface Rail {
  id: string;
  section: string;
  platform: string;
  title: string;
  contentType?: string;
  categoryId?: string;
  sortOrder?: number;
  visibleFrom?: string;
  visibleTo?: string;
  style?: string;
  isVisible?: boolean;
  createdAt: string;
}

type EntityName =
  | 'movies' | 'videos' | 'shorts' | 'genres' | 'actors' | 'playlists'
  | 'articles' | 'events' | 'plans' | 'notifications' | 'keywords'
  | 'banned' | 'livestreams' | 'banners' | 'rails';

const REQUIRED: Record<EntityName, string[]> = {
  movies: ['title'],
  videos: ['title'],
  shorts: ['title'],
  genres: ['title'],
  actors: ['name'],
  playlists: ['title'],
  articles: ['title'],
  events: ['title'],
  plans: ['name'],
  notifications: ['title'],
  keywords: ['keyword'],
  banned: ['word'],
  livestreams: ['title'],
  banners: ['title', 'section'],
  rails: ['title', 'section'],
};

// Prefix rieng tung entity — id la PRIMARY KEY chung mot bang nen khong duoc trung prefix.
const PREFIX: Record<EntityName, string> = {
  movies: 'mo', videos: 'vi', shorts: 'sh', genres: 'ge', actors: 'ac',
  playlists: 'pl', articles: 'ar', events: 'ev', plans: 'pn', notifications: 'no',
  keywords: 'ke', banned: 'bw', livestreams: 'ls', banners: 'bn', rails: 'rl',
};

function nid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function checkRequired(required: string[], data: any): void {
  for (const f of required) {
    if (data[f] === undefined || data[f] === null || String(data[f]).trim() === '') {
      throw new Error(`${f} is required`);
    }
  }
}

function pageOpts(page?: number, limit?: number): { p: number; l: number } {
  const p = Math.max(1, Math.floor(page || 1));
  const l = Math.min(100, Math.max(1, Math.floor(limit || 20)));
  return { p, l };
}

function paginate(all: any[], page?: number, limit?: number): any {
  const { p, l } = pageOpts(page, limit);
  return { data: all.slice((p - 1) * l, p * l), meta: { page: p, limit: l, total: all.length } };
}

// --- Cong khai cho web (apps/web): chi noi dung dang xuat ban ---
// public_id dang 24-hex (sha256) de khop quy uoc URL /short|video/{slug}-{24hex}
// cua apps/web (utils/url.ts), giong cach channelPublicId lam cho kenh TV.
export function catalogPublicId(id: string): string {
  return createHash('sha256').update(`catalog:${id}`).digest('hex').slice(0, 24);
}

export function slugifyVi(input: string): string {
  return (input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

// Ban cong khai: chi field hien thi, khong lo videoFileId/upload noi bo.
export function toPublicItem(item: any): any {
  if (!item) return item;
  return {
    id: item.id,
    public_id: catalogPublicId(item.id),
    slug: slugifyVi(item.title || item.name || ''),
    title: item.title || item.name || '',
    description: item.description || '',
    thumbnail: item.thumbnail || item.thumbnailUrl || '',
    poster: item.posterUrl || '',
    duration: item.duration || null, // "" -> null: hop dong API thong nhat, client khoi phai doan kieu
    ageLimit: item.ageLimit ?? null,
    planId: item.planId ?? null,
    publishedAt: item.publishedAt ?? null,
    createdAt: item.createdAt,
  };
}

// Khoi giao dien mac dinh theo tung muc — giong cac rail dang ON tren VTCPlay.
// section: home | tv | movies | video | short | entertainment
const RAIL_SEED: Array<{
  section: string; title: string; contentType: string; categorySlug?: string; sortOrder: number;
}> = [
  // Trang chu
  { section: 'home', title: 'Kênh truyền hình', contentType: 'tv', sortOrder: 1 },
  { section: 'home', title: 'KICK-OFF THỂ THAO', contentType: 'video', categorySlug: 'kick-off-the-thao', sortOrder: 2 },
  { section: 'home', title: 'World Cup 2026 - Chào buổi sáng', contentType: 'video', categorySlug: 'world-cup-2026-chao-buoi-sang', sortOrder: 3 },
  { section: 'home', title: 'Check in Việt Nam', contentType: 'video', categorySlug: 'check-in-viet-nam-video', sortOrder: 4 },
  { section: 'home', title: 'Phim bộ', contentType: 'movie', categorySlug: 'phim-bo', sortOrder: 5 },
  { section: 'home', title: 'Short videos', contentType: 'short', categorySlug: 'short-videos', sortOrder: 6 },
  { section: 'home', title: 'Phim chiếu rạp', contentType: 'movie', categorySlug: 'phim-chieu-rap', sortOrder: 7 },
  { section: 'home', title: 'Ca nhạc', contentType: 'video', categorySlug: 'ca-nhac', sortOrder: 8 },
  // Phim
  { section: 'movies', title: 'Phim Bộ', contentType: 'movie', categorySlug: 'phim-bo', sortOrder: 1 },
  { section: 'movies', title: 'Phim hoạt hình', contentType: 'movie', categorySlug: 'phim-hoat-hinh', sortOrder: 2 },
  { section: 'movies', title: 'Phim SCTV9', contentType: 'movie', categorySlug: 'phim-sctv', sortOrder: 3 },
  { section: 'movies', title: 'Gameshow', contentType: 'movie', categorySlug: 'gameshow', sortOrder: 4 },
  { section: 'movies', title: 'Phim lẻ', contentType: 'movie', categorySlug: 'phim-le', sortOrder: 5 },
  // Video
  { section: 'video', title: 'KICK - OFF Thể thao', contentType: 'video', categorySlug: 'kick-off-the-thao', sortOrder: 1 },
  { section: 'video', title: 'Check in Việt Nam', contentType: 'video', categorySlug: 'check-in-viet-nam-video', sortOrder: 2 },
  { section: 'video', title: 'Tin thể thao trong nước', contentType: 'video', categorySlug: 'tin-the-thao-trong-nuoc', sortOrder: 3 },
  { section: 'video', title: 'Ca nhạc', contentType: 'video', categorySlug: 'ca-nhac', sortOrder: 4 },
  { section: 'video', title: 'Tin thể thao Quốc tế', contentType: 'video', categorySlug: 'tin-the-thao-quoc-te', sortOrder: 5 },
  // Short
  { section: 'short', title: 'Check in Việt Nam', contentType: 'short', categorySlug: 'check-in-viet-nam-short', sortOrder: 1 },
  { section: 'short', title: 'Phim ngắn', contentType: 'short', categorySlug: 'phim-ngan', sortOrder: 2 },
  { section: 'short', title: 'Ẩm thực', contentType: 'short', categorySlug: 'am-thuc', sortOrder: 3 },
  { section: 'short', title: 'Kỹ năng số', contentType: 'short', categorySlug: 'ky-nang-so', sortOrder: 4 },
  { section: 'short', title: 'Động vật', contentType: 'short', categorySlug: 'dong-vat', sortOrder: 5 },
  // Giai tri
  { section: 'entertainment', title: 'KICK - OFF Thể thao', contentType: 'video', categorySlug: 'kick-off-the-thao', sortOrder: 1 },
  { section: 'entertainment', title: 'Ca nhạc', contentType: 'video', categorySlug: 'ca-nhac', sortOrder: 2 },
  { section: 'entertainment', title: 'Gameshow', contentType: 'video', categorySlug: 'gameshow-video', sortOrder: 3 },
];

@Injectable()
export class CatalogService implements OnModuleInit {
  private readonly logger = new Logger(CatalogService.name);

  constructor(
    private prisma: PrismaService,
    @Optional() private uploads?: UploadsService,
  ) {}

  // NOTE: @prisma/client trong VM chua duoc regenerate cho CatalogSeason/
  // CatalogTrailer/season_id (can mang de tai Prisma engine; Docker build
  // tren production tu chay `prisma generate` day du). Dung cast tam co
  // chu thich; test dung fake Prisma, runtime that co du model.
  private get seasonDb(): any { return (this.prisma as any).catalogSeason; }
  private get trailerDb(): any { return (this.prisma as any).catalogTrailer; }

  async onModuleInit(): Promise<void> {
    // Seed giong VTCPlay: 2 goi cuoc mac dinh — chi khi bang plans con trong.
    try {
      const n = await this.prisma.catalogItem.count({ where: { entity: 'plans' } });
      if (n === 0) {
        await this.create('plans', { name: 'Phim lẻ PL1', isVisible: true });
        await this.create('plans', { name: 'Chung VTC', isVisible: true });
        this.logger.log('Da seed 2 goi cuoc mac dinh.');
      }
    } catch (e) {
      this.logger.warn(`Bo qua seed plans (DB chua san sang?): ${(e as Error).message}`);
    }
    // Seed khoi giao dien (rails) mac dinh theo tung muc — giong cac rail dang ON
    // tren VTCPlay. Idempotent theo tung (section, title): section nao thieu rail
    // nao thi seed bu rail do; khong dung den rail admin da tao/sua.
    try {
      const catDb: any = (this.prisma as any).category;
      const existing = await this.prisma.catalogItem.findMany({ where: { entity: 'rails' } });
      const existingKeys = new Set(
        (existing || []).map((r: any) => `${(r.data as any)?.section}::${(r.data as any)?.title}`),
      );
      let seeded = 0;
      for (const s of RAIL_SEED) {
        if (existingKeys.has(`${s.section}::${s.title}`)) continue;
        let categoryId: string | undefined;
        if (s.categorySlug && catDb) {
          try {
            const c = await catDb.findUnique({ where: { slug: s.categorySlug } });
            if (c) categoryId = c.id;
          } catch { /* bo qua */ }
        }
        await this.create('rails', {
          title: s.title,
          section: s.section,
          platform: 'web',
          contentType: s.contentType,
          categoryId,
          categorySlug: s.categorySlug,
          sortOrder: s.sortOrder,
          style: 'Mặc định',
          isVisible: true,
        });
        seeded += 1;
      }
      if (seeded > 0) this.logger.log(`Da seed ${seeded} khoi giao dien mac dinh.`);
    } catch (e) {
      this.logger.warn(`Bo qua seed rails (DB chua san sang?): ${(e as Error).message}`);
    }
    // Noi dung mau: moi section 3 items + gan rail (de user cuon thu trang).
    await this.seedSampleContent();
    // Banner mau cho CMS (HIEN THI > Banner) — bien the DB-backed cua hero seed,
    // de admin tu sua/thay anh duoc; FE doc qua GET /banners.
    await this.seedBanners();
  }

  // Seed 3 danh muc + 9 item mau (id co dinh -> public_id on dinh de hero link toi).
  // Idempotent: chi tao khi chua co; gan categoryId cho rail theo SAMPLE_RAIL_LINKS.
  private async seedSampleContent(): Promise<void> {
    try {
      const catDb: any = (this.prisma as any).category;
      if (!catDb) return;
      const catIdBySlug = new Map<string, string>();
      for (const c of SAMPLE_CATEGORIES) {
        let row: any = null;
        try {
          row = await catDb.findUnique({ where: { slug: c.slug } });
        } catch { /* bo qua */ }
        if (!row) {
          row = await catDb.create({
            data: {
              id: c.id,
              publicId: randomBytes(12).toString('hex'),
              name: c.name,
              slug: c.slug,
              parentId: null,
              sortOrder: 99,
              isVisible: true,
              platforms: ['WEB'],
              appliesTo: c.appliesTo,
              contentSort: 'created',
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          });
          this.logger.log(`Da seed danh muc mau: ${c.slug}`);
        }
        catIdBySlug.set(c.slug, row.id);
      }
      for (const it of SAMPLE_ITEMS) {
        let exists = true;
        try {
          await this.get(it.entity, it.id);
        } catch {
          exists = false;
        }
        if (!exists) {
          await this.create(it.entity, {
            id: it.id,
            title: it.title,
            thumbnail: it.thumbnail,
            ...(it.posterUrl ? { posterUrl: it.posterUrl } : {}),
            categoryIds: [catIdBySlug.get(it.categorySlug)!],
            isVisible: true,
          });
          this.logger.log(`Da seed item mau: ${it.title}`);
        }
      }
      const rails = await this.list('rails', { page: 1, limit: 200 });
      for (const link of SAMPLE_RAIL_LINKS) {
        const r = (rails.data || []).find(
          (x: any) => x.section === link.section && x.title === link.title,
        );
        const catId = catIdBySlug.get(link.categorySlug);
        // Chi gan khi rail CHUA co categoryId (lan seed dau tien). Tuyet doi
        // khong ghi de categoryId admin da cau hinh trong CMS: truoc day moi
        // lan backend restart, cac rail mau bi keo nguoc ve danh muc mau
        // (0 noi dung that) du admin da tro vao danh muc that.
        if (r && catId && !r.categoryId) {
          await this.update('rails', r.id, { categoryId: catId });
          this.logger.log(`Da gan rail "${link.title}" (${link.section}) -> ${link.categorySlug}`);
        }
      }
    } catch (e) {
      this.logger.warn(`Bo qua seed noi dung mau (DB chua san sang?): ${(e as Error).message}`);
    }
  }

  // Seed banner mau (idempotent theo section+title) — de CMS co san banner
  // sua duoc ngay sau deploy; FE uu tien doc tu DB qua GET /banners.
  private async seedBanners(): Promise<void> {
    try {
      const existing = await this.prisma.catalogItem.findMany({ where: { entity: 'banners' } });
      const keys = new Set(
        (existing || []).map((r: any) => `${(r.data as any)?.section}::${(r.data as any)?.title}`),
      );
      let n = 0;
      for (const s of BANNER_SEEDS) {
        if (keys.has(`${s.section}::${s.title}`)) continue;
        await this.create('banners', {
          title: s.title,
          section: s.section,
          platforms: ['web'],
          linkType: s.linkType,
          linkTarget: s.linkTarget,
          imageWeb: s.imageWeb,
          imageMobile: '',
          sortOrder: s.sortOrder,
          isVisible: true,
        });
        n += 1;
      }
      if (n > 0) this.logger.log(`Da seed ${n} banner mau cho CMS.`);
    } catch (e) {
      this.logger.warn(`Bo qua seed banner (DB chua san sang?): ${(e as Error).message}`);
    }
  }

  private assertEntity(name: string): EntityName {
    if (!(name in REQUIRED)) throw new Error('unknown entity');
    return name as EntityName;
  }

  // ---- Generic CRUD (bang catalog_items) ----
  async create(name: string, input: any): Promise<any> {
    const entity = this.assertEntity(name);
    const data = input || {};
    checkRequired(REQUIRED[entity], data);
    const item = { ...data, id: data.id || nid(PREFIX[entity]), createdAt: new Date().toISOString() };
    await this.prisma.catalogItem.create({ data: { id: item.id, entity, data: item } });
    return item;
  }

  async get(name: string, id: string): Promise<any> {
    const entity = this.assertEntity(name);
    const row = await this.prisma.catalogItem.findFirst({ where: { id, entity } });
    if (!row) throw new Error('not found');
    return row.data as any;
  }

  async update(name: string, id: string, patch: any): Promise<any> {
    const cur = await this.get(name, id);
    const next = { ...cur, ...(patch || {}), id: cur.id, createdAt: cur.createdAt };
    await this.prisma.catalogItem.update({ where: { id }, data: { data: next } });
    return next;
  }

  async remove(name: string, id: string): Promise<void> {
    await this.get(name, id); // 404 neu khong ton tai
    await this.prisma.catalogItem.delete({ where: { id } });
    if (name === 'movies') {
      // Xoa phim thi don sach mua / tap / trailer keo theo (tranh mo coi).
      const seasons = await this.seasonDb.findMany({ where: { movieId: id }, select: { id: true } });
      const seasonIds = seasons.map((s) => s.id);
      if (seasonIds.length) {
        await this.trailerDb.deleteMany({ where: { seasonId: { in: seasonIds } } });
        await this.prisma.catalogEpisode.deleteMany({ where: { seasonId: { in: seasonIds } } as any });
      }
      await this.trailerDb.deleteMany({ where: { movieId: id } });
      await this.prisma.catalogEpisode.deleteMany({ where: { movieId: id } });
      await this.seasonDb.deleteMany({ where: { movieId: id } });
    }
  }

  async list(name: string, opts: { page?: number; limit?: number; q?: string } = {}): Promise<any> {
    const entity = this.assertEntity(name);
    const rows = await this.prisma.catalogItem.findMany({
      where: { entity },
      orderBy: { createdAt: 'desc' },
    });
    // "Moi nhat len dau" theo ngay HIEN THI cua noi dung: publishedAt neu co,
    // khong thi createdAt cua item (cuoi cung la createdAt cua ban ghi).
    // Truoc day chi theo createdAt ban ghi, nen noi dung import hang loat
    // (ban ghi tao theo thu tu nguoc ngay phat) bi hien tap cu nhat len truoc
    // o ca CMS lan FE — rail va trang danh muc deu di qua list() nay.
    const tsOr = (v: any, fallback: number): number => {
      const t = v ? new Date(v).getTime() : NaN;
      return Number.isFinite(t) ? t : fallback;
    };
    let all = rows
      .map((r) => {
        const it = r.data as any;
        const rowTs = new Date(r.createdAt).getTime();
        return { it, key: tsOr(it?.publishedAt, tsOr(it?.createdAt, rowTs)) };
      })
      .sort((a, b) => b.key - a.key)
      .map((x) => x.it);
    if (opts.q) {
      const q = opts.q.toLowerCase();
      all = all.filter((it) => JSON.stringify(it).toLowerCase().includes(q));
    }
    return paginate(all, opts.page, opts.limit);
  }

  // Web cong khai (/catalog/shorts|videos): chi noi dung dang xuat ban.
  // Chua co thumbnail rieng -> dung poster worker tu cat tu video (neu co).
  private withPosterFallback(item: any): any {
    const out = toPublicItem(item);
    if (out && !out.thumbnail && item?.videoFileId) {
      out.thumbnail = this.uploads?.posterUrlFor(item.videoFileId) || '';
    }
    return out;
  }

  async listPublic(name: string, opts: { page?: number; limit?: number; categoryId?: string } = {}): Promise<any> {
    const res = await this.list(name, { page: 1, limit: 100 });
    let visible = (res.data || []).filter((it: any) => it.isVisible !== false);
    if (opts.categoryId) {
      visible = visible.filter((it: any) =>
        Array.isArray(it.categoryIds) ? it.categoryIds.includes(opts.categoryId) : it.categoryId === opts.categoryId,
      );
    }
    const mapped = visible.map((it: any) => this.withPosterFallback(it));
    return paginate(mapped, opts.page, opts.limit);
  }

  async getPublic(name: string, publicId: string): Promise<any> {
    const res = await this.list(name, { page: 1, limit: 100 });
    const found = (res.data || []).find(
      (it: any) => it.isVisible !== false && catalogPublicId(it.id) === publicId,
    );
    if (!found) throw new Error('not found');
    return this.withPosterFallback(found);
  }

  async count(name: string): Promise<number> {
    const entity = this.assertEntity(name);
    return this.prisma.catalogItem.count({ where: { entity } });
  }

  // ---- Episodes (nam trong movie, hoac trong season doi voi phim bo) ----
  async createEpisode(movieId: string, input: any): Promise<Episode> {
    await this.get('movies', movieId); // 404 neu movie khong ton tai
    const data = input || {};
    if (!data.title && data.name) data.title = data.name; // CMS gui name
    if (!data.title || !String(data.title).trim()) throw new Error('title is required');
    const seasonId = data.seasonId || null;
    if (seasonId) {
      const s = await this.getSeason(seasonId);
      if (s.movieId !== movieId) throw new Error('season khong thuoc phim nay');
    }
    const item = { ...data, movieId, seasonId, id: data.id || nid('ep'), createdAt: new Date().toISOString() };
    await this.prisma.catalogEpisode.create({ data: { id: item.id, movieId, seasonId, data: item } as any });
    return item as Episode;
  }

  async listEpisodes(movieId: string, page = 1, limit = 20, seasonId?: string): Promise<any> {
    await this.get('movies', movieId); // 404 neu movie khong ton tai
    const where: any = { movieId };
    if (seasonId !== undefined) where.seasonId = seasonId || null;
    const rows = await this.prisma.catalogEpisode.findMany({
      where: where as any,
      orderBy: { createdAt: 'desc' },
    });
    return paginate(rows.map((r) => r.data as any), page, limit);
  }

  async getEpisode(id: string): Promise<Episode> {
    const row = await this.prisma.catalogEpisode.findUnique({ where: { id } });
    if (!row) throw new Error('not found');
    return row.data as unknown as Episode;
  }

  async updateEpisode(id: string, patch: any): Promise<Episode> {
    const cur = await this.getEpisode(id);
    const next = { ...cur, ...(patch || {}), id: cur.id, createdAt: cur.createdAt, movieId: cur.movieId };
    await this.prisma.catalogEpisode.update({
      where: { id },
      data: { data: next, seasonId: (next as any).seasonId ?? null } as any,
    });
    return next as Episode;
  }

  async deleteEpisode(id: string): Promise<void> {
    await this.getEpisode(id);
    await this.prisma.catalogEpisode.delete({ where: { id } });
  }

  // ---- Seasons (mua / phan cua phim bo) ----
  async createSeason(movieId: string, input: any): Promise<Season> {
    await this.get('movies', movieId); // 404 neu movie khong ton tai
    const data = input || {};
    if (!data.title && data.name) data.title = data.name; // CMS gui name
    if (!data.title || !String(data.title).trim()) throw new Error('title is required');
    const item = { ...data, movieId, id: data.id || nid('se'), createdAt: new Date().toISOString() };
    await this.seasonDb.create({ data: { id: item.id, movieId, data: item } });
    return item as Season;
  }

  async listSeasons(movieId: string, page = 1, limit = 50): Promise<any> {
    await this.get('movies', movieId); // 404 neu movie khong ton tai
    const rows = await this.seasonDb.findMany({
      where: { movieId },
      orderBy: { createdAt: 'desc' },
    });
    return paginate(rows.map((r) => r.data as any), page, limit);
  }

  async getSeason(id: string): Promise<Season> {
    const row = await this.seasonDb.findUnique({ where: { id } });
    if (!row) throw new Error('not found');
    return row.data as unknown as Season;
  }

  async updateSeason(id: string, patch: any): Promise<Season> {
    const cur = await this.getSeason(id);
    const next = { ...cur, ...(patch || {}), id: cur.id, createdAt: cur.createdAt, movieId: cur.movieId };
    await this.seasonDb.update({ where: { id }, data: { data: next } });
    return next as Season;
  }

  async deleteSeason(id: string): Promise<void> {
    const cur = await this.getSeason(id);
    // Xoa mua thi don sach tap + trailer cua mua.
    await this.trailerDb.deleteMany({ where: { seasonId: id } });
    await this.prisma.catalogEpisode.deleteMany({ where: { seasonId: id } as any });
    await this.seasonDb.delete({ where: { id } });
  }

  async setSeasonPublished(id: string, published: boolean): Promise<Season> {
    return this.updateSeason(id, { isVisible: published });
  }

  async seasonCount(): Promise<number> {
    return this.seasonDb.count();
  }

  // ---- Trailers (cung cau truc episode; o cap phim voi phim le, cap mua voi phim bo) ----
  private async assertTrailerOwner(owner: { movieId?: string; seasonId?: string }): Promise<{ movieId: string | null; seasonId: string | null }> {
    const movieId = owner.movieId || null;
    const seasonId = owner.seasonId || null;
    if (!!movieId === !!seasonId) throw new Error('trailer phai gan vao phim hoac mua (chi mot)');
    if (movieId) await this.get('movies', movieId);
    if (seasonId) await this.getSeason(seasonId);
    return { movieId, seasonId };
  }

  async createTrailer(owner: { movieId?: string; seasonId?: string }, input: any): Promise<Trailer> {
    const { movieId, seasonId } = await this.assertTrailerOwner(owner);
    const data = input || {};
    if (!data.title && data.name) data.title = data.name; // CMS gui name
    if (!data.title || !String(data.title).trim()) throw new Error('title is required');
    const item = { ...data, movieId, seasonId, id: data.id || nid('tr'), createdAt: new Date().toISOString() };
    await this.trailerDb.create({ data: { id: item.id, movieId, seasonId, data: item } });
    return item as Trailer;
  }

  async listTrailers(owner: { movieId?: string; seasonId?: string }, page = 1, limit = 50): Promise<any> {
    const { movieId, seasonId } = await this.assertTrailerOwner(owner);
    const rows = await this.trailerDb.findMany({
      where: movieId ? { movieId } : { seasonId },
      orderBy: { createdAt: 'desc' },
    });
    return paginate(rows.map((r) => r.data as any), page, limit);
  }

  async getTrailer(id: string): Promise<Trailer> {
    const row = await this.trailerDb.findUnique({ where: { id } });
    if (!row) throw new Error('not found');
    return row.data as unknown as Trailer;
  }

  async updateTrailer(id: string, patch: any): Promise<Trailer> {
    const cur = await this.getTrailer(id);
    const next = { ...cur, ...(patch || {}), id: cur.id, createdAt: cur.createdAt, movieId: cur.movieId, seasonId: cur.seasonId };
    await this.trailerDb.update({ where: { id }, data: { data: next } });
    return next as Trailer;
  }

  async deleteTrailer(id: string): Promise<void> {
    await this.getTrailer(id);
    await this.trailerDb.delete({ where: { id } });
  }

  async setTrailerPublished(id: string, published: boolean): Promise<Trailer> {
    return this.updateTrailer(id, { isVisible: published });
  }

  async trailerCount(): Promise<number> {
    return this.trailerDb.count();
  }

  // ---- Xuat ban / an noi dung VOD (cong tac isVisible) ----
  async setPublished(name: string, id: string, published: boolean): Promise<any> {
    return this.update(name, id, { isVisible: published });
  }

  async setEpisodePublished(id: string, published: boolean): Promise<Episode> {
    return this.updateEpisode(id, { isVisible: published });
  }

  async episodeCount(): Promise<number> {
    return this.prisma.catalogEpisode.count();
  }

  // ---- Settings (key-value, bang catalog_settings) ----
  async getSettings(): Promise<Record<string, string>> {
    const rows = await this.prisma.catalogSetting.findMany();
    // Khoa noi bo (epg:...) dung chung bang nhung khong phai cau hinh CMS.
    return Object.fromEntries(rows.filter((r) => !r.key.startsWith('epg:')).map((r) => [r.key, r.value]));
  }

  async putSettings(patch: Record<string, string>): Promise<Record<string, string>> {
    for (const [k, v] of Object.entries(patch || {})) {
      if (k.startsWith('epg:')) continue; // khoa noi bo, chi EpgService duoc ghi
      await this.prisma.catalogSetting.upsert({
        where: { key: k },
        create: { key: k, value: String(v) },
        update: { value: String(v) },
      });
    }
    return this.getSettings();
  }

  // ---- Analytics ----
  async summary(extra: { users: number; channels: number }): Promise<any> {
    const [movies, episodes, videos, shorts] = await Promise.all([
      this.count('movies'),
      this.episodeCount(),
      this.count('videos'),
      this.count('shorts'),
    ]);
    return {
      users: extra.users,
      movies,
      episodes,
      channels: extra.channels,
      videos,
      shorts,
    };
  }
}
