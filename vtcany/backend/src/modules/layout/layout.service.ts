import { Injectable } from '@nestjs/common';
import { HOME_SEED, HomeBlockSeed, SECTION_HEROES, HeroItem } from './seed-data';

// Server-Driven UI: GET /api/v1/layout/home?platform=WEB (Mục 3A).
// Nguồn đọc: bảng layout_blocks (migration 0001) — Phase hiện tại dùng seed
// in-memory nạp lúc boot; Redis cache 60s — Phase hiện tại dùng cache
// in-memory TTL, thay bằng Redis mà không đổi shape API.

const CACHE_TTL_MS = 60_000;

@Injectable()
export class LayoutService {
  private blocks: HomeBlockSeed[] = HOME_SEED.map((b, i) => ({
    ...b,
    id: b.id || `seed-block-${i + 1}`,
    is_active: b.is_active ?? true,
  }));
  private cache = new Map<string, { exp: number; data: { platform: string; layout_blocks: HomeBlockSeed[] } }>();

  // HANG DOI DB (Postgres layout_blocks): thay thân hàm này bằng SELECT ...
  // WHERE platform=$1 AND is_active ORDER BY "order", giữ nguyên return shape.
  getHome(platform = 'WEB'): { platform: string; layout_blocks: HomeBlockSeed[] } {
    const key = (platform || 'WEB').toUpperCase();
    const now = Date.now();
    const hit = this.cache.get(key);
    if (hit && hit.exp > now) return hit.data;
    const data = {
      platform: key,
      layout_blocks: this.blocks
        .filter((b) => b.is_active !== false && b.items.length > 0)
        .sort((a, b) => a.order - b.order),
    };
    this.cache.set(key, { exp: now + CACHE_TTL_MS, data });
    return data;
  }

  // Hero banner rieng cho tung section (trang chu / phim / video / short / giai tri)
  // — giong VTC Play. Fallback ve home khi section la.
  getSectionHero(section: string): HeroItem[] {
    const key = (section || 'home').toLowerCase();
    return SECTION_HEROES[key] ?? SECTION_HEROES.home;
  }

  // ---- Admin CRUD (Banner/Rail) ----
  listAll(): HomeBlockSeed[] {
    return [...this.blocks].sort((a, b) => a.order - b.order);
  }

  createBlock(dto: Partial<HomeBlockSeed> & { type: HomeBlockSeed['type'] }): HomeBlockSeed {
    if (!dto.type || !['HERO_CAROUSEL', 'HORIZONTAL_LIST'].includes(dto.type))
      throw new Error('invalid type');
    const block: HomeBlockSeed = {
      id: `block-${Date.now().toString(36)}`,
      order: dto.order ?? this.blocks.length + 1,
      type: dto.type,
      title: dto.title,
      target_url: dto.target_url,
      card_aspect: dto.card_aspect,
      is_active: dto.is_active ?? true,
      items: dto.items ?? [],
    };
    this.blocks.push(block);
    this.cache.clear();
    return block;
  }

  updateBlock(id: string, dto: Partial<HomeBlockSeed>): HomeBlockSeed {
    const b = this.blocks.find((x) => x.id === id);
    if (!b) throw new Error('not found');
    if (dto.order !== undefined) b.order = dto.order;
    if (dto.title !== undefined) b.title = dto.title;
    if (dto.target_url !== undefined) b.target_url = dto.target_url;
    if (dto.card_aspect !== undefined) b.card_aspect = dto.card_aspect;
    if (dto.is_active !== undefined) b.is_active = dto.is_active;
    if (dto.items !== undefined) b.items = dto.items;
    this.cache.clear();
    return b;
  }

  removeBlock(id: string): { id: string } {
    const i = this.blocks.findIndex((x) => x.id === id);
    if (i < 0) throw new Error('not found');
    this.blocks.splice(i, 1);
    this.cache.clear();
    return { id };
  }

  // Seed ghi đè (dùng cho script seed / test).
  replaceAll(blocks: HomeBlockSeed[]): void {
    this.blocks = blocks.map((b, i) => ({ ...b, id: b.id || `seed-block-${i + 1}`, is_active: b.is_active ?? true }));
    this.cache.clear();
  }

  count(): number {
    return this.blocks.length;
  }
}
