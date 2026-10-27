<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center justify-between">
      <h2 class="text-lg font-semibold">Quản lý banner {{ sectionLabel }}</h2>
      <p class="text-sm text-neutral-400">Tổng: {{ filtered.length }} banner</p>
    </div>

    <!-- 6 trang con giong CMS VTCPlay -->
    <div class="flex flex-wrap gap-2">
      <Button v-for="s in sections" :key="s.value" :label="s.label" size="small"
        :severity="section === s.value ? undefined : 'secondary'" :outlined="section !== s.value"
        @click="section = s.value" />
    </div>

    <div class="surface-card flex flex-wrap gap-2 p-3">
      <Button v-if="can('catalog:write')" label="Thêm" icon="pi pi-plus" severity="secondary" @click="openAdd" />
      <Button v-if="can('catalog:write')" label="Công khai" icon="pi pi-lock-open" severity="success"
        :disabled="!sel.length" @click="batchVisible(true)" />
      <Button v-if="can('catalog:write')" label="Ẩn" icon="pi pi-lock" severity="warn"
        :disabled="!sel.length" @click="batchVisible(false)" />
      <Button v-if="can('catalog:write')" label="Xoá" icon="pi pi-trash" severity="danger"
        :disabled="!sel.length" @click="batchDelete" />
      <span class="p-input-icon-left ml-auto">
        <i class="pi pi-search" />
        <InputText v-model="q" placeholder="Tìm kiếm..." class="w-64" />
      </span>
    </div>

    <div class="surface-card p-4">
      <DataTable :value="filtered" v-model:selection="sel" data-key="id" :loading="loading" size="small">
        <Column selection-mode="multiple" style="width:3rem" />
        <Column field="sortOrder" header="Thứ tự" sortable style="width:7rem" />
        <Column field="title" header="Tên" sortable>
          <template #body="{ data }">
            <div class="font-medium">{{ data.title }}</div>
            <div class="mt-1 flex gap-1">
              <Tag v-for="p in platformsOf(data)" :key="p" :value="p === 'web' ? 'Website' : 'Mobile'" severity="success" />
            </div>
          </template>
        </Column>
        <Column header="Hiển thị" style="width:7rem">
          <template #body="{ data }">
            <InputSwitch :model-value="data.isVisible !== false"
              :disabled="!can('catalog:write')" @update:model-value="(v: boolean) => toggleVisible(data, v)" />
          </template>
        </Column>
        <Column header="Ngày tạo" sortable :sort-field="(r: any) => r.createdAt || ''" style="width:11rem">
          <template #body="{ data }">{{ fmtDate(data.createdAt) }}</template>
        </Column>
        <Column header="" style="width:7rem">
          <template #body="{ data }">
            <Button v-if="can('catalog:write')" icon="pi pi-pencil" size="small" text rounded severity="success"
              @click="openEdit(data)" />
            <Button v-if="can('catalog:write')" icon="pi pi-trash" size="small" text rounded severity="danger"
              @click="confirmDelete(data)" />
          </template>
        </Column>
      </DataTable>
    </div>

    <!-- Dialog them/sua — field giong CMS VTCPlay -->
    <Dialog v-model:visible="dlg" modal :header="editing ? 'Cập nhật banner' : 'Thêm banner'" class="w-[95vw] max-w-4xl">
      <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div class="flex flex-col gap-3">
          <div><label class="field-label">Tiêu đề (bắt buộc)</label><InputText v-model="form.title" class="w-full" /></div>
          <div><label class="field-label">Loại nội dung được mở</label>
            <Dropdown v-model="form.linkType" :options="linkTypes" option-label="label" option-value="value" class="w-full" />
          </div>
          <div><label class="field-label">Đường dẫn</label>
            <InputText v-model="form.linkTarget" class="w-full" :placeholder="linkHint" />
            <small class="text-neutral-400">{{ linkHint }}</small>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div><label class="field-label">Thứ tự (bắt buộc)</label>
              <InputNumber v-model="form.sortOrder" class="w-full" :use-grouping="false" />
            </div>
            <div><label class="field-label">Nền tảng hiển thị</label>
              <MultiSelect v-model="form.platforms" :options="platformOpts" option-label="label" option-value="value"
                class="w-full" display="chip" />
            </div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div><label class="field-label">Hiển thị từ ngày</label>
              <Calendar v-model="form.visibleFrom" date-format="dd/mm/yy" show-time hour-format="24" show-icon class="w-full" />
            </div>
            <div><label class="field-label">Hiển thị đến ngày</label>
              <Calendar v-model="form.visibleTo" date-format="dd/mm/yy" show-time hour-format="24" show-icon class="w-full" />
            </div>
          </div>
          <div><label class="field-label">Trạng thái hiển thị</label>
            <div class="flex gap-4">
              <div class="flex items-center gap-2"><RadioButton v-model="form.isVisible" :value="true" input-id="bshow" /><label for="bshow">Hiển thị</label></div>
              <div class="flex items-center gap-2"><RadioButton v-model="form.isVisible" :value="false" input-id="bhide" /><label for="bhide">Ẩn</label></div>
            </div>
          </div>
        </div>
        <div class="flex flex-col gap-3">
          <div><label class="field-label">Ảnh Website</label><ImagePicker v-model="form.imageWeb" ratio="16/9" /></div>
          <div><label class="field-label">Ảnh Mobile (Tỉ lệ: 2:3)</label><ImagePicker v-model="form.imageMobile" ratio="2/3" /></div>
        </div>
      </div>
      <template #footer>
        <Button label="Đóng" text @click="dlg = false" />
        <Button label="Lưu" severity="success" :loading="saving" :disabled="!form.title.trim()" @click="save" />
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'auth' });
useHead({ title: 'Quản lý Banner - VTC ANY CMS' });

const { can } = useCmsAuth();
const api = useApi();
const toast = useToast();
const confirm = useConfirm();
const { fmtDate } = useCatalog('banners');

const sections = [
  { label: 'Trang chủ', value: 'home' },
  { label: 'Truyền hình', value: 'tv' },
  { label: 'Phim', value: 'movies' },
  { label: 'Video', value: 'video' },
  { label: 'Short', value: 'short' },
  { label: 'Giải trí', value: 'entertainment' },
];
const section = ref('home');
const sectionLabel = computed(() => sections.find((s) => s.value === section.value)?.label || '');

const linkTypes = [
  { label: 'Đường dẫn ngoài', value: 'external' },
  { label: 'Phim', value: 'movie' },
  { label: 'Video', value: 'video' },
  { label: 'Short', value: 'short' },
  { label: 'Danh mục', value: 'category' },
];
const platformOpts = [
  { label: 'Website', value: 'web' },
  { label: 'Mobile', value: 'mobile' },
];
const linkHint = computed(() => {
  switch (form.value.linkType) {
    case 'external': return 'VD: https://truyenhinhso.vn/';
    case 'category': return 'VD: phim-bo-68da48a2071eb8976684a2a6 (slug + public_id danh mục)';
    default: return 'VD: tham-tinh-7a1729c2cfff3412c2c34d4f (slug + public_id nội dung)';
  }
});

const items = ref<any[]>([]);
const sel = ref<any[]>([]);
const q = ref('');
const loading = ref(false);

const filtered = computed(() => {
  const kw = q.value.trim().toLowerCase();
  return items.value
    .filter((b) => b.section === section.value)
    .filter((b) => !kw || (b.title || '').toLowerCase().includes(kw))
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
});

function platformsOf(b: any): string[] {
  if (Array.isArray(b.platforms)) return b.platforms;
  if (b.platform) return [b.platform];
  return ['web'];
}

async function load() {
  loading.value = true;
  try {
    const r = await api.get<any>('/admin/catalog/banners', { page: 1, limit: 200 });
    items.value = r.data || [];
    sel.value = [];
  } catch {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: 'Không tải được banner', life: 3000 });
  } finally {
    loading.value = false;
  }
}

function toDate(v: any) { return v ? new Date(v) : null; }
function toIso(d: any) { return d instanceof Date && !isNaN(d.getTime()) ? d.toISOString() : ''; }

const dlg = ref(false);
const editing = ref<any>(null);
const saving = ref(false);
function blankForm() {
  return {
    title: '', linkType: 'external', linkTarget: '', sortOrder: (filtered.value.length || 0) + 1,
    platforms: ['web'], visibleFrom: null as any, visibleTo: null as any,
    isVisible: true, imageWeb: '', imageMobile: '',
  };
}
const form = ref(blankForm());

function openAdd() {
  editing.value = null;
  form.value = blankForm();
  dlg.value = true;
}
function openEdit(b: any) {
  editing.value = b;
  form.value = {
    title: b.title || '',
    linkType: b.linkType || 'external',
    linkTarget: b.linkTarget || '',
    sortOrder: b.sortOrder ?? 0,
    platforms: platformsOf(b),
    visibleFrom: toDate(b.visibleFrom),
    visibleTo: toDate(b.visibleTo),
    isVisible: b.isVisible !== false,
    imageWeb: b.imageWeb || '',
    imageMobile: b.imageMobile || '',
  };
  dlg.value = true;
}

async function save() {
  if (!form.value.title.trim()) return;
  saving.value = true;
  const body = {
    title: form.value.title.trim(),
    section: section.value,
    linkType: form.value.linkType,
    linkTarget: (form.value.linkTarget || '').trim(),
    sortOrder: form.value.sortOrder ?? 0,
    platforms: form.value.platforms,
    visibleFrom: toIso(form.value.visibleFrom) || undefined,
    visibleTo: toIso(form.value.visibleTo) || undefined,
    isVisible: form.value.isVisible,
    imageWeb: form.value.imageWeb || '',
    imageMobile: form.value.imageMobile || '',
  };
  try {
    if (editing.value) await api.patch(`/admin/catalog/banners/${editing.value.id}`, body);
    else await api.post('/admin/catalog/banners', body);
    toast.add({ severity: 'success', summary: 'Xong', detail: 'Đã lưu banner', life: 3000 });
    dlg.value = false;
    load();
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.response?.data?.error?.message || 'Lưu thất bại', life: 3000 });
  } finally {
    saving.value = false;
  }
}

async function toggleVisible(b: any, v: boolean) {
  try {
    await api.patch(`/admin/catalog/banners/${b.id}`, { isVisible: v });
    b.isVisible = v;
  } catch {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: 'Đổi trạng thái thất bại', life: 3000 });
  }
}

function confirmDelete(b: any) {
  confirm.require({
    message: `Xóa banner "${b.title}"?`, header: 'Xác nhận', icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Xóa', rejectLabel: 'Hủy', acceptClass: 'p-button-danger',
    accept: async () => {
      try {
        await api.del(`/admin/catalog/banners/${b.id}`);
        toast.add({ severity: 'success', summary: 'Xong', detail: 'Đã xóa banner', life: 3000 });
        load();
      } catch {
        toast.add({ severity: 'error', summary: 'Lỗi', detail: 'Xóa thất bại', life: 3000 });
      }
    },
  });
}

async function batchVisible(v: boolean) {
  for (const b of sel.value) {
    try {
      await api.patch(`/admin/catalog/banners/${b.id}`, { isVisible: v });
      b.isVisible = v;
    } catch { /* bo qua tung loi */ }
  }
  sel.value = [];
  toast.add({ severity: 'success', summary: 'Xong', detail: v ? 'Đã công khai các banner đã chọn' : 'Đã ẩn các banner đã chọn', life: 3000 });
}

function batchDelete() {
  confirm.require({
    message: `Xóa ${sel.value.length} banner đã chọn?`, header: 'Xác nhận', icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Xóa', rejectLabel: 'Hủy', acceptClass: 'p-button-danger',
    accept: async () => {
      for (const b of [...sel.value]) {
        try { await api.del(`/admin/catalog/banners/${b.id}`); } catch { /* bo qua */ }
      }
      sel.value = [];
      load();
    },
  });
}

onMounted(load);
</script>
