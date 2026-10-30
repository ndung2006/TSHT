<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center gap-2">
      <p class="text-sm text-neutral-400">Tổng: {{ meta.total }} bài báo in</p>
      <div class="flex-1" />
      <span class="p-input-icon-left">
        <i class="pi pi-search" />
        <InputText v-model="q" placeholder="Tìm tiêu đề..." class="w-56" @keyup.enter="load(1)" />
      </span>
      <Dropdown v-model="statusFilter" :options="statusOptions" option-label="label" option-value="value"
        placeholder="Tất cả trạng thái" class="w-44" @change="load(1)" />
      <Button label="Tải lại" icon="pi pi-refresh" size="small" outlined @click="load(meta.page)" />
      <Button v-if="can('print_articles:create')" label="Thêm bài báo in" icon="pi pi-plus" size="small" @click="openAdd" />
    </div>

    <div class="surface-card p-4">
      <DataTable :value="items" :loading="loading" paginator :rows="meta.limit" :total-records="meta.total"
        lazy :first="(meta.page - 1) * meta.limit" @page="onPage" size="small">
        <Column field="title" header="Tiêu đề" />
        <Column header="Bài gốc" style="min-width:12rem">
          <template #body="{ data }"><span class="text-sm text-neutral-400">{{ data.sourceNewsSlug || '—' }}</span></template>
        </Column>
        <Column header="Chuyên mục" style="min-width:10rem">
          <template #body="{ data }"><span class="text-sm">{{ data.category?.name || '—' }}</span></template>
        </Column>
        <Column header="Trạng thái" style="width:11rem">
          <template #body="{ data }"><Tag :value="statusText(data)"
            :severity="data.status === 'approved' ? 'success' : data.status === 'pending_review' ? 'warn' : 'secondary'" /></template>
        </Column>
        <Column header="Sửa đổi gần nhất" style="min-width:11rem">
          <template #body="{ data }"><span class="text-sm text-neutral-400">{{ lastApprovalText(data) }}</span></template>
        </Column>
        <Column header="Thao tác" style="min-width:16rem">
          <template #body="{ data }">
            <Button v-if="can('print_articles:view')" label="Xem" size="small" text @click="openView(data)" />
            <Button v-if="can('print_articles:update') && data.status === 'draft'" label="Sửa" size="small" text @click="openEdit(data)" />
            <Button v-if="can('print_articles:update') && data.status === 'draft'" label="Gửi duyệt" size="small" text
              severity="info" @click="submitItem(data)" />
            <Button v-if="can('print_articles:publish') && data.status === 'pending_review'" label="Duyệt" size="small" text
              severity="success" @click="approveItem(data)" />
            <Button v-if="can('print_articles:publish') && data.status === 'pending_review'" label="Trả lại" size="small" text
              severity="warn" @click="openReturn(data)" />
            <Button v-if="can('print_articles:view')" label="Lịch sử duyệt" size="small" text @click="openHistory(data)" />
            <Button v-if="can('print_articles:delete') && data.status === 'draft'" label="Xóa" size="small" text
              severity="danger" @click="removeItem(data)" />
          </template>
        </Column>
      </DataTable>
      <p class="mt-2 text-xs text-neutral-500">Bài báo in là bản sao nội dung của bài báo điện tử, chuyển sang đây
        (nút “Chuyển sang báo in” trong trang Tin bài) để duyệt LẠI theo quy trình báo in:
        KTV → MD (Duyệt Mo-rát) → T.PP (Trưởng/Phó phòng, Thư ký tòa soạn) → P.TBT (Phó Tổng Biên tập) →
        TBT (Tổng Biên tập, duyệt bước cuối = đã duyệt, chờ dàn trang). Trả lại phải ghi lý do.
        Bài báo in KHÔNG xuất bản công khai lên web — TBT duyệt xong là nguyên liệu cho tổ dàn trang
        ghép vào số báo. Chỉ bài nháp mới xóa được, chỉ bài nháp mới sửa được.
        Ngoài chuyển đổi từ bài báo điện tử, có thể tạo bài báo in bằng tay bằng nút
        “Thêm bài báo in” (không cần bài gốc); bài tạo tay cũng duyệt theo đúng quy trình trên.</p>
    </div>

    <!-- Xem bai bao in -->
    <Dialog v-model:visible="viewDlg" modal :header="`Xem bài báo in — ${viewItem?.title || ''}`"
      class="w-[96vw] max-w-[96vw]">
      <div v-if="viewItem" class="flex flex-col gap-3 max-h-[75dvh] overflow-y-auto pr-1">
        <p class="text-sm text-neutral-400">{{ viewItem.category?.name || '—' }} · {{ statusText(viewItem) }} · Bài gốc: {{ viewItem.sourceNewsSlug || '—' }}</p>
        <h2 class="text-xl font-semibold leading-snug">{{ viewItem.title }}</h2>
        <p v-if="viewItem.sapo" class="text-sm text-neutral-300 leading-relaxed">{{ viewItem.sapo }}</p>
        <img v-if="viewItem.coverPath" :src="resolveMedia(viewItem.coverPath)" :alt="viewItem.title" class="w-full max-h-96 object-cover rounded-lg" />
        <p class="text-xs text-neutral-400">{{ (viewItem.authors || []).join(', ') || '—' }}</p>
        <div v-if="viewItem.body" class="text-sm leading-relaxed" v-html="viewItem.body" />
        <p v-else class="text-sm text-neutral-400">Chưa có nội dung.</p>
      </div>
      <template #footer>
        <Button label="Đóng" text @click="viewDlg = false" />
        <Button label="Preview" severity="secondary" @click="openPreviewFromView" />
        <Button v-if="viewItem && can('print_articles:update') && viewItem.status === 'draft'" label="Gửi duyệt" severity="info" @click="viewSubmit" />
        <Button v-if="viewItem && can('print_articles:publish') && viewItem.status === 'pending_review'" label="Duyệt" severity="success" @click="viewApprove" />
        <Button v-if="viewItem && can('print_articles:publish') && viewItem.status === 'pending_review'" label="Trả lại" severity="warn" @click="viewReturn" />
      </template>
    </Dialog>

    <!-- Tra lai bai dang cho duyet (bat buoc ghi ly do) -->
    <Dialog v-model:visible="returnDlg" modal header="Trả lại bài báo in" class="w-full max-w-lg">
      <div v-if="returnTarget" class="flex flex-col gap-2">
        <p class="text-sm">Trả lại bài “{{ returnTarget.title }}” về nháp để sửa.</p>
        <Textarea v-model="returnReason" rows="3" class="w-full" placeholder="Lý do trả lại *" />
      </div>
      <template #footer>
        <Button label="Hủy" text @click="returnDlg = false" />
        <Button label="Trả lại" severity="warn" :disabled="!returnReason.trim()" @click="saveReturn" />
      </template>
    </Dialog>

    <!-- Ngoai le tin nong (tach nhiem vu) -->
    <Dialog v-model:visible="excDlg" modal header="Duyệt với ngoại lệ tin nóng" class="w-full max-w-lg">
      <div class="flex flex-col gap-2">
        <p class="text-sm">Bạn đã xử lý bước trước của bài “{{ excTarget?.title }}” nên quy tắc tách nhiệm vụ chặn lượt duyệt này. Chỉ dùng ngoại lệ cho tin nóng thật sự — lượt duyệt này sẽ được ghi log là ngoại lệ.</p>
        <Textarea v-model="excReason" rows="3" class="w-full" placeholder="Lý do ngoại lệ (nếu có)" />
      </div>
      <template #footer>
        <Button label="Hủy" text @click="excDlg = false" />
        <Button label="Duyệt với ngoại lệ tin nóng" severity="warn" @click="confirmExceptionApprove" />
      </template>
    </Dialog>

    <!-- Lich su duyet theo buoc -->
    <Dialog v-model:visible="histDlg" modal header="Lịch sử duyệt" class="w-full max-w-2xl">
      <div v-if="histTarget" class="flex flex-col gap-2">
        <p class="text-sm text-neutral-400">{{ histTarget.title }}</p>
        <p v-if="histItems.length === 0" class="text-sm">Chưa có lượt duyệt nào.</p>
        <DataTable v-else :value="histItems" size="small">
          <Column header="Hành động"><template #body="{ data }">{{ data.actionLabel || data.action }}</template></Column>
          <Column header="Bước"><template #body="{ data }">{{ data.stepLabel || '—' }}</template></Column>
          <Column header="Vai trò"><template #body="{ data }">{{ data.actorRole || '?' }}</template></Column>
          <Column header="Người xử lý"><template #body="{ data }">{{ data.actorName || '—' }}</template></Column>
          <Column header="Ngoại lệ"><template #body="{ data }">{{ data.isException ? ('Tin nóng' + (data.exceptionReason ? ' — ' + data.exceptionReason : '')) : '—' }}</template></Column>
          <Column header="Lý do / ghi chú"><template #body="{ data }">{{ data.comment || '—' }}</template></Column>
          <Column header="Thời gian"><template #body="{ data }">{{ fmtTime(data.createdAt) }}</template></Column>
        </DataTable>
      </div>
      <template #footer>
        <Button label="Đóng" text @click="histDlg = false" />
      </template>
    </Dialog>

    <!-- Sua / them bai bao in (khuon dialog Sua bai cua tin-bai.vue, nhung
         chi co truong bai bao in: khong khoi dinh dang, khong nhuan but,
         khong panel media, khong chon so bao — so bao la PDF tai len,
         bai da duyet la nguyen lieu cho to dan trang). -->
    <Dialog v-model:visible="editDlg" modal :header="editItem ? 'Sửa bài báo in' : 'Thêm bài báo in'"
      class="w-[96vw] max-w-[96vw]">
      <div class="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div class="xl:col-span-2 flex flex-col gap-3">
          <div><label class="field-label">Tiêu đề *</label><InputText v-model="editForm.title" class="w-full text-lg font-semibold" /></div>
          <div><label class="field-label">Slug (để trống = tự sinh từ tiêu đề)</label><InputText v-model="editForm.slug" class="w-full" /></div>
          <div>
            <label class="field-label">Sapo (tóm tắt, tối đa 500 ký tự) — {{ editForm.sapo.length }}/500</label>
            <Textarea v-model="editForm.sapo" rows="3" class="w-full" maxlength="500" />
          </div>
          <div><label class="field-label">Nội dung</label>
            <Editor v-model="editForm.body" editor-style="height: 480px" />
            <span class="text-xs text-neutral-500">Ảnh trong nội dung giữ nguyên URL đã có; ảnh bìa chọn riêng bằng khung bên phải.</span>
          </div>
        </div>
        <div class="flex flex-col gap-3">
          <div><label class="field-label">Chuyên mục</label>
            <Dropdown v-model="editForm.categoryId" :options="catOptions" option-label="label" option-value="value"
              placeholder="Chưa chọn chuyên mục" class="w-full" show-clear />
          </div>
          <div><label class="field-label">Ảnh bìa</label><ImagePicker v-model="editForm.coverPath" ratio="16/9" /></div>
          <div><label class="field-label">Tác giả (nhiều người cách nhau bằng dấu phẩy)</label><InputText v-model="editAuthorsText" class="w-full" /></div>
          <div><label class="field-label">Từ khóa (cách nhau bằng dấu phẩy)</label><InputText v-model="editTagsText" class="w-full" /></div>
          <p v-if="editItem" class="text-xs text-neutral-500">Bài gốc: {{ editItem.sourceNewsSlug || '— (tạo tay)' }} · Trạng thái: {{ statusText(editItem) }}</p>
        </div>
      </div>
      <template #footer>
        <Button label="Hủy" text @click="editDlg = false" />
        <Button label="Preview" severity="secondary" @click="openPreviewFromEdit" />
        <Button :label="editItem ? 'Lưu' : 'Tạo'" :loading="editSaving" @click="saveEdit"
          :disabled="!editForm.title.trim() || editForm.sapo.length > 500" />
      </template>
    </Dialog>

    <!-- Preview bai (component dung chung ArticlePreviewDialog) -->
    <ArticlePreviewDialog v-model:visible="previewDlg" :title="previewData.title" :sapo="previewData.sapo"
      :cover-path="previewData.coverPath" :body="previewData.body" :category-name="previewData.categoryName" />
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'auth' });
useHead({ title: 'Bài báo in - VTC ANY CMS' });

const { can } = useCmsAuth();
const api = useApi();
const toast = useToast();
const confirm = useConfirm();

const items = ref<any[]>([]);
const meta = ref({ total: 0, page: 1, limit: 20 });
const loading = ref(false);
const q = ref('');
const statusFilter = ref('');

const statusOptions = [
  { label: 'Tất cả trạng thái', value: '' },
  { label: 'Nháp', value: 'draft' },
  { label: 'Chờ duyệt', value: 'pending_review' },
  { label: 'Đã duyệt, chờ dàn trang', value: 'approved' },
];

function statusText(it: any) {
  if (it.status === 'approved') return 'Đã duyệt, chờ dàn trang';
  if (it.status === 'pending_review') {
    const label = it.workflowStepLabel ? ` · ${it.workflowStepLabel}` : '';
    const total = it.workflowTotalSteps ? `/${it.workflowTotalSteps}` : '';
    return `Chờ duyệt${label} (bước ${it.workflowStep || '?'}${total})`;
  }
  return 'Nháp';
}
function lastApprovalText(it: any) {
  const a = it.lastApproval;
  if (!a) return '—';
  const role = a.actorRole ? ` · ${a.actorRole}` : '';
  const step = a.stepLabel ? ` (${a.stepLabel})` : '';
  const comment = a.comment ? ` — ${a.comment}` : '';
  return `${a.actionLabel || a.action}${step}${role} · ${fmtTime(a.createdAt)}${comment}`;
}
function fmtTime(s: string | null | undefined) {
  return s ? s.slice(0, 16).replace('T', ' ') : '';
}
// URL media dang tuong doi (/images/...) thuoc ve backend: hien thi phai
// ghep voi origin cua apiBase (giong tin-bai.vue), neu khong trinh duyet
// hieu thanh cms origin -> 404.
function resolveMedia(u: string) {
  if (!u) return '';
  if (/^(https?:)?\/\//.test(u) || u.startsWith('data:')) return u;
  if (!u.startsWith('/')) return u;
  try { return new URL(useRuntimeConfig().public.apiBase as string).origin + u; } catch { return u; }
}

async function load(page = 1) {
  loading.value = true;
  try {
    const r = await api.get<any>('/admin/print-articles', {
      q: q.value || undefined, status: statusFilter.value || undefined, page, limit: meta.value.limit,
    });
    items.value = r.data || [];
    meta.value = { total: r.total || 0, page: r.page || 1, limit: r.limit || 20 };
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.data?.message || e?.response?.data?.message || e?.message || 'Tải thất bại', life: 3000 });
  } finally {
    loading.value = false;
  }
}
function onPage(e: any) {
  load(e.page + 1);
}

// --- Sua / them bai bao in (khuon tin-bai.vue) ---
const cats = ref<any[]>([]);
const catOptions = computed(() => {
  const byId = new Map(cats.value.map((c) => [c.id, c]));
  return cats.value.map((c) => {
    const parent = c.parentId ? byId.get(c.parentId) : null;
    return { label: parent ? `${parent.name} / ${c.name}` : c.name, value: c.publicId };
  });
});
async function loadCats() {
  try { cats.value = await api.get<any[]>('/admin/news-categories') || []; }
  catch { cats.value = []; }
}
onMounted(() => { load(1); loadCats(); });

const editDlg = ref(false);
const editItem = ref<any>(null);
const editSaving = ref(false);
const editForm = ref({ title: '', slug: '', sapo: '', body: '', categoryId: '', coverPath: '' });
const editAuthorsText = ref('');
const editTagsText = ref('');
function splitList(s: string) {
  return s.split(',').map((x) => x.trim()).filter(Boolean);
}
function openAdd() {
  editItem.value = null;
  editForm.value = { title: '', slug: '', sapo: '', body: '', categoryId: '', coverPath: '' };
  editAuthorsText.value = '';
  editTagsText.value = '';
  editDlg.value = true;
}
function openEdit(it: any) {
  editItem.value = it;
  editForm.value = {
    title: it.title || '', slug: it.slug || '', sapo: it.sapo || '', body: it.body || '',
    categoryId: it.category?.publicId || '', coverPath: it.coverPath || '',
  };
  editAuthorsText.value = (it.authors || []).join(', ');
  editTagsText.value = (it.tags || []).join(', ');
  editDlg.value = true;
}
async function saveEdit() {
  editSaving.value = true;
  try {
    const payload: any = {
      title: editForm.value.title.trim(),
      slug: editForm.value.slug.trim() || undefined,
      sapo: editForm.value.sapo,
      body: editForm.value.body,
      categoryId: editForm.value.categoryId || null,
      coverPath: editForm.value.coverPath || null,
      authors: splitList(editAuthorsText.value),
      tags: splitList(editTagsText.value),
    };
    if (editItem.value) {
      await api.patch(`/admin/print-articles/${editItem.value.publicId}`, payload);
      toast.add({ severity: 'success', summary: 'Đã lưu bài báo in', life: 2500 });
    } else {
      await api.post('/admin/print-articles', payload);
      toast.add({ severity: 'success', summary: 'Đã tạo bài báo in (nháp)', life: 2500 });
    }
    editDlg.value = false;
    load(meta.value.page);
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.data?.message || e?.response?.data?.message || e?.message || 'Lưu thất bại', life: 3000 });
  } finally {
    editSaving.value = false;
  }
}

// --- Preview bai (component dung chung, goi sau Tin bai cung dung) ---
// Khong can gate quyen rieng: nut Preview nam trong dialog Xem (da gate
// view) va dialog Sua/Tao (da gate create/update). Preview o dialog Sua
// doc theo noi dung DANG NHAP, ke ca khi chua luu.
const previewDlg = ref(false);
const previewData = ref({ title: '', sapo: '', coverPath: '', body: '', categoryName: '' });
function openPreviewFromView() {
  if (!viewItem.value) return;
  previewData.value = {
    title: viewItem.value.title || '',
    sapo: viewItem.value.sapo || '',
    coverPath: viewItem.value.coverPath || '',
    body: viewItem.value.body || '',
    categoryName: viewItem.value.category?.name || '',
  };
  previewDlg.value = true;
}
function openPreviewFromEdit() {
  const catLabel = catOptions.value.find((o) => o.value === editForm.value.categoryId)?.label || '';
  previewData.value = {
    title: editForm.value.title,
    sapo: editForm.value.sapo,
    coverPath: editForm.value.coverPath,
    body: editForm.value.body,
    categoryName: catLabel,
  };
  previewDlg.value = true;
}

// --- Quy trinh duyet (khuon tin-bai.vue / bao-in.vue) ---
async function submitItem(it: any) {
  try {
    await api.post(`/admin/print-articles/${it.publicId}/submit`);
    toast.add({ severity: 'success', summary: 'Đã gửi duyệt', life: 2500 });
    load(meta.value.page);
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.data?.message || e?.response?.data?.message || e?.message || 'Gửi duyệt thất bại', life: 3000 });
  }
}
/** Id nguoi dung hien tai, decode tu JWT sub (khong can secret, khong goi backend). */
function currentUserId(): string | null {
  try {
    const t = localStorage.getItem('cms_token') || sessionStorage.getItem('cms_token');
    if (!t) return null;
    let part = t.split('.')[1] || '';
    if (!part) return null;
    part = part.replace(/-/g, '+').replace(/_/g, '/');
    part += '='.repeat((4 - (part.length % 4)) % 4);
    return JSON.parse(atob(part))?.sub || null;
  } catch { return null; }
}
async function approveItem(it: any) {
  // Kiem tra SoD chu dong: trung nguoi xu ly buoc truoc (truong "Sua doi
  // gan nhat" cua hang) thi mo thang dialog ngoai le, khong goi approve
  // mu roi moi doan chuoi loi 403. Luoi bat chuoi loi giu lam fallback.
  const prevActor = it.lastApproval?.actorId || null;
  const me = currentUserId();
  if (prevActor && me && prevActor === me) { openExceptionApprove(it); return; }
  try {
    const r = await api.post<any>(`/admin/print-articles/${it.publicId}/approve`);
    toast.add({ severity: 'success', summary: r?.status === 'approved' ? 'Đã duyệt xong, chờ dàn trang' : 'Đã duyệt, chuyển bước tiếp theo', life: 2500 });
    load(meta.value.page);
  } catch (e: any) {
    // ofetch dat body loi da parse vao e.data, khong phai e.response.data.
    const msg = e?.data?.message || e?.response?.data?.message || e?.message || '';
    if (String(msg).includes('tach nhiem vu')) { openExceptionApprove(it); return; }
    toast.add({ severity: 'error', summary: 'Lỗi', detail: msg || 'Duyệt thất bại', life: 3000 });
  }
}
const excDlg = ref(false);
const excTarget = ref<any>(null);
const excReason = ref('');
function openExceptionApprove(it: any) {
  excTarget.value = it;
  excReason.value = '';
  excDlg.value = true;
}
async function confirmExceptionApprove() {
  if (!excTarget.value) return;
  try {
    const r = await api.post<any>(`/admin/print-articles/${excTarget.value.publicId}/approve`, { breakingNews: true, breakingNewsReason: excReason.value.trim() || undefined });
    toast.add({ severity: 'success', summary: r?.status === 'approved' ? 'Đã duyệt xong với ngoại lệ tin nóng, chờ dàn trang' : 'Đã duyệt với ngoại lệ tin nóng', life: 2500 });
    excDlg.value = false;
    load(meta.value.page);
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.data?.message || e?.response?.data?.message || e?.message || 'Duyệt thất bại', life: 3000 });
  }
}
const returnDlg = ref(false);
const returnTarget = ref<any>(null);
const returnReason = ref('');
function openReturn(it: any) {
  returnTarget.value = it;
  returnReason.value = '';
  returnDlg.value = true;
}
async function saveReturn() {
  if (!returnTarget.value) return;
  try {
    await api.post(`/admin/print-articles/${returnTarget.value.publicId}/return`, { reason: returnReason.value.trim() });
    toast.add({ severity: 'success', summary: 'Đã trả lại bài báo in', life: 2500 });
    returnDlg.value = false;
    load(meta.value.page);
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.data?.message || e?.response?.data?.message || e?.message || 'Trả lại thất bại', life: 3000 });
  }
}
const histDlg = ref(false);
const histTarget = ref<any>(null);
const histItems = ref<any[]>([]);
async function openHistory(it: any) {
  histTarget.value = it;
  histItems.value = [];
  histDlg.value = true;
  try {
    const r = await api.get<any>(`/admin/print-articles/${it.publicId}/approvals`);
    histItems.value = Array.isArray(r) ? r : (r?.data || []);
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.data?.message || e?.response?.data?.message || e?.message || 'Tải lịch sử thất bại', life: 3000 });
  }
}
function removeItem(it: any) {
  confirm.require({
    message: `Xóa bài báo in “${it.title}”? Chỉ bài nháp mới xóa được.`,
    header: 'Xóa bài báo in',
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Xóa',
    rejectLabel: 'Hủy',
    accept: async () => {
      try {
        await api.del(`/admin/print-articles/${it.publicId}`);
        toast.add({ severity: 'success', summary: 'Đã xóa', life: 2500 });
        load(meta.value.page);
      } catch (e: any) {
        toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.data?.message || e?.response?.data?.message || e?.message || 'Xóa thất bại', life: 3000 });
      }
    },
  });
}

// --- Xem bai (dialog) + duyet ngay trong dialog ---
const viewDlg = ref(false);
const viewItem = ref<any>(null);
function openView(it: any) {
  viewItem.value = it;
  viewDlg.value = true;
}
async function viewSubmit() {
  if (!viewItem.value) return;
  await submitItem(viewItem.value);
  viewItem.value = items.value.find((x) => x.publicId === viewItem.value.publicId) || viewItem.value;
}
async function viewApprove() {
  if (!viewItem.value) return;
  await approveItem(viewItem.value);
  viewItem.value = items.value.find((x) => x.publicId === viewItem.value.publicId) || viewItem.value;
}
function viewReturn() {
  if (!viewItem.value) return;
  viewDlg.value = false;
  openReturn(viewItem.value);
}
</script>
