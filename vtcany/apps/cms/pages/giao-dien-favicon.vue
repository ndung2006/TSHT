<template>
  <div class="surface-card p-4">
    <h2 class="mb-1 font-semibold">Favicon</h2>
    <p class="mb-4 text-sm text-neutral-400">Icon hiển thị trên tab trình duyệt của portal. Khi chưa đặt ảnh thì portal dùng favicon mặc định hiện nay.</p>
    <div class="flex flex-col gap-4">
      <div><label class="field-label">Icon Favicon *</label><ImagePicker v-model="form.image" ratio="16/9" /></div>
      <div><label class="field-label">Tên Icon</label><InputText v-model="form.name" class="w-full" placeholder="vd: favicon" /></div>
      <div><label class="field-label">Mô Tả *</label><InputText v-model="form.description" class="w-full" placeholder="vd: favicon cổng TSHT" /></div>
      <div><Button v-if="can('site_interface:update')" label="Lưu" icon="pi pi-check" @click="save" /></div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'auth' });
useHead({ title: 'Favicon - Quản lý giao diện - VTC ANY CMS' });

const { can } = useCmsAuth();
const api = useApi();
const toast = useToast();

const form = ref({ image: '', name: '', description: '' });

async function load() {
  try {
    const r = await api.get<any>('/admin/site-interface/favicon');
    if (r) form.value = { image: r.image || '', name: r.name || '', description: r.description || '' };
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.data?.message || e?.message || 'Tải thất bại', life: 3000 });
  }
}
onMounted(() => load());

async function save() {
  try {
    await api.put('/admin/site-interface/favicon', form.value);
    toast.add({ severity: 'success', summary: 'Đã lưu favicon', life: 2500 });
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.data?.message || e?.message || 'Lưu thất bại', life: 3000 });
  }
}
</script>
