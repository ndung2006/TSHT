<template>
  <div class="flex flex-col gap-4">
    <div class="surface-card p-4">
      <DataTable :value="items" :loading="loading" size="small">
        <Column field="title" header="Tiêu đề" />
        <Column header="Ảnh / Video" style="width:9rem">
          <template #body="{ data }">
            <img v-if="data.mediaType === 'image' && data.mediaUrl" :src="resolveMedia(data.mediaUrl)" alt="" class="w-24 h-14 object-cover rounded" />
            <span v-else-if="data.mediaUrl" class="text-xs">Video</span>
            <span v-else class="text-xs text-neutral-400">—</span>
          </template>
        </Column>
        <Column header="Trạng thái" style="width:8rem">
          <template #body="{ data }"><Tag :value="data.status === 'published' ? 'Đã xuất bản' : 'Nháp'" :severity="data.status === 'published' ? 'success' : 'secondary'" /></template>
        </Column>
        <Column header="Đích đến" style="min-width:16rem">
          <template #body="{ data }">
            <div class="flex flex-wrap gap-2">
              <span v-for="t in data.targets" :key="t.platform" class="inline-flex items-center gap-1 text-xs">
                <Tag :value="platformLabel(t.platform) + ': ' + targetLabel(t.status)" :severity="t.status === 'posted' ? 'success' : t.status === 'ready' ? 'info' : t.status === 'failed' ? 'danger' : 'secondary'" />
                <a v-if="t.status === 'posted' && t.url && t.url !== '/nen-tang-so'" :href="t.url" target="_blank" rel="noopener" class="underline">Mở link</a>
                <Button v-if="(t.platform === 'facebook' || t.platform === 'tiktok') && can('distribution:update')" label="Đã đăng" size="small" text @click="openMark(data, t)" />
              </span>
              <span v-if="!data.targets?.length" class="text-xs text-neutral-400">Chưa chọn đích</span>
            </div>
          </template>
        </Column>
        <Column header="Thao tác" style="min-width:13rem">
          <template #body="{ data }">
            <Button v-if="data.status === 'draft' && can('distribution:update')" label="Sửa" size="small" text @click="openEdit(data)" />
            <Button v-if="data.status === 'draft' && can('distribution:publish')" label="Xuất bản" size="small" text @click="doPublish(data)" />
            <Button v-if="data.status === 'published' && can('distribution:publish')" label="Gỡ xuống" size="small" text severity="warn" @click="doUnpublish(data)" />
            <Button v-if="data.status === 'draft' && can('distribution:delete')" label="Xóa" size="small" text severity="danger" @click="removeItem(data)" />
          </template>
        </Column>
      </DataTable>
      <p class="mt-2 text-xs text-neutral-500">Phân phối đa nền tảng (giai đoạn 2): App tự động khi xuất bản; Facebook giai đoạn này chỉ chuẩn bị (chưa đăng tự động vì chưa kết nối tài khoản); TikTok đăng tay qua TikTok Studio rồi dán link về đánh dấu đã đăng.</p>
    </div>

    <div v-if="can('distribution:create') || can('distribution:update')" class="surface-card p-4 flex flex-col gap-2">
      <p class="text-sm font-medium">{{ editing ? 'Sửa bài phân phối' : 'Thêm bài phân phối' }}</p>
      <InputText v-model="form.title" placeholder="Tiêu đề *" class="w-full" />
      <Textarea v-model="form.caption" placeholder="Nội dung / chú thích" rows="3" class="w-full" />
      <div class="flex gap-2 items-center flex-wrap">
        <InputText v-model="form.mediaUrl" placeholder="URL ảnh/video (hoặc chọn từ thư viện)" class="flex-1" />
        <Button label="Chọn từ thư viện" size="small" outlined @click="openLib" />
        <select v-model="form.mediaType" class="border rounded px-2 py-1 text-sm">
          <option value="image">Ảnh</option>
          <option value="video">Video</option>
        </select>
      </div>
      <div v-if="form.mediaUrl && form.mediaType === 'image'" class="mt-1">
        <img :src="resolveMedia(form.mediaUrl)" alt="" class="w-48 h-28 object-cover rounded" @error="previewBroken = true" />
        <p v-if="previewBroken" class="text-xs text-red-600">Ảnh xem trước không tải được — kiểm tra lại URL.</p>
      </div>
      <div class="flex gap-4 flex-wrap text-sm">
        <label class="flex items-center gap-2"><Checkbox v-model="form.platforms" value="app" /> App &amp; cổng (tự động khi xuất bản)</label>
        <label class="flex items-center gap-2"><Checkbox v-model="form.platforms" value="facebook" /> Facebook (chuẩn bị, chưa auto)</label>
        <label class="flex items-center gap-2"><Checkbox v-model="form.platforms" value="tiktok" /> TikTok (đăng tay qua Studio)</label>
      </div>
      <div class="flex gap-2">
        <Button :label="editing ? 'Lưu' : 'Thêm'" size="small" @click="save" :disabled="!form.title.trim()" />
        <Button v-if="editing" label="Hủy sửa" size="small" text @click="resetForm" />
      </div>
    </div>

    <Dialog v-model:visible="libDlg" header="Chọn từ thư viện" modal class="w-[90vw] max-w-3xl">
      <div class="flex gap-2 mb-2">
        <InputText v-model="libQ" placeholder="Tìm trong thư viện" class="flex-1" @keyup.enter="loadLib(1)" />
        <Button label="Tìm" size="small" @click="loadLib(1)" />
      </div>
      <div class="grid grid-cols-3 gap-2">
        <button v-for="im in libItems" :key="im.id" type="button" class="text-left border rounded p-1" @click="pickLib(im)">
          <img v-if="im.url" :src="resolveMedia(im.url)" alt="" class="w-full h-20 object-cover rounded" />
          <span class="text-xs block truncate mt-1">{{ im.title || im.url }}</span>
        </button>
      </div>
      <p v-if="!libItems.length && !libLoading" class="text-sm text-neutral-500 mt-2">Không có mục nào trong thư viện cho loại này.</p>
    </Dialog>

    <Dialog v-model:visible="markDlg" header="Đánh dấu đã đăng tay" modal class="w-[90vw] max-w-lg">
      <p class="text-sm mb-2">Bài: <b>{{ markPost?.title }}</b> — đích: <b>{{ markTarget ? platformLabel(markTarget.platform) : '' }}</b></p>
      <p class="text-xs text-neutral-500 mb-2">Dán link bài đã đăng tay (TikTok Studio / Facebook) để ghi nhận. Không có link thật thì không đánh dấu đã đăng.</p>
      <InputText v-model="markUrl" placeholder="https://..." class="w-full" />
      <div class="flex gap-2 mt-3">
        <Button label="Xác nhận đã đăng" size="small" @click="doMark" :disabled="!markUrl.trim()" />
        <Button label="Đóng" size="small" text @click="markDlg = false" />
      </div>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'auth' });
useHead({ title: 'Phân phối - VTC ANY CMS' });

const { can } = useCmsAuth();
const api = useApi();
const toast = useToast();

const items = ref<any[]>([]);
const loading = ref(false);
const editing = ref<any>(null);
const previewBroken = ref(false);
const form = ref({ title: '', caption: '', mediaUrl: '', mediaType: 'image', platforms: [] as string[] });

const libDlg = ref(false);
const libItems = ref<any[]>([]);
const libQ = ref('');
const libLoading = ref(false);

const markDlg = ref(false);
const markPost = ref<any>(null);
const markTarget = ref<any>(null);
const markUrl = ref('');

// URL thu vien tra ve la tuong doi (/images/...) thuoc ve backend, khong
// phai origin CMS: chi dung resolveMedia khi HIEN THI. Gia tri luu trong
// DB giu nguyen duong dan tuong doi; proxy cong khai se ghep origin
// backend khi phuc vu (giong cover tin bai). Khong bao gio chen url tho
// vao HTML hien thi — do la loi icon hong tung xay ra o tin bai.
function resolveMedia(u: string) {
  if (!u) return '';
  if (/^(https?:)?\/\//.test(u) || u.startsWith('data:')) return u;
  if (!u.startsWith('/')) return u;
  try { return new URL(useRuntimeConfig().public.apiBase as string).origin + u; } catch { return u; }
}

function platformLabel(p: string) {
  return ({ app: 'App', facebook: 'Facebook', tiktok: 'TikTok' } as Record<string, string>)[p] || p;
}
function targetLabel(s: string) {
  return ({ draft: 'Nháp', ready: 'Sẵn sàng', posted: 'Đã đăng', failed: 'Lỗi' } as Record<string, string>)[s] || s;
}

function resetForm() {
  editing.value = null;
  previewBroken.value = false;
  form.value = { title: '', caption: '', mediaUrl: '', mediaType: 'image', platforms: [] };
}

async function load() {
  loading.value = true;
  try { items.value = await api.get<any[]>('/admin/distribution') || []; }
  catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.response?.data?.message || e?.message || 'Không tải được danh sách', life: 3000 });
  } finally { loading.value = false; }
}

function openEdit(d: any) {
  editing.value = d;
  form.value = {
    title: d.title || '',
    caption: d.caption || '',
    mediaUrl: d.mediaUrl || '',
    mediaType: d.mediaType || 'image',
    platforms: (d.targets || []).map((t: any) => t.platform),
  };
}

async function save() {
  try {
    const payload = { ...form.value };
    if (editing.value) await api.patch(`/admin/distribution/${editing.value.publicId}`, payload);
    else await api.post('/admin/distribution', payload);
    toast.add({ severity: 'success', summary: 'Đã lưu', life: 3000 });
    resetForm();
    await load();
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.response?.data?.message || e?.message || 'Không lưu được', life: 3000 });
  }
}

async function doPublish(d: any) {
  try { await api.post(`/admin/distribution/${d.publicId}/publish`); await load(); }
  catch (e: any) { toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.response?.data?.message || e?.message || 'Không xuất bản được', life: 3000 }); }
}

async function doUnpublish(d: any) {
  try { await api.post(`/admin/distribution/${d.publicId}/unpublish`); await load(); }
  catch (e: any) { toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.response?.data?.message || e?.message || 'Không gỡ được', life: 3000 }); }
}

async function removeItem(d: any) {
  if (!confirm(`Xóa bài phân phối "${d.title}"? Chỉ xóa được bài ở trạng thái Nháp.`)) return;
  try { await api.del(`/admin/distribution/${d.publicId}`); await load(); }
  catch (e: any) { toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.response?.data?.message || e?.message || 'Không xóa được', life: 3000 }); }
}

async function loadLib(page = 1) {
  libLoading.value = true;
  try {
    const kind = form.value.mediaType === 'video' ? 'video' : 'image';
    const r = await api.get<any>('/admin/media', { kind, q: libQ.value || undefined, page, limit: 20 });
    libItems.value = r.data || [];
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.response?.data?.message || e?.message || 'Không tải được thư viện', life: 3000 });
  } finally { libLoading.value = false; }
}

function openLib() {
  libDlg.value = true;
  loadLib(1);
}

function pickLib(item: any) {
  if (!item?.url) return;
  // Luu url THO (tuong doi) vao form; hien thi qua resolveMedia. Khac voi
  // chen anh vao than bai tin bai (noi can url tuyet doi trong HTML).
  form.value.mediaUrl = item.url;
  libDlg.value = false;
}

function openMark(post: any, target: any) {
  markPost.value = post;
  markTarget.value = target;
  markUrl.value = '';
  markDlg.value = true;
}

async function doMark() {
  if (!markPost.value || !markTarget.value) return;
  try {
    await api.patch(`/admin/distribution/${markPost.value.publicId}/targets/${markTarget.value.platform}`, { status: 'posted', url: markUrl.value.trim() });
    toast.add({ severity: 'success', summary: 'Đã ghi nhận đã đăng', life: 3000 });
    markDlg.value = false;
    await load();
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.response?.data?.message || e?.message || 'Không ghi nhận được', life: 3000 });
  }
}

onMounted(load);
</script>
