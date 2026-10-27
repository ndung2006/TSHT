<template>
  <div>
    <div class="relative aspect-[16/7] w-full overflow-hidden bg-neutral-800">
      <img :src="info.backdrop" :alt="info.title" class="h-full w-full object-cover" />
      <div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-neutral-950 to-transparent p-5">
        <div class="flex items-end gap-4">
          <img :src="info.poster" :alt="info.title" class="hidden w-28 rounded-lg object-cover aspect-[3/4] sm:block" />
          <div>
            <h1 class="text-2xl font-bold">{{ info.title }}</h1>
            <p class="mt-1 text-sm text-neutral-300">{{ info.release_year }} · {{ info.total_episodes }}</p>
            <div class="mt-3 flex gap-2">
              <Button
                :icon="fav ? 'pi pi-heart-fill' : 'pi pi-heart'"
                label="Yêu thích"
                size="small"
                :severity="fav ? 'danger' : 'secondary'"
                @click="toggleFav"
              />
              <Button icon="pi pi-share-alt" label="Chia sẻ" size="small" severity="secondary" @click="share" />
            </div>
            <p v-if="notice" class="mt-2 text-xs text-amber-300">{{ notice }}</p>
          </div>
        </div>
      </div>
    </div>

    <div class="p-5">
      <p class="text-sm text-neutral-300" :class="expanded ? '' : 'line-clamp-3'">{{ info.description }}</p>
      <button class="mt-1 text-sm font-semibold text-sky-400" @click="expanded = !expanded">
        {{ expanded ? 'Thu gọn' : 'Xem thêm' }}
      </button>

      <h2 class="mb-3 mt-6 text-lg font-bold">Danh sách tập</h2>
      <EpisodeList :tabs="info.tabs" :episodes="episodes" :base-path="`/phim/${slugId}`" />

      <RailCarousel :block="{ order: 99, type: 'HORIZONTAL_LIST', title: 'Đề xuất', items: related }" />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { EpisodeItem } from '@/components/EpisodeList.vue';
import { parseSlugId } from '@/utils/url';

const route = useRoute();
const config = useRuntimeConfig();
const slugId = String(route.params.slugId);

let publicId = '';
try {
  publicId = parseSlugId(slugId).publicId;
} catch {
  throw createError({ statusCode: 404, statusMessage: 'Phim không tồn tại' });
}

const { data, error } = await useFetch(`/movies/${publicId}`, {
  baseURL: config.public.apiBase as string,
});
if (error.value) {
  throw createError({ statusCode: 404, statusMessage: 'Phim không tồn tại' });
}

interface DetailResponse {
  video_info: {
    public_id: string;
    title: string;
    release_year: number;
    total_episodes: string;
    description: string;
    poster: string;
    backdrop: string;
    is_favorited: boolean;
    tabs: string[];
  };
  episodes: EpisodeItem[];
  related_videos: Array<Record<string, string | boolean>>;
}

const detail = computed(() => data.value as unknown as DetailResponse);
const info = computed(() => detail.value.video_info);
const episodes = computed(() => detail.value.episodes);
const related = computed(() => detail.value.related_videos as unknown as Array<{
  id: string; public_id: string; slug: string; title: string;
  thumbnail: string; aspect: string; is_premium: boolean; type?: string;
}>);

const expanded = ref(false);
const fav = ref(info.value.is_favorited);
const notice = ref('');

async function toggleFav() {
  notice.value = '';
  const token = typeof window !== 'undefined' ? localStorage.getItem('vtc-token') : null;
  if (!token) {
    notice.value = 'Đăng nhập để sử dụng Yêu thích.';
    return;
  }
  try {
    const res = await $fetch<{ is_favorited: boolean }>(`/movies/${publicId}/favorite`, {
      baseURL: config.public.apiBase as string,
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    fav.value = res.is_favorited;
  } catch {
    notice.value = 'Phiên đăng nhập hết hạn, vui lòng đăng nhập lại.';
  }
}

async function share() {
  try {
    await navigator.clipboard.writeText(window.location.href);
    notice.value = 'Đã copy link phim.';
  } catch {
    notice.value = window.location.href;
  }
}
</script>
