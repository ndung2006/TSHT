<template>
  <Carousel
    :value="items"
    :num-visible="1"
    :num-scroll="1"
    :autoplay-interval="6000"
    circular
    :show-navigators="false"
  >
    <template #item="{ data }">
      <div class="relative aspect-video w-full overflow-hidden rounded-xl bg-neutral-800">
        <img :src="data.image_url" :alt="data.title" class="h-full w-full object-cover" loading="lazy" />
        <div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-5">
          <h2 class="text-xl font-bold text-white md:text-2xl">{{ data.title }}</h2>
          <NuxtLink
            :to="data.target_url || `/phim/${data.target_id}`"
            class="mt-3 inline-block rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600"
          >
            Xem ngay
          </NuxtLink>
        </div>
      </div>
    </template>
  </Carousel>
</template>

<script setup lang="ts">
export interface HeroItem {
  id: string;
  image_url: string;
  title: string;
  action: string;
  target_id: string;
  target_url?: string; // backend moi: link truc tiep (uu tien hon target_id)
}

defineProps<{ items: HeroItem[] }>();
</script>
