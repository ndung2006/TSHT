import { Injectable, Optional } from '@nestjs/common';
import { MOVIES, MovieRec, buildTabs } from './movies.catalog';
import { CatalogService } from '../catalog/catalog.service';
import { VodService } from '../catalog/vod.service';

const HEX24 = /^[0-9a-f]{24}$/;

// Phase hiện tại: catalog + favorites in-memory. Len Postgres: videos/episodes
// + bảng favorites(user_id, public_id), giữ nguyên shape API.
@Injectable()
export class MoviesService {
  private favorites = new Map<string, Set<string>>(); // userId -> publicIds

  constructor(
    @Optional() private catalog?: CatalogService,
    @Optional() private vod?: VodService,
  ) {}

  assertValidPublicId(publicId: string): void {
    if (!HEX24.test(publicId)) {
      const err: any = new Error('invalid public_id (must be 24 hex chars)');
      err.status = 400;
      throw err;
    }
  }

  get(publicId: string): MovieRec {
    this.assertValidPublicId(publicId);
    const m = MOVIES.find((x) => x.public_id === publicId);
    if (!m) {
      const err: any = new Error('movie not found');
      err.status = 404;
      throw err;
    }
    return m;
  }

  // Phim tao tu CMS (DB catalog) — tra ve item public hoac null.
  private async dbMovie(publicId: string): Promise<any | null> {
    if (!this.catalog) return null;
    try {
      return await this.catalog.getPublic('movies', publicId);
    } catch {
      return null;
    }
  }

  private favOf(userId: string | undefined, publicId: string): boolean {
    return userId ? (this.favorites.get(userId)?.has(publicId) ?? false) : false;
  }

  // Map tap phim DB -> shape EpisodeRec cu (FE dang dung).
  private async dbEpisodes(movieId: string): Promise<import('./movies.catalog').EpisodeRec[]> {
    if (!this.catalog) return [];
    let rows: any[] = [];
    try {
      const res: any = await this.catalog.listEpisodes(movieId, 1, 200);
      rows = (res?.data || []).filter((e: any) => e.isVisible !== false)
        .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));
    } catch {
      return [];
    }
    const out: import('./movies.catalog').EpisodeRec[] = [];
    for (const e of rows) {
      const n = e.order ?? out.length + 1;
      let hls_url = '';
      try {
        if (this.vod) hls_url = (await this.vod.resolvePlay('episode', e.id)).hls_path;
      } catch {
        // tap chua xuat ban / chua co video -> de trong, FE hien thong bao
      }
      out.push({
        episode_id: e.id,
        episode_number: n,
        title: e.title || e.name || `Tập ${n}`,
        thumbnail: e.thumbnail || '',
        duration: e.duration ? String(e.duration) : null,
        description: e.description || '',
        hls_url,
      });
    }
    return out;
  }

  private async dbRelated(publicId: string): Promise<Array<Record<string, string | boolean>>> {
    if (!this.catalog) return [];
    try {
      const res: any = await this.catalog.listPublic('movies', { page: 1, limit: 11 });
      return ((res?.data || []) as any[])
        .filter((m: any) => m.public_id !== publicId)
        .slice(0, 10)
        .map((m: any) => ({
          id: `vid-${m.slug}`,
          public_id: m.public_id,
          slug: m.slug,
          title: m.title,
          thumbnail: m.poster || m.thumbnail,
          aspect: '3:4',
          is_premium: false,
          type: 'phim',
        }));
    } catch {
      return [];
    }
  }

  private async dbDetail(item: any, userId?: string) {
    const episodes = await this.dbEpisodes(item.id);
    const total = episodes.length;
    const year = item.releaseYear || (item.publishedAt || '').slice(0, 4) || (item.createdAt || '').slice(0, 4) || String(new Date().getFullYear());
    return {
      video_info: {
        public_id: item.public_id,
        title: item.title,
        release_year: Number(year) || new Date().getFullYear(),
        total_episodes: `${total} / ${total} Tập`,
        description: item.description || '',
        poster: item.poster || item.thumbnail || '',
        backdrop: item.backdrop || item.thumbnail || '',
        is_favorited: this.favOf(userId, item.public_id),
        tabs: buildTabs(total),
      },
      episodes,
      related_videos: await this.dbRelated(item.public_id),
    };
  }

  async detail(publicId: string, userId?: string) {
    // 1. Du lieu cung cu (giữ nguyên).
    try {
      const m = this.get(publicId);
      const related = MOVIES.filter((x) => x.public_id !== publicId)
        .slice(0, 10)
        .map((x) => ({
          id: `vid-${x.slug}`,
          public_id: x.public_id,
          slug: x.slug,
          title: x.title,
          thumbnail: x.poster,
          aspect: '3:4',
          is_premium: false,
          type: 'phim',
        }));
      return {
        video_info: {
          public_id: m.public_id,
          title: m.title,
          release_year: m.release_year,
          total_episodes: `${m.total_episodes} / ${m.total_episodes} Tập`,
          description: m.description,
          poster: m.poster,
          backdrop: m.backdrop,
          stream_urls: { hls: m.episodes[0]?.hls_url },
          is_favorited: this.favOf(userId, publicId),
          tabs: buildTabs(m.total_episodes),
        },
        episodes: m.episodes.map(({ hls_url, ...ep }) => ({ ...ep, hls_url })),
        related_videos: related,
      };
    } catch (e: any) {
      if (e?.status !== 404) throw e; // 400 (sai dinh dang) van nem nhu cu
    }
    // 2. Phim tao tu CMS (DB catalog).
    this.assertValidPublicId(publicId);
    const item = await this.dbMovie(publicId);
    if (!item) {
      const err: any = new Error('movie not found');
      err.status = 404;
      throw err;
    }
    return this.dbDetail(item, userId);
  }

  // Tap phim cho endpoint /movies/:id/episodes (FE hien chua dung den).
  async episodeList(publicId: string) {
    try {
      const m = this.get(publicId);
      return { public_id: publicId, tabs: buildTabs(m.total_episodes), episodes: m.episodes };
    } catch (e: any) {
      if (e?.status !== 404) throw e;
    }
    this.assertValidPublicId(publicId);
    const item = await this.dbMovie(publicId);
    if (!item) {
      const err: any = new Error('movie not found');
      err.status = 404;
      throw err;
    }
    const episodes = await this.dbEpisodes(item.id);
    return { public_id: publicId, tabs: buildTabs(episodes.length), episodes };
  }

  async toggleFavorite(userId: string, publicId: string): Promise<{ is_favorited: boolean }> {
    this.assertValidPublicId(publicId);
    // ton tai o mot trong hai nguon thi moi cho favorite
    let exists = MOVIES.some((x) => x.public_id === publicId);
    if (!exists) exists = (await this.dbMovie(publicId)) != null;
    if (!exists) {
      const err: any = new Error('movie not found');
      err.status = 404;
      throw err;
    }
    let set = this.favorites.get(userId);
    if (!set) {
      set = new Set();
      this.favorites.set(userId, set);
    }
    if (set.has(publicId)) set.delete(publicId);
    else set.add(publicId);
    return { is_favorited: set.has(publicId) };
  }
}
