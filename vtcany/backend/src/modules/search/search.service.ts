import { Injectable } from '@nestjs/common';
import { MOVIES } from '../movies/movies.catalog';
import { HOME_SEED } from '../layout/seed-data';
import { normalizeVi } from '../tv/tv.catalog';

export interface SearchItem {
  public_id: string;
  slug: string;
  title: string;
  thumbnail: string;
  aspect: string;
  type: 'phim' | 'video' | 'short';
}

// Tìm không dấu trên catalog Phim + rail Video/Short (Mục 3D).
// Meilisearch/Typesense thay hàm match này khi dữ liệu lớn (Phụ lục 2).
@Injectable()
export class SearchService {
  private index: Array<SearchItem & { norm: string }> = this.buildIndex();

  private buildIndex(): Array<SearchItem & { norm: string }> {
    const out: Array<SearchItem & { norm: string }> = [];
    const seen = new Set<string>();
    const push = (item: SearchItem) => {
      if (seen.has(item.public_id)) return;
      seen.add(item.public_id);
      out.push({ ...item, norm: normalizeVi(item.title) });
    };
    for (const m of MOVIES) {
      push({ public_id: m.public_id, slug: m.slug, title: m.title, thumbnail: m.poster, aspect: '3:4', type: 'phim' });
    }
    for (const block of HOME_SEED) {
      if (block.type !== 'HORIZONTAL_LIST') continue;
      for (const it of block.items as Array<{ public_id: string; slug: string; title: string; thumbnail: string; aspect: '3:2' | '3:4'; type?: string }>) {
        if (it.type !== 'video' && it.type !== 'short') continue;
        push({ public_id: it.public_id, slug: it.slug, title: it.title, thumbnail: it.thumbnail, aspect: it.aspect, type: it.type });
      }
    }
    return out;
  }

  search(query: string): { query: string; groups: Array<{ type: string; items: SearchItem[] }> } {
    const q = normalizeVi(query);
    if (!q) return { query: query || '', groups: [] };
    const hits = this.index.filter((it) => it.norm.includes(q)).slice(0, 60);
    const groups: Array<{ type: string; items: SearchItem[] }> = [];
    for (const label of ['Phim', 'Video', 'Short'] as const) {
      const key = label.toLowerCase() as 'phim' | 'video' | 'short';
      const items = hits.filter((h) => h.type === key).map(({ norm: _n, ...rest }) => rest);
      if (items.length > 0) groups.push({ type: label, items });
    }
    return { query: (query || '').trim(), groups };
  }
}
