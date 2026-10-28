<template>
  <div class="flex flex-col gap-4">
    <div class="surface-card p-4">
      <DataTable :value="items" :loading="loading" size="small">
        <Column field="name" header="Tên phòng ban" />
        <Column field="slug" header="Slug" class="text-xs" />
        <Column field="sortOrder" header="Thứ tự" style="width:7rem" />
        <Column header="Hiện" style="width:6rem">
          <template #body="{ data }"><Tag :value="data.isVisible ? 'Hiện' : 'Ẩn'" :severity="data.isVisible ? 'success' : 'secondary'" /></template>
        </Column>
        <Column header="Thao tác" style="min-width:10rem">
          <template #body="{ data }">
            <Button v-if="can('departments:update')" label="Sửa" size="small" text @click="openEdit(data)" />
            <Button v-if="can('departments:delete')" label="Xóa" size="small" text severity="danger" @click="removeItem(data)" />
          </template>
        </Column>
      </DataTable>
      <p class="mt-2 text-xs text-neutral-500">Phòng ban là dữ liệu nền (Dot 1a): dùng để gắn quản trị viên vào phòng. Logic lọc bước duyệt TP theo phòng và nhuận bút theo phòng để Dot 4 — hiện chưa có logic nào dùng trường này.</p>
    </div>

    <div v-if="can('departments:create') || can('departments:update')" class="surface-card p-4 flex flex-col gap-2">
      <p class="text-sm font-medium">{{ editing ? 'Sửa phòng ban' : 'Thêm phòng ban' }}</p>
      <InputText v-model="form.name" placeholder="Tên phòng ban *" class="w-full" />
      <InputText v-model="form.slug" placeholder="Slug (để trống = tự sinh)" class="w-full" />
      <div class="flex gap-2">
        <InputText v-model.number="form.sortOrder" type="number" placeholder="Thứ tự" class="w-32" />
        <div class="flex items-center gap-2"><Checkbox v-model="form.isVisible" binary input-id="deptvis" />
          <label for="deptvis">Hiển thị</label>
        </div>
        <Button :label="editing ? 'Lưu' : 'Thêm'" size="small" @click="save" :disabled="!form.name.trim()" />
        <Button v-if="editing" label="Hủy sửa" size="small" text @click="resetForm" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'auth' });
useHead({ title: 'Phòng ban - VTC ANY CMS' });

const { can } = useCmsAuth();
const api = useApi();
const toast = useToast();

const items = ref<any[]>([]);
const loading = ref(false);
const editing = ref<any>(null);
const form = ref({ name: '', slug: '', sortOrder: 0, isVisible: true });

function resetForm() {
  editing.value = null;
  form.value = { name: '', slug: '', sortOrder: 0, isVisible: true };
}
async function load() {
  loading.value = true;
  try { items.value = await api.get<any[]>('/admin/departments') || []; }
  catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.response?.data?.message || e?.message || 'Không tải được danh sách', life: 3000 });
  } finally { loading.value = false; }
}
function openEdit(d: any) {
  editing.value = d;
  form.value = { name: d.name || '', slug: d.slug || '', sortOrder: d.sortOrder || 0, isVisible: d.isVisible !== false };
}
async function save() {
  try {
    const payload: any = {
      name: form.value.name.trim(),
      slug: form.value.slug.trim() || undefined,
      sortOrder: Number(form.value.sortOrder) || 0,
      isVisible: form.value.isVisible,
    };
    if (editing.value) await api.patch(`/admin/departments/${editing.value.publicId}`, payload);
    else await api.post('/admin/departments', payload);
    toast.add({ severity: 'success', summary: 'Đã lưu phòng ban', life: 2500 });
    resetForm();
    load();
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.response?.data?.message || e?.message || 'Lưu thất bại', life: 3000 });
  }
}
async function removeItem(d: any) {
  if (!window.confirm(`Xóa phòng ban "${d.name}"?`)) return;
  try {
    await api.del(`/admin/departments/${d.publicId}`);
    toast.add({ severity: 'success', summary: 'Đã xóa', life: 2500 });
    load();
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.response?.data?.message || e?.message || 'Xóa thất bại', life: 3000 });
  }
}
load();
</script>
