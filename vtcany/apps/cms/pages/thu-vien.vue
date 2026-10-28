<template>
  <div class="flex flex-col gap-4">
    <div class="surface-card p-4 flex flex-wrap gap-2">
      <Dropdown v-model="kind" :options="kindOptions" option-label="label" option-value="value" class="w-44" @change="load(1)" />
      <InputText v-model="q" placeholder="Tìm tên file..." class="flex-1 min-w-52" @keyup.enter="load(1)" />
      <Button label="Tìm" size="small" @click="load(1)" />
    </div>

    <p class="text-sm text-neutral-400">Tổng: {{ meta.total }} tập tin — ảnh, video, audio dùng chung cho cả tòa soạn (ảnh bìa, ảnh trong bài, tư liệu). Trang "Tập tin" (video VOD) vẫn hoạt động riêng.</p>

    <div v-if="loading" class="text-sm text-neutral-400">Đang tải...</div>
    <div v-else-if="!items.length" class="text-sm text-neutral-400">Chưa có tập tin nào khớp bộ lọc.</div>
    <div v-else class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      <div v-for="it in items" :key="it.id" class="surface-card p-3 flex flex-col gap-2">
        <div class="aspect-video rounded-lg overflow-hidden bg-neutral-800 flex items-center justify-center">
          <img v-if="it.kind === 'image' && it.url" :src="resolveMedia(it.url)" class="w-full h-full object-cover" :alt="it.filename" loading="lazy" />
          <img v-else-if="it.kind === 'video' && it.posterUrl" :src="resolveMedia(it.posterUrl)" class="w-full h-full object-cover" :alt="it.filename" loading="lazy" />
          <i v-else :class="['pi text-3xl text-neutral-500', it.kind === 'video' ? 'pi-play' : 'pi-volume-up']"></i>
        </div>
        <p class="text-xs truncate" :title="it.filename">{{ it.filename }}</p>
        <div class="flex items-center gap-2">
          <Tag :value="kindLabel(it.kind)" severity="secondary" />
          <Tag v-if="it.status" :value="it.status" :severity="it.status === 'done' ? 'success' : 'warn'" />
        </div>
        <p class="text-[11px] text-neutral-500">{{ fmtSize(it.sizeBytes) }} · {{ fmtDate(it.createdAt) }}</p>
        <Button v-if="it.url || it.posterUrl" label="Sao chép URL" icon="pi pi-copy" size="small" text @click="copyUrl(resolveMedia(it.url || it.posterUrl))" />
        <Button v-if="can('catalog:delete')" label="Xóa" icon="pi pi-trash" size="small" text severity="danger" @click="removeItem(it)" />
      </div>
    </div>

    <div class="flex items-center justify-between">
      <span class="text-xs text-neutral-400">Trang {{ meta.page }} — tổng {{ meta.total }}</span>
      <span class="flex gap-2">
        <Button label="Trước" size="small" text :disabled="meta.page <= 1" @click="load(meta.page - 1)" />
        <Button label="Sau" size="small" text :disabled="meta.page * meta.limit >= meta.total" @click="load(meta.page + 1)" />
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'auth' });
useHead({ title: 'Thư viện - VTC ANY CMS' });

const { can } = useCmsAuth();
const api = useApi();
const toast = useToast();

const kindOptions = [
  { label: 'Tất cả', value: '' },
  { label: 'Ảnh', value: 'image' },
  { label: 'Video', value: 'video' },
  { label: 'Audio', value: 'audio' },
];
function kindLabel(k: string) {
  return kindOptions.find((o) => o.value === k)?.label || k;
}

const items = ref<any[]>([]);
const meta = ref({ total: 0, page: 1, limit: 20 });
const loading = ref(false);
const kind = ref('');
const q = ref('');

function resolveMedia(u: string) {
  if (!u) return '';
  if (/^(https?:)?\/\//.test(u) || u.startsWith('data:')) return u;
  if (!u.startsWith('/')) return u;
  try { return new URL(useRuntimeConfig().public.apiBase as string).origin + u; } catch { return u; }
}
function fmtSize(n: number) {
  if (!n) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
function fmtDate(ms: number) {
  if (!ms) return '—';
  try { return new Date(ms).toISOString().slice(0, 16).replace('T', ' '); } catch { return '—'; }
}
async function copyUrl(u: string) {
  try { await navigator.clipboard.writeText(u); toast.add({ severity: 'success', summary: 'Đã sao chép URL', life: 2000 }); }
  catch { toast.add({ severity: 'warn', summary: u, life: 3000 }); }
}
async function removeItem(it: any) {
  // Xoa theo id (khong theo ten hien thi: ten trung nhau giua cac ban ghi).
  // useApi chi co del, khong co delete — dung api.del nhu cac nut Xoa khac.
  if (!window.confirm(`Xóa tập tin "${it.filename}" khỏi thư viện?`)) return;
  try {
    await api.del(`/admin/media/${it.id}`);
    toast.add({ severity: 'success', summary: 'Đã xóa tập tin', life: 2500 });
    load(meta.value.page);
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.response?.data?.message || e?.message || 'Xóa thất bại', life: 3000 });
  }
}
async function load(page = 1) {
  loading.value = true;
  try {
    const r = await api.get<any>('/admin/media', {
      kind: kind.value || undefined, q: q.value || undefined, page, limit: meta.value.limit,
    });
    items.value = r.data || [];
    meta.value = { total: r.total || 0, page: r.page || 1, limit: r.limit || 20 };
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.response?.data?.message || e?.message || 'Không tải được thư viện', life: 3000 });
  } finally { loading.value = false; }
}
load(1);
</script>
