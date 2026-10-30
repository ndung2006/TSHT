<template>
  <div class="flex flex-col gap-4">
    <!-- Thanh cong cu: Them / Cong khai / An / Xoa hang loat (giong VTCPlay) -->
    <div class="surface-card flex flex-wrap items-center gap-2 p-3">
      <template v-if="activeTab !== 'tin-bai'">
        <Button v-if="can('category:create')" label="Thêm" icon="pi pi-plus" severity="secondary" @click="openAdd" />
        <Button v-if="can('category:update')" label="Công khai" icon="pi pi-lock-open" severity="success"
          :disabled="!selected.length" @click="bulkVisible(true)" />
        <Button v-if="can('category:update')" label="Ẩn" icon="pi pi-lock" severity="warning"
          :disabled="!selected.length" @click="bulkVisible(false)" />
        <Button v-if="can('category:delete')" label="Xóa" icon="pi pi-trash" severity="danger"
          :disabled="!selected.length" @click="bulkDelete" />
      </template>
      <Button v-else-if="can('category:create')" label="Thêm chuyên mục" icon="pi pi-plus" severity="secondary" @click="openNewsAdd" />
    </div>

    <div class="flex flex-wrap items-center justify-between gap-3">
      <h2 class="text-base font-semibold">Quản lý danh mục</h2>
      <span class="p-input-icon-left">
        <i class="pi pi-search" />
        <InputText v-model="q" placeholder="Tìm kiếm..." class="w-64" />
      </span>
    </div>

    <!-- Tab loai noi dung: Truyen hinh / Phim / Video / Short (giong VTCPlay) -->
    <div class="flex flex-wrap gap-2">
      <Button v-for="t in tabs" :key="t.key" :label="t.label" size="small"
        :severity="activeTab === t.key ? undefined : 'secondary'" :outlined="activeTab !== t.key"
        @click="activeTab = t.key" />
      <span class="ml-auto self-center text-sm text-neutral-400">Tổng: {{ activeTab === 'tin-bai' ? newsFiltered.length : filtered.length }} danh mục</span>
    </div>

    <div v-if="activeTab !== 'tin-bai'" class="surface-card p-4">
      <DataTable :value="filtered" v-model:selection="selected" :loading="loading" size="small"
        data-key="id" paginator :rows="20">
        <Column selection-mode="multiple" style="width:3rem" />
        <Column field="name" header="Tên" sortable />
        <Column header="Hiển thị" style="width:8rem">
          <template #body="{ data }">
            <InputSwitch :model-value="data.isVisible !== false"
              @update:model-value="(v: boolean) => toggleVisible(data, v)" :disabled="!can('category:update')" />
          </template>
        </Column>
        <Column header="Ngày tạo" style="width:9rem" sortable field="createdAt">
          <template #body="{ data }">{{ fmtDateTime(data.createdAt) }}</template>
        </Column>
        <Column header="Thao tác" style="width:8rem">
          <template #body="{ data }">
            <Button v-if="can('category:update')" icon="pi pi-pencil" size="small" text rounded severity="success"
              aria-label="Sửa" @click="openEdit(data)" />
            <Button v-if="can('category:delete')" icon="pi pi-trash" size="small" text rounded severity="danger"
              aria-label="Xóa" @click="remove(data)" />
          </template>
        </Column>
      </DataTable>
    </div>

    <div v-else class="surface-card p-4">
      <!-- Tab Tin bai: chuyen muc bao dien tu (chuyen tu dialog trang Tin bai
        sang day, cung API /admin/news-categories, cung quyen category:*) -->
      <DataTable :value="newsFiltered" :loading="newsLoading" size="small" data-key="publicId" paginator :rows="20">
        <Column field="name" header="Tên" sortable />
        <Column header="Chuyên mục cha"><template #body="{ data }">{{ newsParentName(data.parentId) }}</template></Column>
        <Column field="slug" header="Slug" class="text-xs" />
        <Column header="Hiện" style="width:6rem">
          <template #body="{ data }"><Tag :value="data.isVisible ? 'Hiện' : 'Ẩn'" :severity="data.isVisible ? 'success' : 'secondary'" /></template>
        </Column>
        <Column header="Thao tác" style="width:8rem">
          <template #body="{ data }">
            <Button v-if="can('category:update')" icon="pi pi-pencil" size="small" text rounded severity="success"
              aria-label="Sửa" @click="openNewsEdit(data)" />
            <Button v-if="can('category:delete')" icon="pi pi-trash" size="small" text rounded severity="danger"
              aria-label="Xóa" @click="removeNewsCat(data)" />
          </template>
        </Column>
      </DataTable>
    </div>

    <Dialog v-model:visible="newsDlg" modal :header="newsEditing ? 'Sửa chuyên mục' : 'Thêm chuyên mục'" class="w-full max-w-xl">
      <div class="flex flex-col gap-3">
        <div><label class="field-label">Tên chuyên mục *</label><InputText v-model="newsForm.name" class="w-full" /></div>
        <div><label class="field-label">Slug (để trống = tự sinh)</label><InputText v-model="newsForm.slug" class="w-full" /></div>
        <div>
          <label class="field-label">Chuyên mục cha (để trống = cấp 1)</label>
          <Dropdown v-model="newsForm.parentId" :options="newsParentOptions" option-label="label" option-value="value"
            class="w-full" show-clear />
        </div>
        <div><label class="field-label">Thứ tự</label><InputText v-model.number="newsForm.sortOrder" type="number" class="w-32" /></div>
        <div class="flex items-center gap-2">
          <Checkbox v-model="newsForm.isVisible" binary input-id="newsvis" />
          <label for="newsvis">Hiển thị công khai</label>
        </div>
      </div>
      <template #footer>
        <Button label="Đóng" text @click="newsDlg = false" />
        <Button label="Lưu" :loading="newsSaving" :disabled="!newsForm.name.trim()" @click="saveNewsCat" />
      </template>
    </Dialog>

    <Dialog v-model:visible="dlg" modal :header="editing ? 'Cập nhật danh mục' : 'Thêm danh mục'" class="w-full max-w-xl">
      <div class="flex flex-col gap-3">
        <div><label class="field-label">Tiêu đề *</label><InputText v-model="form.name" class="w-full" /></div>
        <div><label class="field-label">Code</label><InputText v-model="form.code" class="w-full" /></div>
        <div>
          <label class="field-label">Ảnh thumbnail cho SEO</label>
          <ImagePicker v-model="form.seoThumbnail" ratio="16/9" />
        </div>
        <div>
          <label class="field-label">Nền tảng</label>
          <MultiSelect v-model="form.platforms" :options="platformOpts" class="w-full" />
        </div>
        <div>
          <label class="field-label">Hiển thị nội dung theo</label>
          <Dropdown v-model="form.contentSort" :options="contentSortOpts" option-label="label" option-value="value" class="w-full" />
        </div>
        <div>
          <label class="field-label">Trạng thái hiển thị</label>
          <div class="flex gap-4">
            <div class="flex items-center gap-2">
              <RadioButton v-model="form.isVisible" input-id="vis1" :value="true" />
              <label for="vis1">Hiển thị</label>
            </div>
            <div class="flex items-center gap-2">
              <RadioButton v-model="form.isVisible" input-id="vis2" :value="false" />
              <label for="vis2">Ẩn</label>
            </div>
          </div>
        </div>
      </div>
      <template #footer>
        <Button label="Đóng" text @click="dlg = false" />
        <Button label="Lưu" :loading="saving" :disabled="!form.name.trim()" @click="save" />
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'auth' });
useHead({ title: 'Danh mục - VTC ANY CMS' });

const { can } = useCmsAuth();
const api = useApi();
const toast = useToast();
const confirm = useConfirm();
const cats = ref<any[]>([]);
const loading = ref(true);
const dlg = ref(false);
const editing = ref<any>(null);
const saving = ref(false);
const selected = ref<any[]>([]);
const q = ref('');
const activeTab = ref('video');

const tabs = [
  { key: 'truyen-hinh', label: 'Truyền hình' },
  { key: 'phim', label: 'Phim' },
  { key: 'video', label: 'Video' },
  { key: 'short', label: 'Short' },
  { key: 'tin-bai', label: 'Tin bài' },
];
const platformOpts = ['Android Mobile', 'IOS', 'Web'];
const contentSortOpts = [
  { label: 'Thời gian tạo', value: 'created' },
  { label: 'Thứ tự sắp xếp', value: 'manual' },
];

const blank = () => ({
  name: '', code: '', seoThumbnail: '', platforms: ['Web'],
  contentSort: 'created', isVisible: false, // VTCPlay: mac dinh An khi them
  appliesTo: [activeTab.value],
});
const form = ref(blank());

const filtered = computed(() => {
  const key = activeTab.value;
  const needle = q.value.trim().toLowerCase();
  return cats.value.filter((c) => {
    if (key && !(c.appliesTo || []).includes(key)) return false;
    if (needle && !(c.name || '').toLowerCase().includes(needle)) return false;
    return true;
  });
});

function fmtDateTime(v: string) {
  if (!v) return '—';
  const d = new Date(v);
  if (isNaN(d.getTime())) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()} ${hh}:${mi}`;
}

async function load() {
  loading.value = true;
  try { const r = await api.get<any>('/admin/categories'); cats.value = r.data || []; }
  catch { toast.add({ severity: 'error', summary: 'Lỗi', detail: 'Không tải được danh mục', life: 3000 }); }
  finally { loading.value = false; }
}
function openAdd() { editing.value = null; form.value = blank(); dlg.value = true; }
function openEdit(c: any) {
  editing.value = c;
  form.value = {
    name: c.name || '', code: c.code || '', seoThumbnail: c.seoThumbnail || '',
    platforms: c.platforms?.length ? c.platforms : ['Web'],
    contentSort: c.contentSort || 'created',
    isVisible: c.isVisible !== false,
    appliesTo: c.appliesTo?.length ? c.appliesTo : [activeTab.value],
  };
  dlg.value = true;
}
async function save() {
  saving.value = true;
  const body: any = { ...form.value };
  try {
    if (editing.value) await api.patch(`/admin/categories/${editing.value.id}`, body);
    else await api.post('/admin/categories', body);
    toast.add({ severity: 'success', summary: 'Xong', detail: 'Đã lưu danh mục', life: 3000 });
    dlg.value = false; load();
  } catch (e: any) { toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.response?.data?.message || 'Lưu thất bại', life: 3000 }); }
  finally { saving.value = false; }
}
async function toggleVisible(c: any, v: boolean) {
  try {
    await api.patch(`/admin/categories/${c.id}`, { isVisible: v });
    c.isVisible = v;
    toast.add({ severity: 'success', summary: 'Xong', detail: v ? 'Đã công khai' : 'Đã ẩn', life: 2000 });
  } catch { toast.add({ severity: 'error', summary: 'Lỗi', detail: 'Không đổi được trạng thái', life: 3000 }); }
}
function remove(c: any) {
  confirm.require({
    message: `Xóa danh mục "${c.name}"?`, header: 'Xác nhận', icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Xóa', rejectLabel: 'Hủy', acceptClass: 'p-button-danger',
    accept: async () => {
      try { await api.del(`/admin/categories/${c.id}`); toast.add({ severity: 'success', summary: 'Xong', detail: 'Đã xóa', life: 3000 }); load(); }
      catch { toast.add({ severity: 'error', summary: 'Lỗi', detail: 'Xóa thất bại', life: 3000 }); }
    },
  });
}
async function bulkVisible(v: boolean) {
  const ids = selected.value.map((c) => c.id);
  if (!ids.length) return;
  try {
    await Promise.all(ids.map((id) => api.patch(`/admin/categories/${id}`, { isVisible: v })));
    toast.add({ severity: 'success', summary: 'Xong', detail: `Đã ${v ? 'công khai' : 'ẩn'} ${ids.length} danh mục`, life: 3000 });
    selected.value = []; load();
  } catch { toast.add({ severity: 'error', summary: 'Lỗi', detail: 'Thao tác hàng loạt thất bại', life: 3000 }); }
}
function bulkDelete() {
  const ids = selected.value.map((c) => c.id);
  if (!ids.length) return;
  confirm.require({
    message: `Xóa ${ids.length} danh mục đã chọn?`, header: 'Xác nhận', icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Xóa', rejectLabel: 'Hủy', acceptClass: 'p-button-danger',
    accept: async () => {
      try {
        await Promise.all(ids.map((id) => api.del(`/admin/categories/${id}`)));
        toast.add({ severity: 'success', summary: 'Xong', detail: `Đã xóa ${ids.length} danh mục`, life: 3000 });
        selected.value = []; load();
      } catch { toast.add({ severity: 'error', summary: 'Lỗi', detail: 'Xóa hàng loạt thất bại', life: 3000 }); }
    },
  });
}
// --- Tab Tin bai: chuyen muc bao dien tu (API /admin/news-categories) ---
const newsCats = ref<any[]>([]);
const newsLoading = ref(false);
const newsDlg = ref(false);
const newsEditing = ref<any>(null);
const newsSaving = ref(false);
const newsForm = ref({ name: '', slug: '', parentId: '', sortOrder: 0, isVisible: true });
const newsFiltered = computed(() => {
  const needle = q.value.trim().toLowerCase();
  return newsCats.value.filter((c) => !needle || (c.name || '').toLowerCase().includes(needle));
});
function newsParentName(parentId: string | null) {
  if (!parentId) return '—';
  return newsCats.value.find((c) => c.id === parentId || c.publicId === parentId)?.name || '—';
}
const newsParentOptions = computed(() => newsCats.value
  .filter((c) => !c.parentId)
  .map((c) => ({ label: c.name, value: c.publicId })));
async function loadNewsCats() {
  newsLoading.value = true;
  try { newsCats.value = await api.get<any[]>('/admin/news-categories') || []; }
  catch { newsCats.value = []; }
  finally { newsLoading.value = false; }
}
function openNewsAdd() {
  newsEditing.value = null;
  newsForm.value = { name: '', slug: '', parentId: '', sortOrder: 0, isVisible: true };
  newsDlg.value = true;
}
function openNewsEdit(c: any) {
  newsEditing.value = c;
  newsForm.value = {
    name: c.name || '', slug: c.slug || '',
    parentId: newsCats.value.find((x) => x.id === c.parentId)?.publicId || '',
    sortOrder: c.sortOrder || 0, isVisible: c.isVisible !== false,
  };
  newsDlg.value = true;
}
async function saveNewsCat() {
  newsSaving.value = true;
  const payload: any = {
    name: newsForm.value.name.trim(),
    slug: newsForm.value.slug.trim() || undefined,
    parentId: newsForm.value.parentId || null,
    sortOrder: Number(newsForm.value.sortOrder) || 0,
    isVisible: newsForm.value.isVisible,
  };
  try {
    if (newsEditing.value) await api.patch(`/admin/news-categories/${newsEditing.value.publicId}`, payload);
    else await api.post('/admin/news-categories', payload);
    toast.add({ severity: 'success', summary: 'Đã lưu chuyên mục', life: 2500 });
    newsDlg.value = false;
    loadNewsCats();
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.response?.data?.message || 'Lưu chuyên mục thất bại', life: 3000 });
  } finally { newsSaving.value = false; }
}
function removeNewsCat(c: any) {
  confirm.require({
    message: `Xóa chuyên mục "${c.name}"?`, header: 'Xác nhận', icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Xóa', rejectLabel: 'Hủy', acceptClass: 'p-button-danger',
    accept: async () => {
      try {
        await api.del(`/admin/news-categories/${c.publicId}`);
        toast.add({ severity: 'success', summary: 'Đã xóa chuyên mục', life: 2500 });
        loadNewsCats();
      } catch { toast.add({ severity: 'error', summary: 'Lỗi', detail: 'Xóa thất bại', life: 3000 }); }
    },
  });
}

onMounted(() => { load(); loadNewsCats(); });
</script>
