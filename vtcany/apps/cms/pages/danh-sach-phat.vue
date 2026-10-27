<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center justify-between">
      <p class="text-sm text-neutral-400">Tổng: {{ meta.total }} danh sách phát</p>
      <Button v-if="can('catalog:write')" label="Thêm danh sách" icon="pi pi-plus" @click="openAdd" />
    </div>

    <div class="surface-card p-4">
      <DataTable :value="items" :loading="loading" paginator :rows="20" :total-records="meta.total"
        lazy :first="(meta.page - 1) * meta.limit" @page="onPage" size="small">
        <Column field="title" header="Tiêu đề" />
        <Column header="Số mục">
          <template #body="{ data }">{{ (data.itemIds || []).length }}</template>
        </Column>
        <Column header="Hiển thị" style="width:8rem">
          <template #body="{ data }"><Tag :value="data.isVisible ? 'Bật' : 'Tắt'" :severity="sevVisible(data.isVisible)" /></template>
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

    <Dialog v-model:visible="dlg" modal :header="editing ? 'Sửa danh sách phát' : 'Thêm danh sách phát'" class="w-full max-w-lg">
      <div class="flex flex-col gap-3">
        <div><label class="field-label">Tiêu đề *</label><InputText v-model="form.title" class="w-full" /></div>
        <div><label class="field-label">Mô tả</label><Textarea v-model="form.description" rows="3" class="w-full" /></div>
        <div>
          <label class="field-label">Danh sách ID nội dung (cách nhau dấu phẩy)</label>
          <InputText v-model="form.itemIdsText" class="w-full" placeholder="vd: m1, m2, v3" />
        </div>
        <div class="flex items-center gap-2"><Checkbox v-model="form.isVisible" binary input-id="pv" /><label for="pv">Hiển thị</label></div>
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
useHead({ title: 'Danh sách phát - VTC ANY CMS' });

const { can } = useCmsAuth();
const confirm = useConfirm();
const { items, meta, loading, load, onPage, saveItem, confirmDelete } = useCatalog('playlists');

const dlg = ref(false);
const editing = ref<any>(null);
const saving = ref(false);
const form = ref({ title: '', description: '', itemIdsText: '', isVisible: true });

function openAdd() { editing.value = null; form.value = { title: '', description: '', itemIdsText: '', isVisible: true }; dlg.value = true; }
function openEdit(p: any) {
  editing.value = p;
  form.value = { title: p.title || '', description: p.description || '', itemIdsText: idsToText(p.itemIds), isVisible: p.isVisible !== false };
  dlg.value = true;
}
async function save() {
  saving.value = true;
  const ok = await saveItem(editing.value?.id || null, {
    title: form.value.title, description: form.value.description,
    itemIds: textToIds(form.value.itemIdsText), isVisible: form.value.isVisible,
  }, 'Đã lưu danh sách phát');
  saving.value = false;
  if (ok) { dlg.value = false; load(); }
}
onMounted(load);
</script>
