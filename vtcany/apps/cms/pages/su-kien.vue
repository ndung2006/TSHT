<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center justify-between">
      <p class="text-sm text-neutral-400">Tổng: {{ meta.total }} sự kiện</p>
      <Button v-if="can('catalog:write')" label="Thêm sự kiện" icon="pi pi-plus" @click="openAdd" />
    </div>

    <div class="surface-card p-4">
      <DataTable :value="items" :loading="loading" paginator :rows="20" :total-records="meta.total"
        lazy :first="(meta.page - 1) * meta.limit" @page="onPage" size="small">
        <Column field="title" header="Tiêu đề" />
        <Column header="Bắt đầu">
          <template #body="{ data }">{{ fmtDate(data.startDate) }}</template>
        </Column>
        <Column header="Kết thúc">
          <template #body="{ data }">{{ fmtDate(data.endDate) }}</template>
        </Column>
        <Column header="Hiển thị" style="width:8rem">
          <template #body="{ data }"><Tag :value="data.isVisible ? 'Bật' : 'Tắt'" :severity="sevVisible(data.isVisible)" /></template>
        </Column>
        <Column header="Thao tác" style="min-width:10rem">
          <template #body="{ data }">
            <Button v-if="can('catalog:write')" label="Sửa" size="small" text @click="openEdit(data)" />
            <Button v-if="can('catalog:write')" label="Xóa" size="small" text severity="danger" @click="confirmDelete(confirm, data.id, data.title)" />
          </template>
        </Column>
      </DataTable>
    </div>

    <Dialog v-model:visible="dlg" modal :header="editing ? 'Sửa sự kiện' : 'Thêm sự kiện'" class="w-full max-w-lg">
      <div class="flex flex-col gap-3">
        <div><label class="field-label">Tiêu đề *</label><InputText v-model="form.title" class="w-full" /></div>
        <div><label class="field-label">Mô tả</label><Textarea v-model="form.description" rows="3" class="w-full" /></div>
        <div><label class="field-label">Thumbnail (URL)</label><InputText v-model="form.thumbnail" class="w-full" /></div>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="field-label">Ngày bắt đầu</label><Calendar v-model="form.startDate" date-format="yy-mm-dd" show-icon class="w-full" /></div>
          <div><label class="field-label">Ngày kết thúc</label><Calendar v-model="form.endDate" date-format="yy-mm-dd" show-icon class="w-full" /></div>
        </div>
        <div class="flex items-center gap-2"><Checkbox v-model="form.isVisible" binary input-id="ev" /><label for="ev">Hiển thị</label></div>
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
useHead({ title: 'Sự kiện - VTC ANY CMS' });

const { can } = useCmsAuth();
const confirm = useConfirm();
const { items, meta, loading, load, onPage, saveItem, confirmDelete } = useCatalog('events');

const dlg = ref(false);
const editing = ref<any>(null);
const saving = ref(false);
const form = ref({ title: '', description: '', thumbnail: '', startDate: null as any, endDate: null as any, isVisible: true });

function toDate(v: any) { return v ? new Date(v) : null; }
function toIso(d: any) { return d instanceof Date && !isNaN(d.getTime()) ? d.toISOString() : (d || ''); }
function openAdd() { editing.value = null; form.value = { title: '', description: '', thumbnail: '', startDate: null, endDate: null, isVisible: true }; dlg.value = true; }
function openEdit(e: any) {
  editing.value = e;
  form.value = { title: e.title || '', description: e.description || '', thumbnail: e.thumbnail || '', startDate: toDate(e.startDate), endDate: toDate(e.endDate), isVisible: e.isVisible !== false };
  dlg.value = true;
}
async function save() {
  saving.value = true;
  const ok = await saveItem(editing.value?.id || null, {
    title: form.value.title, description: form.value.description, thumbnail: form.value.thumbnail,
    startDate: toIso(form.value.startDate), endDate: toIso(form.value.endDate), isVisible: form.value.isVisible,
  }, 'Đã lưu sự kiện');
  saving.value = false;
  if (ok) { dlg.value = false; load(); }
}
onMounted(load);
</script>
