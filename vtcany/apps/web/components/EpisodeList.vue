<template>
  <div>
    <div class="mb-3 flex flex-wrap gap-2">
      <Button
        v-for="(tab, i) in tabs"
        :key="tab"
        :label="tab"
        size="small"
        :severity="i === activeTab ? undefined : 'secondary'"
        @click="activeTab = i"
      />
    </div>
    <div class="flex max-h-96 flex-col gap-2 overflow-y-auto pr-1">
      <NuxtLink
        v-for="ep in visibleEpisodes"
        :key="ep.episode_id"
        :to="`${basePath}/tap-${ep.episode_id}`"
        class="flex gap-3 rounded-lg p-2 hover:bg-neutral-800"
        :class="ep.episode_id === activeId ? 'bg-neutral-800 ring-1 ring-sky-500' : ''"
      >
        <img :src="ep.thumbnail" :alt="ep.title" class="aspect-video w-28 shrink-0 rounded object-cover" loading="lazy" />
        <div class="min-w-0">
          <p class="truncate text-sm font-semibold">{{ ep.title }}</p>
          <p class="text-xs text-neutral-400">{{ ep.duration }}</p>
          <p class="line-clamp-2 text-xs text-neutral-400">{{ ep.description }}</p>
        </div>
      </NuxtLink>
    </div>
  </div>
</template>

<script setup lang="ts">
export interface EpisodeItem {
  episode_id: string;
  episode_number: number;
  title: string;
  thumbnail: string;
  duration: string;
  description: string;
}

const props = defineProps<{
  tabs: string[];
  episodes: EpisodeItem[];
  basePath: string;
  activeId?: string;
}>();

const activeTab = ref(0);
const visibleEpisodes = computed(() => props.episodes.slice(activeTab.value * 10, activeTab.value * 10 + 10));
</script>
