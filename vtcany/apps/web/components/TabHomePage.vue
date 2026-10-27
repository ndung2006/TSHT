<template>
  <div class="p-5">
    <h1 class="text-xl font-bold">{{ title }}</h1>

    <div v-if="pending" class="mt-4 flex flex-col gap-4">
      <Skeleton width="100%" height="22rem" border-radius="0.75rem" />
      <Skeleton width="100%" height="10rem" border-radius="0.75rem" />
      <Skeleton width="100%" height="10rem" border-radius="0.75rem" />
    </div>

    <template v-else-if="heroItems.length || rails?.length">
      <HeroCarousel :items="heroItems" />
      <template v-for="rail in rails" :key="rail.id">
        <ChannelStrip v-if="rail.contentType === 'tv'" :title="rail.title" />
        <RailCarousel v-else :block="rail.block" />
      </template>
    </template>

    <p v-else class="mt-4 text-neutral-400">Chưa có nội dung cho mục này.</p>
  </div>
</template>

<script setup lang="ts">
import type { HeroItem } from '@/components/HeroCarousel.vue';
import type { RailBlock, RailItem } from '@/components/RailCarousel.vue';

// Trang tab kieu vtcplay.vn (/phim, /video, /short, trang chu):
// hero banner + rail theo "khoi giao dien" do CMS cau hinh thu cong
// (HIEN THI > Giao dien) — moi khoi tro den mot danh muc.
const props = defineProps<{
  title: string;
  pageTitle: string;
  section: 'home' | 'tv' | 'movies' | 'video' | 'short' | 'entertainment';
}>();

useHead({ title: props.pageTitle });

const config = useRuntimeConfig();

const ASPECT: Record<string, string> = {
  movie: '3/4',
  video: '3/2',
  short: '9/16',
  event: '3/2',
  tv: '3/2',
};
const ITEM_TYPE: Record<string, string> = {
  movie: 'phim',
  video: 'video',
  short: 'short',
  event: 'event',
};

interface PublicItem {
  public_id: string;
  slug: string;
  title: string;
  thumbnail?: string;
  poster?: string;
  planId?: string | null;
}

interface ApiRail {
  id: string;
  title: string;
  contentType?: string;
  sortOrder: number;
  category?: { id: string; public_id: string; name: string; slug: string } | null;
  items: PublicItem[];
}

interface Rail {
  id: string;
  title: string;
  contentType?: string;
  block: RailBlock;
}

// Banner do CMS quan ly (HIEN THI > Banner) — uu tien nhat de admin tu doi duoc;
// fallback ve seed /layout/section/:section roi /layout/home khi backend cu
// hoac CMS chua co banner nao.
const { data: bannerData } = await useFetch('/catalog/banners', {
  baseURL: config.public.apiBase as string,
  query: { page: props.section, platform: 'WEB' },
});
const { data: sectionHero } = await useFetch(`/layout/section/${props.section}`, {
  baseURL: config.public.apiBase as string,
  query: { platform: 'WEB' },
});
const { data: layoutData } = await useFetch('/layout/home', {
  baseURL: config.public.apiBase as string,
  query: { platform: 'WEB' },
});
const heroItems = computed(() => {
  const bd = (bannerData.value as { data?: unknown } | null)?.data;
  if (Array.isArray(bd) && bd.length) return bd as HeroItem[];
  const s = (sectionHero.value as { hero?: unknown } | null)?.hero;
  if (Array.isArray(s) && s.length) return s as HeroItem[];
  const blocks = ((layoutData.value as { layout_blocks?: any[] } | null)?.layout_blocks ?? []);
  const h = blocks.find((b) => b.type === 'HERO_CAROUSEL');
  return ((h?.items ?? []) as unknown) as HeroItem[];
});

// Rail theo khoi giao dien CMS.
const { data: rails, pending } = await useAsyncData(`tab-rails-${props.section}`, async () => {
  const res: any = await $fetch('/catalog/rails', {
    baseURL: config.public.apiBase as string,
    query: { section: props.section, platform: 'web' },
  });
  const apiRails: ApiRail[] = res?.data ?? [];
  const out: Rail[] = [];
  for (const r of apiRails) {
    if (r.contentType === 'tv') {
      out.push({ id: r.id, title: r.title, contentType: 'tv', block: {} as RailBlock });
      continue;
    }
    const ct = (r.contentType || 'movie').toLowerCase();
    const aspect = ASPECT[ct] ?? '3/2';
    const itemType = ITEM_TYPE[ct] ?? 'phim';
    const items: RailItem[] = (r.items ?? []).map((it: PublicItem) => ({
      id: it.public_id,
      public_id: it.public_id,
      slug: it.slug,
      title: it.title,
      thumbnail: it.poster || it.thumbnail || '',
      aspect,
      is_premium: !!it.planId,
      type: itemType,
    }));
    if (!items.length) continue; // khong hien thi rail rong (giong VTCPlay)
    out.push({
      id: r.id,
      title: r.title,
      contentType: ct,
      block: {
        order: r.sortOrder,
        type: 'HORIZONTAL_LIST',
        title: r.title,
        // Bam tieu de rail -> trang chi tiet danh muc (giong vtcplay.vn/danh-muc/<slug>-<id>)
        target_url: r.category ? `/danh-muc/${r.category.slug}-${r.category.public_id}` : undefined,
        card_aspect: aspect,
        items,
      },
    });
  }
  return out;
});
</script>
