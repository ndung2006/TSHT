<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center justify-between">
      <p class="text-sm text-neutral-400">Tổng: {{ meta.total }} bài viết</p>
      <Button v-if="can('catalog:write')" label="Thêm bài viết" icon="pi pi-plus" @click="openAdd" />
    </div>

    <div class="surface-card p-4">
      <DataTable :value="items" :loading="loading" paginator :rows="20" :total-records="meta.total"
        lazy :first="(meta.page - 1) * meta.limit" @page="onPage" size="small">
        <Column field="title" header="Tiêu đề" />
        <Column field="slug" header="Slug" class="text-xs" />
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

    <Dialog v-model:visible="dlg" modal :header="editing ? 'Sửa bài viết' : 'Thêm bài viết'" class="w-full max-w-2xl">
      <div class="flex flex-col gap-3">
        <div><label class="field-label">Tiêu đề *</label><InputText v-model="form.title" class="w-full" /></div>
        <div><label class="field-label">Slug</label><InputText v-model="form.slug" class="w-full" placeholder="tu-dong-neu-de-trong" /></div>
        <div><label class="field-label">Thumbnail (URL)</label><InputText v-model="form.thumbnail" class="w-full" /></div>
        <div><label class="field-label">Nội dung</label><Textarea v-model="form.content" rows="8" class="w-full" /></div>
        <div class="flex items-center gap-2"><Checkbox v-model="form.isVisible" binary input-id="av" /><label for="av">Hiển thị</label></div>
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
useHead({ title: 'Bài viết - VTC ANY CMS' });

const { can } = useCmsAuth();
const confirm = useConfirm();
const { items, meta, loading, load, onPage, saveItem, confirmDelete } = useCatalog('articles');

const dlg = ref(false);
const editing = ref<any>(null);
const saving = ref(false);
const form = ref({ title: '', slug: '', thumbnail: '', content: '', isVisible: true });

function openAdd() { editing.value = null; form.value = { title: '', slug: '', thumbnail: '', content: '', isVisible: true }; dlg.value = true; }
function openEdit(a: any) {
  editing.value = a;
  form.value = { title: a.title || '', slug: a.slug || '', thumbnail: a.thumbnail || '', content: a.content || '', isVisible: a.isVisible !== false };
  dlg.value = true;
}
async function save() {
  saving.value = true;
  const ok = await saveItem(editing.value?.id || null, { ...form.value }, 'Đã lưu bài viết');
  saving.value = false;
  if (ok) { dlg.value = false; load(); }
}
onMounted(load);
</script>
