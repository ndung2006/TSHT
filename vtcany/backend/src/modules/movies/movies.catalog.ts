import { FEATURED_THAM_TINH_PUBLIC_ID, HOME_SEED } from '../layout/seed-data';

// Bước 4/8 — Catalog phim in-memory dựng từ seed trang chủ (Mục 3B).
// Postgres (videos + episodes) thay catalog này, giữ nguyên shape trả về.

export const SAMPLE_HLS = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';

export interface EpisodeRec {
  episode_id: string;
  episode_number: number;
  title: string;
  thumbnail: string;
  duration: string | null;
  description: string;
  hls_url: string;
}

export interface MovieRec {
  public_id: string;
  slug: string;
  title: string;
  release_year: number;
  total_episodes: number;
  description: string;
  poster: string;
  backdrop: string;
  episodes: EpisodeRec[];
}

const thumb = (seed: string, w: number, h: number) => `https://picsum.photos/seed/${seed}/${w}/${h}`;

function makeEpisodes(publicId: string, slug: string, total: number): EpisodeRec[] {
  const out: EpisodeRec[] = [];
  for (let n = 1; n <= total; n++) {
    out.push({
      episode_id: `${publicId.slice(0, 8)}-e${n}`,
      episode_number: n,
      title: `Tập ${n}`,
      thumbnail: thumb(`${slug}-t${n}`, 640, 360),
      duration: `${10 + ((n * 7) % 30)} phút`,
      description: `${slug} — nội dung tập ${n}.`,
      hls_url: SAMPLE_HLS,
    });
  }
  return out;
}

// Tabs 10 tập/tab: ["Tập 1 - Tập 10", "Tập 11 - Tập 20", "Tập 21 - Tập cuối"].
export function buildTabs(total: number): string[] {
  const tabs: string[] = [];
  for (let start = 1; start <= total; start += 10) {
    const end = Math.min(start + 9, total);
    tabs.push(end === total && end - start < 9 && start !== 1 ? `Tập ${start} - Tập cuối` : `Tập ${start} - Tập ${end}`);
  }
  return tabs;
}

function buildCatalog(): MovieRec[] {
  const movies: MovieRec[] = [];
  for (const block of HOME_SEED) {
    if (block.type === 'HERO_CAROUSEL') {
      for (const it of block.items as Array<{ target_id: string; title: string; image_url: string }>) {
        const m = it.target_id.match(/^(.*)-([0-9a-f]{24})$/);
        if (!m) continue;
        const [, slug, publicId] = m;
        if (movies.some((x) => x.public_id === publicId)) continue;
        const isThamTinh = publicId === FEATURED_THAM_TINH_PUBLIC_ID;
        const total = isThamTinh ? 22 : 12;
        movies.push({
          public_id: publicId,
          slug,
          title: it.title,
          release_year: isThamTinh ? 2024 : 2025,
          total_episodes: total,
          description: isThamTinh
            ? 'Thâm Tình — bộ phim tình cảm gia đình với 22 tập, xoay quanh những ân tình sâu nặng và các biến cố bất ngờ.'
            : `${it.title} — nội dung nổi bật trên VTC ANY.`,
          poster: thumb(`${slug}-poster`, 400, 533),
          backdrop: it.image_url,
          episodes: makeEpisodes(publicId, slug, total),
        });
      }
    } else {
      for (const it of block.items as Array<{ public_id: string; slug: string; title: string; thumbnail: string; type?: string }>) {
        if (it.type !== 'phim') continue;
        if (movies.some((x) => x.public_id === it.public_id)) continue;
        const total = 12;
        movies.push({
          public_id: it.public_id,
          slug: it.slug,
          title: it.title,
          release_year: 2025,
          total_episodes: total,
          description: `${it.title} — nội dung nổi bật trên VTC ANY.`,
          poster: thumb(`${it.slug}-poster`, 400, 533),
          backdrop: thumb(`${it.slug}-bg`, 1280, 720),
          episodes: makeEpisodes(it.public_id, it.slug, total),
        });
      }
    }
  }
  return movies;
}

export const MOVIES: MovieRec[] = buildCatalog();
