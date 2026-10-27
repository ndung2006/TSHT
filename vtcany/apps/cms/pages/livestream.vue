<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center justify-between">
      <p class="text-sm text-neutral-400">Tổng: {{ meta.total }} livestream</p>
      <Button v-if="can('catalog:write')" label="Thêm livestream" icon="pi pi-plus" @click="openAdd" />
    </div>

    <div class="surface-card p-4">
      <DataTable :value="items" :loading="loading" paginator :rows="20" :total-records="meta.total"
        lazy :first="(meta.page - 1) * meta.limit" @page="onPage" size="small">
        <Column field="title" header="Tiêu đề" />
        <Column header="Trạng thái" style="width:10rem">
          <template #body="{ data }"><Tag :value="statusLabel(data.status)" :severity="statusSev(data.status)" /></template>
        </Column>
        <Column header="Lịch phát">
          <template #body="{ data }">{{ fmtDate(data.scheduledAt) }}</template>
        </Column>
        <Column field="createdAt" header="Ngày tạo">
          <template #body="{ data }">{{ fmtDate(data.createdAt) }}</template>
        </Column>
        <Column header="Thao tác" style="min-width:10rem">
          <template #body="{ data }">
            <Button v-if="can('catalog:write')" label="Sửa" size="small" text @click="openEdit(data)" />
            <Button v-if="can('catalog:write')" label="Xóa" size="small" text severity="danger" @click="confirmDelete(confirm, data.id, data.title)" />
          </template>
        </Column>
      </DataTable>
    </div>

    <Dialog v-model:visible="dlg" modal :header="editing ? 'Sửa livestream' : 'Thêm livestream'" class="w-full max-w-lg">
      <div class="flex flex-col gap-3">
        <div><label class="field-label">Tiêu đề *</label><InputText v-model="form.title" class="w-full" /></div>
        <div><label class="field-label">Stream URL</label><InputText v-model="form.streamUrl" class="w-full" placeholder="https://.../live.m3u8" /></div>
        <div><label class="field-label">Thumbnail (URL)</label><InputText v-model="form.thumbnail" class="w-full" /></div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="field-label">Trạng thái</label>
            <Dropdown v-model="form.status" :options="statuses" option-label="label" option-value="value" class="w-full" />
          </div>
          <div><label class="field-label">Lịch phát</label><Calendar v-model="form.scheduledAt" date-format="yy-mm-dd" show-time hour-format="24" show-icon class="w-full" /></div>
        </div>
      </div>
      <template #footer>
        <Button label="Hủy" text @click="dlg = false" />
        <Button :label="editing ? 'Lưu' : 'Tạo'" :loading="saving" @click="save" :disabled="!form.title.trim()" />
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'auth' });
useHead({ title: 'Livestream - VTC ANY CMS' });

const { can } = useCmsAuth();
const confirm = useConfirm();
const { items, meta, loading, load, onPage, saveItem, confirmDelete } = useCatalog('livestreams');

const statuses = [
  { label: 'Đã lên lịch', value: 'scheduled' },
  { label: 'Đang phát', value: 'live' },
  { label: 'Đã kết thúc', value: 'ended' },
];

const dlg = ref(false);
const editing = ref<any>(null);
const saving = ref(false);
const form = ref({ title: '', streamUrl: '', thumbnail: '', status: 'scheduled', scheduledAt: null as any });

function statusLabel(s: string) { return statuses.find((x) => x.value === s)?.label || s || '—'; }
function statusSev(s: string) { return { scheduled: 'info', live: 'danger', ended: 'secondary' }[s] || 'secondary'; }
function toIso(d: any) { return d instanceof Date && !isNaN(d.getTime()) ? d.toISOString() : (d || ''); }
function openAdd() { editing.value = null; form.value = { title: '', streamUrl: '', thumbnail: '', status: 'scheduled', scheduledAt: null }; dlg.value = true; }
function openEdit(l: any) {
  editing.value = l;
  form.value = { title: l.title || '', streamUrl: l.streamUrl || '', thumbnail: l.thumbnail || '', status: l.status || 'scheduled', scheduledAt: l.scheduledAt ? new Date(l.scheduledAt) : null };
  dlg.value = true;
}
async function save() {
  saving.value = true;
  const ok = await saveItem(editing.value?.id || null, { ...form.value, scheduledAt: toIso(form.value.scheduledAt) }, 'Đã lưu livestream');
  saving.value = false;
  if (ok) { dlg.value = false; load(); }
}
onMounted(load);
</script>
