<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center justify-between">
      <p class="text-sm text-neutral-400">Tổng: {{ meta.total }} thể loại</p>
      <Button v-if="can('catalog:write')" label="Thêm thể loại" icon="pi pi-plus" @click="openAdd" />
    </div>

    <div class="surface-card p-4">
      <DataTable :value="items" :loading="loading" paginator :rows="20" :total-records="meta.total"
        lazy :first="(meta.page - 1) * meta.limit" @page="onPage" size="small">
        <Column field="title" header="Tiêu đề" />
        <Column header="Hiển thị" style="width:10rem">
          <template #body="{ data }">
            <InputSwitch :model-value="data.isVisible !== false"
              @update:model-value="(v: boolean) => toggleVisible(data, v)" :disabled="!can('catalog:write')" />
          </template>
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

    <Dialog v-model:visible="dlg" modal :header="editing ? 'Sửa thể loại' : 'Thêm thể loại'" class="w-full max-w-md">
      <div class="flex flex-col gap-3">
        <div><label class="field-label">Tiêu đề *</label><InputText v-model="form.title" class="w-full" /></div>
        <div class="flex items-center gap-2"><Checkbox v-model="form.isVisible" binary input-id="gv" /><label for="gv">Hiển thị</label></div>
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
useHead({ title: 'Thể loại - VTC ANY CMS' });

const { can } = useCmsAuth();
const confirm = useConfirm();
const { api, toast, items, meta, loading, load, onPage, saveItem, confirmDelete } = useCatalog('genres');

const dlg = ref(false);
const editing = ref<any>(null);
const saving = ref(false);
const form = ref({ title: '', isVisible: true });

function openAdd() { editing.value = null; form.value = { title: '', isVisible: true }; dlg.value = true; }
function openEdit(g: any) {
  editing.value = g;
  form.value = { title: g.title || '', isVisible: g.isVisible !== false };
  dlg.value = true;
}
async function save() {
  saving.value = true;
  const ok = await saveItem(editing.value?.id || null, { ...form.value }, 'Đã lưu thể loại');
  saving.value = false;
  if (ok) { dlg.value = false; load(); }
}
async function toggleVisible(g: any, v: boolean) {
  try {
    await api.patch(`/admin/catalog/genres/${g.id}`, { isVisible: v });
    g.isVisible = v;
    toast.add({ severity: 'success', summary: 'Xong', detail: v ? 'Đã bật hiển thị' : 'Đã tắt hiển thị', life: 2000 });
  } catch {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: 'Không đổi được trạng thái', life: 3000 });
  }
}
onMounted(load);
</script>
