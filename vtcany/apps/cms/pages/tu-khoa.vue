<template>
  <div class="flex flex-col gap-4">
    <div class="flex gap-2">
      <Button v-for="t in tabs" :key="t.key" :label="t.label" :icon="t.icon"
        :severity="tab === t.key ? undefined : 'secondary'" :outlined="tab !== t.key"
        @click="tab = t.key" size="small" />
    </div>

    <div class="flex items-center justify-between">
      <p class="text-sm text-neutral-400">Tổng: {{ meta.total }} {{ tab === 'keywords' ? 'từ khoá' : 'từ cấm' }}</p>
      <Button v-if="can('catalog:write')" :label="tab === 'keywords' ? 'Thêm từ khoá' : 'Thêm từ cấm'" icon="pi pi-plus" @click="openAdd" />
    </div>

    <div class="surface-card p-4">
      <DataTable :value="items" :loading="loading" paginator :rows="20" :total-records="meta.total"
        lazy :first="(meta.page - 1) * meta.limit" @page="onPage" size="small">
        <Column :field="fieldName" :header="tab === 'keywords' ? 'Từ khoá' : 'Từ cấm'" />
        <Column field="createdAt" header="Ngày tạo">
          <template #body="{ data }">{{ fmtDate(data.createdAt) }}</template>
        </Column>
        <Column header="Thao tác" style="min-width:10rem">
          <template #body="{ data }">
            <Button v-if="can('catalog:write')" label="Sửa" size="small" text @click="openEdit(data)" />
            <Button v-if="can('catalog:write')" label="Xóa" size="small" text severity="danger" @click="confirmDelete(confirm, data.id, data[fieldName])" />
          </template>
        </Column>
      </DataTable>
    </div>

    <Dialog v-model:visible="dlg" modal :header="editing ? 'Sửa' : 'Thêm mới'" class="w-full max-w-md">
      <div><label class="field-label">{{ tab === 'keywords' ? 'Từ khoá *' : 'Từ cấm *' }}</label><InputText v-model="form.value" class="w-full" /></div>
      <template #footer>
        <Button label="Hủy" text @click="dlg = false" />
        <Button :label="editing ? 'Lưu' : 'Tạo'" :loading="saving" @click="save" :disabled="!form.value.trim()" />
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'auth' });
useHead({ title: 'Từ khoá - VTC ANY CMS' });

const { can } = useCmsAuth();
const confirm = useConfirm();

const tabs = [
  { key: 'keywords', label: 'Từ khoá tìm kiếm', icon: 'pi pi-search' },
  { key: 'banned', label: 'Từ cấm', icon: 'pi pi-ban' },
];
const tab = ref('keywords');
const entity = computed(() => tab.value);
const fieldName = computed(() => (tab.value === 'keywords' ? 'keyword' : 'word'));

const { items, meta, loading, load, onPage, saveItem, confirmDelete } = useCatalog(entity);

const dlg = ref(false);
const editing = ref<any>(null);
const saving = ref(false);
const form = ref({ value: '' });

watch(tab, () => { meta.value.page = 1; load(); });
function openAdd() { editing.value = null; form.value = { value: '' }; dlg.value = true; }
function openEdit(k: any) {
  editing.value = k;
  form.value = { value: k[fieldName.value] || '' };
  dlg.value = true;
}
async function save() {
  saving.value = true;
  const ok = await saveItem(editing.value?.id || null, { [fieldName.value]: form.value.value.trim() }, 'Đã lưu');
  saving.value = false;
  if (ok) { dlg.value = false; load(); }
}
onMounted(load);
</script>
