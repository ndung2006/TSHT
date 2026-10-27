<template>
  <div class="flex flex-col gap-3">
    <div class="flex items-center gap-3">
      <input ref="fileInput" type="file" accept="video/*" class="hidden" @change="onPick" />
      <Button label="Chọn file video" icon="pi pi-upload" severity="secondary" :disabled="busy" @click="fileInput?.click()" />
      <span class="text-sm text-neutral-400">{{ fileName || 'Tối đa 10GB, định dạng video/*' }}</span>
    </div>
    <ProgressBar v-if="busy || progress > 0" :value="progress" class="h-2" />
    <p v-if="phase" class="text-sm" :class="phaseClass">{{ phase }}</p>
    <Button v-if="file && !busy && !uploadId" label="Bắt đầu upload" icon="pi pi-cloud-upload" @click="start" />
    <Button v-if="uploadId && doneVideoId" label="Dùng cho video này" icon="pi pi-check" severity="success" size="small" @click="$emit('uploaded', doneVideoId)" />
  </div>
</template>

<script setup lang="ts">
const emit = defineEmits<{ uploaded: [videoId: string]; done: [uploadId: string]; attached: [uploadId: string] }>();
const props = defineProps<{ videoId?: string }>();

const api = useApi();
const fileInput = ref<HTMLInputElement | null>(null);
const file = ref<File | null>(null);
const fileName = ref('');
const busy = ref(false);
const progress = ref(0);
const phase = ref('');
const phaseClass = ref('text-neutral-400');
const uploadId = ref('');
const doneVideoId = ref('');
const CHUNK = 5 * 1024 * 1024;
const MAX = 10 * 1024 * 1024 * 1024; // 10GB — khop MAX_FILE_BYTES backend

function onPick(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (!f) return;
  if (!f.type.startsWith('video/')) { setPhase('Chỉ chấp nhận file video.', 'text-red-400'); return; }
  if (f.size > MAX) { setPhase('File vượt quá 10GB.', 'text-red-400'); return; }
  file.value = f;
  fileName.value = `${f.name} (${(f.size / 1048576).toFixed(1)}MB)`;
  setPhase('Đã chọn file, nhấn "Bắt đầu upload".', 'text-neutral-400');
}
function setPhase(msg: string, cls: string) { phase.value = msg; phaseClass.value = cls; }

async function start() {
  if (!file.value) return;
  busy.value = true; progress.value = 0;
  try {
    setPhase('Khởi tạo upload...', 'text-neutral-400');
    const init = await api.post<any>('/uploads/init', {
      filename: file.value.name,
      sizeBytes: file.value.size,
      contentType: file.value.type || 'video/mp4',
      videoId: props.videoId || undefined,
    });
    uploadId.value = init.id;
    const total = Math.ceil(file.value.size / CHUNK);
    for (let n = 0; n < total; n++) {
      setPhase(`Đang upload chunk ${n + 1}/${total}...`, 'text-neutral-400');
      const blob = file.value.slice(n * CHUNK, (n + 1) * CHUNK);
      await api.put(`/storage-local/raw/${init.id}/chunks/${n}`, blob, { 'Content-Type': 'application/octet-stream' });
      progress.value = Math.round(((n + 1) / total) * 90);
    }
    setPhase('Hoàn tất upload, chờ transcode...', 'text-amber-300');
    await api.post(`/uploads/${init.id}/complete`);
    progress.value = 95;
    // Bao ngay uploadId cho form cha: gan file vao ban ghi du transcode chua xong,
    // de nguoi dung luu som van khong mat video (phat duoc khi transcode xong).
    emit('attached', init.id);
    setPhase('Đã tải lên xong — có thể lưu ngay, video phát được khi transcode xong.', 'text-amber-300');
    await poll(init.id);
  } catch (e: any) {
    setPhase(`Lỗi: ${e?.response?.data?.error || e?.message || 'upload thất bại'}`, 'text-red-400');
    busy.value = false;
  }
}

async function poll(id: string) {
  for (;;) {
    await new Promise((r) => setTimeout(r, 3000));
    try {
      const s = await api.get<any>(`/uploads/${id}`);
      if (s.status === 'done') {
        progress.value = 100;
        doneVideoId.value = s.videoId || '';
        emit('done', id);
        setPhase('Transcode xong, video đã sẵn sàng.', 'text-emerald-400');
        busy.value = false;
        return;
      }
      if (s.status === 'error') {
        setPhase('Transcode lỗi, kiểm tra worker.', 'text-red-400');
        busy.value = false;
        return;
      }
      if (typeof s.progress === 'number') {
        progress.value = s.progress;
        setPhase(`Đang transcode... ${s.progress}%`, 'text-amber-300');
      } else {
        setPhase(`Đang xử lý (${s.status})...`, 'text-amber-300');
      }
    } catch {
      setPhase('Mất kết nối khi kiểm tra trạng thái.', 'text-red-400');
      busy.value = false;
      return;
    }
  }
}
</script>
