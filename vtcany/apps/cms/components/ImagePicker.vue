<template>
  <div>
    <!-- Khung xem truoc (an khi compact) -->
    <div v-if="!compact" :class="['bg-neutral-100 dark:bg-neutral-800 rounded-lg overflow-hidden flex items-center justify-center relative', aspectClass]">
      <img v-if="url" :src="url" :class="['absolute inset-0 w-full h-full', fit === 'contain' ? 'object-contain bg-white' : 'object-cover']" alt="anh" />
      <span v-else class="text-xs text-neutral-400 px-2 text-center">Chưa có ảnh<br />({{ ratioLabel }})</span>
      <span v-if="url" class="absolute right-1.5 top-1.5 flex gap-1.5">
        <button type="button" title="Đổi ảnh"
          class="flex h-8 w-8 items-center justify-center rounded-full border border-white/70 bg-black/30 text-green-400 backdrop-blur transition hover:bg-black/50"
          @click.stop="fileEl?.click()">
          <i class="pi pi-pencil text-xs"></i>
        </button>
        <button type="button" title="Xoá ảnh"
          class="flex h-8 w-8 items-center justify-center rounded-full border border-white/70 bg-black/30 text-red-400 backdrop-blur transition hover:bg-black/50"
          @click.stop="url = ''">
          <i class="pi pi-trash text-xs"></i>
        </button>
      </span>
    </div>

    <div class="flex items-center gap-2" :class="{ 'mt-2': !compact }">
      <InputText v-model="url" class="flex-1 min-w-0" placeholder="URL ảnh" />
      <Button icon="pi pi-cloud-upload" severity="secondary" :loading="busy" v-tooltip.top="'Tải ảnh mới lên'" @click="fileEl?.click()" />
      <Button icon="pi pi-images" severity="secondary" v-tooltip.top="'Chọn từ thư viện ảnh'" @click="openLib" />
      <Button v-if="compact && url" icon="pi pi-trash" severity="danger" text v-tooltip.top="'Xoá ảnh'" @click="url = ''" />
    </div>
    <input ref="fileEl" type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" class="hidden" @change="onFile" />
    <p v-if="msg" class="text-xs mt-1" :class="msgError ? 'text-red-400' : 'text-emerald-400'">{{ msg }}</p>

    <!-- Thu vien anh da tai len -->
    <Dialog v-model:visible="libDlg" modal header="Thư viện ảnh" class="w-[95vw] max-w-3xl">
      <div v-if="loadingLib" class="text-sm text-neutral-400">Đang tải...</div>
      <div v-else-if="!lib.length" class="text-sm text-neutral-400">Chưa có ảnh nào. Hãy tải ảnh mới lên trước.</div>
      <div v-else class="grid grid-cols-3 sm:grid-cols-4 gap-3 max-h-[60dvh] overflow-y-auto pr-1">
        <button v-for="im in lib" :key="im.id" type="button" class="text-left group" @click="pick(im)">
          <span class="block aspect-square rounded-lg overflow-hidden bg-neutral-800">
            <img :src="im.url" class="w-full h-full object-cover" :alt="im.filename" loading="lazy" />
          </span>
          <span class="block text-[11px] text-neutral-400 truncate mt-1 group-hover:text-neutral-200">{{ im.filename }}</span>
        </button>
      </div>
      <template #footer>
        <Button label="Đóng" text @click="libDlg = false" />
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ modelValue: string; ratio?: string; fit?: string; compact?: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [v: string] }>();
const api = useApi();

const url = ref(props.modelValue || '');
watch(() => props.modelValue, (v) => { if ((v || '') !== url.value) url.value = v || ''; });
watch(url, (v) => { if (v !== props.modelValue) emit('update:modelValue', v); });

const aspectClass = computed(() => ({ '9/16': 'aspect-[9/16]', '16/9': 'aspect-video', '2/3': 'aspect-[2/3]' } as Record<string, string>)[props.ratio || '16/9']);
const ratioLabel = computed(() => `tỉ lệ ${props.ratio || '16:9'}`);

const fileEl = ref<HTMLInputElement | null>(null);
const busy = ref(false);
const msg = ref('');
const msgError = ref(false);
function note(m: string, isErr: boolean) { msg.value = m; msgError.value = isErr; }

async function onFile(e: Event) {
  const input = e.target as HTMLInputElement;
  const f = input.files?.[0];
  input.value = '';
  if (!f) return;
  if (!f.type.startsWith('image/')) { note('Chỉ chấp nhận file ảnh.', true); return; }
  if (f.size > 10 * 1024 * 1024) { note('Ảnh vượt quá 10MB.', true); return; }
  busy.value = true;
  note('', false);
  try {
    const res = await api.put<any>('/uploads/image', f, { 'Content-Type': f.type, 'x-file-name': encodeURIComponent(f.name) });
    url.value = res.url;
    note('Đã tải ảnh lên.', false);
    libLoaded.value = false;
  } catch (err: any) {
    note(`Tải ảnh lỗi: ${err?.data?.error || err?.message || 'thử lại'}`, true);
  } finally {
    busy.value = false;
  }
}

const libDlg = ref(false);
const lib = ref<any[]>([]);
const loadingLib = ref(false);
const libLoaded = ref(false);
async function openLib() {
  libDlg.value = true;
  if (libLoaded.value) return;
  loadingLib.value = true;
  try {
    const r = await api.get<any>('/uploads/images');
    lib.value = r.data || [];
    libLoaded.value = true;
  } catch {
    lib.value = [];
  } finally {
    loadingLib.value = false;
  }
}
function pick(im: any) {
  url.value = im.url;
  libDlg.value = false;
}
</script>
