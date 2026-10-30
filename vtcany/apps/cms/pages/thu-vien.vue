<template>
  <div class="flex flex-col gap-4">
    <div class="surface-card p-4 flex flex-wrap gap-2">
      <Dropdown v-model="kind" :options="kindOptions" option-label="label" option-value="value" class="w-44" @change="load(1)" />
      <InputText v-model="q" placeholder="Tìm tên file..." class="flex-1 min-w-52" @keyup.enter="load(1)" />
      <Button label="Tìm" size="small" @click="load(1)" />
    </div>

    <div class="flex gap-4 items-start">
      <!-- Cay thu muc LOGIC (Goi 2D-1): chi phan loai trong CSDL, khong di
           chuyen file vat ly nen URL khong doi. -->
      <div class="surface-card p-3 w-64 shrink-0 flex flex-col gap-1">
        <p class="text-sm font-medium mb-1">Thư mục</p>
        <button type="button" :class="rowCls(folderSel === 'all')" @click="selectFolder('all')">
          <span>Tất cả tập tin</span><span class="text-neutral-400">{{ folderMeta.totalFiles }}</span>
        </button>
        <button type="button" :class="rowCls(folderSel === 'root')" @click="selectFolder('root')">
          <span>Chưa phân loại</span><span class="text-neutral-400">{{ folderMeta.unclassifiedCount }}</span>
        </button>
        <div v-for="f in folders" :key="f.id" :class="rowCls(folderSel === f.id)" :style="{ paddingLeft: `${12 + f.depth * 16}px` }">
          <button type="button" class="flex-1 text-left truncate" @click="selectFolder(f.id)">{{ f.name }} <span class="text-neutral-400">({{ f.totalCount }})</span></button>
          <Button v-if="can('catalog:update')" icon="pi pi-pencil" size="small" text @click="openFolderDlg(f)" />
          <Button v-if="can('catalog:delete')" icon="pi pi-trash" size="small" text severity="danger" @click="removeFolder(f)" />
        </div>
        <Button v-if="can('catalog:create')" label="Thư mục mới" icon="pi pi-plus" size="small" outlined class="mt-2" @click="openFolderDlg(null)" />
        <p class="text-[11px] text-neutral-500 mt-2">Thư mục chỉ để phân loại — chuyển thư mục không đổi URL của file.</p>
      </div>

      <div class="flex-1 flex flex-col gap-4 min-w-0">
        <p class="text-sm text-neutral-400">Tổng: {{ meta.total }} tập tin — ảnh, video, audio dùng chung cho cả tòa soạn (ảnh bìa, ảnh trong bài, tư liệu). Trang "Tập tin" (video VOD) vẫn hoạt động riêng.</p>

        <div v-if="loading" class="text-sm text-neutral-400">Đang tải...</div>
        <div v-else-if="!items.length" class="text-sm text-neutral-400">Chưa có tập tin nào khớp bộ lọc.</div>
        <div v-else class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <div v-for="it in items" :key="it.id" class="surface-card p-3 flex flex-col gap-2">
            <div class="aspect-video rounded-lg overflow-hidden bg-neutral-800 flex items-center justify-center">
              <img v-if="it.kind === 'image' && it.url" :src="resolveMedia(it.url)" class="w-full h-full object-cover" :alt="it.filename" loading="lazy" />
              <img v-else-if="it.kind === 'video' && it.posterUrl" :src="resolveMedia(it.posterUrl)" class="w-full h-full object-cover" :alt="it.filename" loading="lazy" />
              <i v-else :class="['pi text-3xl text-neutral-500', it.kind === 'video' ? 'pi-play' : 'pi-volume-up']"></i>
            </div>
            <p class="text-xs truncate" :title="it.filename">{{ it.filename }}</p>
            <div class="flex items-center gap-2">
              <Tag :value="kindLabel(it.kind)" severity="secondary" />
              <Tag v-if="it.status" :value="it.status" :severity="it.status === 'done' ? 'success' : 'warn'" />
              <Tag v-if="folderName(it.folderId)" :value="folderName(it.folderId)" severity="info" />
            </div>
            <p class="text-[11px] text-neutral-500">{{ fmtSize(it.sizeBytes) }} · {{ fmtDate(it.createdAt) }}</p>
            <Button v-if="it.url || it.posterUrl" label="Sao chép URL" icon="pi pi-copy" size="small" text @click="copyUrl(resolveMedia(it.url || it.posterUrl))" />
            <Button v-if="can('catalog:update')" label="Chuyển thư mục" icon="pi pi-folder-open" size="small" text @click="openMove(it)" />
            <Button v-if="can('catalog:delete')" label="Xóa" icon="pi pi-trash" size="small" text severity="danger" @click="removeItem(it)" />
          </div>
        </div>

        <div class="flex items-center justify-between">
          <span class="text-xs text-neutral-400">Trang {{ meta.page }} — tổng {{ meta.total }}</span>
          <span class="flex gap-2">
            <Button label="Trước" size="small" text :disabled="meta.page <= 1" @click="load(meta.page - 1)" />
            <Button label="Sau" size="small" text :disabled="meta.page * meta.limit >= meta.total" @click="load(meta.page + 1)" />
          </span>
        </div>
      </div>
    </div>

    <!-- Tao / sua thu muc -->
    <Dialog v-model:visible="folderDlg" modal :header="folderForm.id ? 'Sửa thư mục' : 'Thư mục mới'" class="w-[95vw] max-w-md">
      <div class="flex flex-col gap-3">
        <InputText v-model="folderForm.name" placeholder="Tên thư mục *" class="w-full" />
        <Dropdown v-model="folderForm.parentId" :options="parentOptions" option-label="label" option-value="value" placeholder="Thư mục cha (để trống = thư mục gốc)" class="w-full" show-clear />
      </div>
      <template #footer>
        <Button label="Hủy" text @click="folderDlg = false" />
        <Button label="Lưu" icon="pi pi-check" :loading="saving" @click="saveFolder" />
      </template>
    </Dialog>

    <!-- Chuyen file sang thu muc khac -->
    <Dialog v-model:visible="moveDlg" modal header="Chuyển thư mục" class="w-[95vw] max-w-md">
      <div class="flex flex-col gap-3">
        <p class="text-sm truncate">{{ moveItem?.filename }}</p>
        <Dropdown v-model="moveTarget" :options="moveOptions" option-label="label" option-value="value" placeholder="Chọn thư mục đích" class="w-full" />
        <p class="text-xs text-neutral-500">Chỉ đổi phân loại trong thư viện — URL và file gốc giữ nguyên.</p>
      </div>
      <template #footer>
        <Button label="Hủy" text @click="moveDlg = false" />
        <Button label="Chuyển" icon="pi pi-check" :loading="saving" @click="doMove" />
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'auth' });
useHead({ title: 'Thư viện - VTC ANY CMS' });

const { can } = useCmsAuth();
const api = useApi();
const toast = useToast();

const kindOptions = [
  { label: 'Tất cả', value: '' },
  { label: 'Ảnh', value: 'image' },
  { label: 'Video', value: 'video' },
  { label: 'Audio', value: 'audio' },
];
function kindLabel(k: string) {
  return kindOptions.find((o) => o.value === k)?.label || k;
}

const items = ref<any[]>([]);
const meta = ref({ total: 0, page: 1, limit: 20 });
const loading = ref(false);
const kind = ref('');
const q = ref('');

// ---- Thu muc (Goi 2D-1) ----
const folders = ref<any[]>([]);
const folderMeta = ref({ unclassifiedCount: 0, totalFiles: 0 });
const folderSel = ref<'all' | 'root' | string>('all');
const saving = ref(false);

function rowCls(active: boolean) {
  return [
    'flex items-center justify-between gap-1 w-full text-left text-sm px-3 py-1.5 rounded',
    active ? 'bg-neutral-700 text-white' : 'hover:bg-neutral-800',
  ];
}
function folderName(id: string | null | undefined) {
  if (!id) return '';
  return folders.value.find((f) => f.id === id)?.name || '';
}
function selectFolder(sel: 'all' | 'root' | string) {
  folderSel.value = sel;
  load(1);
}
async function loadFolders() {
  try {
    const r = await api.get<any>('/admin/media-folders');
    folders.value = r.data || [];
    folderMeta.value = { unclassifiedCount: r.unclassifiedCount || 0, totalFiles: r.totalFiles || 0 };
  } catch { /* khong co quyen catalog:read thi danh sach file cung khong tai duoc */ }
}

const folderDlg = ref(false);
const folderForm = ref<{ id: string | null; name: string; parentId: string | null }>({ id: null, name: '', parentId: null });
const parentOptions = computed(() => folders.value
  .filter((f) => f.id !== folderForm.value.id)
  .map((f) => ({ label: `${'— '.repeat(f.depth)}${f.name}`, value: f.id })));
function openFolderDlg(f: any | null) {
  folderForm.value = f
    ? { id: f.id, name: f.name, parentId: f.parentId || null }
    : { id: null, name: '', parentId: folderSel.value !== 'all' && folderSel.value !== 'root' ? folderSel.value : null };
  folderDlg.value = true;
}
async function saveFolder() {
  if (!folderForm.value.name.trim()) { toast.add({ severity: 'warn', summary: 'Chưa nhập tên thư mục', life: 2500 }); return; }
  saving.value = true;
  try {
    if (folderForm.value.id) await api.patch(`/admin/media-folders/${folderForm.value.id}`, { name: folderForm.value.name, parentId: folderForm.value.parentId });
    else await api.post('/admin/media-folders', { name: folderForm.value.name, parentId: folderForm.value.parentId });
    toast.add({ severity: 'success', summary: 'Đã lưu thư mục', life: 2500 });
    folderDlg.value = false;
    loadFolders();
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.response?.data?.message || e?.message || 'Lưu thư mục thất bại', life: 3000 });
  } finally { saving.value = false; }
}
async function removeFolder(f: any) {
  if (!window.confirm(`Xóa thư mục "${f.name}"? File bên trong sẽ về "Chưa phân loại" (không xóa file), thư mục con chuyển lên thư mục cha.`)) return;
  try {
    await api.del(`/admin/media-folders/${f.id}`);
    toast.add({ severity: 'success', summary: 'Đã xóa thư mục', life: 2500 });
    if (folderSel.value === f.id) folderSel.value = 'all';
    loadFolders();
    load(1);
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.response?.data?.message || e?.message || 'Xóa thư mục thất bại', life: 3000 });
  }
}

const moveDlg = ref(false);
const moveItem = ref<any | null>(null);
const moveTarget = ref<string | null>(null);
const moveOptions = computed(() => [
  { label: 'Chưa phân loại', value: null },
  ...folders.value.map((f) => ({ label: `${'— '.repeat(f.depth)}${f.name}`, value: f.id })),
]);
function openMove(it: any) {
  moveItem.value = it;
  moveTarget.value = it.folderId || null;
  moveDlg.value = true;
}
async function doMove() {
  if (!moveItem.value) return;
  saving.value = true;
  try {
    await api.patch(`/admin/media/${moveItem.value.id}/folder`, { folderId: moveTarget.value });
    toast.add({ severity: 'success', summary: 'Đã chuyển thư mục', life: 2500 });
    moveDlg.value = false;
    loadFolders();
    load(meta.value.page);
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.response?.data?.message || e?.message || 'Chuyển thư mục thất bại', life: 3000 });
  } finally { saving.value = false; }
}

function resolveMedia(u: string) {
  if (!u) return '';
  if (/^(https?:)?\/\//.test(u) || u.startsWith('data:')) return u;
  if (!u.startsWith('/')) return u;
  try { return new URL(useRuntimeConfig().public.apiBase as string).origin + u; } catch { return u; }
}
function fmtSize(n: number) {
  if (!n) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
function fmtDate(ms: number) {
  if (!ms) return '—';
  try { return new Date(ms).toISOString().slice(0, 16).replace('T', ' '); } catch { return '—'; }
}
async function copyUrl(u: string) {
  try { await navigator.clipboard.writeText(u); toast.add({ severity: 'success', summary: 'Đã sao chép URL', life: 2000 }); }
  catch { toast.add({ severity: 'warn', summary: u, life: 3000 }); }
}
async function removeItem(it: any) {
  // Xoa theo id (khong theo ten hien thi: ten trung nhau giua cac ban ghi).
  // useApi chi co del, khong co delete — dung api.del nhu cac nut Xoa khac.
  if (!window.confirm(`Xóa tập tin "${it.filename}" khỏi thư viện?`)) return;
  try {
    await api.del(`/admin/media/${it.id}`);
    toast.add({ severity: 'success', summary: 'Đã xóa tập tin', life: 2500 });
    loadFolders();
    load(meta.value.page);
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.response?.data?.message || e?.message || 'Xóa thất bại', life: 3000 });
  }
}
async function load(page = 1) {
  loading.value = true;
  try {
    const r = await api.get<any>('/admin/media', {
      kind: kind.value || undefined, q: q.value || undefined, page, limit: meta.value.limit,
      folderId: folderSel.value === 'all' ? undefined : folderSel.value,
    });
    items.value = r.data || [];
    meta.value = { total: r.total || 0, page: r.page || 1, limit: r.limit || 20 };
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.response?.data?.message || e?.message || 'Không tải được thư viện', life: 3000 });
  } finally { loading.value = false; }
}
loadFolders();
load(1);
</script>
