<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center gap-2">
      <p class="text-sm text-neutral-400">Tổng: {{ meta.total }} số báo</p>
      <div class="flex-1" />
      <span class="p-input-icon-left">
        <i class="pi pi-search" />
        <InputText v-model="q" placeholder="Tìm số báo / tiêu đề..." class="w-56" @keyup.enter="load(1)" />
      </span>
      <Dropdown v-model="issueType" :options="typeOptions" option-label="label" option-value="value"
        placeholder="Tất cả loại số" class="w-44" @change="load(1)" />
      <Button label="Tải lại" icon="pi pi-refresh" size="small" outlined @click="load(meta.page)" />
      <Button v-if="can('epaper:create')" label="Thêm số báo" icon="pi pi-plus" @click="openAdd" />
    </div>

    <div class="surface-card p-4">
      <DataTable :value="items" :loading="loading" paginator :rows="meta.limit" :total-records="meta.total"
        lazy :first="(meta.page - 1) * meta.limit" @page="onPage" size="small">
        <Column field="issueNumber" header="Số" style="width:5rem" />
        <Column header="Loại số" style="width:8rem">
          <template #body="{ data }"><Tag :value="data.issueType === 'vung_cao' ? 'Vùng cao' : 'Thường'"
            :severity="data.issueType === 'vung_cao' ? 'info' : 'secondary'" /></template>
        </Column>
        <Column field="title" header="Tiêu đề" />
        <Column field="publishDate" header="Ngày phát hành" style="width:9rem" />
        <Column field="pageCount" header="Số trang" style="width:6rem" />
        <Column header="Trạng thái" style="width:8rem">
          <template #body="{ data }"><Tag :value="data.status === 'published' ? 'Đã xuất bản' : 'Nháp'"
            :severity="data.status === 'published' ? 'success' : 'secondary'" /></template>
        </Column>
        <Column header="Thao tác" style="min-width:16rem">
          <template #body="{ data }">
            <Button v-if="can('epaper:update')" label="Sửa" size="small" text @click="openEdit(data)" />
            <Button v-if="can('epaper:update') && data.status === 'published'" label="Sửa loại số" size="small" text
              severity="info" @click="openChangeType(data)" />
            <Button v-if="can('epaper:publish') && data.status !== 'published'" label="Xuất bản" size="small" text
              severity="success" @click="setPublished(data, true)" />
            <Button v-if="can('epaper:publish') && data.status === 'published'" label="Gỡ xuống" size="small" text
              severity="warn" @click="setPublished(data, false)" />
            <Button v-if="can('epaper:view') && data.pdfPath" label="Tải PDF" size="small" text
              @click="downloadPdf(data)" />
            <Button v-if="can('epaper:delete') && data.status !== 'published'" label="Xóa" size="small" text
              severity="danger" @click="removeItem(data)" />
          </template>
        </Column>
      </DataTable>
      <p class="mt-2 text-xs text-neutral-500">Số trang tự đếm khi chọn file PDF (vẫn sửa tay được nếu cần).
        Số đã xuất bản không đổi được số báo; đổi loại số không đổi số báo, slug và URL.</p>
    </div>

    <!-- Form tạo / sửa số báo (số nháp sửa được mọi trường; số đã xuất bản chỉ đổi qua form này kèm lý do) -->
    <Dialog v-model:visible="dlg" modal :header="editing ? 'Sửa số báo' : 'Thêm số báo'" class="w-full max-w-2xl">
      <div class="flex flex-col gap-3">
        <div class="grid grid-cols-2 gap-3">
          <div><label class="field-label">Số báo *</label><InputNumber v-model="form.issueNumber" class="w-full"
            :disabled="!!editing && editing.status === 'published'" /></div>
          <div><label class="field-label">Loại số *</label><Dropdown v-model="form.issueType" :options="typeOptions"
            option-label="label" option-value="value" class="w-full" /></div>
        </div>
        <div><label class="field-label">Tiêu đề *</label><InputText v-model="form.title" class="w-full" /></div>
        <div><label class="field-label">Ngày phát hành *</label><input type="date" v-model="form.publishDate"
          class="p-inputtext p-component w-full" /></div>
        <div><label class="field-label">Số trang (tự động khi chọn PDF, vẫn sửa tay được)</label><InputNumber
            v-model="form.pageCount" class="w-full" /></div>
        <div>
          <label class="field-label">File PDF gốc</label>
          <div class="flex items-center gap-2">
            <input ref="pdfInput" type="file" accept="application/pdf" class="hidden" @change="onPdfPicked" />
            <Button label="Chọn file PDF" icon="pi pi-upload" size="small" outlined @click="pdfInput?.click()" />
            <span class="text-xs text-neutral-500">{{ form.pdfPath || 'Chưa có file' }}</span>
          </div>
          <p v-if="pdfBusy" class="text-xs text-neutral-500">Đang tải PDF lên...</p>
        </div>
        <div><label class="field-label">Ảnh bìa (URL ảnh, tùy chọn)</label><InputText v-model="form.coverPath" class="w-full"
          placeholder="/images/..." /></div>
        <div v-if="editing && editing.status === 'published'">
          <label class="field-label">Lý do sửa (bắt buộc với số đã xuất bản) *</label>
          <Textarea v-model="form.changeReason" rows="2" class="w-full" />
        </div>
      </div>
      <template #footer>
        <Button label="Hủy" text @click="dlg = false" />
        <Button :label="editing ? 'Lưu' : 'Tạo'" :loading="saving" @click="save"
          :disabled="!form.title.trim() || !form.issueNumber || !form.publishDate" />
      </template>
    </Dialog>

    <!-- Đổi riêng loại số cho số đã xuất bản -->
    <Dialog v-model:visible="typeDlg" modal header="Sửa loại số" class="w-full max-w-lg">
      <div v-if="typeTarget" class="flex flex-col gap-3">
        <p class="text-sm">Đổi loại số <b>{{ typeTarget.issueNumber }}</b> từ
          <b>{{ typeTarget.issueType === 'vung_cao' ? 'Vùng cao' : 'Thường' }}</b> sang:</p>
        <Dropdown v-model="typeForm.issueType" :options="typeOptions" option-label="label" option-value="value"
          class="w-full" />
        <div><label class="field-label">Lý do (bắt buộc) *</label><Textarea v-model="typeForm.changeReason" rows="2"
          class="w-full" /></div>
        <p class="text-xs text-neutral-500">Số báo, tiêu đề, ngày, slug và URL không đổi. Chỉ đổi trường loại số để lọc đúng.</p>
      </div>
      <template #footer>
        <Button label="Hủy" text @click="typeDlg = false" />
        <Button label="Đổi loại số" :loading="saving" @click="saveChangeType"
          :disabled="!typeForm.changeReason.trim() || typeForm.issueType === typeTarget?.issueType" />
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'auth' });
useHead({ title: 'Báo in - VTC ANY CMS' });

const { can } = useCmsAuth();
const api = useApi();
const toast = useToast();

const typeOptions = [
  { label: 'Tất cả loại số', value: '' },
  { label: 'Thường', value: 'thuong' },
  { label: 'Vùng cao', value: 'vung_cao' },
];
const items = ref<any[]>([]);
const meta = ref({ total: 0, page: 1, limit: 20 });
const loading = ref(false);
const q = ref('');
const issueType = ref('');

async function load(page = 1) {
  loading.value = true;
  try {
    const r = await api.get<any>('/admin/epaper', {
      issueType: issueType.value || undefined, q: q.value || undefined, page, limit: meta.value.limit,
    });
    items.value = r.data || [];
    meta.value = { total: r.total || 0, page: r.page || 1, limit: r.limit || 20 };
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.response?.data?.error?.message || e?.message || 'Không tải được danh sách số báo', life: 3000 });
  } finally { loading.value = false; }
}
function onPage(e: any) { load(Math.floor(e.first / e.rows) + 1); }

const dlg = ref(false);
const editing = ref<any>(null);
const saving = ref(false);
const pdfBusy = ref(false);
const pdfInput = ref<HTMLInputElement | null>(null);
const form = ref({
  issueNumber: null as number | null, issueType: 'thuong', title: '', publishDate: '',
  pageCount: 0, pdfPath: '', coverPath: '', changeReason: '',
});

function openAdd() {
  editing.value = null;
  form.value = { issueNumber: null, issueType: 'thuong', title: '', publishDate: '', pageCount: 0, pdfPath: '', coverPath: '', changeReason: '' };
  dlg.value = true;
}
function openEdit(it: any) {
  editing.value = it;
  form.value = {
    issueNumber: it.issueNumber, issueType: it.issueType, title: it.title || '', publishDate: it.publishDate || '',
    pageCount: it.pageCount || 0, pdfPath: it.pdfPath || '', coverPath: it.coverPath || '', changeReason: '',
  };
  dlg.value = true;
}

async function onPdfPicked(ev: Event) {
  const f = (ev.target as HTMLInputElement).files?.[0];
  if (!f) return;
  if (f.type !== 'application/pdf') { toast.add({ severity: 'warn', summary: 'Chỉ chấp nhận file PDF', life: 2500 }); return; }
  pdfBusy.value = true;
  try {
    const out = await api.put<any>('/uploads/pdf', f, {
      'Content-Type': 'application/pdf', 'x-file-name': encodeURIComponent(f.name),
    });
    form.value.pdfPath = out.pdfPath || '';
    if (typeof out.pageCount === 'number' && out.pageCount > 0) {
      form.value.pageCount = out.pageCount;
      toast.add({ severity: 'success', summary: `Đã tải PDF lên, tự đếm được ${out.pageCount} trang`, life: 3000 });
    } else {
      toast.add({ severity: 'success', summary: 'Đã tải PDF lên (không đếm được số trang, nhập tay giúp)', life: 3000 });
    }
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.response?.data?.error || e?.message || 'Tải PDF thất bại', life: 3000 });
  } finally { pdfBusy.value = false; }
}

async function save() {
  saving.value = true;
  try {
    const body: any = {
      issueNumber: form.value.issueNumber, issueType: form.value.issueType, title: form.value.title.trim(),
      publishDate: form.value.publishDate, pageCount: form.value.pageCount || 0,
      pdfPath: form.value.pdfPath || null, coverPath: form.value.coverPath || null,
    };
    if (editing.value) {
      if (editing.value.status === 'published') {
        if (!form.value.changeReason.trim()) { toast.add({ severity: 'warn', summary: 'Số đã xuất bản bắt buộc nhập lý do sửa', life: 2500 }); return; }
        body.changeReason = form.value.changeReason.trim();
        // So da xuat ban: khong gui issueNumber (bat bien) — chi gui cac truong duoc doi.
        delete body.issueNumber;
      }
      await api.patch(`/admin/epaper/${editing.value.publicId}`, body);
      toast.add({ severity: 'success', summary: 'Đã lưu số báo', life: 2500 });
    } else {
      await api.post('/admin/epaper', body);
      toast.add({ severity: 'success', summary: 'Đã tạo số báo', life: 2500 });
    }
    dlg.value = false;
    load(meta.value.page);
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.response?.data?.message || e?.response?.data?.error?.message || e?.message || 'Lưu thất bại', life: 3000 });
  } finally { saving.value = false; }
}

const typeDlg = ref(false);
const typeTarget = ref<any>(null);
const typeForm = ref({ issueType: 'thuong', changeReason: '' });
function openChangeType(it: any) {
  typeTarget.value = it;
  typeForm.value = { issueType: it.issueType === 'vung_cao' ? 'thuong' : 'vung_cao', changeReason: '' };
  typeDlg.value = true;
}
async function saveChangeType() {
  if (!typeTarget.value) return;
  saving.value = true;
  try {
    await api.patch(`/admin/epaper/${typeTarget.value.publicId}`, {
      issueType: typeForm.value.issueType, changeReason: typeForm.value.changeReason.trim(),
    });
    toast.add({ severity: 'success', summary: `Đã đổi loại số ${typeTarget.value.issueNumber} sang ${typeForm.value.issueType}`, life: 3000 });
    typeDlg.value = false;
    load(meta.value.page);
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.response?.data?.message || e?.response?.data?.error?.message || e?.message || 'Đổi loại số thất bại', life: 3000 });
  } finally { saving.value = false; }
}

async function setPublished(it: any, publish: boolean) {
  try {
    await api.post(`/admin/epaper/${it.publicId}/${publish ? 'publish' : 'unpublish'}`);
    toast.add({ severity: 'success', summary: publish ? 'Đã xuất bản' : 'Đã gỡ xuống', life: 2500 });
    load(meta.value.page);
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.response?.data?.message || e?.message || 'Thao tác thất bại', life: 3000 });
  }
}

function downloadPdf(it: any) {
  // Route admin co JWT: mo tab moi qua apiBase; token lay tu storage cua CMS.
  const base = (useRuntimeConfig().public.apiBase as string).replace(/\/$/, '');
  const token = localStorage.getItem('cms_token') || sessionStorage.getItem('cms_token') || '';
  if (!token) { toast.add({ severity: 'warn', summary: 'Hết phiên đăng nhập', life: 2500 }); return; }
  fetch(`${base}/admin/epaper/${it.publicId}/pdf`, { headers: { Authorization: `Bearer ${token}` } })
    .then(async (r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const blob = await r.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `bao-so-${it.issueNumber}.pdf`;
      a.click();
      URL.revokeObjectURL(a.href);
    })
    .catch((e) => toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.message || 'Tải PDF thất bại', life: 3000 }));
}

async function removeItem(it: any) {
  if (!window.confirm(`Xóa số báo ${it.issueNumber} (chỉ số nháp mới xóa được)?`)) return;
  try {
    await api.del(`/admin/epaper/${it.publicId}`);
    toast.add({ severity: 'success', summary: 'Đã xóa số báo', life: 2500 });
    load(meta.value.page);
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.response?.data?.message || e?.message || 'Xóa thất bại', life: 3000 });
  }
}

load(1);
</script>
