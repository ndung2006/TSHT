<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center justify-between">
      <p class="text-sm text-neutral-400">Cấu hình key-value của hệ thống</p>
      <div class="flex gap-2">
        <Button v-if="can('catalog:write')" label="Thêm dòng" icon="pi pi-plus" size="small" @click="rows.push({ key: '', value: '' })" />
        <Button v-if="can('catalog:write')" label="Lưu cài đặt" icon="pi pi-save" :loading="saving" @click="save" />
      </div>
    </div>

    <div class="surface-card p-4">
      <div v-if="loading" class="py-8 text-center text-sm text-neutral-500">Đang tải...</div>
      <div v-else class="flex flex-col gap-2">
        <div v-for="(r, i) in rows" :key="i" class="flex items-center gap-2">
          <InputText v-model="r.key" placeholder="key" class="w-64 font-mono text-sm" :disabled="!can('catalog:write')" />
          <InputText v-model="r.value" placeholder="value" class="flex-1 font-mono text-sm" :disabled="!can('catalog:write')" />
          <Button v-if="can('catalog:write')" icon="pi pi-trash" size="small" text severity="danger" @click="rows.splice(i, 1)" />
        </div>
        <p v-if="!rows.length" class="py-8 text-center text-sm text-neutral-500">Chưa có cài đặt nào.</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'auth' });
useHead({ title: 'Cài đặt - VTC ANY CMS' });

const { can } = useCmsAuth();
const api = useApi();
const toast = useToast();
const rows = ref<{ key: string; value: string }[]>([]);
const loading = ref(true);
const saving = ref(false);

async function load() {
  loading.value = true;
  try {
    const r = await api.get<Record<string, any>>('/admin/catalog/settings/all');
    rows.value = Object.entries(r || {}).map(([key, value]) => ({ key, value: String(value ?? '') }));
  } catch {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: 'Không tải được cài đặt', life: 3000 });
  } finally { loading.value = false; }
}
async function save() {
  saving.value = true;
  try {
    const body: Record<string, string> = {};
    for (const r of rows.value) {
      if (r.key.trim()) body[r.key.trim()] = r.value;
    }
    await api.put('/admin/catalog/settings/all', body);
    toast.add({ severity: 'success', summary: 'Xong', detail: 'Đã lưu cài đặt', life: 3000 });
    load();
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.response?.data?.error?.message || 'Lưu thất bại', life: 3000 });
  } finally { saving.value = false; }
}
onMounted(load);
</script>
