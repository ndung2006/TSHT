<template>
  <section class="mt-8">
    <NuxtLink
      v-if="block.target_url"
      :to="block.target_url"
      class="mb-3 inline-block text-lg font-bold hover:text-sky-400"
    >
      {{ block.title }}
    </NuxtLink>
    <h2 v-else class="mb-3 text-lg font-bold">{{ block.title }}</h2>

    <Carousel :value="block.items" :num-visible="5" :num-scroll="5" :responsive-options="responsive">
      <template #item="{ data }">
        <NuxtLink :to="cardUrl(data)" class="mr-3 block">
          <div
            class="w-full overflow-hidden rounded-lg bg-neutral-800"
            :class="aspectClass"
          >
            <img
              :src="data.thumbnail"
              :alt="data.title"
              class="h-full w-full object-cover"
              loading="lazy"
            />
          </div>
          <p class="mt-2 line-clamp-2 text-sm text-neutral-200">{{ data.title }}</p>
        </NuxtLink>
      </template>
    </Carousel>
  </section>
</template>

<script setup lang="ts">
export interface RailItem {
  id: string;
  public_id: string;
  slug: string;
  title: string;
  thumbnail: string;
  aspect: string;
  is_premium: boolean;
  type?: string;
}

export interface RailBlock {
  order: number;
  type: string;
  title?: string;
  target_url?: string;
  card_aspect?: string;
  items: RailItem[];
}

import { contentUrl } from '@/utils/url';

const props = defineProps<{ block: RailBlock }>();

const responsive = [
  { breakpoint: '1280px', numVisible: 4, numScroll: 4 },
  { breakpoint: '1024px', numVisible: 3, numScroll: 3 },
  { breakpoint: '640px', numVisible: 2, numScroll: 2 },
];

function cardUrl(item: RailItem): string {
  return contentUrl(item);
}

const aspectClass = computed(() => {
  const a = props.block.card_aspect;
  if (a === '3:4' || a === '3/4') return 'aspect-[3/4]';
  if (a === '9:16' || a === '9/16') return 'aspect-[9/16]';
  return 'aspect-[3/2]';
});
</script>
