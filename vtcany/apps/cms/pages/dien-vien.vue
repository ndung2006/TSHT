<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center justify-between">
      <p class="text-sm text-neutral-400">Tổng: {{ meta.total }} diễn viên</p>
      <Button v-if="can('catalog:write')" label="Thêm diễn viên" icon="pi pi-plus" @click="openAdd" />
    </div>

    <div class="surface-card p-4">
      <DataTable :value="items" :loading="loading" paginator :rows="20" :total-records="meta.total"
        lazy :first="(meta.page - 1) * meta.limit" @page="onPage" size="small">
        <Column header="Ảnh" style="width:5rem">
          <template #body="{ data }"><img v-if="data.avatar" :src="data.avatar" class="h-10 w-10 rounded-full object-cover" alt="" /></template>
        </Column>
        <Column field="name" header="Tên" />
        <Column field="bio" header="Tiểu sử">
          <template #body="{ data }"><span class="line-clamp-2 text-xs text-neutral-400">{{ data.bio }}</span></template>
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

    <Dialog v-model:visible="dlg" modal :header="editing ? 'Sửa diễn viên' : 'Thêm diễn viên'" class="w-full max-w-lg">
      <div class="flex flex-col gap-3">
        <div><label class="field-label">Tên *</label><InputText v-model="form.name" class="w-full" /></div>
        <div><label class="field-label">Avatar (URL)</label><InputText v-model="form.avatar" class="w-full" /></div>
        <div><label class="field-label">Tiểu sử</label><Textarea v-model="form.bio" rows="4" class="w-full" /></div>
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
useHead({ title: 'Diễn viên - VTC ANY CMS' });

const { can } = useCmsAuth();
const confirm = useConfirm();
const { items, meta, loading, load, onPage, saveItem, confirmDelete } = useCatalog('actors');

const dlg = ref(false);
const editing = ref<any>(null);
const saving = ref(false);
const form = ref({ name: '', avatar: '', bio: '' });

function openAdd() { editing.value = null; form.value = { name: '', avatar: '', bio: '' }; dlg.value = true; }
function openEdit(a: any) {
  editing.value = a;
  form.value = { name: a.name || '', avatar: a.avatar || '', bio: a.bio || '' };
  dlg.value = true;
}
async function save() {
  saving.value = true;
  const ok = await saveItem(editing.value?.id || null, { ...form.value }, 'Đã lưu diễn viên');
  saving.value = false;
  if (ok) { dlg.value = false; load(); }
}
onMounted(load);
</script>
