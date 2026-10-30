<template>
  <div class="surface-card p-4">
    <h2 class="mb-1 font-semibold">Header</h2>
    <p class="mb-4 text-sm text-neutral-400">Ảnh và liên hệ hiển thị ở đầu trang portal. Để trống mục nào thì portal giữ mặc định ở mục đó (logo VTC TSHT + dòng “TÒA SOẠN HỘI TỤ” khi chưa đặt ảnh header).</p>
    <div class="flex flex-col gap-4">
      <div><label class="field-label">Ảnh header *</label><ImagePicker v-model="form.image" ratio="16/9" /></div>
      <div><label class="field-label">Email</label><InputText v-model="form.email" class="w-full" placeholder="vd: toasoan@tsht.vn" /></div>
      <div><label class="field-label">Facebook</label><InputText v-model="form.facebook" class="w-full" placeholder="https://..." /></div>
      <div><label class="field-label">Youtube</label><InputText v-model="form.youtube" class="w-full" placeholder="https://..." /></div>
      <div><label class="field-label">Tiktok</label><InputText v-model="form.tiktok" class="w-full" placeholder="https://..." /></div>
      <div><label class="field-label">Zalo</label><InputText v-model="form.zalo" class="w-full" placeholder="https://..." /></div>
      <div><label class="field-label">Số điện thoại *</label><InputText v-model="form.phone" class="w-full" placeholder="vd: 0888215099" /></div>
      <div><Button v-if="can('site_interface:update')" label="Lưu" icon="pi pi-check" @click="save" /></div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'auth' });
useHead({ title: 'Header - Quản lý giao diện - VTC ANY CMS' });

const { can } = useCmsAuth();
const api = useApi();
const toast = useToast();

const form = ref({ image: '', email: '', facebook: '', youtube: '', tiktok: '', zalo: '', phone: '' });

async function load() {
  try {
    const r = await api.get<any>('/admin/site-interface/header');
    if (r) form.value = { image: r.image || '', email: r.email || '', facebook: r.facebook || '', youtube: r.youtube || '', tiktok: r.tiktok || '', zalo: r.zalo || '', phone: r.phone || '' };
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.data?.message || e?.message || 'Tải thất bại', life: 3000 });
  }
}
onMounted(() => load());

async function save() {
  try {
    await api.put('/admin/site-interface/header', form.value);
    toast.add({ severity: 'success', summary: 'Đã lưu header', life: 2500 });
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.data?.message || e?.message || 'Lưu thất bại', life: 3000 });
  }
}
</script>
