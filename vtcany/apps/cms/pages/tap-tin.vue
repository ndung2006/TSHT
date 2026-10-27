<template>
  <div class="flex flex-col gap-4">
    <div class="surface-card p-4">
      <h3 class="text-base font-semibold mb-1">Tải video lên (VOD tự host)</h3>
      <p class="text-sm text-neutral-400 mb-3">File được upload theo chunk, worker transcode sang HLS. Khi trạng thái là <b>done</b>, dùng ID của tập tin để gắn vào Tập phim / Video / Short rồi xuất bản.</p>
      <MediaUploader @done="onUploaded" />
      <p v-if="lastUploadId" class="text-sm mt-2">ID tập tin vừa tải: <code class="text-emerald-300">{{ lastUploadId }}</code>
        <Button label="Sao chép" icon="pi pi-copy" size="small" text @click="copyId(lastUploadId)" /></p>
    </div>

    <p class="text-sm text-neutral-400">Tổng: {{ meta.total }} tập tin</p>

    <div class="surface-card p-4">
      <DataTable :value="items" :loading="loading" paginator :rows="20" :total-records="meta.total"
        lazy :first="(meta.page - 1) * meta.limit" @page="onPage" size="small">
        <Column field="filename" header="Tên file" />
        <Column field="id" header="ID" class="text-xs" style="width:14rem" />
        <Column header="Dung lượng" style="width:9rem">
          <template #body="{ data }">{{ fmtSize(data.sizeBytes ?? data.size) }}</template>
        </Column>
        <Column field="status" header="Trạng thái upload" style="width:10rem">
          <template #body="{ data }"><Tag :value="statusLabel(data)" :severity="data.status === 'done' ? 'success' : 'warn'" /></template>
        </Column>
        <Column header="Transcode" style="width:10rem">
          <template #body="{ data }"><Tag :value="data.transcode || '—'" :severity="transcodeSev(data.transcode)" /></template>
        </Column>
        <Column field="createdAt" header="Ngày tạo">
          <template #body="{ data }">{{ fmtDate(data.createdAt) }}</template>
        </Column>
        <Column header="" style="width:5rem">
          <template #body="{ data }">
            <Button icon="pi pi-copy" size="small" text v-tooltip="'Sao chép ID'" @click="copyId(data.id)" />
          </template>
        </Column>
      </DataTable>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'auth' });
useHead({ title: 'Tập tin - VTC ANY CMS' });

const api = useApi();
const toast = useToast();
const items = ref<any[]>([]);
const meta = ref({ page: 1, limit: 20, total: 0 });
const loading = ref(true);
const lastUploadId = ref('');

function transcodeSev(t: string) {
  return { pending: 'warn', processing: 'info', done: 'success', error: 'danger' }[t] || 'secondary';
}
async function copyId(id: string) {
  try { await navigator.clipboard.writeText(id); toast.add({ severity: 'success', summary: 'Đã sao chép ID tập tin', life: 2000 }); }
  catch { toast.add({ severity: 'warn', summary: id, life: 3000 }); }
}
async function onUploaded(uploadId: string) {
  lastUploadId.value = uploadId;
  toast.add({ severity: 'success', summary: 'Transcode xong', detail: `ID: ${uploadId}`, life: 4000 });
  await load();
}
async function load() {
  loading.value = true;
  try {
    const r = await api.get<any>('/admin/catalog/files/all', { page: meta.value.page, limit: meta.value.limit });
    items.value = r.data || [];
    meta.value = { ...meta.value, ...r.meta };
  } finally { loading.value = false; }
}
function onPage(e: any) { meta.value.page = e.page + 1; load(); }

function statusLabel(d: any) {
  if (!d.status) return '—';
  return d.status === 'processing' && typeof d.progress === 'number' ? `${d.status} · ${d.progress}%` : d.status;
}

// Tu lam moi 10s khi con file dang transcode de theo doi tien do.
let refreshTimer: any = null;
onMounted(() => {
  load();
  refreshTimer = setInterval(() => {
    if (items.value.some((x: any) => x.status === 'processing' || x.status === 'uploaded')) load();
  }, 10000);
});
onUnmounted(() => { if (refreshTimer) clearInterval(refreshTimer); });
</script>
