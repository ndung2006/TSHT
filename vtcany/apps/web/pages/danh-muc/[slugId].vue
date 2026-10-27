<template>
  <div class="p-5">
    <div v-if="pending" class="flex flex-col gap-3">
      <Skeleton width="16rem" height="2rem" />
      <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        <Skeleton v-for="i in 10" :key="i" width="100%" height="10rem" border-radius="0.5rem" />
      </div>
    </div>

    <template v-else-if="category">
      <h1 class="text-xl font-bold">{{ category.name }}</h1>
      <div class="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        <NuxtLink v-for="item in category.items" :key="item.public_id" :to="contentUrl(item)" class="block">
          <div class="w-full overflow-hidden rounded-lg bg-neutral-800" :class="category.aspectClass">
            <img :src="item.poster || item.thumbnail" :alt="item.title" class="h-full w-full object-cover" loading="lazy" />
          </div>
          <h3 class="mt-2 line-clamp-2 text-sm text-neutral-200">{{ item.title }}</h3>
        </NuxtLink>
      </div>
    </template>

    <p v-else class="mt-4 text-neutral-400">Không tải được danh mục.</p>
  </div>
</template>

<script setup lang="ts">
import { contentUrl, parseSlugId } from '@/utils/url';

// Trang chi tiet danh muc — giong vtcplay.vn/danh-muc/<slug>-<24hex>:
// tieu de = ten danh muc + luoi card noi dung.
const route = useRoute();
const config = useRuntimeConfig();
const slugId = String(route.params.slugId);

let publicId: string;
try {
  publicId = parseSlugId(slugId).publicId;
} catch {
  throw createError({ statusCode: 404, statusMessage: 'Danh mục không tồn tại' });
}

interface CategoryDetail {
  id: string;
  public_id: string;
  name: string;
  slug: string;
  type?: string | null;
  items: Array<{
    public_id: string;
    slug: string;
    title: string;
    thumbnail?: string;
    poster?: string;
    planId?: string | null;
  }>;
}

const ITEM_TYPE: Record<string, string> = { phim: 'phim', video: 'video', short: 'short' };
const ASPECT_CLASS: Record<string, string> = {
  phim: 'aspect-[3/4]',
  video: 'aspect-[3/2]',
  short: 'aspect-[9/16]',
};

const { data, pending, error } = await useFetch<{ data: CategoryDetail }>(`/catalog/categories/${publicId}`, {
  baseURL: config.public.apiBase as string,
});

const category = computed(() => {
  const c = data.value?.data;
  if (!c) return null;
  const t = (c.type || 'phim').toLowerCase();
  return {
    ...c,
    aspectClass: ASPECT_CLASS[t] ?? ASPECT_CLASS.phim,
    items: (c.items ?? []).map((it) => ({ ...it, type: ITEM_TYPE[t] ?? 'phim' })),
  };
});

watch(
  category,
  (c) => {
    // Chỉ 404 khi API trả về OK nhưng không có danh mục; lỗi mạng thì hiện thông báo.
    if (!pending.value && !error.value && !c) {
      throw createError({ statusCode: 404, statusMessage: 'Danh mục không tồn tại' });
    }
  },
  { immediate: true },
);

useHead({ title: computed(() => (category.value?.name ? `${category.value.name} - VTC ANY` : 'Danh mục - VTC ANY')) });
</script>
