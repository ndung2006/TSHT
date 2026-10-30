<template>
  <div class="surface-card p-4">
    <h2 class="mb-1 font-semibold">Footer</h2>
    <p class="mb-4 text-sm text-neutral-400">Logo, mô tả và thông tin bản quyền hiển thị ở chân trang portal. Để trống thì portal giữ chân trang mặc định hiện nay.</p>
    <div class="flex flex-col gap-4">
      <div><label class="field-label">Ảnh Footer (ảnh logo)</label><ImagePicker v-model="form.logo" ratio="16/9" /></div>
      <div><label class="field-label">Mô tả</label><Editor v-model="form.description" editor-style="height: 240px" /></div>
      <div><label class="field-label">Thông tin bản quyền</label><Textarea v-model="form.copyright" rows="4" class="w-full" placeholder="vd: Giấy phép hoạt động số ...; © Bản quyền thuộc về ..." /></div>
      <div><Button v-if="can('site_interface:update')" label="Lưu" icon="pi pi-check" @click="save" /></div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'auth' });
useHead({ title: 'Footer - Quản lý giao diện - VTC ANY CMS' });

const { can } = useCmsAuth();
const api = useApi();
const toast = useToast();

const form = ref({ logo: '', description: '', copyright: '' });

async function load() {
  try {
    const r = await api.get<any>('/admin/site-interface/footer');
    if (r) form.value = { logo: r.logo || '', description: r.description || '', copyright: r.copyright || '' };
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.data?.message || e?.message || 'Tải thất bại', life: 3000 });
  }
}
onMounted(() => load());

async function save() {
  try {
    await api.put('/admin/site-interface/footer', form.value);
    toast.add({ severity: 'success', summary: 'Đã lưu footer', life: 2500 });
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.data?.message || e?.message || 'Lưu thất bại', life: 3000 });
  }
}
</script>
