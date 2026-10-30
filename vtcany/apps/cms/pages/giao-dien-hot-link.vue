<template>
  <div class="flex flex-col gap-4">
    <div class="surface-card p-4">
      <p class="text-sm text-neutral-400">Chọn bài viết làm hot link, dùng nút lên/xuống để sắp xếp thứ tự hiển thị. Portal hiện dãy hot link ngay dưới thanh menu ở trang chủ. Chỉ bài đang xuất bản mới hiện công khai — bài hạ xuất bản sẽ tự ẩn khỏi dãy hot link cho tới khi xuất bản lại.</p>
    </div>
    <div class="grid gap-4 lg:grid-cols-2">
      <div class="surface-card p-4">
        <h2 class="mb-3 font-semibold">Chọn bài viết hot link</h2>
        <div class="flex gap-2">
          <span class="p-input-icon-left flex-1">
            <i class="pi pi-search" />
            <InputText v-model="q" placeholder="Tìm theo tiêu đề..." class="w-full" @keyup.enter="searchArticles" />
          </span>
          <Button label="Tìm" icon="pi pi-search" @click="searchArticles" />
        </div>
        <div class="mt-3 flex flex-col gap-2">
          <div v-for="a in articles" :key="a.publicId" class="flex items-center gap-2 border-b border-neutral-800 pb-2">
            <span class="flex-1 text-sm">{{ a.title }}</span>
            <Tag :value="statusText(a.status)" :severity="a.status === 'published' ? 'success' : 'secondary'" />
            <Button v-if="can('site_interface:create')" icon="pi pi-plus" size="small" :disabled="pickedIds.has(a.publicId)" @click="addItem(a)" />
          </div>
          <p v-if="articles.length === 0" class="text-sm text-neutral-400">Nhập từ khóa rồi bấm Tìm để chọn bài viết.</p>
        </div>
      </div>
      <div class="surface-card p-4">
        <h2 class="mb-3 font-semibold">Sắp xếp thứ tự</h2>
        <p class="mb-3 text-sm text-neutral-400">Dùng nút lên/xuống để sắp xếp thứ tự hiển thị.</p>
        <div class="flex flex-col gap-2">
          <div v-for="(it, i) in items" :key="it.id" class="flex items-center gap-2 border-b border-neutral-800 pb-2">
            <span class="text-sm font-semibold text-neutral-400">{{ i + 1 }}</span>
            <span class="flex-1 text-sm">{{ it.title }}</span>
            <Tag :value="statusText(it.status)" :severity="it.status === 'published' ? 'success' : 'secondary'" />
            <Button v-if="can('site_interface:update')" icon="pi pi-arrow-up" size="small" text :disabled="i === 0" @click="moveItem(i, -1)" />
            <Button v-if="can('site_interface:update')" icon="pi pi-arrow-down" size="small" text :disabled="i === items.length - 1" @click="moveItem(i, 1)" />
            <Button v-if="can('site_interface:delete')" icon="pi pi-minus" size="small" text severity="danger" @click="removeItem(it)" />
          </div>
          <p v-if="items.length === 0" class="text-sm text-neutral-400">Chưa chọn bài viết nào.</p>
        </div>
        <Button v-if="can('site_interface:update')" label="Lưu" icon="pi pi-check" class="mt-4" @click="saveOrder" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'auth' });
useHead({ title: 'Hot Link - Quản lý giao diện - VTC ANY CMS' });

const { can } = useCmsAuth();
const api = useApi();
const toast = useToast();
const confirm = useConfirm();

const q = ref('');
const articles = ref<any[]>([]);
const items = ref<any[]>([]);

const pickedIds = computed(() => new Set(items.value.map((it: any) => it.articleId)));

function statusText(s: string) {
  if (s === 'published') return 'Đã xuất bản';
  if (s === 'pending_review') return 'Chờ duyệt';
  if (s === 'unpublished') return 'Hạ xuất bản';
  return 'Nháp';
}

async function loadPicked() {
  try {
    const m = await api.get<any[]>('/admin/site-interface/hot-links');
    items.value = Array.isArray(m) ? m : [];
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.data?.message || e?.message || 'Tải thất bại', life: 3000 });
  }
}
onMounted(() => loadPicked());

async function searchArticles() {
  try {
    const r = await api.get<any[]>('/admin/site-interface/articles', { q: q.value.trim() || undefined });
    articles.value = Array.isArray(r) ? r : [];
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.data?.message || e?.message || 'Tìm thất bại', life: 3000 });
  }
}

async function addItem(a: any) {
  try {
    await api.post('/admin/site-interface/hot-links', { ref: a.publicId });
    toast.add({ severity: 'success', summary: 'Đã thêm hot link', life: 2500 });
    loadPicked();
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.data?.message || e?.message || 'Thêm thất bại', life: 3000 });
  }
}

function moveItem(i: number, dir: number) {
  const next = [...items.value];
  const j = i + dir;
  if (j < 0 || j >= next.length) return;
  const tmp = next[i];
  next[i] = next[j];
  next[j] = tmp;
  items.value = next;
}

async function saveOrder() {
  try {
    await api.put('/admin/site-interface/hot-links/reorder', { ids: items.value.map((it: any) => it.id) });
    toast.add({ severity: 'success', summary: 'Đã lưu thứ tự', life: 2500 });
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.data?.message || e?.message || 'Lưu thứ tự thất bại', life: 3000 });
    loadPicked();
  }
}

function removeItem(it: any) {
  confirm.require({
    message: `Gỡ hot link “${it.title}”?`,
    header: 'Gỡ hot link',
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Gỡ',
    rejectLabel: 'Hủy',
    accept: async () => {
      try {
        await api.del(`/admin/site-interface/hot-links/${it.id}`);
        toast.add({ severity: 'success', summary: 'Đã gỡ', life: 2500 });
        loadPicked();
      } catch (e: any) {
        toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.data?.message || e?.message || 'Gỡ thất bại', life: 3000 });
      }
    },
  });
}
</script>
