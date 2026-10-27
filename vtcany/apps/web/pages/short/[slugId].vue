<template>
  <div class="p-5">
    <div v-if="item" class="mx-auto w-full max-w-[430px]">
      <VideoPlayer
        v-if="play?.hls_path"
        :src="play.hls_path"
        :poster="item.thumbnail"
        aspect="9/16"
      />
      <div v-else class="relative aspect-[9/16] overflow-hidden rounded-xl bg-neutral-900">
        <img v-if="item.thumbnail" :src="item.thumbnail" :alt="item.title" class="h-full w-full object-cover opacity-70" />
        <p class="absolute inset-x-0 bottom-4 px-3 text-center text-sm text-neutral-300">
          Video chưa sẵn sàng để phát.
        </p>
      </div>

      <h1 class="mt-4 text-lg font-bold leading-snug">{{ item.title }}</h1>
      <p class="mt-1 flex flex-wrap gap-2 text-xs text-neutral-400">
        <span v-if="item.duration" class="rounded bg-neutral-800 px-2 py-0.5">Thời lượng {{ item.duration }}</span>
        <span v-if="item.ageLimit" class="rounded bg-neutral-800 px-2 py-0.5">{{ item.ageLimit }}</span>
      </p>
      <p v-if="item.description" class="mt-3 whitespace-pre-line text-sm leading-6 text-neutral-300">
        {{ item.description }}
      </p>
    </div>

    <section v-if="others.length" class="mx-auto mt-10 max-w-6xl">
      <h2 class="text-base font-semibold">Short khác</h2>
      <div class="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <NuxtLink
          v-for="s in others"
          :key="s.public_id"
          :to="`/short/${s.slug}-${s.public_id}`"
          class="block"
        >
          <div class="aspect-[9/16] w-full overflow-hidden rounded-lg bg-neutral-800">
            <img v-if="s.thumbnail" :src="s.thumbnail" :alt="s.title" class="h-full w-full object-cover" loading="lazy" />
          </div>
          <h3 class="mt-2 line-clamp-2 text-sm text-neutral-200">{{ s.title }}</h3>
        </NuxtLink>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { parseSlugId } from '@/utils/url';

interface PublicItem {
  id: string;
  public_id: string;
  slug: string;
  title: string;
  description?: string;
  thumbnail?: string;
  duration?: string | null;
  ageLimit?: string | null;
}

const route = useRoute();
const config = useRuntimeConfig();
const apiBase = config.public.apiBase as string;
const slugId = String(route.params.slugId);

let publicId = '';
try {
  publicId = parseSlugId(slugId).publicId;
} catch {
  throw createError({ statusCode: 404, statusMessage: 'Short không tồn tại' });
}

const { data: item, error: itemError } = await useFetch<PublicItem>(`/catalog/shorts/${publicId}`, {
  baseURL: apiBase,
});

if (itemError.value || !item.value) {
  throw createError({ statusCode: 404, statusMessage: 'Short không tồn tại hoặc chưa xuất bản' });
}
const it = item.value;

useHead({ title: `${it.title} - Short - VTC ANY` });

// URL phat ky HMAC (chi co khi video da transcode xong).
const play = it.id
  ? await $fetch<{ hls_path: string }>(`/vod/short/${it.id}/play`, { baseURL: apiBase }).catch(() => null)
  : null;

const { data: listData } = await useFetch('/catalog/shorts', {
  baseURL: apiBase,
  query: { limit: 15 },
});
const all = ((listData.value as { data?: PublicItem[] } | null)?.data ?? []) as PublicItem[];
const others = all.filter((s) => s.public_id !== publicId);
</script>
