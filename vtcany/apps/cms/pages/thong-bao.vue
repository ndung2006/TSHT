<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center justify-between">
      <p class="text-sm text-neutral-400">Tổng: {{ meta.total }} thông báo</p>
      <Button v-if="can('catalog:write')" label="Tạo thông báo" icon="pi pi-plus" @click="openAdd" />
    </div>

    <div class="surface-card p-4">
      <DataTable :value="items" :loading="loading" paginator :rows="20" :total-records="meta.total"
        lazy :first="(meta.page - 1) * meta.limit" @page="onPage" size="small">
        <Column field="title" header="Tiêu đề" />
        <Column field="target" header="Đối tượng" />
        <Column field="body" header="Nội dung">
          <template #body="{ data }"><span class="line-clamp-2 text-xs text-neutral-400">{{ data.body }}</span></template>
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

    <Dialog v-model:visible="dlg" modal :header="editing ? 'Sửa thông báo' : 'Tạo thông báo'" class="w-full max-w-lg">
      <div class="flex flex-col gap-3">
        <div><label class="field-label">Tiêu đề *</label><InputText v-model="form.title" class="w-full" /></div>
        <div><label class="field-label">Nội dung</label><Textarea v-model="form.body" rows="4" class="w-full" /></div>
        <div>
          <label class="field-label">Đối tượng</label>
          <Dropdown v-model="form.target" :options="targets" option-label="label" option-value="value" class="w-full" editable />
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
useHead({ title: 'Thông báo - VTC ANY CMS' });

const { can } = useCmsAuth();
const confirm = useConfirm();
const { items, meta, loading, load, onPage, saveItem, confirmDelete } = useCatalog('notifications');

const targets = [
  { label: 'Tất cả người dùng', value: 'all' },
  { label: 'Người dùng gói trả phí', value: 'paid' },
  { label: 'Người dùng miễn phí', value: 'free' },
];

const dlg = ref(false);
const editing = ref<any>(null);
const saving = ref(false);
const form = ref({ title: '', body: '', target: 'all' });

function openAdd() { editing.value = null; form.value = { title: '', body: '', target: 'all' }; dlg.value = true; }
function openEdit(n: any) {
  editing.value = n;
  form.value = { title: n.title || '', body: n.body || '', target: n.target || 'all' };
  dlg.value = true;
}
async function save() {
  saving.value = true;
  const ok = await saveItem(editing.value?.id || null, { ...form.value }, 'Đã lưu thông báo');
  saving.value = false;
  if (ok) { dlg.value = false; load(); }
}
onMounted(load);
</script>
