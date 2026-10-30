<template>
  <div class="flex flex-col gap-4">
    <div class="surface-card p-4">
      <p class="text-sm text-neutral-400">Chọn mục cha đưa vào thanh menu của portal, kéo thứ tự bằng nút lên/xuống. Lưu ý: khi danh sách này còn trống, portal vẫn hiện đủ cây mục cha như hiện nay (không mất menu) — chỉ khi đã chọn ít nhất 1 mục thì nav mới chỉ hiện các mục đã chọn theo đúng thứ tự này.</p>
    </div>
    <div class="grid gap-4 lg:grid-cols-2">
      <div class="surface-card p-4">
        <h2 class="mb-3 font-semibold">Chọn chuyên mục đưa vào menu</h2>
        <span class="p-input-icon-left w-full">
          <i class="pi pi-search" />
          <InputText v-model="q" placeholder="Tìm chuyên mục..." class="w-full" />
        </span>
        <div class="mt-3 flex flex-col gap-2">
          <div v-for="c in filteredCats" :key="c.id" class="flex items-center gap-2 border-b border-neutral-800 pb-2">
            <span class="flex-1 text-sm">{{ c.name }}</span>
            <Tag v-if="!c.isVisible" value="Ẩn" severity="secondary" />
            <Button v-if="can('site_interface:create')" icon="pi pi-plus" size="small" :disabled="pickedIds.has(c.id)" @click="addItem(c)" />
          </div>
          <p v-if="filteredCats.length === 0" class="text-sm text-neutral-400">Không có chuyên mục cha nào.</p>
        </div>
      </div>
      <div class="surface-card p-4">
        <h2 class="mb-3 font-semibold">Sắp xếp menu</h2>
        <p class="mb-3 text-sm text-neutral-400">Dùng nút lên/xuống để sắp xếp thứ tự hiển thị.</p>
        <div class="flex flex-col gap-2">
          <div v-for="(it, i) in items" :key="it.id" class="flex items-center gap-2 border-b border-neutral-800 pb-2">
            <span class="text-sm font-semibold text-neutral-400">{{ i + 1 }}</span>
            <span class="flex-1 text-sm">{{ it.name }}</span>
            <Tag v-if="!it.isVisible" value="Ẩn" severity="secondary" />
            <Button v-if="can('site_interface:update')" icon="pi pi-arrow-up" size="small" text :disabled="i === 0" @click="moveItem(i, -1)" />
            <Button v-if="can('site_interface:update')" icon="pi pi-arrow-down" size="small" text :disabled="i === items.length - 1" @click="moveItem(i, 1)" />
            <Button v-if="can('site_interface:delete')" icon="pi pi-minus" size="small" text severity="danger" @click="removeItem(it)" />
          </div>
          <p v-if="items.length === 0" class="text-sm text-neutral-400">Chưa chọn mục nào — portal đang hiện đủ cây mục cha.</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'auth' });
useHead({ title: 'Menu - Quản lý giao diện - VTC ANY CMS' });

const { can } = useCmsAuth();
const api = useApi();
const toast = useToast();
const confirm = useConfirm();

const q = ref('');
const cats = ref<any[]>([]);
const items = ref<any[]>([]);

const pickedIds = computed(() => new Set(items.value.map((it: any) => it.categoryId)));
const filteredCats = computed(() => {
  const kw = q.value.trim().toLowerCase();
  return cats.value.filter((c: any) => !c.parentId && (!kw || c.name.toLowerCase().includes(kw)));
});

async function load() {
  try {
    const [c, m] = await Promise.all([
      api.get<any[]>('/admin/site-interface/categories'),
      api.get<any[]>('/admin/site-interface/menu'),
    ]);
    cats.value = Array.isArray(c) ? c : [];
    items.value = Array.isArray(m) ? m : [];
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.data?.message || e?.message || 'Tải thất bại', life: 3000 });
  }
}
onMounted(() => load());

async function addItem(c: any) {
  try {
    await api.post('/admin/site-interface/menu', { ref: c.id });
    toast.add({ severity: 'success', summary: 'Đã thêm vào menu', life: 2500 });
    load();
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.data?.message || e?.message || 'Thêm thất bại', life: 3000 });
  }
}

async function moveItem(i: number, dir: number) {
  const next = [...items.value];
  const j = i + dir;
  if (j < 0 || j >= next.length) return;
  const tmp = next[i];
  next[i] = next[j];
  next[j] = tmp;
  items.value = next;
  try {
    await api.put('/admin/site-interface/menu/reorder', { ids: next.map((it: any) => it.id) });
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.data?.message || e?.message || 'Lưu thứ tự thất bại', life: 3000 });
    load();
  }
}

function removeItem(it: any) {
  confirm.require({
    message: `Gỡ “${it.name}” khỏi menu?`,
    header: 'Gỡ khỏi menu',
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Gỡ',
    rejectLabel: 'Hủy',
    accept: async () => {
      try {
        await api.del(`/admin/site-interface/menu/${it.id}`);
        toast.add({ severity: 'success', summary: 'Đã gỡ', life: 2500 });
        load();
      } catch (e: any) {
        toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.data?.message || e?.message || 'Gỡ thất bại', life: 3000 });
      }
    },
  });
}
</script>
