<template>
  <div class="flex flex-col gap-4">
    <div class="flex gap-2">
      <Button v-for="t in tabs" :key="t.key" :label="t.label" :icon="t.icon"
        :severity="tab === t.key ? undefined : 'secondary'" :outlined="tab !== t.key"
        @click="tab = t.key" size="small" />
    </div>

    <!-- TAB 1: Layout blocks cũ (giữ nguyên) -->
    <template v-if="tab === 'blocks'">
      <div class="flex items-center justify-between">
        <p class="text-sm text-neutral-400">Tổng: {{ blocks.length }} blocks</p>
        <Button label="Thêm block" icon="pi pi-plus" @click="openAdd" />
      </div>
      <div class="surface-card p-4">
        <DataTable :value="blocks" :loading="loading" size="small">
          <Column field="order" header="Thứ tự" style="width:6rem" />
          <Column header="Loại">
            <template #body="{ data }"><Tag :value="data.type" :severity="data.type === 'HERO_CAROUSEL' ? 'info' : 'secondary'" /></template>
          </Column>
          <Column field="title" header="Tiêu đề" />
          <Column field="card_aspect" header="Tỉ lệ card" />
          <Column header="Trạng thái">
            <template #body="{ data }"><Tag :value="data.is_active ? 'Bật' : 'Tắt'" :severity="data.is_active ? 'success' : 'secondary'" /></template>
          </Column>
          <Column header="Thao tác">
            <template #body="{ data }">
              <Button label="Sửa" size="small" text @click="openEdit(data)" />
              <Button label="Xóa" size="small" text severity="danger" @click="remove(data)" />
            </template>
          </Column>
        </DataTable>
      </div>

      <Dialog v-model:visible="dlg" modal :header="editing ? 'Sửa block' : 'Thêm block'" class="w-full max-w-xl">
        <div class="flex flex-col gap-3">
          <div class="grid grid-cols-2 gap-3">
            <div><label class="field-label">Thứ tự</label><InputNumber v-model="form.order" class="w-full" /></div>
            <div><label class="field-label">Loại *</label>
              <Dropdown v-model="form.type" :options="['HERO_CAROUSEL', 'HORIZONTAL_LIST']" class="w-full" />
            </div>
          </div>
          <div><label class="field-label">Tiêu đề</label><InputText v-model="form.title" class="w-full" /></div>
          <div class="grid grid-cols-2 gap-3">
            <div><label class="field-label">Target URL</label><InputText v-model="form.target_url" class="w-full" /></div>
            <div><label class="field-label">Tỉ lệ card</label>
              <Dropdown v-model="form.card_aspect" :options="['16/9', '2/3', '1/1']" class="w-full" editable />
            </div>
          </div>
          <div class="flex items-center gap-2"><InputSwitch v-model="form.is_active" input-id="ba" /><label for="ba">Kích hoạt</label></div>
          <div>
            <label class="field-label">Items (JSON)</label>
            <Textarea v-model="itemsText" rows="5" class="w-full font-mono text-xs" placeholder='[{"title":"...","image":"...","url":"..."}]' />
            <small v-if="itemsError" class="text-red-400">{{ itemsError }}</small>
          </div>
        </div>
        <template #footer>
          <Button label="Hủy" text @click="dlg = false" />
          <Button label="Lưu" :loading="saving" :disabled="!!itemsError" @click="save" />
        </template>
      </Dialog>
    </template>

    <!-- TAB 3: Khối giao diện theo mục (giống CMS VTCPlay: 6 trang con) -->
    <template v-if="tab === 'rails'">
      <div class="flex flex-wrap items-center gap-2">
        <Button v-for="s in railSections" :key="s.value" :label="s.label" size="small"
          :severity="railSection === s.value ? undefined : 'secondary'" :outlined="railSection !== s.value"
          @click="railSection = s.value" />
        <span class="ml-auto flex items-center gap-2">
          <label class="text-sm text-neutral-400">Nền tảng:</label>
          <Dropdown v-model="railPlatform" :options="railPlatformOpts" option-label="label" option-value="value"
            class="w-40" size="small" />
        </span>
      </div>

      <div class="flex items-center justify-between">
        <p class="text-sm text-neutral-400">Tổng: {{ rails.length }} khối — kéo <i class="pi pi-bars"></i> để sắp xếp</p>
        <Button v-if="can('catalog:write')" label="Thêm khối" icon="pi pi-plus" @click="openRailAdd" />
      </div>

      <div class="surface-card overflow-x-auto p-2">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-neutral-700 text-left text-neutral-400">
              <th class="w-10 px-2 py-2"></th>
              <th class="w-20 px-2 py-2">Thứ tự</th>
              <th class="px-2 py-2">Tiêu đề</th>
              <th class="px-2 py-2">Loại nội dung</th>
              <th class="px-2 py-2">Danh mục</th>
              <th class="w-28 px-2 py-2">Nền tảng</th>
              <th class="w-24 px-2 py-2">Hiển thị</th>
              <th class="w-28 px-2 py-2">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(r, i) in rails" :key="r.id"
              draggable="true"
              @dragstart="onRailDragStart(i)" @dragover.prevent @drop="onRailDrop(i)"
              class="border-b border-neutral-800 transition hover:bg-neutral-800/40"
              :class="{ 'opacity-40': dragIdx === i }">
              <td class="cursor-move px-2 py-2 text-neutral-500"><i class="pi pi-bars"></i></td>
              <td class="px-2 py-2">{{ r.sortOrder ?? i + 1 }}</td>
              <td class="px-2 py-2 font-medium">{{ r.title }}</td>
              <td class="px-2 py-2">{{ contentTypeLabel(r.contentType) }}</td>
              <td class="px-2 py-2">{{ categoryName(r.categoryId) }}</td>
              <td class="px-2 py-2">{{ platformLabel(r.platform) }}</td>
              <td class="px-2 py-2">
                <InputSwitch :model-value="r.isVisible !== false"
                  @update:model-value="(v: boolean) => toggleRailVisible(r, v)"
                  :disabled="!can('catalog:write')" />
              </td>
              <td class="px-2 py-2">
                <Button v-if="can('catalog:write')" icon="pi pi-pencil" size="small" text rounded severity="success"
                  aria-label="Sửa" @click="openRailEdit(r)" />
                <Button v-if="can('catalog:write')" icon="pi pi-trash" size="small" text rounded severity="danger"
                  aria-label="Xóa" @click="removeRail(r)" />
              </td>
            </tr>
            <tr v-if="!rails.length && !railLoading">
              <td colspan="8" class="px-2 py-6 text-center text-neutral-500">Chưa có khối nào cho mục này.</td>
            </tr>
          </tbody>
        </table>
        <div v-if="railLoading" class="p-4 text-sm text-neutral-400">Đang tải...</div>
      </div>

      <Dialog v-model:visible="railDlg" modal :header="editingRail ? 'Cập nhật khối giao diện' : 'Thêm khối giao diện'" class="w-full max-w-xl">
        <div class="flex flex-col gap-3">
          <div><label class="field-label">Tiêu đề *</label><InputText v-model="railForm.title" class="w-full" /></div>
          <div class="grid grid-cols-2 gap-3">
            <div><label class="field-label">Nền tảng hiển thị</label>
              <Dropdown v-model="railForm.platform" :options="railPlatformOpts.slice(1)" option-label="label" option-value="value" class="w-full" />
            </div>
            <div><label class="field-label">Loại nội dung</label>
              <Dropdown v-model="railForm.contentType" :options="contentTypeOpts" option-label="label" option-value="value" class="w-full" />
            </div>
          </div>
          <div v-if="railForm.contentType !== 'event'">
            <label class="field-label">Danh mục *</label>
            <Dropdown v-model="railForm.categoryId" :options="categoryOpts" option-label="name" option-value="id"
              placeholder="— Chọn danh mục —" class="w-full" filter />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div><label class="field-label">Thứ tự *</label><InputNumber v-model="railForm.sortOrder" class="w-full" :use-grouping="false" /></div>
            <div><label class="field-label">Style giao diện</label>
              <Dropdown v-model="railForm.style" :options="['Mặc định']" class="w-full" />
            </div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div><label class="field-label">Hiển thị từ ngày</label><Calendar v-model="railForm.visibleFrom" date-format="yy-mm-dd" show-icon class="w-full" /></div>
            <div><label class="field-label">Hiển thị đến ngày</label><Calendar v-model="railForm.visibleTo" date-format="yy-mm-dd" show-icon class="w-full" /></div>
          </div>
          <div>
            <label class="field-label">Trạng thái hiển thị</label>
            <div class="flex gap-4">
              <div class="flex items-center gap-2">
                <RadioButton v-model="railForm.isVisible" input-id="rvis1" :value="true" />
                <label for="rvis1">Hiển thị</label>
              </div>
              <div class="flex items-center gap-2">
                <RadioButton v-model="railForm.isVisible" input-id="rvis2" :value="false" />
                <label for="rvis2">Ẩn</label>
              </div>
            </div>
          </div>
        </div>
        <template #footer>
          <Button label="Đóng" text @click="railDlg = false" />
          <Button :label="editingRail ? 'Lưu' : 'Lưu'" :loading="railSaving" @click="saveRail"
            :disabled="!railForm.title.trim() || (railForm.contentType !== 'event' && !railForm.categoryId)" />
        </template>
      </Dialog>
    </template>

  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'auth' });
useHead({ title: 'Giao diện - VTC ANY CMS' });

const { can } = useCmsAuth();
const api = useApi();
const toast = useToast();
const confirm = useConfirm();

const tabs = [
  { key: 'blocks', label: 'Layout blocks', icon: 'pi pi-th-large' },
  { key: 'rails', label: 'Khối giao diện theo mục', icon: 'pi pi-list' },
];
const tab = ref('blocks');
const sections = [
  { label: 'Trang chủ', value: 'home' },
  { label: 'Truyền hình', value: 'tv' },
  { label: 'Phim', value: 'movies' },
  { label: 'Video', value: 'video' },
  { label: 'Short', value: 'short' },
  { label: 'Giải trí', value: 'entertainment' },
];
function sectionLabel(s: string) { return sections.find((x) => x.value === s)?.label || s || '—'; }
function toDate(v: any) { return v ? new Date(v) : null; }
function toIso(d: any) { return d instanceof Date && !isNaN(d.getTime()) ? d.toISOString() : (d || ''); }

// ---- TAB blocks (logic cũ giữ nguyên) ----
const blocks = ref<any[]>([]);
const loading = ref(true);
const dlg = ref(false);
const editing = ref<any>(null);
const saving = ref(false);
const form = ref({ order: 0, type: 'HORIZONTAL_LIST', title: '', target_url: '', card_aspect: '16/9', is_active: true });
const itemsText = ref('[]');
const itemsError = ref('');

watch(itemsText, (v) => {
  try { const p = JSON.parse(v || '[]'); itemsError.value = Array.isArray(p) ? '' : 'Items phải là mảng JSON.'; }
  catch { itemsError.value = 'JSON không hợp lệ.'; }
});

async function load() {
  loading.value = true;
  try { const r = await api.get<any>('/admin/layout-blocks'); blocks.value = r.data || []; }
  catch { toast.add({ severity: 'error', summary: 'Lỗi', detail: 'Không tải được layout blocks', life: 3000 }); }
  finally { loading.value = false; }
}
function openAdd() {
  editing.value = null;
  form.value = { order: blocks.value.length, type: 'HORIZONTAL_LIST', title: '', target_url: '', card_aspect: '16/9', is_active: true };
  itemsText.value = '[]'; dlg.value = true;
}
function openEdit(b: any) {
  editing.value = b;
  form.value = { order: b.order ?? 0, type: b.type, title: b.title || '', target_url: b.target_url || '', card_aspect: b.card_aspect || '16/9', is_active: b.is_active !== false };
  itemsText.value = JSON.stringify(b.items || [], null, 2);
  dlg.value = true;
}
async function save() {
  if (itemsError.value) return;
  saving.value = true;
  const body = { ...form.value, items: JSON.parse(itemsText.value || '[]') };
  try {
    if (editing.value) await api.patch(`/admin/layout-blocks/${editing.value.id}`, body);
    else await api.post('/admin/layout-blocks', body);
    toast.add({ severity: 'success', summary: 'Xong', detail: 'Đã lưu block', life: 3000 });
    dlg.value = false; load();
  } catch (e: any) { toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.response?.data?.message || 'Lưu thất bại', life: 3000 }); }
  finally { saving.value = false; }
}
function remove(b: any) {
  confirm.require({
    message: `Xóa block "${b.title || b.type}"?`, header: 'Xác nhận', icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Xóa', rejectLabel: 'Hủy', acceptClass: 'p-button-danger',
    accept: async () => {
      try { await api.del(`/admin/layout-blocks/${b.id}`); toast.add({ severity: 'success', summary: 'Xong', detail: 'Đã xóa', life: 3000 }); load(); }
      catch { toast.add({ severity: 'error', summary: 'Lỗi', detail: 'Xóa thất bại', life: 3000 }); }
    },
  });
}

// ---- TAB rails: khối giao diện theo mục (giống CMS VTCPlay) ----
const railSections = [
  { label: 'Trang chủ', value: 'home' },
  { label: 'Truyền hình', value: 'tv' },
  { label: 'Phim', value: 'movies' },
  { label: 'Video', value: 'video' },
  { label: 'Short', value: 'short' },
  { label: 'Giải trí', value: 'entertainment' },
];
const railSection = ref('home');
const railPlatformOpts = [
  { label: 'Tất cả', value: '' },
  { label: 'Website', value: 'web' },
  { label: 'Mobile', value: 'mobile' },
  { label: 'SmartTV', value: 'smarttv' },
];
const railPlatform = ref('');
const contentTypeOpts = [
  { label: 'Danh mục Phim', value: 'movie' },
  { label: 'Danh mục Video', value: 'video' },
  { label: 'Danh mục Short', value: 'short' },
  { label: 'Danh mục Truyền hình', value: 'tv' },
  { label: 'Sự kiện', value: 'event' },
];
// contentType -> appliesTo cua danh muc
const typeToApplies: Record<string, string> = { movie: 'phim', video: 'video', short: 'short', tv: 'truyen-hinh' };
function contentTypeLabel(v: string) { return contentTypeOpts.find((x) => x.value === v)?.label || v || '—'; }
function platformLabel(v: string) { return railPlatformOpts.find((x) => x.value === v)?.label || v || '—'; }

const railCtl = useCatalog('rails');
const rails = ref<any[]>([]);
const railLoading = ref(false);
const allCats = ref<any[]>([]);

async function loadRails() {
  railLoading.value = true;
  try {
    const r = await api.get<any>('/admin/catalog/rails', { page: 1, limit: 200 });
    rails.value = (r.data || [])
      .filter((x: any) => x.section === railSection.value)
      .filter((x: any) => !railPlatform.value || x.platform === railPlatform.value)
      .sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  } catch { toast.add({ severity: 'error', summary: 'Lỗi', detail: 'Không tải được khối giao diện', life: 3000 }); }
  finally { railLoading.value = false; }
}
async function loadCats() {
  try { const r = await api.get<any>('/admin/categories'); allCats.value = r.data || []; }
  catch { /* bo qua */ }
}
function categoryName(id: string) {
  return allCats.value.find((c) => c.id === id)?.name || '—';
}
const categoryOpts = computed(() => {
  const applies = typeToApplies[railForm.value.contentType];
  return allCats.value.filter((c) => !applies || (c.appliesTo || []).includes(applies));
});

const railDlg = ref(false);
const editingRail = ref<any>(null);
const railSaving = ref(false);
const railForm = ref({
  title: '', platform: 'web', contentType: 'movie', categoryId: '',
  sortOrder: 1, visibleFrom: null as any, visibleTo: null as any,
  style: 'Mặc định', isVisible: true,
});

function openRailAdd() {
  editingRail.value = null;
  railForm.value = {
    title: '', platform: 'web', contentType: railSection.value === 'movies' ? 'movie' : railSection.value === 'video' || railSection.value === 'entertainment' ? 'video' : railSection.value === 'short' ? 'short' : railSection.value === 'tv' ? 'tv' : 'movie',
    categoryId: '', sortOrder: rails.value.length + 1,
    visibleFrom: null, visibleTo: null, style: 'Mặc định', isVisible: true,
  };
  railDlg.value = true;
}
function openRailEdit(r: any) {
  editingRail.value = r;
  railForm.value = {
    title: r.title || '', platform: r.platform || 'web', contentType: r.contentType || 'movie',
    categoryId: r.categoryId || '', sortOrder: r.sortOrder ?? 1,
    visibleFrom: toDate(r.visibleFrom), visibleTo: toDate(r.visibleTo),
    style: r.style || 'Mặc định', isVisible: r.isVisible !== false,
  };
  railDlg.value = true;
}
async function saveRail() {
  railSaving.value = true;
  const cat = allCats.value.find((c) => c.id === railForm.value.categoryId);
  const ok = await railCtl.saveItem(editingRail.value?.id || null, {
    title: railForm.value.title.trim(),
    section: railSection.value,
    platform: railForm.value.platform,
    contentType: railForm.value.contentType,
    categoryId: railForm.value.categoryId || undefined,
    categorySlug: cat?.slug,
    sortOrder: railForm.value.sortOrder ?? 1,
    visibleFrom: toIso(railForm.value.visibleFrom) || undefined,
    visibleTo: toIso(railForm.value.visibleTo) || undefined,
    style: railForm.value.style,
    isVisible: railForm.value.isVisible,
  }, 'Đã lưu khối giao diện');
  railSaving.value = false;
  if (ok) { railDlg.value = false; loadRails(); }
}
async function toggleRailVisible(r: any, v: boolean) {
  try {
    await api.patch(`/admin/catalog/rails/${r.id}`, { isVisible: v });
    r.isVisible = v;
    toast.add({ severity: 'success', summary: 'Xong', detail: v ? 'Đã hiển thị' : 'Đã ẩn', life: 2000 });
  } catch { toast.add({ severity: 'error', summary: 'Lỗi', detail: 'Không đổi được trạng thái', life: 3000 }); }
}

function removeRail(r: any) {
  confirm.require({
    message: `Xóa khối "${r.title}"?`, header: 'Xác nhận', icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Xóa', rejectLabel: 'Hủy', acceptClass: 'p-button-danger',
    accept: async () => {
      try {
        await api.del(`/admin/catalog/rails/${r.id}`);
        toast.add({ severity: 'success', summary: 'Xong', detail: 'Đã xóa', life: 3000 });
        loadRails();
      } catch { toast.add({ severity: 'error', summary: 'Lỗi', detail: 'Xóa thất bại', life: 3000 }); }
    },
  });
}

// Keo-tha sap xep (giong VTCPlay): keo hang roi tha vao vi tri moi.
const dragIdx = ref(-1);
function onRailDragStart(i: number) { dragIdx.value = i; }
async function onRailDrop(i: number) {
  const from = dragIdx.value;
  dragIdx.value = -1;
  if (from < 0 || from === i) return;
  const moved = rails.value.splice(from, 1)[0];
  rails.value.splice(i, 0, moved);
  rails.value.forEach((r, idx) => { r.sortOrder = idx + 1; });
  try {
    await Promise.all(rails.value.map((r) => api.patch(`/admin/catalog/rails/${r.id}`, { sortOrder: r.sortOrder })));
    toast.add({ severity: 'success', summary: 'Xong', detail: 'Đã cập nhật thứ tự', life: 2000 });
  } catch { toast.add({ severity: 'error', summary: 'Lỗi', detail: 'Lưu thứ tự thất bại', life: 3000 }); loadRails(); }
}

watch(tab, (t) => {
  if (t === 'rails') { loadCats(); loadRails(); }
});
watch([railSection, railPlatform], () => { if (tab.value === 'rails') loadRails(); });
onMounted(load);
</script>
