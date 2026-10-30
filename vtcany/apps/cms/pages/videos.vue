<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center justify-between">
      <p class="text-sm text-neutral-400">Tổng: {{ meta.total }} video</p>
      <Button v-if="can('catalog:write')" label="Thêm video" icon="pi pi-plus" @click="openAdd" />
    </div>

    <div class="surface-card p-4">
      <DataTable :value="items" :loading="loading" paginator :rows="20" :total-records="meta.total"
        lazy :first="(meta.page - 1) * meta.limit" @page="onPage" size="small">
        <Column header="Ảnh" style="width:6.5rem">
          <template #body="{ data }">
            <img v-if="data.thumbnail" :src="data.thumbnail" class="w-20 aspect-video object-cover rounded" alt="" />
            <span v-else class="text-neutral-500 text-xs">—</span>
          </template>
        </Column>
        <Column field="title" header="Tên" />
        <Column header="Danh mục" style="width:11rem">
          <template #body="{ data }">{{ categoryNames(data.categoryIds) }}</template>
        </Column>
        <Column header="Gói cước" style="width:9rem">
          <template #body="{ data }"><Tag :value="data.planId ? planName(data.planId) : 'Miễn phí'" :severity="data.planId ? 'warn' : 'success'" /></template>
        </Column>
        <Column header="Hiển thị" style="width:7rem">
          <template #body="{ data }"><Tag :value="data.isVisible ? 'Bật' : 'Tắt'" :severity="sevVisible(data.isVisible)" /></template>
        </Column>
        <Column field="createdAt" header="Ngày tạo">
          <template #body="{ data }">{{ fmtDate(data.createdAt) }}</template>
        </Column>
        <Column header="Thao tác" style="min-width:14rem">
          <template #body="{ data }">
            <Button size="small" text label="Link phát" @click="showPlay(data)" />
            <Button v-if="can('catalog:write')" :label="data.isVisible ? 'Ẩn' : 'Xuất bản'" size="small" text :severity="data.isVisible ? 'warn' : 'success'" @click="togglePublish(data)" />
            <Button v-if="can('articles:create') && data.isVisible" label="Tạo bản nháp Báo điện tử" size="small" text severity="info" @click="openConvertDialog('videos', data)" />
            <Button v-if="can('catalog:write')" label="Sửa" size="small" text @click="openEdit(data)" />
            <Button v-if="can('catalog:write')" label="Xóa" size="small" text severity="danger" @click="confirmDelete(confirm, data.id, data.title)" />
          </template>
        </Column>
      </DataTable>
    </div>

    <Dialog v-model:visible="dlg" modal :header="editing ? 'Cập nhật video' : 'Thêm video'" class="w-[95vw] max-w-7xl">
      <div class="max-h-[calc(100dvh_-_190px)] overflow-y-auto pr-2">
      <div class="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-5">
        <!-- Cot trai: thong tin -->
        <div class="flex flex-col gap-3">
          <div><label class="field-label">Tên (bắt buộc)</label><InputText v-model="form.title" class="w-full" /></div>
          <div><label class="field-label">Mô tả</label><Textarea v-model="form.description" rows="5" class="w-full" /></div>
          <div><label class="field-label">Danh mục</label>
            <MultiSelect v-model="form.categoryIds" :options="typeCategories('video')" option-label="name" option-value="id" filter display="chip"
              :loading="loadingCats" placeholder="Chọn danh mục" class="w-full" />
          </div>
          <div><label class="field-label">Danh sách phát</label>
            <Dropdown v-model="form.playlistId" :options="playlists" option-label="name" option-value="id" show-clear filter
              :loading="loadingPlaylists" placeholder="Chọn danh sách phát" class="w-full" />
          </div>
          <div><label class="field-label">Gói cước</label>
            <Dropdown v-model="form.planId" :options="plans" option-label="name" option-value="id" show-clear
              :loading="loadingPlans" placeholder="Miễn phí" class="w-full" />
          </div>
          <div><label class="field-label">Giới hạn độ tuổi</label>
            <Dropdown v-model="form.ageLimit" :options="ageOptions" show-clear placeholder="P - Phù hợp mọi độ tuổi" class="w-full" />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div><label class="field-label">Ngày xuất bản</label>
              <Calendar v-model="publishedDate" date-format="dd/mm/yy" show-icon placeholder="dd/mm/yyyy" class="w-full" />
            </div>
            <div><label class="field-label">Thời lượng video</label>
              <InputText v-model="form.duration" placeholder="giờ:phút:giây" class="w-full" />
            </div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div><label class="field-label">Phân phối <i class="pi pi-info-circle text-xs text-neutral-400" v-tooltip.top="'Nền tảng hiển thị video này'"></i></label>
              <MultiSelect v-model="form.distribution" :options="platformOptions" placeholder="Chọn nền tảng" class="w-full" />
            </div>
            <div><label class="field-label">Giá mua lẻ nội dung (VNĐ)</label>
              <InputNumber v-model="form.price" class="w-full" :use-grouping="true" placeholder="0" />
            </div>
          </div>
          <div class="flex items-center gap-2"><Checkbox v-model="form.isVisible" binary input-id="vv" /><label for="vv">Hiển thị (xuất bản)</label></div>
        </div>

        <!-- Cot phai: thumbnail 16:9 + video -->
        <div class="flex flex-col gap-4">
          <div>
            <label class="field-label">Ảnh thumbnail (Tỉ lệ 16:9)</label>
            <ImagePicker v-model="form.thumbnail" ratio="16/9" />
          </div>
          <div>
            <label class="field-label">Video</label>
            <div class="relative aspect-video overflow-hidden rounded-lg bg-neutral-900">
              <HlsPreview v-if="previewUrl" ref="previewRef" :src="previewUrl" :poster="form.thumbnail" class="absolute inset-0" />
              <div v-else class="absolute inset-0 flex flex-col items-center justify-center gap-2 p-3 text-center">
                <i class="pi pi-play-circle text-4xl text-neutral-400"></i>
                <span class="text-xs text-neutral-400 break-all">{{ selectedFileLabel || 'Chưa chọn video' }}</span>
                <span v-if="form.videoFileId" class="text-[11px] text-neutral-500 break-all">{{ form.videoFileId }}</span>
              </div>
              <span v-if="previewUrl" class="absolute right-2 top-2 z-10 flex gap-1.5">
                <button type="button" title="Chụp thumbnail từ khung hình hiện tại"
                  class="flex h-9 w-9 items-center justify-center rounded-full border border-white/70 bg-black/30 text-white backdrop-blur transition hover:bg-black/50 disabled:opacity-50"
                  :disabled="capturing" @click="captureThumb">
                  <i :class="capturing ? 'pi pi-spin pi-spinner text-sm' : 'pi pi-camera text-sm'"></i>
                </button>
                <button type="button" title="Chọn video khác"
                  class="flex h-9 w-9 items-center justify-center rounded-full border border-white/70 bg-black/30 text-green-400 backdrop-blur transition hover:bg-black/50"
                  @click="previewUrl = ''">
                  <i class="pi pi-pencil text-sm"></i>
                </button>
                <button type="button" title="Bỏ video"
                  class="flex h-9 w-9 items-center justify-center rounded-full border border-white/70 bg-black/30 text-red-400 backdrop-blur transition hover:bg-black/50"
                  @click="clearVideo">
                  <i class="pi pi-trash text-sm"></i>
                </button>
              </span>
            </div>
            <Button v-if="editing?.id && form.videoFileId && !previewUrl" label="Xem trước video" icon="pi pi-play"
              outlined size="small" class="mt-2 w-full" :loading="previewBusy" @click="loadPreview" />
            <p v-if="previewErr" class="mt-1 text-xs text-red-500">{{ previewErr }}</p>
            <p v-else-if="!editing && form.videoFileId && !previewUrl" class="mt-1 text-xs text-neutral-400">
              Lưu video này trước để xem trước ngay trong form.
            </p>
            <Dropdown v-model="form.videoFileId" :options="files" option-label="label" option-value="id" editable filter
              :loading="loadingFiles" placeholder="Chọn từ thư viện Tập tin" class="w-full mt-2" />
            <InputText v-model="form.videoFileId" class="w-full mt-1" placeholder="...hoặc nhập ID file thủ công" />
            <div class="mt-3"><MediaUploader @done="onUploadDone" /></div>
          </div>
        </div>
      </div>
      </div>
      <template #footer>
        <Button label="Đóng" text @click="dlg = false" />
        <Button label="Lưu" icon="pi pi-check" :loading="saving" @click="save" :disabled="!form.title.trim()" />
      </template>
    </Dialog>

    <Dialog v-model:visible="playDlg" modal header="Link phát" class="w-full max-w-lg">
      <div v-if="playInfo" class="flex flex-col gap-2">
        <InputText :model-value="playInfo" readonly class="w-full text-xs" />
        <Button label="Sao chép link" icon="pi pi-copy" size="small" @click="copyPlay" />
        <p class="text-xs text-neutral-400">Link HLS đã ký, chỉ phát được khi video đã xuất bản và file đã transcode xong.</p>
      </div>
      <Message v-else-if="playError" severity="warn">{{ playError }}</Message>
    </Dialog>
    <Dialog v-model:visible="convertDlg" modal header="Tạo bản nháp Báo điện tử" class="w-full max-w-lg">
      <div class="flex flex-col gap-3">
        <div><label class="field-label">Tác giả (mặc định là tài khoản đang đăng nhập, sửa hoặc xóa nếu cần)</label>
          <InputText v-model="convertAuthor" class="w-full" placeholder="Tên tác giả" /></div>
        <div><label class="field-label">Chuyên mục (để trống thì biên tập gán sau)</label>
          <Dropdown v-model="convertCategoryId" :options="convertCatOptions" option-label="label" option-value="value"
            placeholder="Chưa chọn chuyên mục" class="w-full" show-clear filter /></div>
      </div>
      <template #footer>
        <Button label="Hủy" text @click="convertDlg = false" />
        <Button label="Tạo bản nháp" @click="confirmConvert" />
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'auth' });
useHead({ title: 'Video - VTC ANY CMS' });

const { can, user } = useCmsAuth();
const confirm = useConfirm();
const api = useApi();
const toast = useToast();
const { items, meta, loading, load, onPage, saveItem, confirmDelete } = useCatalog('videos');
const { files: vodFiles, loadingFiles, loadDoneFiles, fileLabel, playUrl } = useVodFiles();
const files = computed(() => vodFiles.value.map((f) => ({ id: f.id, label: fileLabel(f), posterUrl: f.posterUrl || '' })));
const selectedFileLabel = computed(() => files.value.find((f) => f.id === form.value.videoFileId)?.label || '');

const categories = ref<any[]>([]);
const loadingCats = ref(false);
const playlists = ref<any[]>([]);
const loadingPlaylists = ref(false);
const plans = ref<any[]>([]);
const loadingPlans = ref(false);
const ageOptions = ['P - Phù hợp mọi độ tuổi', 'T13 - 13 tuổi trở lên', 'T16 - 16 tuổi trở lên', 'T18 - 18 tuổi trở lên'];
const platformOptions = ['Website', 'Mobile App', 'TV App'];

function categoryNames(ids: any): string {
  if (!Array.isArray(ids) || !ids.length) return '—';
  return ids.map((id) => categories.value.find((c) => c.id === id)?.name || id).join(', ');
}
// Chi hien danh muc ap dung cho loai noi dung nay (appliesTo rong = hien het, tuong thich du lieu cu).
function typeCategories(kind: string) {
  return categories.value.filter((c) => {
    const a = c.appliesTo || [];
    return !a.length || a.includes(kind);
  });
}
function planName(id: any): string { return plans.value.find((p) => p.id === id)?.name || 'Có gói'; }

async function loadRefs() {
  loadingCats.value = true;
  try { const r = await api.get<any>('/admin/categories'); categories.value = r.data || []; } catch { categories.value = []; }
  finally { loadingCats.value = false; }
  loadingPlaylists.value = true;
  try { const r = await api.get<any>('/admin/catalog/playlists', { page: 1, limit: 100 }); playlists.value = r.data || []; } catch { playlists.value = []; }
  finally { loadingPlaylists.value = false; }
  loadingPlans.value = true;
  try { const r = await api.get<any>('/admin/catalog/plans', { page: 1, limit: 100 }); plans.value = r.data || []; } catch { plans.value = []; }
  finally { loadingPlans.value = false; }
}

const dlg = ref(false);
const editing = ref<any>(null);
const saving = ref(false);
const publishedDate = ref<Date | null>(null);
const playDlg = ref(false);
const playInfo = ref('');
const playError = ref('');
const emptyForm = () => ({ title: '', description: '', categoryIds: [] as string[], playlistId: null as any, planId: null as any, ageLimit: null as any, duration: '', distribution: [] as string[], price: null as number | null, videoFileId: '', thumbnail: '', isVisible: true });
const form = ref(emptyForm());

function openAdd() {
  editing.value = null;
  form.value = emptyForm();
  publishedDate.value = new Date();
  dlg.value = true; loadDoneFiles(); loadRefs();
}
function openEdit(v: any) {
  editing.value = v;
  form.value = {
    title: v.title || '', description: v.description || '',
    categoryIds: Array.isArray(v.categoryIds) ? v.categoryIds : (v.categoryId ? [v.categoryId] : []),
    playlistId: v.playlistId ?? null, planId: v.planId ?? null, ageLimit: v.ageLimit ?? null,
    duration: v.duration || '', distribution: Array.isArray(v.distribution) ? v.distribution : [],
    price: v.price ?? null, videoFileId: v.videoFileId || '', thumbnail: v.thumbnail || '',
    isVisible: v.isVisible !== false,
  };
  publishedDate.value = v.publishedAt ? new Date(v.publishedAt) : null;
  dlg.value = true; loadDoneFiles(); loadRefs();
}
function onUploadDone(uploadId: string) {
  form.value.videoFileId = uploadId;
  loadDoneFiles();
  toast.add({ severity: 'success', summary: 'Upload xong', detail: 'Đã gắn file video vừa tải lên.', life: 3000 });
}
async function togglePublish(row: any) {
  const action = row.isVisible ? 'unpublish' : 'publish';
  try {
    await api.post(`/admin/catalog/videos/${row.id}/${action}`);
    toast.add({ severity: 'success', summary: row.isVisible ? 'Đã ẩn video' : 'Đã xuất bản video', life: 2500 });
    load();
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.response?.data?.error?.message || e?.message, life: 3000 });
  }
}
// Goi 1C: chuyen doi cheo — tu video da xuat ban tao ban nhap Bao dien tu
// (nhap o trang thai Nhap, di quy trinh tin bai binh thuong). Nut chi hien
// khi video dang hien thi (isVisible) va tai khoan co articles:create;
// server chan lai neu nguon chua xuat ban (fail-closed).
// Goi 1C dot 2: chuyen doi cheo qua dialog xac nhan — bien tap chon/ghi
// tac gia (mac dinh email tai khoan dang dang nhap, sua/xoa duoc) va chon
// chuyen muc truoc khi tao nhap; server chan trung nguon (409) va validate
// chuyen muc (sai -> 400). Nut chi hien khi video dang hien thi va tai
// khoan co articles:create; server chan lai neu nguon chua xuat ban.
const convertDlg = ref(false);
const convertPending = ref<any>(null);
const convertEntity = ref('');
const convertAuthor = ref('');
const convertCategoryId = ref('');
const convertCats = ref<any[]>([]);
const convertCatOptions = computed(() => {
  const byId = new Map(convertCats.value.map((c: any) => [c.id, c]));
  return convertCats.value.map((c: any) => {
    const parent = c.parentId ? byId.get(c.parentId) : null;
    return { label: parent ? `${parent.name} / ${c.name}` : c.name, value: c.publicId };
  });
});
async function openConvertDialog(entity: string, row: any) {
  convertPending.value = row;
  convertEntity.value = entity;
  convertAuthor.value = user.value?.email || '';
  convertCategoryId.value = '';
  if (!convertCats.value.length) {
    try { convertCats.value = await api.get<any[]>('/admin/news-categories') || []; }
    catch { convertCats.value = []; }
  }
  convertDlg.value = true;
}
async function confirmConvert() {
  const row = convertPending.value;
  if (!row) return;
  convertDlg.value = false;
  try {
    const r = await api.post<any>('/admin/crossmedia/from-tv', {
      entity: convertEntity.value, id: row.id,
      authors: convertAuthor.value.trim() ? [convertAuthor.value.trim()] : [],
      categoryId: convertCategoryId.value || null,
    });
    toast.add({ severity: 'success', summary: 'Đã tạo bản nháp', detail: `“${r?.title || row.title}” đã tạo trong Tin bài, trạng thái Nháp.`, life: 4000 });
    navigateTo('/tin-bai');
  } catch (e: any) {
    const d = e?.data || e?.response?.data;
    if (d?.slug || d?.publicId) {
      toast.add({ severity: 'warn', summary: 'Đã có bản nháp', detail: 'Nguồn này đã được chuyển đổi trước đó — mở Tin bài để xem bản nháp.', life: 5000 });
      navigateTo('/tin-bai');
    } else {
      toast.add({ severity: 'error', summary: 'Lỗi', detail: d?.message || e?.message || 'Không tạo được bản nháp', life: 4000 });
    }
  }
}
// Xem truoc video ngay trong form (chi voi muc da luu - can id de goi API play).
const previewUrl = ref('');
const previewBusy = ref(false);
const previewErr = ref('');
async function loadPreview() {
  if (!editing.value?.id) return;
  previewBusy.value = true; previewErr.value = '';
  try {
    const r = await api.get<any>(`/admin/catalog/videos/${editing.value.id}/play`);
    previewUrl.value = r.hls_path || '';
    if (!previewUrl.value) previewErr.value = 'Chưa có URL phát cho video này.';
  } catch (e: any) {
    previewErr.value = e?.data?.error?.message || 'Video chưa sẵn sàng (chưa gắn file hoặc transcode chưa xong).';
  } finally { previewBusy.value = false; }
}
function clearVideo() {
  form.value.videoFileId = '';
  previewUrl.value = ''; previewErr.value = '';
}

// Thumbnail tu dong: file video nao da co poster (worker cat khi transcode)
// thi tu dien lam thumbnail neu form chua co anh rieng.
function autoThumbFromFile() {
  if (form.value.thumbnail) return;
  const f = files.value.find((x) => x.id === form.value.videoFileId);
  if (f?.posterUrl) form.value.thumbnail = f.posterUrl;
}

// Chup khung hinh dang phat lam thumbnail: tai anh len thu vien roi gan form.
const previewRef = ref<any>(null);
const capturing = ref(false);
async function captureThumb() {
  if (!previewRef.value?.captureFrame) return;
  capturing.value = true;
  try {
    const blob = await previewRef.value.captureFrame();
    if (!blob) {
      toast.add({ severity: 'warn', summary: 'Chưa chụp được', detail: 'Hãy để video phát một lúc rồi thử lại.', life: 3000 });
      return;
    }
    const file = new File([blob], `thumb-${Date.now()}.jpg`, { type: 'image/jpeg' });
    const res = await api.put<any>('/uploads/image', file, { 'Content-Type': 'image/jpeg', 'x-file-name': encodeURIComponent(file.name) });
    if (res?.url) {
      form.value.thumbnail = res.url;
      toast.add({ severity: 'success', summary: 'Đã cắt thumbnail từ video', life: 2500 });
    }
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Chụp thumbnail lỗi', detail: e?.data?.error || e?.message || 'Thử lại sau.', life: 3000 });
  } finally { capturing.value = false; }
}

watch(() => form.value.videoFileId, () => { previewUrl.value = ''; previewErr.value = ''; autoThumbFromFile(); });
watch(files, autoThumbFromFile);
watch(dlg, (open) => { if (!open) { previewUrl.value = ''; previewErr.value = ''; } });

async function showPlay(row: any) {
  playDlg.value = true; playInfo.value = ''; playError.value = '';
  try { playInfo.value = await playUrl('video', row.id); }
  catch { playError.value = 'Chưa phát được: video chưa xuất bản, chưa gắn file, hoặc file chưa transcode xong.'; }
}
async function copyPlay() {
  try { await navigator.clipboard.writeText(playInfo.value); toast.add({ severity: 'success', summary: 'Đã sao chép link phát', life: 2000 }); } catch { /* clipboard bi chan */ }
}
async function save() {
  saving.value = true;
  const body: any = { ...form.value };
  body.publishedAt = publishedDate.value ? publishedDate.value.toISOString() : null;
  const ok = await saveItem(editing.value?.id || null, body, 'Đã lưu video');
  saving.value = false;
  if (ok) { dlg.value = false; load(); }
}
onMounted(() => { load(); loadRefs(); });
</script>
