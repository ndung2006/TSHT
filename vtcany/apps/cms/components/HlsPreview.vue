<template>
  <div class="relative h-full w-full bg-black">
    <video ref="videoEl" class="h-full w-full" controls playsinline crossorigin="anonymous" :poster="poster" />
  </div>
</template>

<script setup lang="ts">
import Hls from 'hls.js';

// Player xem truoc HLS trong CMS (dung chung Short/Video/Tap phim).
const props = defineProps<{ src: string; poster?: string }>();
const videoEl = ref<HTMLVideoElement | null>(null);
let hls: Hls | null = null;

function attach() {
  const video = videoEl.value;
  if (!video || !props.src) return;
  detach();
  if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = props.src; // Safari: HLS native
  } else if (Hls.isSupported()) {
    hls = new Hls();
    hls.loadSource(props.src);
    hls.attachMedia(video);
  }
}

function detach() {
  hls?.destroy();
  hls = null;
}

// Chup khung hinh hien tai lam thumbnail (CMS tai len /uploads/image sau).
// Tra null khi video chua du du lieu (chua phat/duoc frame nao).
async function captureFrame(): Promise<Blob | null> {
  const v = videoEl.value;
  if (!v || v.readyState < 2 || !v.videoWidth || !v.videoHeight) return null;
  const canvas = document.createElement('canvas');
  canvas.width = v.videoWidth;
  canvas.height = v.videoHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.85));
}

defineExpose({ captureFrame });

onMounted(attach);
watch(() => props.src, attach);
onUnmounted(detach);
</script>
