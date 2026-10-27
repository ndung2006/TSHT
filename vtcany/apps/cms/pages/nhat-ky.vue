<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center justify-between">
      <p class="text-sm text-neutral-400">Hiển thị {{ logs.length }} bản ghi gần nhất</p>
      <Button label="Tải lại" icon="pi pi-refresh" size="small" severity="secondary" @click="load" />
    </div>
    <div class="surface-card p-4">
      <DataTable :value="logs" :loading="loading" paginator :rows="20" size="small" sort-field="at" :sort-order="-1">
        <Column header="Thời gian" sortable field="at">
          <template #body="{ data }">{{ fmtTime(data.at) }}</template>
        </Column>
        <Column field="actor" header="Người thực hiện" />
        <Column field="role" header="Vai trò" />
        <Column field="action" header="Hành động" />
        <Column field="resource" header="Tài nguyên" class="text-xs" />
      </DataTable>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'auth' });
useHead({ title: 'Nhật ký - VTC ANY CMS' });

const api = useApi();
const toast = useToast();
const logs = ref<any[]>([]);
const loading = ref(true);

function fmtTime(at: number) {
  return at ? new Date(at).toLocaleString('vi-VN') : '';
}
async function load() {
  loading.value = true;
  try {
    const r = await api.get<any[]>('/audit-logs', { limit: 100 });
    logs.value = Array.isArray(r) ? r : [];
  } catch { toast.add({ severity: 'error', summary: 'Lỗi', detail: 'Không tải được nhật ký', life: 3000 }); }
  finally { loading.value = false; }
}
onMounted(load);
</script>
