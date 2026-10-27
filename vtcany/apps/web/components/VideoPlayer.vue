<template>
  <div
    ref="containerEl"
    class="relative w-full select-none overflow-hidden rounded-xl bg-black"
    :class="aspect === '9/16' ? 'aspect-[9/16]' : 'aspect-video'"
    @mousemove="pokeControls"
    @mouseleave="hideOnLeave"
    @click="togglePlay"
  >
    <video
      ref="videoEl"
      class="h-full w-full"
      :class="background ? 'opacity-0' : ''"
      playsinline
      :poster="poster"
      @canplay="loading = false"
      @waiting="loading = true"
      @playing="onPlaying"
      @pause="onPause"
      @ended="onEnded"
      @timeupdate="onTimeUpdate"
      @loadedmetadata="onLoadedMeta"
      @volumechange="onVolumeChange"
      @error="onVideoError"
      @click.stop
    />

    <!-- Background co dinh cho kenh radio (audio-only): poster chi hien truoc
         khi phat, con anh nay giu suot thoi gian nghe. Video element van chay
         ngam de phat tieng, cac control tu che nam tren cung. -->
    <img
      v-if="background"
      :src="background"
      alt=""
      class="pointer-events-none absolute inset-0 h-full w-full object-cover"
    />

    <div v-if="loading" class="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40">
      <i class="pi pi-spin pi-spinner !text-4xl text-white" />
    </div>

    <!-- Bao loi phat (tam hien de chan doan su co timeshift/hls) -->
    <div v-if="playError && !loading" class="absolute inset-x-0 top-0 flex justify-center p-2">
      <div class="rounded bg-red-900/90 px-3 py-1.5 text-xs text-red-100">Lỗi phát: {{ playError }}</div>
    </div>

    <!-- Nut play lon giua man hinh khi pause -->
    <button
      v-if="!playing && !loading"
      type="button"
      class="absolute inset-0 m-auto flex h-16 w-16 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur transition hover:scale-105 hover:bg-black/80"
      @click.stop="togglePlay"
    >
      <i class="pi pi-play !text-2xl" />
    </button>

    <!-- Thanh dieu khien kieu VTC Play -->
    <div
      class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-3 pb-2.5 pt-10 transition-opacity duration-200"
      :class="controlsVisible ? 'opacity-100' : 'pointer-events-none opacity-0'"
      @click.stop
    >
      <!-- Progress -->
      <div
        ref="progressEl"
        class="group/bar relative mb-2 h-1.5 cursor-pointer rounded-full bg-white/25"
        @pointerdown="startScrub"
      >
        <div class="absolute inset-y-0 left-0 rounded-full bg-emerald-500" :style="{ width: progressPct + '%' }" />
        <div
          class="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500 opacity-0 shadow transition group-hover/bar:opacity-100"
          :style="{ left: progressPct + '%' }"
        />
      </div>

      <div class="flex items-center gap-1.5 text-white">
        <button type="button" class="ctrl-btn" @click="togglePlay">
          <i :class="playing ? 'pi pi-pause' : 'pi pi-play'" />
        </button>
        <button type="button" class="ctrl-btn" title="Lùi 10 giây" @click="skip(-10)">
          <i class="pi pi-replay" />
        </button>
        <button type="button" class="ctrl-btn" title="Tới 10 giây" @click="skip(10)">
          <i class="pi pi-refresh" />
        </button>
        <button type="button" class="ctrl-btn" @click="toggleMute">
          <i :class="muted || volume === 0 ? 'pi pi-volume-off' : volume < 0.5 ? 'pi pi-volume-down' : 'pi pi-volume-up'" />
        </button>
        <input
          v-model.number="volume"
          type="range"
          min="0"
          max="1"
          step="0.05"
          class="hidden h-1 w-20 accent-emerald-500 sm:block"
          @input="onVolumeInput"
        />
        <span class="ml-1 text-xs tabular-nums text-white/90">{{ fmt(current) }} / {{ fmt(duration) }}</span>

        <div class="flex-1" />

        <!-- Chat luong (giong VTC Play): banh rang + menu popup -->
        <div v-if="levels.length > 1" class="relative">
          <button type="button" class="ctrl-btn" title="Chất lượng" @click.stop="qOpen = !qOpen">
            <i class="pi pi-cog" />
          </button>
          <div
            v-if="qOpen"
            class="absolute bottom-full right-0 mb-2 w-36 overflow-hidden rounded-lg bg-black/95 py-1 shadow-2xl"
            @click.stop
          >
            <button
              type="button"
              class="q-item"
              :class="{ 'font-bold text-amber-400': manualLevel === -1 }"
              @click="setQuality(-1)"
            >
              Tự động
              <i v-if="manualLevel === -1" class="pi pi-check !text-xs" />
            </button>
            <button
              v-for="lv in levels"
              :key="lv.index"
              type="button"
              class="q-item"
              :class="{ 'font-bold text-amber-400': manualLevel === lv.index }"
              @click="setQuality(lv.index)"
            >
              {{ lv.height }}p
              <i v-if="manualLevel === lv.index" class="pi pi-check !text-xs" />
            </button>
          </div>
        </div>

        <button v-if="canPip" type="button" class="ctrl-btn" title="Ảnh trong ảnh" @click="togglePip">
          <i class="pi pi-clone" />
        </button>
        <button type="button" class="ctrl-btn" title="Toàn màn hình" @click="toggleFs">
          <i :class="isFs ? 'pi pi-window-minimize' : 'pi pi-window-maximize'" />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import Hls from 'hls.js';

// aspect: '16/9' (mac dinh) hoac '9/16' cho short doc.
// autoplay: bam kenh la phat luon (trang truyen hinh). Trinh duyet chan
// autoplay co tieng khi khong co user activation -> tu fallback sang mute.
const props = defineProps<{ src: string; poster?: string; aspect?: string; autoplay?: boolean; background?: string }>();
const emit = defineEmits<{ (e: 'ended'): void }>();

const containerEl = ref<HTMLElement | null>(null);
const videoEl = ref<HTMLVideoElement | null>(null);
const progressEl = ref<HTMLElement | null>(null);

const loading = ref(true);
const playing = ref(false);
// Loi phat (hls.js): hien len UI de chan doan (VD CORS segment, playlist loi).
const playError = ref<string | null>(null);
const current = ref(0);
const duration = ref(0);
const volume = ref(1);
const muted = ref(false);
const isFs = ref(false);
const canPip = ref(false);
const controlsVisible = ref(true);
let hideTimer: ReturnType<typeof setTimeout> | undefined;
let scrubbing = false;

// Chat luong (hls.js): -1 = Tu dong (ABR).
const hlsRef = ref<Hls | null>(null);
const levels = ref<Array<{ index: number; height: number }>>([]);
const manualLevel = ref(-1);
const qOpen = ref(false);

const progressPct = computed(() => (duration.value > 0 ? (current.value / duration.value) * 100 : 0));

function fmt(s: number): string {
  const t = Math.max(0, Math.floor(s || 0));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = t % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? h + ':' : ''}${mm}:${String(sec).padStart(2, '0')}`;
}

function currentTime(): number {
  return videoEl.value ? Math.floor(videoEl.value.currentTime) : 0;
}
defineExpose({ currentTime, videoEl });

function togglePlay() {
  const v = videoEl.value;
  if (!v) return;
  if (v.paused) v.play().catch(() => {});
  else v.pause();
}
// Tu phat ngay khi co the (autoplay). Thu co tieng truoc — click chon kenh
// la user activation nen thuong duoc phep; neu bi chan thi phat mute.
function tryAutoplay() {
  const v = videoEl.value;
  if (!v || !props.autoplay || !v.paused) return;
  v.play()
    .then(() => {
      muted.value = v.muted;
    })
    .catch(() => {
      v.muted = true;
      muted.value = true;
      v.play().catch(() => {});
    });
}
function skip(sec: number) {
  const v = videoEl.value;
  if (v && isFinite(v.duration)) v.currentTime = Math.min(Math.max(0, v.currentTime + sec), v.duration);
}
function toggleMute() {
  const v = videoEl.value;
  if (!v) return;
  v.muted = !v.muted;
  if (!v.muted && v.volume === 0) v.volume = 0.5;
}
function onVolumeInput() {
  const v = videoEl.value;
  if (!v) return;
  v.volume = volume.value;
  v.muted = volume.value === 0;
}
function toggleFs() {
  const el = containerEl.value;
  if (!el) return;
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else el.requestFullscreen().catch(() => {});
}
function togglePip() {
  const v = videoEl.value as any;
  if (!v) return;
  if (document.pictureInPictureElement) (document as any).exitPictureInPicture().catch(() => {});
  else if (v.requestPictureInPicture) v.requestPictureInPicture().catch(() => {});
}

// Tua: click + keo tren thanh progress.
function seekFromEvent(e: PointerEvent) {
  const bar = progressEl.value;
  const v = videoEl.value;
  if (!bar || !v || !isFinite(v.duration) || v.duration <= 0) return;
  const r = bar.getBoundingClientRect();
  const ratio = Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1);
  v.currentTime = ratio * v.duration;
}
function startScrub(e: PointerEvent) {
  scrubbing = true;
  seekFromEvent(e);
  const move = (ev: PointerEvent) => scrubbing && seekFromEvent(ev);
  const up = () => {
    scrubbing = false;
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

// An/hien thanh dieu khien.
function pokeControls() {
  controlsVisible.value = true;
  qOpen.value = false;
  clearTimeout(hideTimer);
  if (playing.value) {
    hideTimer = setTimeout(() => {
      controlsVisible.value = false;
    }, 2800);
  }
}
function hideOnLeave() {
  if (playing.value && !scrubbing) {
    clearTimeout(hideTimer);
    controlsVisible.value = false;
  }
}

// Chat luong.
function setQuality(i: number) {
  manualLevel.value = i;
  const hls = hlsRef.value;
  if (hls) hls.currentLevel = i; // -1 = ABR tu dong
  qOpen.value = false;
}

// Su kien video.
function onPlaying() {
  loading.value = false;
  playing.value = true;
  pokeControls();
}
function onPause() {
  playing.value = false;
  controlsVisible.value = true;
  clearTimeout(hideTimer);
}
function onEnded() {
  playing.value = false;
  controlsVisible.value = true;
  emit('ended');
}
function onTimeUpdate() {
  if (!scrubbing && videoEl.value) current.value = videoEl.value.currentTime;
}
function onLoadedMeta() {
  if (videoEl.value && isFinite(videoEl.value.duration)) duration.value = videoEl.value.duration;
}
function onVolumeChange() {
  const v = videoEl.value;
  if (!v) return;
  volume.value = v.volume;
  muted.value = v.muted;
}
// Loi native (Safari): khong co handler nay thi hong la spinner quay mai
// khong bao gi. Ma MediaError: 1=aborted, 2=network, 3=decode, 4=src.
function onVideoError() {
  const code = (videoEl.value?.error as { code?: number } | null)?.code ?? 0;
  playError.value = `native/${code}`;
  loading.value = false;
}
function onDocClick() {
  qOpen.value = false;
}
function onFsChange() {
  isFs.value = !!document.fullscreenElement;
}

onMounted(() => {
  const video = videoEl.value;
  if (!video || !props.src) {
    loading.value = false;
    return;
  }
  canPip.value = typeof (video as any).requestPictureInPicture === 'function';
  // Playlist timeshift VOD co EXT-X-DISCONTINUITY ma trinh phat HLS native
  // (Safari) hay ket im lang -> uu tien hls.js khi browser ho tro MSE.
  // iOS (khong MSE) van dung native nhu cu.
  const isTimeshift = props.src.includes('timeshift.m3u8');
  const canNative = !!video.canPlayType('application/vnd.apple.mpegurl');
  if (Hls.isSupported() && (!canNative || isTimeshift)) {
    const hls = new Hls();
    hlsRef.value = hls;
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      levels.value = hls.levels
        .map((l, i) => ({ index: i, height: l.height || 0 }))
        .filter((l) => l.height > 0)
        .sort((a, b) => b.height - a.height);
      tryAutoplay();
    });
    hls.on(Hls.Events.ERROR, (_ev, data) => {
      if (!data?.fatal) return;
      playError.value = `${data.type}/${data.details}`;
      loading.value = false;
    });
    hls.loadSource(props.src);
    hls.attachMedia(video);
  } else if (canNative) {
    video.src = props.src; // Safari: HLS native (khong co chon muc)
    if (props.autoplay) video.addEventListener('canplay', tryAutoplay, { once: true });
  } else {
    loading.value = false;
  }
  document.addEventListener('click', onDocClick);
  document.addEventListener('fullscreenchange', onFsChange);
});

onUnmounted(() => {
  clearTimeout(hideTimer);
  document.removeEventListener('click', onDocClick);
  document.removeEventListener('fullscreenchange', onFsChange);
  hlsRef.value?.destroy();
  hlsRef.value = null;
});
</script>

<style scoped>
.ctrl-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: 0.5rem;
  color: #fff;
  transition: background-color 0.15s;
}
.ctrl-btn:hover {
  background-color: rgba(255, 255, 255, 0.15);
}
.ctrl-btn :deep(i) {
  font-size: 0.95rem;
}
.q-item {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.9rem;
  font-size: 0.8rem;
  color: #fff;
  text-align: left;
  transition: background-color 0.15s;
}
.q-item:hover {
  background-color: rgba(255, 255, 255, 0.1);
}
</style>
