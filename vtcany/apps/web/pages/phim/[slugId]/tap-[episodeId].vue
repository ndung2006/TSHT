<template>
  <div class="grid grid-cols-1 gap-5 p-5 lg:grid-cols-3">
    <div class="lg:col-span-2">
      <h1 class="mb-3 text-xl font-bold">{{ info.title }} — {{ current?.title }}</h1>
      <VideoPlayer
        ref="player"
        :src="current?.hls_url ?? ''"
        :poster="info.backdrop"
        @ended="showNext = true"
      />
      <div v-if="showNext && next" class="mt-3 rounded-lg bg-neutral-800 p-3 text-sm">
        Hết tập. <NuxtLink :to="`${basePath}/tap-${next.episode_id}`" class="font-semibold text-sky-400">Xem {{ next.title }} →</NuxtLink>
      </div>
      <p class="mt-3 text-sm text-neutral-300">{{ current?.description }}</p>
    </div>
    <div>
      <h2 class="mb-3 text-lg font-bold">Danh sách tập</h2>
      <EpisodeList :tabs="info.tabs" :episodes="episodes" :base-path="basePath" :active-id="episodeId" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { parseSlugId } from '@/utils/url';

const route = useRoute();
const config = useRuntimeConfig();
const slugId = String(route.params.slugId);
const episodeId = String(route.params.episodeId);

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

interface Ep {
  episode_id: string;
  episode_number: number;
  title: string;
  thumbnail: string;
  duration: string;
  description: string;
  hls_url: string;
}

const detail = computed(() => data.value as unknown as {
  video_info: { title: string; backdrop: string; tabs: string[] };
  episodes: Ep[];
});
const info = computed(() => detail.value.video_info);
const episodes = computed(() => detail.value.episodes);
const basePath = `/phim/${slugId}`;
const current = computed(() => episodes.value.find((e) => e.episode_id === episodeId));
if (!current.value) {
  throw createError({ statusCode: 404, statusMessage: 'Tập phim không tồn tại' });
}
const next = computed(() => {
  const i = episodes.value.findIndex((e) => e.episode_id === episodeId);
  return i >= 0 ? episodes.value[i + 1] : undefined;
});

const player = ref<{ currentTime: () => number } | null>(null);
const showNext = ref(false);
const sessionId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
  ? crypto.randomUUID()
  : `sess-${Date.now()}`;

function beat() {
  $fetch('/telemetry/heartbeat', {
    baseURL: config.public.apiBase as string,
    method: 'POST',
    body: {
      session_id: sessionId,
      content_id: `${publicId}:${episodeId}`,
      current_time_seconds: player.value?.currentTime() ?? 0,
      bitrate: 'auto',
      device_type: 'WEB_BROWSER',
    },
  }).catch(() => {});
}

let timer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  beat();
  timer = setInterval(beat, 30000); // heartbeat 30s
});
onUnmounted(() => {
  if (timer) clearInterval(timer);
});
</script>
