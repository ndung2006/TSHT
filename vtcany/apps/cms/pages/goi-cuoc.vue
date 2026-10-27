<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center justify-between">
      <p class="text-sm text-neutral-400">Tổng: {{ meta.total }} gói cước</p>
      <Button v-if="can('catalog:write')" label="Thêm gói cước" icon="pi pi-plus" @click="openAdd" />
    </div>

    <div class="surface-card p-4">
      <DataTable :value="items" :loading="loading" paginator :rows="20" :total-records="meta.total"
        lazy :first="(meta.page - 1) * meta.limit" @page="onPage" size="small">
        <Column field="name" header="Tên gói" />
        <Column header="Hiển thị" style="width:8rem">
          <template #body="{ data }"><Tag :value="data.isVisible ? 'Bật' : 'Tắt'" :severity="sevVisible(data.isVisible)" /></template>
        </Column>
        <Column field="createdAt" header="Ngày tạo">
          <template #body="{ data }">{{ fmtDate(data.createdAt) }}</template>
        </Column>
        <Column header="Thao tác" style="min-width:10rem">
          <template #body="{ data }">
            <Button v-if="can('catalog:write')" label="Sửa" size="small" text @click="openEdit(data)" />
            <Button v-if="can('catalog:write')" label="Xóa" size="small" text severity="danger" @click="confirmDelete(confirm, data.id, data.name)" />
          </template>
        </Column>
      </DataTable>
    </div>

    <Dialog v-model:visible="dlg" modal :header="editing ? 'Sửa gói cước' : 'Thêm gói cước'" class="w-full max-w-md">
      <div class="flex flex-col gap-3">
        <div><label class="field-label">Tên gói *</label><InputText v-model="form.name" class="w-full" /></div>
        <div class="flex items-center gap-2"><Checkbox v-model="form.isVisible" binary input-id="plv" /><label for="plv">Hiển thị</label></div>
      </div>
      <template #footer>
        <Button label="Hủy" text @click="dlg = false" />
        <Button :label="editing ? 'Lưu' : 'Tạo'" :loading="saving" @click="save" :disabled="!form.name.trim()" />
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'auth' });
useHead({ title: 'Gói cước - VTC ANY CMS' });

const { can } = useCmsAuth();
const confirm = useConfirm();
const { items, meta, loading, load, onPage, saveItem, confirmDelete } = useCatalog('plans');

const dlg = ref(false);
const editing = ref<any>(null);
const saving = ref(false);
const form = ref({ name: '', isVisible: true });

function openAdd() { editing.value = null; form.value = { name: '', isVisible: true }; dlg.value = true; }
function openEdit(p: any) {
  editing.value = p;
  form.value = { name: p.name || '', isVisible: p.isVisible !== false };
  dlg.value = true;
}
async function save() {
  saving.value = true;
  const ok = await saveItem(editing.value?.id || null, { ...form.value }, 'Đã lưu gói cước');
  saving.value = false;
  if (ok) { dlg.value = false; load(); }
}
onMounted(load);
</script>
