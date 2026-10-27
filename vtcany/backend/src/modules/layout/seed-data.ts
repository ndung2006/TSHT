import { createHash } from 'crypto';

// Bước 2/8 — Seed trang chủ giống VTC Play (Mục 3A, 11B).
// 6 blocks: 1 HERO_CAROUSEL (5 slides) + 5 HORIZONTAL_LIST (mỗi rail 8 items).
// public_id: 24 hex ổn định (sha256 theo namespace:index), đúng quy ước Bước 1.

export function seedHex(namespace: string, index: number): string {
  return createHash('sha256').update(`${namespace}:${index}`).digest('hex').slice(0, 24);
}

export interface HeroItem {
  id: string;
  image_url: string;
  title: string;
  action: 'OPEN_MOVIE' | 'OPEN_URL';
  target_id: string; // {slug}-{24hex} (khi action=OPEN_MOVIE)
  target_url?: string; // FE uu tien dung khi co (khi action=OPEN_URL)
}

export interface RailItem {
  id: string;
  public_id: string; // 24hex
  slug: string;
  title: string;
  thumbnail: string;
  aspect: '3:2' | '3:4';
  is_premium: boolean;
  type: 'phim' | 'video' | 'short';
}

export interface HomeBlockSeed {
  id?: string; // admin CRUD gán id; seed boot tự sinh
  order: number;
  type: 'HERO_CAROUSEL' | 'HORIZONTAL_LIST';
  title?: string;
  target_url?: string;
  card_aspect?: '3:2' | '3:4';
  is_active?: boolean; // admin ẩn block; default true
  items: Array<HeroItem | RailItem>;
}

const WEB_ORIGIN = 'https://any.vtcrd.top';
const BANNERS = `${WEB_ORIGIN}/banners`;
const SAMPLES = `${WEB_ORIGIN}/samples`;

const thumb = (seed: string, w: number, h: number) =>
  `https://picsum.photos/seed/${seed}/${w}/${h}`;

function slugifyViSeed(input: string): string {
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

// public_id cua catalog item = sha256(`catalog:${id}`)[:24] — deterministic
// theo id co dinh, de hero co the link thang toi trang chi tiet item mau.
export function samplePublicId(itemId: string): string {
  return createHash('sha256').update(`catalog:${itemId}`).digest('hex').slice(0, 24);
}

// ---- Noi dung mau: moi section 3 items (de cuon thu trang) ----
// CatalogService seed idempotent theo cac dinh nghia nay.
export interface SampleCategoryDef {
  id: string;
  name: string;
  slug: string;
  appliesTo: string[];
}
export const SAMPLE_CATEGORIES: SampleCategoryDef[] = [
  { id: 'cat-mau-kickoff-the-thao', name: 'KICK-OFF Thể thao (mẫu)', slug: 'mau-kickoff-the-thao', appliesTo: ['video'] },
  { id: 'cat-mau-phim-bo', name: 'Phim bộ (mẫu)', slug: 'mau-phim-bo', appliesTo: ['phim'] },
  { id: 'cat-mau-short', name: 'Short (mẫu)', slug: 'mau-short', appliesTo: ['short'] },
];

export interface SampleItemDef {
  id: string;
  entity: 'videos' | 'movies' | 'shorts';
  title: string;
  thumbnail: string;
  posterUrl?: string;
  categorySlug: string;
}
export const SAMPLE_ITEMS: SampleItemDef[] = [
  { id: 'vi-mau-kickoff-1', entity: 'videos', title: 'KICK-OFF Thể thao | 05/10/2026', thumbnail: `${SAMPLES}/sample-video-1.jpg`, categorySlug: 'mau-kickoff-the-thao' },
  { id: 'vi-mau-kickoff-2', entity: 'videos', title: 'KICK-OFF Thể thao | 04/10/2026', thumbnail: `${SAMPLES}/sample-video-2.jpg`, categorySlug: 'mau-kickoff-the-thao' },
  { id: 'vi-mau-kickoff-3', entity: 'videos', title: 'KICK-OFF Thể thao | 03/10/2026', thumbnail: `${SAMPLES}/sample-video-3.jpg`, categorySlug: 'mau-kickoff-the-thao' },
  { id: 'mo-mau-phimbo-1', entity: 'movies', title: 'Thâm Tình', thumbnail: `${SAMPLES}/sample-movie-1.jpg`, posterUrl: `${SAMPLES}/sample-movie-1.jpg`, categorySlug: 'mau-phim-bo' },
  { id: 'mo-mau-phimbo-2', entity: 'movies', title: 'Sóng Gió', thumbnail: `${SAMPLES}/sample-movie-2.jpg`, posterUrl: `${SAMPLES}/sample-movie-2.jpg`, categorySlug: 'mau-phim-bo' },
  { id: 'mo-mau-phimbo-3', entity: 'movies', title: 'Nắng Mới', thumbnail: `${SAMPLES}/sample-movie-3.jpg`, posterUrl: `${SAMPLES}/sample-movie-3.jpg`, categorySlug: 'mau-phim-bo' },
  { id: 'sh-mau-short-1', entity: 'shorts', title: 'Check in Sa Pa', thumbnail: `${SAMPLES}/sample-short-1.jpg`, categorySlug: 'mau-short' },
  { id: 'sh-mau-short-2', entity: 'shorts', title: 'Check in Hội An', thumbnail: `${SAMPLES}/sample-short-2.jpg`, categorySlug: 'mau-short' },
  { id: 'sh-mau-short-3', entity: 'shorts', title: 'Check in Phú Quốc', thumbnail: `${SAMPLES}/sample-short-3.jpg`, categorySlug: 'mau-short' },
];

// Rail nao cua moi section se hien thi 3 item mau (gan categoryId luc seed).
export const SAMPLE_RAIL_LINKS = [
  { section: 'home', title: 'KICK-OFF THỂ THAO', categorySlug: 'mau-kickoff-the-thao' },
  { section: 'movies', title: 'Phim Bộ', categorySlug: 'mau-phim-bo' },
  { section: 'video', title: 'KICK - OFF Thể thao', categorySlug: 'mau-kickoff-the-thao' },
  { section: 'short', title: 'Check in Việt Nam', categorySlug: 'mau-short' },
  { section: 'entertainment', title: 'KICK - OFF Thể thao', categorySlug: 'mau-kickoff-the-thao' },
];

// ---- Hero banner rieng cho tung section (giong VTC Play) ----
interface HeroDef {
  file: string;
  title: string; // tieu de hien thi tren banner (FE overlay)
  kind: 'phim' | 'video' | 'short';
  itemId: string; // id co dinh cua sample item
  itemTitle: string; // title goc cua sample item (de tinh slug + public_id)
  // Chi hero phim cua home giu target_id hop le: movies.catalog index tu
  // HERO_CAROUSEL (search/test phu thuoc); cac hero khac FE dung target_url.
  movieTarget?: boolean;
}
function heroItems(defs: HeroDef[]): HeroItem[] {
  return defs.map((d, i) => {
    const slug = slugifyViSeed(d.itemTitle);
    const publicId = samplePublicId(d.itemId);
    return {
      id: `banner-${i + 1}`,
      image_url: `${BANNERS}/${d.file}`,
      title: d.title,
      action: 'OPEN_URL' as const,
      target_id: d.movieTarget ? `${slug}-${publicId}` : '',
      target_url: `/${d.kind}/${slug}-${publicId}`,
    };
  });
}

// Public ID on dinh cua phim noi bat "Tham Tinh" (sample) — movies.catalog
// dung de nhan dien phim dac biet 22 tap; test dung chung const nay.
export const FEATURED_THAM_TINH_PUBLIC_ID = samplePublicId('mo-mau-phimbo-1');

const V1 = { kind: 'video' as const, itemId: 'vi-mau-kickoff-1', itemTitle: 'KICK-OFF Thể thao | 05/10/2026' };
const V2 = { kind: 'video' as const, itemId: 'vi-mau-kickoff-2', itemTitle: 'KICK-OFF Thể thao | 04/10/2026' };
const V3 = { kind: 'video' as const, itemId: 'vi-mau-kickoff-3', itemTitle: 'KICK-OFF Thể thao | 03/10/2026' };
const M1 = { kind: 'phim' as const, itemId: 'mo-mau-phimbo-1', itemTitle: 'Thâm Tình' };
const M2 = { kind: 'phim' as const, itemId: 'mo-mau-phimbo-2', itemTitle: 'Sóng Gió' };
const S1 = { kind: 'short' as const, itemId: 'sh-mau-short-1', itemTitle: 'Check in Sa Pa' };
const S2 = { kind: 'short' as const, itemId: 'sh-mau-short-2', itemTitle: 'Check in Hội An' };
const S3 = { kind: 'short' as const, itemId: 'sh-mau-short-3', itemTitle: 'Check in Phú Quốc' };

export const SECTION_HEROES: Record<string, HeroItem[]> = {
  home: heroItems([
    { file: 'hero-home-kickoff.jpg', title: 'KICK-OFF THỂ THAO', ...V1 },
    { file: 'hero-home-checkin.jpg', title: 'Check in Việt Nam', ...S1 },
    { file: 'hero-home-phimbo.jpg', title: 'Thâm Tình', ...M1, movieTarget: true },
  ]),
  movies: heroItems([
    { file: 'hero-movies-phimbo.jpg', title: 'Phim bộ đặc sắc', ...M1 },
    { file: 'hero-movies-rap.jpg', title: 'Phim chiếu rạp', ...M2 },
  ]),
  video: heroItems([
    { file: 'hero-video-kickoff.jpg', title: 'KICK-OFF Thể thao', ...V1 },
    { file: 'hero-video-canhac.jpg', title: 'Ca nhạc đỉnh cao', ...V2 },
  ]),
  short: heroItems([
    { file: 'hero-short-noibat.jpg', title: 'Short nổi bật', ...S1 },
    { file: 'hero-short-khampha.jpg', title: 'Khám phá mỗi ngày', ...S2 },
  ]),
  entertainment: heroItems([
    { file: 'hero-ent-gameshow.jpg', title: 'Gameshow cười thả ga', ...V3 },
    { file: 'hero-ent-canhac.jpg', title: 'Ca nhạc giải trí', ...S3 },
  ]),
};

interface RailDef {
  title: string;
  slug: string;
  catId: string;
  cardAspect: '3:2' | '3:4';
  prefix: string;
  itemType: 'phim' | 'video' | 'short';
  topics: string[];
}

const RAILS: RailDef[] = [
  {
    title: 'KICK-OFF THỂ THAO',
    slug: 'kick-off-the-thao',
    catId: '696891e96f1d98f16f5f7af2',
    cardAspect: '3:2',
    prefix: 'kickoff',
    itemType: 'video',
    topics: ['Bóng đá', 'Thể thao', 'Bình luận', 'Highlight', 'Tin nóng', 'Phỏng vấn', 'Tập luyện', 'Góc nhìn'],
  },
  {
    title: 'Check in Việt Nam',
    slug: 'check-in-viet-nam',
    catId: seedHex('cat', 11),
    cardAspect: '3:2',
    prefix: 'checkin',
    itemType: 'video',
    topics: ['Hà Nội', 'Huế', 'Đà Nẵng', 'TP.HCM', 'Phú Quốc', 'Sa Pa', 'Hội An', 'Nha Trang'],
  },
  {
    title: 'Phim bộ',
    slug: 'phim-bo',
    catId: seedHex('cat', 12),
    cardAspect: '3:4',
    prefix: 'phimbo',
    itemType: 'phim',
    topics: ['Thâm Tình', 'Mưa Bụi', 'Sóng Gió', 'Hương Vị', 'Đêm Trăng', 'Lối Về', 'Bến Xưa', 'Nắng Mới'],
  },
  {
    title: 'Short videos',
    slug: 'short-videos',
    catId: seedHex('cat', 13),
    cardAspect: '3:4',
    prefix: 'short',
    itemType: 'short',
    topics: ['Hài ngắn', 'Ẩm thực', 'Du lịch', 'Âm nhạc', 'Thể thao', 'Phim ngắn', 'Vlog', 'Tin nhanh'],
  },
  {
    title: 'Phim chiếu rạp',
    slug: 'phim-chieu-rap',
    catId: seedHex('cat', 14),
    cardAspect: '3:2',
    prefix: 'rap',
    itemType: 'phim',
    topics: ['Hành động', 'Tình cảm', 'Hài', 'Kinh dị', 'Hoạt hình', 'Chiến tranh', 'Phiêu lưu', 'Tâm lý'],
  },
];

function buildRails(): HomeBlockSeed[] {
  return RAILS.map((rail, ri) => ({
    order: ri + 2,
    type: 'HORIZONTAL_LIST' as const,
    title: rail.title,
    target_url: `/danh-muc/${rail.slug}-${rail.catId}`,
    card_aspect: rail.cardAspect,
    items: rail.topics.map((topic, i): RailItem => {
      const publicId = seedHex(rail.prefix, i);
      const slug = `${rail.slug}-${i + 1}`;
      const [w, h] = rail.cardAspect === '3:2' ? [640, 427] : [400, 533];
      return {
        id: `vid-${rail.prefix}-${i + 1}`,
        public_id: publicId,
        slug,
        title: rail.prefix === 'kickoff' ? `KICK - OFF Thể thao | 29/09/2026 — ${topic} ${i + 1}` : `${topic} ${i + 1}`,
        thumbnail: thumb(`${rail.prefix}-${i}`, w, h),
        aspect: rail.cardAspect,
        is_premium: false,
        type: rail.itemType,
      };
    }),
  }));
}


// ---- Seed banner cho CMS (HIEN THI > Banner): bien the DB-backed cua
// SECTION_HEROES de admin tu sua duoc; FE doc qua GET /banners. ----
export interface BannerSeedDef {
  section: string;
  title: string;
  imageWeb: string;
  linkType: 'movie' | 'video' | 'short';
  linkTarget: string; // duong dan chi tiet (FE dung thang)
  sortOrder: number;
}
const SEED_BANNER_KIND: Record<string, Record<string, 'movie' | 'video' | 'short'>> = {
  home: { 'KICK-OFF THỂ THAO': 'video', 'Check in Việt Nam': 'short', 'Thâm Tình': 'movie' },
  movies: { 'Phim bộ đặc sắc': 'movie', 'Phim chiếu rạp': 'movie' },
  video: { 'KICK-OFF Thể thao': 'video', 'Ca nhạc đỉnh cao': 'video' },
  short: { 'Short nổi bật': 'short', 'Khám phá mỗi ngày': 'short' },
  entertainment: { 'Gameshow cười thả ga': 'video', 'Ca nhạc giải trí': 'short' },
};
export const BANNER_SEEDS: BannerSeedDef[] = Object.entries(SECTION_HEROES).flatMap(
  ([section, heroes]) =>
    heroes.map((h, i) => ({
      section,
      title: h.title,
      imageWeb: h.image_url,
      linkType: SEED_BANNER_KIND[section][h.title],
      linkTarget: h.target_url || '',
      sortOrder: i + 1,
    })),
);

export const HOME_SEED: HomeBlockSeed[] = [
  {
    order: 1,
    type: 'HERO_CAROUSEL',
    items: SECTION_HEROES.home,
  },
  ...buildRails(),
];
